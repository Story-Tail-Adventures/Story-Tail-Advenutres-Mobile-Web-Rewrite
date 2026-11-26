package search

import (
	"net/netip"
	"strconv"
	"strings"

	"golang.org/x/net/idna"
)

// The URL parser zod's url() and the TypeScript's isAllowedImage call: the WHATWG URL
// Standard's, which a browser uses to fetch an <img src>. Go's url.Parse is not it. It keeps
// a host's case, reads "https:\\upload.wikimedia.org" as something else, accepts port
// 99999, and refuses "%" escapes a browser takes. Only the part that decides whether a URL
// parses at all, and what its scheme and host are, is ported: a path, query or fragment
// never makes a URL fail to parse.
//
// One deliberate difference: a host with characters outside ASCII goes through x/net/idna
// (UTS 46, the Standard's own algorithm) rather than the ICU build Node carries, so an
// exotic internationalised host may parse on one side and not the other. Nothing on the
// allow-list is internationalised.

// webURL is the part of a parsed URL the callers read.
type webURL struct {
	scheme   string // lower case, without the ":"
	hostname string // serialized; "" for a URL with no host
}

var specialSchemes = map[string]bool{"ftp": true, "http": true, "https": true, "ws": true, "wss": true, "file": true}

// whatwgDomain is domain to ASCII with the URL Standard's flags: no hyphen checks, no
// STD3 rules, no DNS length check, non-transitional.
var whatwgDomain = idna.New(
	idna.MapForLookup(),
	idna.Transitional(false),
	idna.CheckHyphens(false),
	idna.StrictDomainName(false),
	idna.VerifyDNSLength(false),
	idna.BidiRule(),
	idna.CheckJoiners(true),
)

// parseWebURL parses an absolute URL as new URL(input) would, reporting false where that
// throws.
func parseWebURL(input string) (webURL, bool) {
	// Leading and trailing C0 controls and spaces go, then every tab and newline anywhere.
	input = strings.TrimFunc(input, func(r rune) bool { return r <= 0x20 })
	input = strings.NewReplacer("\t", "", "\n", "", "\r", "").Replace(input)

	colon := strings.IndexByte(input, ':')
	if colon < 1 || !isASCIIAlpha(input[0]) {
		return webURL{}, false // no scheme and no base URL to resolve against
	}
	for i := 1; i < colon; i++ {
		c := input[i]
		if !isASCIIAlpha(c) && !('0' <= c && c <= '9') && c != '+' && c != '-' && c != '.' {
			return webURL{}, false
		}
	}
	u := webURL{scheme: strings.ToLower(input[:colon])}
	rest := input[colon+1:]

	if !specialSchemes[u.scheme] {
		if !strings.HasPrefix(rest, "//") {
			return u, true // an opaque path ("mailto:…", "javascript:…") always parses
		}
		host, _, ok := parseAuthority(rest[2:], false, func(c byte) bool { return c == '/' || c == '?' || c == '#' })
		if !ok {
			return webURL{}, false
		}
		u.hostname = host
		return u, true
	}

	isSlash := func(c byte) bool { return c == '/' || c == '\\' }
	if u.scheme == "file" {
		if len(rest) < 2 || !isSlash(rest[0]) || !isSlash(rest[1]) {
			return u, true // a path, never a host
		}
		end := strings.IndexAny(rest[2:], "/\\?#")
		host := rest[2:]
		if end >= 0 {
			host = rest[2 : 2+end]
		}
		if host == "" || isWindowsDriveLetter(host) {
			return u, true
		}
		h, ok := parseHost(host, true)
		if !ok {
			return webURL{}, false
		}
		if h == "localhost" {
			h = ""
		}
		u.hostname = h
		return u, true
	}

	// Any run of slashes and backslashes after the scheme, then the authority.
	rest = strings.TrimLeft(rest, "/\\")
	host, _, ok := parseAuthority(rest, true, isAuthorityEnd)
	if !ok || host == "" {
		return webURL{}, false // a special URL needs a host
	}
	u.hostname = host
	return u, true
}

func isASCIIAlpha(c byte) bool { return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') }

func isWindowsDriveLetter(s string) bool {
	return len(s) == 2 && isASCIIAlpha(s[0]) && (s[1] == ':' || s[1] == '|')
}

// isAuthorityEnd ends a special URL's authority.
func isAuthorityEnd(c byte) bool { return c == '/' || c == '\\' || c == '?' || c == '#' }

// parseAuthority reads [credentials@]host[:port] up to the first end character and
// returns the serialized host and the port's number (-1 for none, which an empty port is).
func parseAuthority(s string, special bool, isEnd func(byte) bool) (host string, port int, ok bool) {
	end := len(s)
	for i := 0; i < len(s); i++ {
		if isEnd(s[i]) {
			end = i
			break
		}
	}
	auth := s[:end]
	if at := strings.LastIndexByte(auth, '@'); at >= 0 {
		auth = auth[at+1:]
		if auth == "" {
			return "", -1, false // credentials and no host
		}
	}

	// The host runs to the first ":" outside brackets.
	hostEnd, inBrackets := len(auth), false
scan:
	for i := 0; i < len(auth); i++ {
		switch auth[i] {
		case '[':
			inBrackets = true
		case ']':
			inBrackets = false
		case ':':
			if !inBrackets {
				hostEnd = i
				break scan
			}
		}
	}
	rawHost, rawPort := auth[:hostEnd], ""
	if hostEnd < len(auth) {
		if rawHost == "" {
			return "", -1, false // ":80" with no host
		}
		rawPort = auth[hostEnd+1:]
	}
	// A port is digits only, at most 65535; leading zeros are fine, an empty one is none.
	port = -1
	for i := 0; i < len(rawPort); i++ {
		if rawPort[i] < '0' || rawPort[i] > '9' {
			return "", -1, false
		}
	}
	if rawPort != "" {
		digits := strings.TrimLeft(rawPort, "0")
		if len(digits) > 5 {
			return "", -1, false
		}
		port, _ = strconv.Atoi(digits) // "" (all zeros) is 0
		if port > 65535 {
			return "", -1, false
		}
	}
	if rawHost == "" {
		return "", port, !special
	}
	host, ok = parseHost(rawHost, special)
	return host, port, ok
}

// forbiddenHost are the forbidden host code points; forbiddenDomain adds the C0 controls,
// "%" and DEL.
const forbiddenHost = "\x00\t\n\r #/:<>?@[\\]^|"

// parseHost is the Standard's host parser: an IPv6 literal, an opaque host for a
// non-special scheme, or a domain (percent-decoded, mapped to ASCII, then an IPv4 address
// when it ends in a number).
func parseHost(host string, special bool) (string, bool) {
	if strings.HasPrefix(host, "[") {
		if !strings.HasSuffix(host, "]") || len(host) < 3 {
			return "", false
		}
		inner := host[1 : len(host)-1]
		if strings.ContainsAny(inner, "%") {
			return "", false
		}
		addr, err := netip.ParseAddr(inner)
		if err != nil || !addr.Is6() {
			return "", false
		}
		return "[" + serializeIPv6(addr.As16()) + "]", true
	}
	if !special {
		if strings.ContainsAny(host, forbiddenHost) {
			return "", false
		}
		return host, true
	}

	domain := formDecodePercent(host)
	ascii, err := whatwgDomain.ToASCII(domain)
	if err != nil || ascii == "" {
		return "", false
	}
	for i := 0; i < len(ascii); i++ {
		c := ascii[i]
		if c <= 0x1F || c == '%' || c == 0x7F || strings.IndexByte(forbiddenHost, c) >= 0 {
			return "", false
		}
	}
	if endsInNumber(ascii) {
		return parseIPv4(ascii)
	}
	return ascii, true
}

// serializeIPv6 writes an address the Standard's way: lower-case hex pieces without
// leading zeros, the first longest run of two or more zero pieces as "::", and never the
// dotted IPv4 tail netip.Addr.String writes for "::ffff:1.2.3.4".
func serializeIPv6(b [16]byte) string {
	var pieces [8]uint16
	for i := range pieces {
		pieces[i] = uint16(b[2*i])<<8 | uint16(b[2*i+1])
	}
	compress, best := -1, 1
	for i := 0; i < 8; {
		if pieces[i] != 0 {
			i++
			continue
		}
		j := i
		for j < 8 && pieces[j] == 0 {
			j++
		}
		if j-i > best {
			compress, best = i, j-i
		}
		i = j
	}
	var out strings.Builder
	for i := 0; i < 8; i++ {
		if i == compress {
			if i == 0 {
				out.WriteString("::")
			} else {
				out.WriteString(":")
			}
			i += best - 1
			continue
		}
		out.WriteString(strconv.FormatUint(uint64(pieces[i]), 16))
		if i != 7 {
			out.WriteString(":")
		}
	}
	return out.String()
}

// formDecodePercent percent-decodes a host, keeping a "%" that starts no valid escape, then
// decodes the bytes as UTF-8 with replacement.
func formDecodePercent(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			b = append(b, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 2
			continue
		}
		b = append(b, s[i])
	}
	return decodeUTF8(string(b))
}

// lastLabel is the host's last dot-separated label, ignoring one trailing dot.
func lastLabel(host string) string {
	parts := strings.Split(host, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	return parts[len(parts)-1]
}

// endsInNumber is the Standard's "ends in a number": a host whose last label is all digits,
// or 0x followed by hex digits, is read as an IPv4 address and must be a valid one.
func endsInNumber(host string) bool {
	last := lastLabel(host)
	if last == "" {
		return false
	}
	if strings.Trim(last, "0123456789") == "" {
		return true
	}
	if len(last) >= 2 && last[0] == '0' && (last[1] == 'x' || last[1] == 'X') {
		return strings.Trim(last[2:], "0123456789abcdefABCDEF") == ""
	}
	return false
}

// parseIPv4 is the Standard's IPv4 parser, with decimal, 0x hex and 0-led octal parts.
func parseIPv4(host string) (string, bool) {
	parts := strings.Split(host, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	if len(parts) > 4 {
		return "", false
	}
	nums := make([]uint64, len(parts))
	for i, p := range parts {
		n, ok := ipv4Number(p)
		if !ok {
			return "", false
		}
		nums[i] = n
	}
	for _, n := range nums[:len(nums)-1] {
		if n > 255 {
			return "", false
		}
	}
	last := nums[len(nums)-1]
	if last >= 1<<(8*(5-len(nums))) {
		return "", false
	}
	ipv4 := last
	for i, n := range nums[:len(nums)-1] {
		ipv4 += n << (8 * (3 - i))
	}
	return strconv.FormatUint(ipv4>>24, 10) + "." + strconv.FormatUint(ipv4>>16&0xFF, 10) + "." +
		strconv.FormatUint(ipv4>>8&0xFF, 10) + "." + strconv.FormatUint(ipv4&0xFF, 10), true
}

func ipv4Number(p string) (uint64, bool) {
	if p == "" {
		return 0, false
	}
	base := 10
	switch {
	case len(p) >= 2 && p[0] == '0' && (p[1] == 'x' || p[1] == 'X'):
		base, p = 16, p[2:]
	case len(p) >= 2 && p[0] == '0':
		base, p = 8, p[1:]
	}
	if p == "" {
		return 0, true
	}
	n, err := strconv.ParseUint(p, base, 64)
	if err != nil {
		// Too many digits for 64 bits is still a number, and still too big for an address.
		if ne, ok := err.(*strconv.NumError); ok && ne.Err == strconv.ErrRange {
			return 1 << 40, true
		}
		return 0, false
	}
	return n, true
}

// canParseURL is URL.canParse(input).
func canParseURL(input string) bool {
	_, ok := parseWebURL(input)
	return ok
}
