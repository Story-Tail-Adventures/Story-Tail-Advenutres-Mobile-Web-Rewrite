package paylink

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// This file is the WHATWG URL Standard's basic URL parser (https://url.spec.whatwg.org/),
// with no base URL and no state override, which is all `new URL(raw)` uses. It follows the
// spec's state machine step by step so the two can be read side by side; the comments name
// the spec's states.
//
// Where Deno 2.9.6 and the current spec text differ, it does what Deno does:
//   - the path percent-encode set does not include ^ (newer spec text adds it);
//   - an opaque path keeps a space before ? or # (newer text writes %20);
//   - a port ends at a backslash whatever the scheme;
//   - an @ with no host after it is not always a failure (see the authority state).
//
// Only the first changes what an https link stores; the others only change which sentence a
// non-https link is refused with. paylink_test.go pins Deno's answers for a sample.

type parsedURL struct {
	scheme   string
	username string
	password string
	host     *string // nil is null; the serialized host otherwise
	port     *int
	path     []string // for a URL with a hierarchical path
	opaque   *string  // the opaque path, for a URL like javascript:alert(1)
	query    *string
	fragment *string

	// The parts that grow a character at a time are built here and set once at the end:
	// `s += x` per character is quadratic in Go (JavaScript's strings are ropes), and a 1.6M
	// character link took 68 seconds (review of #187).
	ub, pb, ob, fb strings.Builder
}

// flush sets the built parts.
func (u *parsedURL) flush() {
	u.username += u.ub.String()
	u.password += u.pb.String()
	if u.opaque != nil {
		*u.opaque += u.ob.String()
	}
	if u.fragment != nil {
		*u.fragment += u.fb.String()
	}
}

func (u *parsedURL) special() bool { return isSpecialScheme(u.scheme) }

// hostname is url.hostname: the serialized host, or "".
func (u *parsedURL) hostname() string {
	if u.host == nil {
		return ""
	}
	return *u.host
}

// href is the URL serializer, url.href.
func (u *parsedURL) href() string {
	var b strings.Builder
	b.WriteString(u.scheme)
	b.WriteByte(':')
	if u.host != nil {
		b.WriteString("//")
		if u.username != "" || u.password != "" {
			b.WriteString(u.username)
			if u.password != "" {
				b.WriteByte(':')
				b.WriteString(u.password)
			}
			b.WriteByte('@')
		}
		b.WriteString(*u.host)
		if u.port != nil {
			b.WriteByte(':')
			b.WriteString(strconv.Itoa(*u.port))
		}
	}
	if u.opaque != nil {
		b.WriteString(*u.opaque)
	} else {
		if u.host == nil && len(u.path) > 1 && u.path[0] == "" {
			b.WriteString("/.")
		}
		for _, segment := range u.path {
			b.WriteByte('/')
			b.WriteString(segment)
		}
	}
	if u.query != nil {
		b.WriteByte('?')
		b.WriteString(*u.query)
	}
	if u.fragment != nil {
		b.WriteByte('#')
		b.WriteString(*u.fragment)
	}
	return b.String()
}

func isSpecialScheme(scheme string) bool {
	switch scheme {
	case "ftp", "file", "http", "https", "ws", "wss":
		return true
	}
	return false
}

func defaultPort(scheme string) int {
	switch scheme {
	case "ftp":
		return 21
	case "http", "ws":
		return 80
	case "https", "wss":
		return 443
	}
	return -1
}

type urlState int

const (
	stSchemeStart urlState = iota
	stScheme
	stNoScheme
	stSpecialAuthoritySlashes
	stSpecialAuthorityIgnoreSlashes
	stPathOrAuthority
	stAuthority
	stHost
	stPort
	stFile
	stFileSlash
	stFileHost
	stPathStart
	stPath
	stOpaquePath
	stQuery
	stFragment
)

const eof rune = -1

// parseURL is `new URL(input)`: the parsed URL, or false where new URL() throws.
func parseURL(input string) (*parsedURL, bool) {
	u, ok := parseParts(input)
	if ok {
		u.flush()
	}
	return u, ok
}

func parseParts(input string) (*parsedURL, bool) {
	// Strip leading and trailing C0 control or space, then remove every ASCII tab or newline.
	trimmed := strings.TrimFunc(input, func(r rune) bool { return r <= 0x20 })
	in := make([]rune, 0, len(trimmed))
	for _, r := range trimmed {
		if r != '\t' && r != '\n' && r != '\r' {
			in = append(in, r)
		}
	}

	u := &parsedURL{}
	state := stSchemeStart
	var buf []rune
	atSignSeen, insideBrackets, passwordTokenSeen := false, false, false
	authStart, atCount, atPos := -1, 0, -1 // for Deno's empty-host quirk in the authority state
	at := func(i int) rune {
		if i >= 0 && i < len(in) {
			return in[i]
		}
		return eof
	}

	for p := 0; ; p++ {
		c := at(p)
		switch state {
		case stSchemeStart:
			if isASCIIAlpha(c) {
				buf = append(buf, asciiLower(c))
				state = stScheme
			} else {
				state = stNoScheme
				p--
			}

		case stScheme:
			switch {
			case isASCIIAlpha(c) || isASCIIDigit(c) || c == '+' || c == '-' || c == '.':
				buf = append(buf, asciiLower(c))
			case c == ':':
				u.scheme = string(buf)
				buf = buf[:0]
				switch {
				case u.scheme == "file":
					state = stFile
				case u.special():
					// No base URL, so straight to the slashes.
					state = stSpecialAuthoritySlashes
				case at(p+1) == '/':
					state = stPathOrAuthority
					p++
				default:
					empty := ""
					u.opaque = &empty
					state = stOpaquePath
				}
			default:
				buf = buf[:0]
				state = stNoScheme
				p = -1 // start over from the first code point
			}

		case stNoScheme:
			// No scheme and no base URL to resolve against.
			return nil, false

		case stSpecialAuthoritySlashes:
			state = stSpecialAuthorityIgnoreSlashes
			if c == '/' && at(p+1) == '/' {
				p++
			} else {
				p--
			}

		case stSpecialAuthorityIgnoreSlashes:
			if c != '/' && c != '\\' {
				state = stAuthority
				p--
			}

		case stPathOrAuthority:
			if c == '/' {
				state = stAuthority
			} else {
				state = stPath
				p--
			}

		case stAuthority:
			if authStart < 0 {
				authStart = p
			}
			switch {
			case c == '@':
				atCount++
				atPos = p
				if atSignSeen {
					buf = append([]rune("%40"), buf...)
				}
				atSignSeen = true
				for _, cp := range buf {
					if cp == ':' && !passwordTokenSeen {
						passwordTokenSeen = true
						continue
					}
					if passwordTokenSeen {
						u.pb.WriteString(percentEncode(cp, inUserinfoSet))
					} else {
						u.ub.WriteString(percentEncode(cp, inUserinfoSet))
					}
				}
				buf = buf[:0]
			case c == eof || c == '/' || c == '?' || c == '#' || (u.special() && c == '\\'):
				if atSignSeen && len(buf) == 0 {
					// Host missing: the spec fails here, Deno not always. With
					// nothing before the @ ("foo://@") it fails unless the input ends there;
					// otherwise a non-special URL may have an empty host as long as the
					// user name and password are empty too ("foo://:@/x" is foo:///x).
					// Only a non-https answer's sentence depends on this.
					if atCount == 1 && atPos == authStart {
						if c == eof && !u.special() {
							empty := ""
							u.host = &empty
							return u, true
						}
						return nil, false
					}
					if u.special() || u.ub.Len() > 0 || u.pb.Len() > 0 {
						return nil, false
					}
					empty := ""
					u.host = &empty
					state = stPathStart
					p--
					break
				}
				p -= len(buf) + 1
				buf = buf[:0]
				state = stHost
			default:
				buf = append(buf, c)
			}

		case stHost:
			switch {
			case c == ':' && !insideBrackets:
				if len(buf) == 0 {
					return nil, false
				}
				host, ok := parseHost(buf, !u.special())
				if !ok {
					return nil, false
				}
				u.host = &host
				buf = buf[:0]
				state = stPort
			case c == eof || c == '/' || c == '?' || c == '#' || (u.special() && c == '\\'):
				p--
				if u.special() && len(buf) == 0 {
					return nil, false
				}
				host, ok := parseHost(buf, !u.special())
				if !ok {
					return nil, false
				}
				u.host = &host
				buf = buf[:0]
				state = stPathStart
			default:
				if c == '[' {
					insideBrackets = true
				}
				if c == ']' {
					insideBrackets = false
				}
				buf = append(buf, c)
			}

		case stPort:
			switch {
			case isASCIIDigit(c):
				buf = append(buf, c)
			// Deno ends a port at a backslash whatever the scheme (the spec only does for a
			// special one): new URL("foo://h:0\\x") is foo://h:0/\\x there, not a failure.
			case c == eof || c == '/' || c == '?' || c == '#' || c == '\\':
				if len(buf) != 0 {
					port := 0
					for _, d := range buf {
						port = port*10 + int(d-'0')
						if port > 65535 {
							return nil, false
						}
					}
					if port == defaultPort(u.scheme) {
						u.port = nil
					} else {
						u.port = &port
					}
					buf = buf[:0]
				}
				state = stPathStart
				p--
			default:
				return nil, false
			}

		case stFile:
			u.scheme = "file"
			empty := ""
			u.host = &empty
			if c == '/' || c == '\\' {
				state = stFileSlash
			} else {
				state = stPath
				p--
			}

		case stFileSlash:
			if c == '/' || c == '\\' {
				state = stFileHost
			} else {
				state = stPath
				p--
			}

		case stFileHost:
			if c == eof || c == '/' || c == '\\' || c == '?' || c == '#' {
				p--
				switch {
				case isWindowsDriveLetter(buf):
					// The buffer is not reset: the path state uses it.
					state = stPath
				case len(buf) == 0:
					empty := ""
					u.host = &empty
					state = stPathStart
				default:
					host, ok := parseHost(buf, false)
					if !ok {
						return nil, false
					}
					if host == "localhost" {
						host = ""
					}
					u.host = &host
					buf = buf[:0]
					state = stPathStart
				}
			} else {
				buf = append(buf, c)
			}

		case stPathStart:
			switch {
			case u.special():
				state = stPath
				if c != '/' && c != '\\' {
					p--
				}
			case c == '?':
				empty := ""
				u.query = &empty
				state = stQuery
			case c == '#':
				empty := ""
				u.fragment = &empty
				state = stFragment
			case c != eof:
				state = stPath
				if c != '/' {
					p--
				}
			}

		case stPath:
			slash := c == '/' || (u.special() && c == '\\')
			if c == eof || slash || c == '?' || c == '#' {
				segment := string(buf)
				switch {
				case isDoubleDotSegment(segment):
					u.shortenPath()
					if !slash {
						u.path = append(u.path, "")
					}
				case isSingleDotSegment(segment) && !slash:
					u.path = append(u.path, "")
				case !isSingleDotSegment(segment):
					if u.scheme == "file" && len(u.path) == 0 && isWindowsDriveLetter(buf) {
						buf[1] = ':'
						segment = string(buf)
					}
					u.path = append(u.path, segment)
				}
				buf = buf[:0]
				if c == '?' {
					empty := ""
					u.query = &empty
					state = stQuery
				}
				if c == '#' {
					empty := ""
					u.fragment = &empty
					state = stFragment
				}
			} else {
				buf = append(buf, []rune(percentEncode(c, inPathSet))...)
			}

		case stOpaquePath:
			switch {
			case c == '?':
				empty := ""
				u.query = &empty
				state = stQuery
			case c == '#':
				empty := ""
				u.fragment = &empty
				state = stFragment
			case c != eof:
				u.ob.WriteString(percentEncode(c, inC0ControlSet))
			}

		case stQuery:
			if c == '#' || c == eof {
				set := inQuerySet
				if u.special() {
					set = inSpecialQuerySet
				}
				var b strings.Builder
				for _, r := range buf {
					b.WriteString(percentEncode(r, set))
				}
				*u.query += b.String()
				buf = buf[:0]
				if c == '#' {
					empty := ""
					u.fragment = &empty
					state = stFragment
				}
			} else {
				buf = append(buf, c)
			}

		case stFragment:
			if c != eof {
				u.fb.WriteString(percentEncode(c, inFragmentSet))
			}
		}

		if p >= len(in) {
			break
		}
	}
	return u, true
}

func (u *parsedURL) shortenPath() {
	if u.scheme == "file" && len(u.path) == 1 && isNormalizedWindowsDriveLetter(u.path[0]) {
		return
	}
	if len(u.path) > 0 {
		u.path = u.path[:len(u.path)-1]
	}
}

func isSingleDotSegment(s string) bool { return s == "." || strings.EqualFold(s, "%2e") }

func isDoubleDotSegment(s string) bool {
	switch strings.ToLower(s) {
	case "..", ".%2e", "%2e.", "%2e%2e":
		return true
	}
	return false
}

func isWindowsDriveLetter(r []rune) bool {
	return len(r) == 2 && isASCIIAlpha(r[0]) && (r[1] == ':' || r[1] == '|')
}

func isNormalizedWindowsDriveLetter(s string) bool {
	return len(s) == 2 && isASCIIAlpha(rune(s[0])) && s[1] == ':'
}

func isASCIIAlpha(c rune) bool { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }

func isASCIIDigit(c rune) bool { return c >= '0' && c <= '9' }

func isASCIIHexDigit(c rune) bool {
	return isASCIIDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func asciiLower(c rune) rune {
	if c >= 'A' && c <= 'Z' {
		return c + ('a' - 'A')
	}
	return c
}

// The percent-encode sets, as Deno 2.9.6 has them (see the file comment about ^).

func inC0ControlSet(r rune) bool { return r <= 0x1f || r > 0x7e }

func inFragmentSet(r rune) bool {
	return inC0ControlSet(r) || r == ' ' || r == '"' || r == '<' || r == '>' || r == '`'
}

func inQuerySet(r rune) bool {
	return inC0ControlSet(r) || r == ' ' || r == '"' || r == '#' || r == '<' || r == '>'
}

func inSpecialQuerySet(r rune) bool { return inQuerySet(r) || r == '\'' }

func inPathSet(r rune) bool {
	return inQuerySet(r) || r == '?' || r == '`' || r == '{' || r == '}'
}

func inUserinfoSet(r rune) bool {
	return inPathSet(r) || r == '/' || r == ':' || r == ';' || r == '=' || r == '@' ||
		(r >= '[' && r <= '^') || r == '|'
}

// percentEncode is the UTF-8 percent-encode of one code point, upper-case hex.
func percentEncode(r rune, set func(rune) bool) string {
	if !set(r) {
		return string(r)
	}
	var tmp [utf8.UTFMax]byte
	n := utf8.EncodeRune(tmp[:], r)
	const hex = "0123456789ABCDEF"
	out := make([]byte, 0, 3*n)
	for _, b := range tmp[:n] {
		out = append(out, '%', hex[b>>4], hex[b&0xf])
	}
	return string(out)
}
