package js

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"unicode/utf8"
)

// Marshal is JSON.stringify for a reply body: no HTML escaping, no trailing newline, U+2028
// and U+2029 left raw, -0 written as 0. A reply built with encoding/json alone would differ
// from the Deno function's on any `<`, `>` or `&` in a name or a note, and mobile compares
// nothing but it is still a drift the differential test would (rightly) flag.
//
// Build objects whose key order matters with O (JavaScript keeps insertion order; a Go map
// does not). Structs marshal in field order, which is fine when the fields are declared in
// the order the original object literal wrote them.
func Marshal(v any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	out := bytes.TrimSuffix(b.Bytes(), []byte("\n"))
	return unescapeGoOnly(out), nil
}

// goOnlyEscapes are the escapes encoding/json writes and JSON.stringify never does: the HTML
// trio (from any nested Marshaler that used plain json.Marshal), the two line separators,
// and the replacement character it writes for invalid UTF-8.
var goOnlyEscapes = map[string]string{
	"\\u003c": "<",
	"\\u003e": ">",
	"\\u0026": "&",
	"\\u2028": "\U00002028",
	"\\u2029": "\U00002029",
	"\\ufffd": "\U0000FFFD",
}

// unescapeGoOnly rewrites those escapes to raw characters. An escape only counts when it is
// preceded by an even number of backslashes: `\\u003c` is the text <, not a `<`.
func unescapeGoOnly(in []byte) []byte {
	if !bytes.Contains(in, []byte(`\u`)) {
		return in
	}
	out := make([]byte, 0, len(in))
	for i := 0; i < len(in); i++ {
		if in[i] != '\\' {
			out = append(out, in[i])
			continue
		}
		// in[i] is a backslash that starts an escape (we skip the escaped byte below).
		if i+6 <= len(in) && in[i+1] == 'u' {
			if raw, ok := goOnlyEscapes[string(in[i:i+6])]; ok {
				out = append(out, raw...)
				i += 5
				continue
			}
		}
		if i+1 < len(in) {
			out = append(out, in[i], in[i+1])
			i++
			continue
		}
		out = append(out, in[i])
	}
	return out
}

// writeString writes a string as JSON.stringify's QuoteJSONString does.
func writeString(b *bytes.Buffer, s string) {
	const hex = "0123456789abcdef"
	b.WriteByte('"')
	for i := 0; i < len(s); {
		c := s[i]
		if c < utf8.RuneSelf {
			switch {
			case c == '"':
				b.WriteString(`\"`)
			case c == '\\':
				b.WriteString(`\\`)
			case c == '\b':
				b.WriteString(`\b`)
			case c == '\f':
				b.WriteString(`\f`)
			case c == '\n':
				b.WriteString(`\n`)
			case c == '\r':
				b.WriteString(`\r`)
			case c == '\t':
				b.WriteString(`\t`)
			case c < 0x20:
				b.WriteString(`\u00`)
				b.WriteByte(hex[c>>4])
				b.WriteByte(hex[c&0xf])
			default:
				b.WriteByte(c)
			}
			i++
			continue
		}
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && size == 1 {
			b.WriteString("\U0000FFFD")
		} else {
			b.WriteString(s[i : i+size])
		}
		i += size
	}
	b.WriteByte('"')
}

// numberJSON is how JSON.stringify writes a number: NaN and Infinity become null, -0 is 0,
// and the digits are the shortest that round-trip, in the same notation JavaScript picks.
func numberJSON(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}
	return NumberString(f)
}

// Num is a float64 that marshals as JSON.stringify writes a number. Use it for any computed
// non-integer field in a reply (a percentage, a ratio): encoding/json fails on NaN and
// writes "-0" for negative zero, where the Deno function wrote null and 0.
type Num float64

// MarshalJSON implements json.Marshaler.
func (n Num) MarshalJSON() ([]byte, error) { return []byte(numberJSON(float64(n))), nil }

// Field is one key of an ordered object.
type Field struct {
	Key   string
	Value any
}

// Ordered is a JavaScript object literal: keys in the order written. A key whose value is
// Undef is left out, as JSON.stringify leaves out undefined.
type Ordered []Field

// Undef marks a value JSON.stringify would drop (an `undefined` property).
var Undef = undefMarker{}

type undefMarker struct{}

// O builds an Ordered from alternating keys and values: O("tripId", id, "changed", true).
func O(kv ...any) Ordered {
	o := make(Ordered, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		o = append(o, Field{Key: kv[i].(string), Value: kv[i+1]})
	}
	return o
}

// Set adds or replaces a key, keeping a replaced key in its first position, as assigning to
// an existing property does.
func (o Ordered) Set(key string, value any) Ordered {
	for i := range o {
		if o[i].Key == key {
			o[i].Value = value
			return o
		}
	}
	return append(o, Field{Key: key, Value: value})
}

// Spread appends another object's keys, as `{...a, ...b}` does.
func (o Ordered) Spread(other Ordered) Ordered {
	for _, f := range other {
		o = o.Set(f.Key, f.Value)
	}
	return o
}

// MarshalJSON implements json.Marshaler.
func (o Ordered) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	first := true
	for _, f := range o {
		if _, skip := f.Value.(undefMarker); skip {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		writeString(&b, f.Key)
		b.WriteByte(':')
		v, err := Marshal(f.Value)
		if err != nil {
			return nil, err
		}
		b.Write(v)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// NumberString is String(n) / Number.prototype.toString(): plain digits from 1e-6 up to
// 1e21, exponent form outside that, "NaN", "Infinity", and "0" for -0.
func NumberString(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	s := []byte(strconv.FormatFloat(f, 'e', -1, 64))
	// Go writes e-07 and e+21; JavaScript writes e-7 and e+21.
	if n := len(s); n >= 4 && s[n-4] == 'e' && s[n-2] == '0' {
		s = append(s[:n-2], s[n-1])
	}
	return string(s)
}
