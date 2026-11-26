// Package validate ports web/lib/validation/* to Go (docs/GO-MIGRATION.md §4.10). Every
// message is byte-identical to the TypeScript, which is itself pinned against the Kotlin twins
// by .github/scripts/check_copy_parity.py, so the three platforms say the same words.
//
// The rules are zod's, and zod is JavaScript, so three of its quiet behaviours are reproduced
// here on purpose rather than swapped for Go's nearest equivalent:
//
//   - .trim() is String.prototype.trim (JSTrim), not strings.TrimSpace: it removes U+FEFF and
//     keeps U+0085, the reverse of Go on both.
//   - .min(n) and .max(n) count UTF-16 code units (UTF16Len), not bytes or runes: an emoji in a
//     name is two.
//   - \s and \d in a regex without the u flag are JS's sets: \s is JSTrim's whitespace, \d is
//     ASCII 0-9 only.
//
// Each validator returns the cleaned value (what zod's parsed.data held) and Errors keyed by the
// form field's name, in the order zod reports them. Pages show the first per field.
//
// Area sessions porting other validation (profile, companions, preferences, client) add their
// own files to this package; text.go, auth.go, mfa.go, registration.go and
// password_strength.go belong to the auth area's port.
package validate

import (
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

// Errors maps a field name to its messages, in the order the rules ran (flattenIssues).
type Errors map[string][]string

// Add appends msg to field's messages.
func (e Errors) Add(field, msg string) { e[field] = append(e[field], msg) }

// First is the message a page shows next to field, or "".
func (e Errors) First(field string) string {
	if m := e[field]; len(m) > 0 {
		return m[0]
	}
	return ""
}

// Empty reports whether nothing failed.
func (e Errors) Empty() bool { return len(e) == 0 }

// isJSSpace is ECMAScript's WhiteSpace and LineTerminator: what String.prototype.trim removes
// and what \s matches.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\v', '\f', ' ', '\u00a0', '\ufeff', // WhiteSpace
		'\n', '\r', '\u2028', '\u2029': // LineTerminator
		return true
	}
	return unicode.Is(unicode.Zs, r) // USP: every other Space_Separator
}

// JSTrim is String.prototype.trim (zod's .trim()).
func JSTrim(s string) string {
	start := 0
	for start < len(s) {
		r, n := utf8.DecodeRuneInString(s[start:])
		if !isJSSpace(r) {
			break
		}
		start += n
	}
	end := len(s)
	for end > start {
		r, n := utf8.DecodeLastRuneInString(s[start:end])
		if !isJSSpace(r) {
			break
		}
		end -= n
	}
	return s[start:end]
}

// UTF16Len is a JavaScript string's .length: UTF-16 code units.
func UTF16Len(s string) int {
	n := 0
	for _, r := range s { // invalid UTF-8 ranges as U+FFFD, one unit, as a browser decodes it
		n += utf16.RuneLen(r)
	}
	return n
}

// HasControl reports a C0 or C1 control character anywhere in s (\p{Cc}), the complement of
// web/lib/validation/text.ts NO_CONTROL_CHARS.
func HasControl(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Cc, r) {
			return true
		}
	}
	return false
}
