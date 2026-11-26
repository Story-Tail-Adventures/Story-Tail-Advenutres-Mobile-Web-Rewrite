package search

import (
	"strings"
)

// safeNext ports web/lib/safe-next.ts exactly, for the links built here: only a same-origin
// path survives, as `${pathname}${search}${hash}` of new URL(value, "http://localhost").
//
// It is not gate.SafeNext, which guards the redirect itself and is just as safe, because the
// two write different strings. The browser's parser percent-encodes what it cleans (a
// space in the query becomes %20, a non-ASCII path byte %XX), resolves "." and ".."
// segments, and reads "//localhost/x" as this origin; gate.SafeNext keeps the query as
// typed and refuses any "//". A link the TypeScript wrote as next=%2Fx%3Fq%3Da%2520b must
// come out the same here.
func safeNext(raw, fallback string) string {
	if !strings.HasPrefix(raw, "/") {
		return fallback
	}
	s := strings.TrimRightFunc(decodeUTF8(raw), func(r rune) bool { return r <= 0x20 })
	s = strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(s)

	rest := s[1:]
	if rest != "" && (rest[0] == '/' || rest[0] == '\\') {
		// "//host…": an authority. It is this origin only as localhost on the default port.
		rest = strings.TrimLeft(rest, "/\\")
		host, port, ok := parseAuthority(rest, true, isAuthorityEnd)
		if !ok || host != "localhost" || (port != -1 && port != 80) {
			return fallback
		}
		end := strings.IndexAny(rest, "/\\?#")
		if end < 0 {
			end = len(rest)
		}
		rest = rest[end:]
		if rest != "" && (rest[0] == '/' || rest[0] == '\\') {
			rest = rest[1:] // the path's own leading slash
		}
	}

	pathPart, query, fragment := rest, "", ""
	if i := strings.IndexAny(pathPart, "?#"); i >= 0 {
		pathPart, rest = pathPart[:i], pathPart[i:]
		if rest[0] == '?' {
			query, fragment, _ = strings.Cut(rest[1:], "#")
		} else {
			fragment = rest[1:]
		}
	}

	segments := splitSlashes(pathPart)
	var path []string
	for i, seg := range segments {
		last := i == len(segments)-1
		enc := percentEncode(seg, inPathSet)
		switch {
		case isDoubleDot(enc):
			if len(path) > 0 {
				path = path[:len(path)-1]
			}
			if last {
				path = append(path, "")
			}
		case isSingleDot(enc):
			if last {
				path = append(path, "")
			}
		default:
			path = append(path, enc)
		}
	}

	out := "/" + strings.Join(path, "/")
	if q := percentEncode(query, inSpecialQuerySet); q != "" {
		out += "?" + q
	}
	if f := percentEncode(fragment, inFragmentSet); f != "" {
		out += "#" + f
	}
	return out
}

// splitSlashes splits a special URL's path on "/" and "\", keeping empty segments, so
// "a//b" is three.
func splitSlashes(p string) []string {
	var out []string
	start := 0
	for i := 0; i < len(p); i++ {
		if p[i] == '/' || p[i] == '\\' {
			out = append(out, p[start:i])
			start = i + 1
		}
	}
	return append(out, p[start:])
}

func isSingleDot(s string) bool { return s == "." || strings.EqualFold(s, "%2e") }

func isDoubleDot(s string) bool {
	switch strings.ToLower(s) {
	case "..", ".%2e", "%2e.", "%2e%2e":
		return true
	}
	return false
}

// The URL Standard's percent-encode sets, for one UTF-8 byte.
func inC0Set(c byte) bool           { return c < 0x20 || c > 0x7E }
func inFragmentSet(c byte) bool     { return inC0Set(c) || strings.IndexByte(" \"<>`", c) >= 0 }
func inQuerySet(c byte) bool        { return inC0Set(c) || strings.IndexByte(" \"#<>", c) >= 0 }
func inPathSet(c byte) bool         { return inQuerySet(c) || strings.IndexByte("?^`{}", c) >= 0 }
func inSpecialQuerySet(c byte) bool { return inQuerySet(c) || c == '\'' }

// percentEncode writes each byte in the set as %XX; "%" itself is kept as it is.
func percentEncode(s string, in func(byte) bool) string {
	var b strings.Builder
	const hex = "0123456789ABCDEF"
	for i := 0; i < len(s); i++ {
		c := s[i]
		if in(c) {
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0x0F])
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}
