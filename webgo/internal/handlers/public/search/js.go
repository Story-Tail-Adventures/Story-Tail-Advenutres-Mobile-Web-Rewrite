package search

import (
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// This file holds the JavaScript built-ins the TypeScript leaned on, ported so the strings
// come out the same. Each one says which built-in it stands for. None of them is Go's
// nearest equivalent, because each nearest equivalent differs somewhere that shows in a URL
// or on the page.

// isJSSpace reports whether r is in String.prototype.trim's set (WhiteSpace plus
// LineTerminator), which is also what \s matches in a JavaScript regular expression.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F,
		0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// jsTrim is String.prototype.trim.
func jsTrim(s string) string { return strings.TrimFunc(s, isJSSpace) }

// utf16Len is a JavaScript string's length: UTF-16 code units, which is what zod's min and
// max count and what String.prototype.slice cuts by.
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// sliceUTF16 is s.slice(0, n). When the cut falls inside a surrogate pair, JavaScript keeps
// the lone high half; nothing in Go can hold that, and every place the TypeScript then sent
// it (a URL, the page) shows U+FFFD in its place, so that is what this keeps.
func sliceUTF16(s string, n int) string {
	units := 0
	for i, r := range s {
		w := utf16.RuneLen(r)
		if units+w > n {
			if units < n {
				return s[:i] + string(utf8.RuneError)
			}
			return s[:i]
		}
		units += w
	}
	return s
}

// decodeUTF8 is the Encoding Standard's "UTF-8 decode without BOM": every maximal invalid
// subpart becomes one U+FFFD. URLSearchParams decodes its values this way. It differs from
// strings.ToValidUTF8 (one U+FFFD per run) and from utf8.DecodeRune (one per byte).
func decodeUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 8)
	var need, seen int
	var cp rune
	lower, upper := byte(0x80), byte(0xBF)
	for i := 0; i < len(s); {
		c := s[i]
		if need == 0 {
			i++
			switch {
			case c <= 0x7F:
				b.WriteByte(c)
			case c >= 0xC2 && c <= 0xDF:
				need, cp = 1, rune(c&0x1F)
			case c >= 0xE0 && c <= 0xEF:
				if c == 0xE0 {
					lower = 0xA0
				}
				if c == 0xED {
					upper = 0x9F
				}
				need, cp = 2, rune(c&0x0F)
			case c >= 0xF0 && c <= 0xF4:
				if c == 0xF0 {
					lower = 0x90
				}
				if c == 0xF4 {
					upper = 0x8F
				}
				need, cp = 3, rune(c&0x07)
			default:
				b.WriteRune(utf8.RuneError)
			}
			continue
		}
		if c < lower || c > upper {
			// The byte is not consumed: it starts again on the next turn.
			need, seen, cp = 0, 0, 0
			lower, upper = 0x80, 0xBF
			b.WriteRune(utf8.RuneError)
			continue
		}
		i++
		lower, upper = 0x80, 0xBF
		cp = cp<<6 | rune(c&0x3F)
		seen++
		if seen == need {
			b.WriteRune(cp)
			need, seen, cp = 0, 0, 0
		}
	}
	if need != 0 {
		b.WriteRune(utf8.RuneError)
	}
	return b.String()
}

// isFormSafe is the application/x-www-form-urlencoded byte set that passes unescaped.
func isFormSafe(c byte) bool {
	return c == '*' || c == '-' || c == '.' || c == '_' ||
		('0' <= c && c <= '9') || ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z')
}

// formEncode is URLSearchParams's serializer for one name or value. url.QueryEscape is not
// it: that escapes "*" and keeps "~", and URLSearchParams does the opposite.
func formEncode(s string) string {
	s = decodeUTF8(s)
	var b strings.Builder
	b.Grow(len(s) + 8)
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ':
			b.WriteByte('+')
		case isFormSafe(c):
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0x0F])
		}
	}
	return b.String()
}

// encodeURIComponent keeps A-Z a-z 0-9 - _ . ! ~ * ' ( ) and percent-encodes every other
// UTF-8 byte.
func encodeURIComponent(s string) string {
	s = decodeUTF8(s)
	var b strings.Builder
	b.Grow(len(s) + 8)
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(s); i++ {
		c := s[i]
		if ('0' <= c && c <= '9') || ('A' <= c && c <= 'Z') || ('a' <= c && c <= 'z') ||
			strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[c>>4])
		b.WriteByte(hex[c&0x0F])
	}
	return b.String()
}

// params is a URLSearchParams being built: an ordered list of pairs, so the query string
// comes out in the order the TypeScript wrote it.
type params struct{ pairs [][2]string }

// set is URLSearchParams.set: the first pair with that name takes the value in place and
// any later ones go; with none, the pair goes on the end.
func (p *params) set(name, value string) {
	out := p.pairs[:0]
	found := false
	for _, kv := range p.pairs {
		if kv[0] != name {
			out = append(out, kv)
			continue
		}
		if !found {
			out = append(out, [2]string{name, value})
			found = true
		}
	}
	p.pairs = out
	if !found {
		p.pairs = append(p.pairs, [2]string{name, value})
	}
}

// add is URLSearchParams.append.
func (p *params) add(name, value string) { p.pairs = append(p.pairs, [2]string{name, value}) }

// String is URLSearchParams.toString.
func (p *params) String() string {
	var b strings.Builder
	for i, kv := range p.pairs {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(formEncode(kv[0]))
		b.WriteByte('=')
		b.WriteString(formEncode(kv[1]))
	}
	return b.String()
}

// ParseQuery reads a query string the way URLSearchParams (and so Next's searchParams)
// does, for a handler that wants the TypeScript's reading of a URL exactly. Use it on
// r.URL.RawQuery in place of r.URL.Query(), which differs on hostile input: Go drops a pair
// whose name has a ";" or whose escapes are malformed ("dest=100%"), where URLSearchParams
// keeps the text as typed. A leading "?" is ignored, like the URLSearchParams constructor.
func ParseQuery(raw string) url.Values {
	raw = strings.TrimPrefix(raw, "?")
	out := url.Values{}
	for _, seq := range strings.Split(raw, "&") {
		if seq == "" {
			continue
		}
		name, value, _ := strings.Cut(seq, "=")
		name, value = formDecode(name), formDecode(value)
		out[name] = append(out[name], value)
	}
	return out
}

// formDecode turns "+" into a space and %XX into a byte, keeping a "%" that does not start
// a valid escape, then decodes the bytes as UTF-8 with replacement.
func formDecode(s string) string {
	if !strings.ContainsAny(s, "+%") {
		return decodeUTF8(s)
	}
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '+':
			b = append(b, ' ')
		case c == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]):
			b = append(b, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 2
		default:
			b = append(b, c)
		}
	}
	return decodeUTF8(string(b))
}

func isHex(c byte) bool {
	return ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}

func unhex(c byte) byte {
	switch {
	case c >= 'a':
		return c - 'a' + 10
	case c >= 'A':
		return c - 'A' + 10
	}
	return c - '0'
}

// parseInt is Number.parseInt(s, 10): leading whitespace skipped, one optional sign, then
// as many decimal digits as there are. False is NaN (no digits at all).
func parseInt(s string) (float64, bool) {
	s = strings.TrimLeftFunc(s, isJSSpace)
	neg := false
	if s != "" && (s[0] == '+' || s[0] == '-') {
		neg = s[0] == '-'
		s = s[1:]
	}
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0, false
	}
	v, _ := strconv.ParseFloat(s[:end], 64) // digits only, so the only error is range: ±Inf
	if neg {
		v = -v
	}
	return v, true
}

// decimalLiteral is StrDecimalLiteral without its "Infinity" arm.
var decimalLiteral = regexp.MustCompile(`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

// toNumber is Number(string): whitespace trimmed, empty is 0, decimal with an optional
// exponent, "Infinity", and the 0x / 0o / 0b integer forms. Anything else is NaN.
func toNumber(s string) float64 {
	s = jsTrim(s)
	switch s {
	case "":
		return 0
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if len(s) > 2 && s[0] == '0' {
		base := 0
		switch s[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			v := 0.0
			for i := 2; i < len(s); i++ {
				d := digitValue(s[i])
				if d < 0 || d >= base {
					return math.NaN()
				}
				v = v*float64(base) + float64(d)
			}
			return v
		}
	}
	if !decimalLiteral.MatchString(s) {
		return math.NaN()
	}
	v, _ := strconv.ParseFloat(s, 64) // the grammar is checked, so only range: ±Inf or 0
	return v
}

func digitValue(c byte) int {
	switch {
	case '0' <= c && c <= '9':
		return int(c - '0')
	case 'a' <= c && c <= 'z':
		return int(c-'a') + 10
	case 'A' <= c && c <= 'Z':
		return int(c-'A') + 10
	}
	return -1
}

// numberString is Number.prototype.toString() in base 10: the shortest digits that round
// trip, written plainly from 1e-7 up to 1e21 and in exponent form outside it.
func numberString(x float64) string {
	switch {
	case math.IsNaN(x):
		return "NaN"
	case x == 0:
		return "0"
	case math.IsInf(x, 1):
		return "Infinity"
	case math.IsInf(x, -1):
		return "-Infinity"
	case x < 0:
		return "-" + numberString(-x)
	}
	e := strconv.FormatFloat(x, 'e', -1, 64) // "d.ddde±XX"
	mant, exp, _ := strings.Cut(e, "e")
	digits := strings.Replace(mant, ".", "", 1)
	n64, _ := strconv.Atoi(exp)
	n := n64 + 1 // x = 0.digits × 10^n
	k := len(digits)
	switch {
	case k <= n && n <= 21:
		return digits + strings.Repeat("0", n-k)
	case 0 < n && n <= 21:
		return digits[:n] + "." + digits[n:]
	case -6 < n && n <= 0:
		return "0." + strings.Repeat("0", -n) + digits
	}
	sign := "+"
	if n-1 < 0 {
		sign = "-"
	}
	abs := n - 1
	if abs < 0 {
		abs = -abs
	}
	if k == 1 {
		return digits + "e" + sign + strconv.Itoa(abs)
	}
	return digits[:1] + "." + digits[1:] + "e" + sign + strconv.Itoa(abs)
}

// padStart is s.padStart(width, "0").
func padStart(s string, width int) string {
	if n := utf16Len(s); n < width {
		return strings.Repeat("0", width-n) + s
	}
	return s
}
