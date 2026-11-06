// Package js reproduces the JavaScript behaviour the Edge Functions lean on, so a Go port
// answers byte for byte what the Deno original answered (docs/GO-MIGRATION.md ruling 10).
//
// The Deno functions read request bodies as untyped objects and test them with `typeof`,
// `Number.isInteger`, `.trim()`, `.length` and friends. Each of those differs from the
// obvious Go equivalent somewhere: `.length` counts UTF-16 units, not bytes; `.trim()` strips
// U+FEFF but not U+0085; `Math.round(-2.5)` is -2; `JSON.stringify` does not escape `<`.
// A port that reached for strings.TrimSpace or json.Marshal would drift on exactly the inputs
// nobody tests. Use this package instead.
//
// Value is a parsed request body. Its numbers are float64 because JavaScript's are: a body's
// `amountCents` reaches the Deno code as a double and is checked with Number.isSafeInteger
// before use, and SafeInt does the same check here before handing back an int64. Rows read
// from the database never go through Value; they decode into typed structs with int64 cents.
package js

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"slices"
	"strconv"
)

// Kind is a value's JavaScript type, with null and arrays told apart from objects.
type Kind uint8

// The kinds. Undefined is a missing property, never something JSON can say.
const (
	Undefined Kind = iota
	Null
	Bool
	Number
	String
	Array
	Object
)

// Value is one JSON value, read with JavaScript's semantics.
type Value struct {
	kind Kind
	b    bool
	n    float64
	s    string
	a    []Value
	o    *Obj
}

// Obj is a JavaScript object, read with JSON.parse's semantics: the last duplicate wins, in
// the first one's position.
type Obj struct {
	keys []string // insertion order
	m    map[string]Value
}

// Keys returns the keys in JavaScript's property order (Object.keys, for...in,
// JSON.stringify): integer-like keys ("0", "17") first in ascending numeric order, then the
// rest in insertion order.
func (o *Obj) Keys() []string {
	if o == nil {
		return nil
	}
	var idx []uint32
	var rest []string
	for _, k := range o.keys {
		if n, ok := arrayIndex(k); ok {
			idx = append(idx, n)
		} else {
			rest = append(rest, k)
		}
	}
	if len(idx) == 0 {
		return o.keys
	}
	slices.Sort(idx)
	out := make([]string, 0, len(o.keys))
	for _, n := range idx {
		out = append(out, strconv.FormatUint(uint64(n), 10))
	}
	return append(out, rest...)
}

// arrayIndex reports whether k is a canonical array index: "0", or digits with no leading
// zero, below 2^32-1.
func arrayIndex(k string) (uint32, bool) {
	if k == "" || len(k) > 10 || (len(k) > 1 && k[0] == '0') {
		return 0, false
	}
	n, err := strconv.ParseUint(k, 10, 64)
	if err != nil || n >= 1<<32-1 {
		return 0, false
	}
	return uint32(n), true
}

// Len is the number of keys.
func (o *Obj) Len() int {
	if o == nil {
		return 0
	}
	return len(o.keys)
}

// Get is property access: the value, or Undefined.
func (o *Obj) Get(key string) Value {
	if o == nil {
		return Value{}
	}
	return o.m[key]
}

// Has is `key in obj` for own properties.
func (o *Obj) Has(key string) bool {
	if o == nil {
		return false
	}
	_, ok := o.m[key]
	return ok
}

// Constructors, mostly for tests and for building values a port passes on.

// UndefinedValue is a missing value.
func UndefinedValue() Value { return Value{} }

// NullValue is null.
func NullValue() Value { return Value{kind: Null} }

// BoolValue is true or false.
func BoolValue(b bool) Value { return Value{kind: Bool, b: b} }

// NumberValue is a number.
func NumberValue(n float64) Value { return Value{kind: Number, n: n} }

// StringValue is a string.
func StringValue(s string) Value { return Value{kind: String, s: s} }

// ArrayValue is an array.
func ArrayValue(items ...Value) Value { return Value{kind: Array, a: items} }

// ObjectValue builds an object from alternating keys and values.
func ObjectValue(kv ...any) Value {
	o := &Obj{m: map[string]Value{}}
	for i := 0; i+1 < len(kv); i += 2 {
		k := kv[i].(string)
		v := kv[i+1].(Value)
		if _, seen := o.m[k]; !seen {
			o.keys = append(o.keys, k)
		}
		o.m[k] = v
	}
	return Value{kind: Object, o: o}
}

// Kind returns the value's kind.
func (v Value) Kind() Kind { return v.kind }

// TypeOf is the `typeof` operator: null and arrays are "object".
func (v Value) TypeOf() string {
	switch v.kind {
	case Null, Array, Object:
		return "object"
	case Bool:
		return "boolean"
	case Number:
		return "number"
	case String:
		return "string"
	default:
		return "undefined"
	}
}

// IsUndefined reports a missing value.
func (v Value) IsUndefined() bool { return v.kind == Undefined }

// IsNull reports null (=== null).
func (v Value) IsNull() bool { return v.kind == Null }

// IsNullish reports null or undefined (== null).
func (v Value) IsNullish() bool { return v.kind == Null || v.kind == Undefined }

// Str returns the string when the value is one.
func (v Value) Str() (string, bool) { return v.s, v.kind == String }

// Num returns the number when the value is one.
func (v Value) Num() (float64, bool) { return v.n, v.kind == Number }

// Bool returns the boolean when the value is one.
func (v Value) Bool() (bool, bool) { return v.b, v.kind == Bool }

// Array returns the items when the value is an array (Array.isArray).
func (v Value) Array() ([]Value, bool) { return v.a, v.kind == Array }

// Object returns the object when the value is a non-null, non-array object.
func (v Value) Object() (*Obj, bool) { return v.o, v.kind == Object }

// IsPlainObject is `typeof v === "object" && v !== null && !Array.isArray(v)`.
func (v Value) IsPlainObject() bool { return v.kind == Object }

// Get is property access on an object; anything else answers Undefined. (JavaScript would
// throw on null.x; a port that can reach that line should test for null first, as the
// original must have.)
func (v Value) Get(key string) Value {
	if v.kind != Object {
		return Value{}
	}
	return v.o.Get(key)
}

// Has is `key in v` on an object.
func (v Value) Has(key string) bool { return v.kind == Object && v.o.Has(key) }

// Truthy is JavaScript's truthiness.
func (v Value) Truthy() bool {
	switch v.kind {
	case Bool:
		return v.b
	case Number:
		return v.n != 0 && !math.IsNaN(v.n)
	case String:
		return v.s != ""
	case Array, Object:
		return true
	default:
		return false
	}
}

// IsTrue is `v === true`.
func (v Value) IsTrue() bool { return v.kind == Bool && v.b }

// SafeInt returns the number as an int64 when it is a safe integer
// (Number.isSafeInteger), the test every cents field goes through.
func (v Value) SafeInt() (int64, bool) {
	if v.kind != Number || !IsSafeInteger(v.n) {
		return 0, false
	}
	return int64(v.n), true
}

// MarshalJSON writes the value as JSON.stringify would. Undefined has no JSON form; inside
// an object or array the encoder of the container decides (see Marshal).
func (v Value) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	if err := v.write(&b); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

func (v Value) write(b *bytes.Buffer) error {
	switch v.kind {
	case Undefined, Null:
		b.WriteString("null")
	case Bool:
		b.WriteString(strconv.FormatBool(v.b))
	case Number:
		b.WriteString(numberJSON(v.n))
	case String:
		writeString(b, v.s)
	case Array:
		b.WriteByte('[')
		for i, item := range v.a {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := item.write(b); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case Object:
		b.WriteByte('{')
		first := true
		for _, k := range v.o.Keys() {
			item := v.o.m[k]
			if item.kind == Undefined {
				continue
			}
			if !first {
				b.WriteByte(',')
			}
			first = false
			writeString(b, k)
			b.WriteByte(':')
			if err := item.write(b); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	}
	return nil
}

// ErrSyntax is any body JSON.parse would refuse.
var ErrSyntax = errors.New("js: not valid JSON")

// Parse reads a body as `await req.json()` would: one JSON value, optional surrounding
// whitespace, an optional UTF-8 byte-order mark, nothing after.
func Parse(data []byte) (Value, error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := parseValue(dec)
	if err != nil {
		return Value{}, ErrSyntax
	}
	if _, err := dec.Token(); err != io.EOF {
		return Value{}, ErrSyntax
	}
	return v, nil
}

// ParseObject is the shape every readJson helper accepts: a non-null, non-array object.
func ParseObject(data []byte) (Value, error) {
	v, err := Parse(data)
	if err != nil {
		return Value{}, err
	}
	if v.kind != Object {
		return Value{}, ErrSyntax
	}
	return v, nil
}

func parseValue(dec *json.Decoder) (Value, error) {
	tok, err := dec.Token()
	if err != nil {
		return Value{}, err
	}
	return fromToken(dec, tok)
}

func fromToken(dec *json.Decoder, tok json.Token) (Value, error) {
	switch t := tok.(type) {
	case nil:
		return Value{kind: Null}, nil
	case bool:
		return Value{kind: Bool, b: t}, nil
	case string:
		return Value{kind: String, s: t}, nil
	case json.Number:
		// JSON.parse yields the nearest double, and an out-of-range one becomes ±Infinity.
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil && !errors.Is(err, strconv.ErrRange) {
			return Value{}, err
		}
		return Value{kind: Number, n: f}, nil
	case json.Delim:
		switch t {
		case '[':
			items := []Value{}
			for dec.More() {
				item, err := parseValue(dec)
				if err != nil {
					return Value{}, err
				}
				items = append(items, item)
			}
			if _, err := dec.Token(); err != nil {
				return Value{}, err
			}
			return Value{kind: Array, a: items}, nil
		case '{':
			o := &Obj{m: map[string]Value{}}
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return Value{}, err
				}
				k, ok := kt.(string)
				if !ok {
					return Value{}, ErrSyntax
				}
				item, err := parseValue(dec)
				if err != nil {
					return Value{}, err
				}
				if _, seen := o.m[k]; !seen {
					o.keys = append(o.keys, k)
				}
				o.m[k] = item
			}
			if _, err := dec.Token(); err != nil {
				return Value{}, err
			}
			return Value{kind: Object, o: o}, nil
		}
	}
	return Value{}, ErrSyntax
}
