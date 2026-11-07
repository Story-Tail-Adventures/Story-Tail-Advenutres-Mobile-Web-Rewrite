package paylink

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// The WHATWG host parser: IPv6 in brackets, an opaque host for a non-special scheme, and
// otherwise a domain, mapped to ASCII (idna.go) and read as IPv4 when it ends in a number.

// parseHost returns the serialized host, or false where the host parser returns failure.
func parseHost(input []rune, isOpaque bool) (string, bool) {
	if len(input) > 0 && input[0] == '[' {
		if input[len(input)-1] != ']' {
			return "", false
		}
		addr, ok := parseIPv6(input[1 : len(input)-1])
		if !ok {
			return "", false
		}
		return "[" + serializeIPv6(addr) + "]", true
	}
	if isOpaque {
		for _, r := range input {
			if isForbiddenHostCodePoint(r) {
				return "", false
			}
		}
		var b strings.Builder
		for _, r := range input {
			b.WriteString(percentEncode(r, inC0ControlSet))
		}
		return b.String(), true
	}

	domain := utf8DecodeWithoutBOM(percentDecode(string(input)))
	ascii, ok := domainToASCII(domain)
	if !ok {
		return "", false
	}
	for _, r := range ascii {
		if isForbiddenDomainCodePoint(r) {
			return "", false
		}
	}
	if endsInANumber(ascii) {
		v4, ok := parseIPv4(ascii)
		if !ok {
			return "", false
		}
		return serializeIPv4(v4), true
	}
	return ascii, true
}

func isForbiddenHostCodePoint(r rune) bool {
	switch r {
	case 0, '\t', '\n', '\r', ' ', '#', '/', ':', '<', '>', '?', '@', '[', '\\', ']', '^', '|':
		return true
	}
	return false
}

func isForbiddenDomainCodePoint(r rune) bool {
	return isForbiddenHostCodePoint(r) || r <= 0x1f || r == '%' || r == 0x7f
}

// percentDecode turns each %XX into its byte and leaves anything else, a lone % included.
func percentDecode(s string) []byte {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isASCIIHexDigit(rune(s[i+1])) && isASCIIHexDigit(rune(s[i+2])) {
			v, _ := strconv.ParseUint(s[i+1:i+3], 16, 8)
			out = append(out, byte(v))
			i += 2
			continue
		}
		out = append(out, s[i])
	}
	return out
}

// utf8DecodeWithoutBOM keeps a leading U+FEFF and turns invalid bytes into U+FFFD. (The
// standard replaces each maximal invalid subpart with one U+FFFD, Go each invalid byte; the
// count never matters here, because U+FFFD is never allowed in a host and refuses it.)
func utf8DecodeWithoutBOM(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	return strings.ToValidUTF8(string(b), "\U0000FFFD")
}

// endsInANumber is the standard's "ends in a number checker".
func endsInANumber(s string) bool {
	parts := strings.Split(s, ".")
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
	_, ok := parseIPv4Number(last)
	return ok
}

// ipv4Cap stands in for "too large": any value past it fails every check below, so a long
// run of digits never overflows.
const ipv4Cap = 1 << 40

// parseIPv4Number reads one part: 0x for hex, a leading 0 for octal, decimal otherwise.
func parseIPv4Number(s string) (uint64, bool) {
	if s == "" {
		return 0, false
	}
	radix := uint64(10)
	switch {
	case len(s) >= 2 && (s[:2] == "0x" || s[:2] == "0X"):
		s = s[2:]
		radix = 16
	case len(s) >= 2 && s[0] == '0':
		s = s[1:]
		radix = 8
	}
	if s == "" {
		return 0, true
	}
	var v uint64
	for i := 0; i < len(s); i++ {
		c := s[i]
		var d uint64
		switch {
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
		if v < ipv4Cap {
			v = v*radix + d
		}
	}
	return v, true
}

func parseIPv4(s string) (uint32, bool) {
	parts := strings.Split(s, ".")
	if parts[len(parts)-1] == "" && len(parts) > 1 {
		parts = parts[:len(parts)-1]
	}
	if len(parts) > 4 {
		return 0, false
	}
	numbers := make([]uint64, 0, len(parts))
	for _, part := range parts {
		n, ok := parseIPv4Number(part)
		if !ok {
			return 0, false
		}
		numbers = append(numbers, n)
	}
	for i, n := range numbers {
		if n > 255 && i != len(numbers)-1 {
			return 0, false
		}
	}
	last := numbers[len(numbers)-1]
	if last >= uint64(1)<<(8*(5-len(numbers))) {
		return 0, false
	}
	v := last
	for i, n := range numbers[:len(numbers)-1] {
		v += n << (8 * (3 - i))
	}
	return uint32(v), true
}

func serializeIPv4(v uint32) string {
	return strconv.Itoa(int(v>>24)) + "." + strconv.Itoa(int(v>>16&0xff)) + "." +
		strconv.Itoa(int(v>>8&0xff)) + "." + strconv.Itoa(int(v&0xff))
}

func parseIPv6(in []rune) ([8]uint16, bool) {
	var addr [8]uint16
	pieceIndex, compress := 0, -1
	p := 0
	at := func(i int) rune {
		if i < len(in) {
			return in[i]
		}
		return eof
	}
	if at(p) == ':' {
		if at(p+1) != ':' {
			return addr, false
		}
		p += 2
		pieceIndex++
		compress = pieceIndex
	}
	for at(p) != eof {
		if pieceIndex == 8 {
			return addr, false
		}
		if at(p) == ':' {
			if compress != -1 {
				return addr, false
			}
			p++
			pieceIndex++
			compress = pieceIndex
			continue
		}
		value, length := 0, 0
		for length < 4 && isASCIIHexDigit(at(p)) {
			d, _ := strconv.ParseUint(string(at(p)), 16, 8)
			value = value*0x10 + int(d)
			p++
			length++
		}
		if at(p) == '.' {
			if length == 0 {
				return addr, false
			}
			p -= length
			if pieceIndex > 6 {
				return addr, false
			}
			numbersSeen := 0
			for at(p) != eof {
				piece := -1
				if numbersSeen > 0 {
					if at(p) == '.' && numbersSeen < 4 {
						p++
					} else {
						return addr, false
					}
				}
				if !isASCIIDigit(at(p)) {
					return addr, false
				}
				for isASCIIDigit(at(p)) {
					n := int(at(p) - '0')
					switch {
					case piece == -1:
						piece = n
					case piece == 0:
						return addr, false
					default:
						piece = piece*10 + n
					}
					if piece > 255 {
						return addr, false
					}
					p++
				}
				addr[pieceIndex] = addr[pieceIndex]*0x100 + uint16(piece)
				numbersSeen++
				if numbersSeen == 2 || numbersSeen == 4 {
					pieceIndex++
				}
			}
			if numbersSeen != 4 {
				return addr, false
			}
			break
		} else if at(p) == ':' {
			p++
			if at(p) == eof {
				return addr, false
			}
		} else if at(p) != eof {
			return addr, false
		}
		addr[pieceIndex] = uint16(value)
		pieceIndex++
	}
	if compress != -1 {
		swaps := pieceIndex - compress
		pieceIndex = 7
		for pieceIndex != 0 && swaps > 0 {
			addr[pieceIndex], addr[compress+swaps-1] = addr[compress+swaps-1], addr[pieceIndex]
			pieceIndex--
			swaps--
		}
	} else if pieceIndex != 8 {
		return addr, false
	}
	return addr, true
}

func serializeIPv6(addr [8]uint16) string {
	// The first longest run of two or more zero pieces is compressed.
	compress, bestLen := -1, 1
	for i := 0; i < 8; {
		if addr[i] != 0 {
			i++
			continue
		}
		j := i
		for j < 8 && addr[j] == 0 {
			j++
		}
		if j-i > bestLen {
			compress, bestLen = i, j-i
		}
		i = j
	}
	var b strings.Builder
	ignore0 := false
	for i := 0; i < 8; i++ {
		if ignore0 && addr[i] == 0 {
			continue
		}
		ignore0 = false
		if compress == i {
			if i == 0 {
				b.WriteString("::")
			} else {
				b.WriteByte(':')
			}
			ignore0 = true
			continue
		}
		b.WriteString(strconv.FormatUint(uint64(addr[i]), 16))
		if i != 7 {
			b.WriteByte(':')
		}
	}
	return b.String()
}
