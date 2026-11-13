package agentsettings

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

// What normalizeSocialLink reads from `new URL(t)`, for a t that starts with "https://" (any
// case) and holds no JavaScript whitespace, < > or ". Go's net/url is not the WHATWG parser
// (no backslashes as slashes, no dot segments, no IDNA, no IPv4 number forms), so this is the
// WHATWG basic URL parser cut down to the questions asked: did it throw, are there
// credentials, what is the hostname, and is the path nothing but slashes.
//
// Every refusal along this path has the same sentence ("doesn't look like a link"), so a
// throw and a host without a dot need not be told apart. That is what lets a bracketed (IPv6)
// host be refused outright: its serialization never holds a dot.
//
// THE ONE APPROXIMATION is a host name with non-ASCII letters after percent-decoding.
// Deno runs it through UTS #46 (case folding, NFC, the bidi and joiner rules, punycode),
// whose tables are not in Go's standard library. Here the full stops U+3002, U+FF0E and
// U+FF61, fullwidth ASCII, and the code points UTS #46 ignores are mapped exactly, and any
// other non-ASCII label is kept as it is. The dot and network-suffix checks then answer as
// Deno does, because punycode rewrites a label without moving a dot, EXCEPT where UTS #46
// would refuse the label (Deno: "doesn't look like a link"; here: accepted) or map it onto
// plain ASCII letters (circled or mathematical letters, which here never equal a network's
// host). A punycode ("xn--") label is decoded and checked here, but its decoded code points
// only roughly (no bidi or normalization check). The paylink package holds a fuller
// hand-port with a generated IDNA table; sharing it is the fix if this ever matters.
//
// Checked against Deno 2.9.6's normalizeSocialLink on 6,124 inputs for each of the four
// networks (handles, schemes, credentials, ports, dot segments, percent-escapes, IPv4 number
// forms, punycode, fullwidth and other non-ASCII hosts): one input differed, "xn--a-ecp",
// which decodes to "a⒈", a character UTS #46 refuses.
type httpsLink struct {
	hostname        string
	pathOnlySlashes bool
}

func parseHTTPS(t string) (httpsLink, bool) {
	// The parser strips leading and trailing C0 controls and spaces (t starts with "https").
	t = strings.TrimRightFunc(t, func(r rune) bool { return r <= 0x20 })
	// "https:" then the special-authority slashes, any number of / or \.
	rest := strings.TrimLeft(t[len("https:"):], `/\`)
	end := strings.IndexAny(rest, `/\?#`)
	if end < 0 {
		end = len(rest)
	}
	authority, after := rest[:end], rest[end:]

	hostport := authority
	if at := strings.LastIndexByte(authority, '@'); at >= 0 {
		// Everything before the last @ is userinfo. url.username and url.password are both
		// empty only for "" and ":"; anything else is a credential, and refused.
		if userinfo := authority[:at]; userinfo != "" && userinfo != ":" {
			return httpsLink{}, false
		}
		hostport = authority[at+1:]
	}
	// [ or ] anywhere means an IPv6 host (no dot, refused) or a forbidden code point.
	if strings.ContainsAny(hostport, "[]") {
		return httpsLink{}, false
	}
	host, port, hasPort := strings.Cut(hostport, ":")
	if host == "" {
		return httpsLink{}, false
	}
	if hasPort && !validPort(port) {
		return httpsLink{}, false
	}
	hostname, ok := parseDomain(host)
	if !ok {
		return httpsLink{}, false
	}
	return httpsLink{hostname: hostname, pathOnlySlashes: pathOnlySlashes(after)}, true
}

// validPort is the port state: digits only (none at all is fine), at most 65535.
func validPort(port string) bool {
	n := 0
	for i := 0; i < len(port); i++ {
		c := port[i]
		if c < '0' || c > '9' {
			return false
		}
		if n <= 65535 {
			n = n*10 + int(c-'0')
		}
	}
	return n <= 65535
}

// parseDomain is the host parser for a non-bracketed host of a special URL: percent-decode,
// domain to ASCII, forbidden code points, then the IPv4 forms when it ends in a number.
func parseDomain(host string) (string, bool) {
	raw := percentDecode(host)
	if !utf8.Valid(raw) {
		return "", false // UTF-8 decoding yields U+FFFD, which UTS #46 disallows
	}
	var b strings.Builder
	for _, r := range string(raw) {
		switch {
		case r < 0x80:
			b.WriteRune(asciiLowerRune(r))
		case r == 0x3002 || r == 0xff0e || r == 0xff61:
			b.WriteByte('.')
		case r >= 0xff01 && r <= 0xff5e: // fullwidth ASCII
			b.WriteRune(asciiLowerRune(r - 0xfee0))
		case uts46Ignored(r):
		default:
			b.WriteRune(r) // see the approximation note above
		}
	}
	domain := b.String()
	if domain == "" {
		return "", false
	}
	for _, r := range domain {
		if r <= 0x20 || r == 0x7f || strings.ContainsRune("#%/:<>?@[\\]^|", r) {
			return "", false
		}
	}
	for _, label := range strings.Split(domain, ".") {
		if strings.HasPrefix(label, "xn--") && !validPunycodeLabel(label[len("xn--"):]) {
			return "", false
		}
	}
	if endsInANumber(domain) {
		// An IPv4 host, in any of its number forms, serializes as a dotted quad
		// ("https://1234567" has the hostname "0.18.214.135").
		addr, ok := parseIPv4(domain)
		if !ok {
			return "", false
		}
		return fmt.Sprintf("%d.%d.%d.%d", byte(addr>>24), byte(addr>>16), byte(addr>>8), byte(addr)), true
	}
	return domain, true
}

// uts46Ignored are the code points UTS #46 maps to nothing (soft hyphen, zero width space,
// variation selectors and the rest of its "ignored" set).
func uts46Ignored(r rune) bool {
	switch {
	case r == 0xad, r == 0x34f, r >= 0x180b && r <= 0x180d, r == 0x180f, r == 0x200b,
		r == 0x2060, r == 0x2064, r >= 0xfe00 && r <= 0xfe0f, r == 0xfeff,
		r >= 0x1bca0 && r <= 0x1bca3, r >= 0xe0100 && r <= 0xe01ef:
		return true
	}
	return false
}

func percentDecode(s string) []byte {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			out = append(out, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 2
			continue
		}
		out = append(out, s[i])
	}
	return out
}

func isHex(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}

func unhex(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	default:
		return c - 'A' + 10
	}
}

// endsInANumber is the URL Standard's ends-in-a-number checker.
func endsInANumber(domain string) bool {
	parts := strings.Split(domain, ".")
	if parts[len(parts)-1] == "" {
		if len(parts) == 1 {
			return false
		}
		parts = parts[:len(parts)-1]
	}
	last := parts[len(parts)-1]
	if last != "" && strings.Trim(last, "0123456789") == "" {
		return true
	}
	_, ok := ipv4Number(last)
	return ok
}

// ipv4Number is the IPv4 number parser: decimal, 0x hex or leading-0 octal. Values saturate
// well above 2^32, which is all the range checks need.
func ipv4Number(s string) (uint64, bool) {
	if s == "" {
		return 0, false
	}
	radix := uint64(10)
	switch {
	case len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X"):
		s, radix = s[2:], 16
	case len(s) >= 2 && s[0] == '0':
		s, radix = s[1:], 8
	}
	var n uint64
	for i := 0; i < len(s); i++ {
		var d uint64
		switch c := s[i]; {
		case c >= '0' && c <= '9':
			d = uint64(c - '0')
		case c >= 'a' && c <= 'f':
			d = uint64(c-'a') + 10
		case c >= 'A' && c <= 'F':
			d = uint64(c-'A') + 10
		default:
			return 0, false
		}
		if d >= radix {
			return 0, false
		}
		if n < 1<<40 {
			n = n*radix + d
		}
	}
	return n, true
}

// parseIPv4 is the URL Standard's IPv4 parser.
func parseIPv4(domain string) (uint32, bool) {
	parts := strings.Split(domain, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	if len(parts) > 4 {
		return 0, false
	}
	nums := make([]uint64, len(parts))
	for i, p := range parts {
		n, ok := ipv4Number(p)
		if !ok {
			return 0, false
		}
		nums[i] = n
	}
	for _, n := range nums[:len(nums)-1] {
		if n > 255 {
			return 0, false
		}
	}
	last := nums[len(nums)-1]
	if last >= uint64(1)<<(8*(5-len(nums))) {
		return 0, false
	}
	addr := last
	for i, n := range nums[:len(nums)-1] {
		addr += n << (8 * (3 - i))
	}
	return uint32(addr), true
}

// pathOnlySlashes is `url.pathname.replace(/\/+$/, "") === ""` for what follows the host:
// the path list, after "." and ".." segments (and their %2e spellings) are resolved, holds
// nothing but empty segments.
func pathOnlySlashes(after string) bool {
	path := after
	if i := strings.IndexAny(path, "?#"); i >= 0 {
		path = path[:i]
	}
	if path != "" && (path[0] == '/' || path[0] == '\\') {
		path = path[1:]
	}
	var list []string
	segs := strings.Split(strings.ReplaceAll(path, `\`, "/"), "/")
	for i, seg := range segs {
		last := i == len(segs)-1
		switch {
		case isDoubleDot(seg):
			if len(list) > 0 {
				list = list[:len(list)-1]
			}
			if last {
				list = append(list, "")
			}
		case isSingleDot(seg):
			if last {
				list = append(list, "")
			}
		default:
			list = append(list, seg)
		}
	}
	for _, s := range list {
		if s != "" {
			return false
		}
	}
	return true
}

func isSingleDot(seg string) bool {
	return seg == "." || asciiLower(seg) == "%2e"
}

func isDoubleDot(seg string) bool {
	switch asciiLower(seg) {
	case "..", ".%2e", "%2e.", "%2e%2e":
		return true
	}
	return false
}

// validPunycodeLabel checks the part of an "xn--" label after the prefix as UTS #46 does
// with IgnoreInvalidPunycode off: it must decode, to something not empty and not all ASCII,
// and every decoded code point must be one UTS #46 calls valid. That last check is the
// approximation noted on httpsLink: upper and title case (mapped), controls, the full stops
// and fullwidth forms (mapped), the ignored set, and a leading combining mark are refused.
func validPunycodeLabel(encoded string) bool {
	decoded, ok := punycodeDecode(encoded)
	if !ok || len(decoded) == 0 {
		return false
	}
	ascii := true
	for i, r := range decoded {
		if r >= 0x80 {
			ascii = false
		}
		switch {
		case unicode.IsUpper(r), unicode.IsTitle(r), unicode.IsControl(r), uts46Ignored(r),
			r == 0x3002, r >= 0xff01 && r <= 0xff5e, r == 0xff61,
			i == 0 && unicode.In(r, unicode.Mn, unicode.Mc, unicode.Me):
			return false
		}
	}
	return !ascii
}

// Punycode (RFC 3492) decoding.
const (
	pcBase        = 36
	pcTMin        = 1
	pcTMax        = 26
	pcSkew        = 38
	pcDamp        = 700
	pcInitialBias = 72
	pcInitialN    = 128
)

func pcAdapt(delta, numPoints int, first bool) int {
	if first {
		delta /= pcDamp
	} else {
		delta /= 2
	}
	delta += delta / numPoints
	k := 0
	for delta > ((pcBase-pcTMin)*pcTMax)/2 {
		delta /= pcBase - pcTMin
		k += pcBase
	}
	return k + (pcBase-pcTMin+1)*delta/(delta+pcSkew)
}

func punycodeDecode(input string) ([]rune, bool) {
	var out []rune
	b := strings.LastIndexByte(input, '-')
	if b > 0 {
		for i := 0; i < b; i++ {
			if input[i] >= 0x80 {
				return nil, false
			}
			out = append(out, rune(input[i]))
		}
	}
	if b < 0 {
		b = 0
	} else {
		b++
	}
	n, i, bias := pcInitialN, 0, pcInitialBias
	const maxInt = 1<<31 - 1
	for in := b; in < len(input); {
		oldi, w := i, 1
		for k := pcBase; ; k += pcBase {
			if in >= len(input) {
				return nil, false
			}
			c := input[in]
			in++
			var digit int
			switch {
			case c >= '0' && c <= '9':
				digit = int(c-'0') + 26
			case c >= 'a' && c <= 'z':
				digit = int(c - 'a')
			case c >= 'A' && c <= 'Z':
				digit = int(c - 'A')
			default:
				return nil, false
			}
			if digit > (maxInt-i)/w {
				return nil, false
			}
			i += digit * w
			t := k - bias
			if t < pcTMin {
				t = pcTMin
			} else if t > pcTMax {
				t = pcTMax
			}
			if digit < t {
				break
			}
			if w > maxInt/(pcBase-t) {
				return nil, false
			}
			w *= pcBase - t
		}
		bias = pcAdapt(i-oldi, len(out)+1, oldi == 0)
		if i/(len(out)+1) > maxInt-n {
			return nil, false
		}
		n += i / (len(out) + 1)
		i %= len(out) + 1
		if n > unicode.MaxRune || n >= 0xd800 && n <= 0xdfff {
			return nil, false
		}
		out = append(out, 0)
		copy(out[i+1:], out[i:])
		out[i] = rune(n)
		i++
	}
	return out, true
}

// asciiLower lower-cases A-Z only, as a JavaScript /i pattern without the u flag compares
// ASCII letters (Go's (?i) and strings.EqualFold also fold "ſ" and the Kelvin sign).
func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 'a' - 'A'
		}
	}
	return string(b)
}

func asciiLowerRune(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + 'a' - 'A'
	}
	return r
}

// hasPrefixFold is /^prefix/i for an ASCII prefix.
func hasPrefixFold(s, prefix string) bool {
	return len(s) >= len(prefix) && asciiLower(s[:len(prefix)]) == prefix
}
