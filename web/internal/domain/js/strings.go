package js

import (
	"regexp"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// IsSpace reports whether r is JavaScript whitespace (WhiteSpace or LineTerminator), the set
// `.trim()` and the regex `\s` use. It differs from unicode.IsSpace: it includes U+FEFF and
// excludes U+0085.
func IsSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00a0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

// Trim is String.prototype.trim.
func Trim(s string) string { return strings.TrimFunc(s, IsSpace) }

// TrimStart is String.prototype.trimStart.
func TrimStart(s string) string { return strings.TrimLeftFunc(s, IsSpace) }

// TrimEnd is String.prototype.trimEnd.
func TrimEnd(s string) string { return strings.TrimRightFunc(s, IsSpace) }

// Len is `.length`: UTF-16 code units, so an emoji counts 2 and "é" counts 1.
func Len(s string) int {
	n := 0
	for _, r := range s {
		if r > 0xffff {
			n += 2
		} else {
			n++
		}
	}
	return n
}

// Slice is String.prototype.slice(start, end) on UTF-16 units, negative indices counting
// from the end. A cut through a surrogate pair leaves a lone half, which Go cannot hold; it
// becomes U+FFFD, the same character a JSON reply would carry for it.
func Slice(s string, start, end int) string {
	units := utf16.Encode([]rune(s))
	n := len(units)
	clamp := func(i int) int {
		if i < 0 {
			i += n
			if i < 0 {
				i = 0
			}
		}
		if i > n {
			i = n
		}
		return i
	}
	from, to := clamp(start), clamp(end)
	if from >= to {
		return ""
	}
	if from == 0 && to == n {
		return s
	}
	return string(utf16.Decode(units[from:to]))
}

// SliceFrom is slice(start) with no end.
func SliceFrom(s string, start int) string { return Slice(s, start, Len(s)) }

// ToLower is toLowerCase. Go's simple mapping turns U+0130 (capital I with a dot) into a
// plain "i"; JavaScript writes "i" plus U+0307, so on an address "İ" can never equal "i".
// That special case is applied here. The Greek final-sigma rule is the one remaining
// difference (Go always writes σ), and it never makes two different strings equal.
func ToLower(s string) string {
	if !strings.ContainsRune(s, 0x0130) {
		return strings.ToLower(s)
	}
	return strings.ToLower(strings.ReplaceAll(s, "\U00000130", "i\U00000307"))
}

// ToUpper is toUpperCase, with the same caveat ("ß" stays "ß" in Go, "SS" in JavaScript).
func ToUpper(s string) string { return strings.ToUpper(s) }

// PadStart is padStart(length, pad) on UTF-16 lengths.
func PadStart(s string, length int, pad string) string {
	missing := length - Len(s)
	if missing <= 0 || pad == "" {
		return s
	}
	var b strings.Builder
	for Len(b.String()) < missing {
		b.WriteString(pad)
	}
	return Slice(b.String(), 0, missing) + s
}

// spaceClass is the body of a character class matching JavaScript's \s.
const spaceClass = `\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// Regexp compiles a JavaScript regex source for Go's RE2, translating the one escape whose
// meaning differs: JavaScript's \s is Unicode whitespace, Go's is ASCII only. \S becomes the
// negated class. Pass flags as JavaScript writes them ("i"); only i, m and s are supported.
// Anything RE2 cannot express (backreferences, lookaround) fails to compile, loudly.
//
// With the i flag, Go folds Unicode (so "ſ" matches s and the Kelvin sign matches k);
// JavaScript without the u flag does not. Where that matters (addresses, hosts), match
// against a copy with only A-Z lowered instead of using the flag.
//
// Other differences worth knowing when porting a pattern: `.` in JavaScript also refuses
// \r, U+2028 and U+2029; `$` without the m flag is end of input in both.
func Regexp(source, flags string) *regexp.Regexp {
	var b strings.Builder
	if flags != "" {
		b.WriteString("(?" + flags + ")")
	}
	inClass := false
	for i := 0; i < len(source); i++ {
		c := source[i]
		switch {
		case c == '\\' && i+1 < len(source):
			next := source[i+1]
			switch {
			case next == 's' && inClass:
				b.WriteString(spaceClass)
			case next == 's':
				b.WriteString("[" + spaceClass + "]")
			case next == 'S' && !inClass:
				b.WriteString("[^" + spaceClass + "]")
			case next == 'S':
				panic("js.Regexp: \\S inside a character class is not supported: " + source)
			default:
				b.WriteByte(c)
				b.WriteByte(next)
			}
			i++
		case c == '[' && !inClass:
			inClass = true
			b.WriteByte(c)
			// A leading ] or ^] is literal; copy it so it does not close the class.
			if i+1 < len(source) && source[i+1] == '^' {
				b.WriteByte('^')
				i++
			}
		case c == ']' && inClass:
			inClass = false
			b.WriteByte(c)
		default:
			b.WriteByte(c)
		}
	}
	return regexp.MustCompile(b.String())
}

// ValidUTF8 replaces invalid bytes with U+FFFD, as a TextDecoder would have.
func ValidUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	return strings.ToValidUTF8(s, "\U0000FFFD")
}
