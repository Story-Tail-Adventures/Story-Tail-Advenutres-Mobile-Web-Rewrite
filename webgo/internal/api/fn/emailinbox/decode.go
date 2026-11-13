package emailinbox

// The MIME work imapflow 2.2.1 did for email-inbox, written out on the standard library and
// golang.org/x/text (docs/IMAP-Go-Library-Security-Review.md §5). package emailinbound reads only
// what imapflow handed over; this file is what imapflow did to produce it:
//
//   - bodyNode turns go-imap's BODYSTRUCTURE into the tree imapflow's parseBodystructure built
//     (part numbers, a message/rfc822's inner message sharing its wrapper's number, lowercased
//     types, RFC 2231 continuations folded into one parameter).
//   - decodeText is download()'s pipeline: transfer decoding (libbase64, libqp), then for an
//     inline text part format=flowed unwrapping (libmime.decodeFlowed) and charset conversion to
//     UTF-8 (iconv-lite), cut at exactly maxTextBytes, then email-inbox's own TextDecoder.
//
// One difference is deliberate and from the review: imapflow read charset, encoding, format and
// disposition from the part's own MIME header (`BODY[1.MIME]`); this reads them from
// BODYSTRUCTURE, so no stranger's MIME header is ever parsed here.

import (
	"bytes"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/emersion/go-imap/v2"
	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/htmlindex"
	"golang.org/x/text/encoding/ianaindex"
	"golang.org/x/text/encoding/japanese"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/emailinbound"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// ── The body structure ──────────────────────────────────────────────────────────

// leaf is what the text download needs to know about one part: its MIME type, transfer encoding,
// charset, format=flowed and disposition, all lowercased and trimmed as imapflow read them.
type leaf struct {
	ctype, encoding, charset, disposition string
	flowed, delSp                         bool
}

// structure is a message's body structure: the tree package emailinbound reads, and each leaf's
// download facts by part number ("1" for a single-part message, as IMAP numbers its body).
type structure struct {
	root   *emailinbound.BodyNode
	leaves map[string]leaf
}

func lowerTrim(s string) string { return js.ToLower(js.Trim(s)) }

// readStructure converts go-imap's BODYSTRUCTURE. nil stays nil (imapflow's undefined).
func readStructure(bs imap.BodyStructure) structure {
	if bs == nil {
		return structure{}
	}
	s := structure{leaves: map[string]leaf{}}
	root := s.walk(bs, nil)
	s.root = &root
	return s
}

// walk is parseBodystructure's walk: the root multipart has no part number; its children are
// numbered from 1; a message/rfc822's inner message reuses the wrapper's number.
func (s structure) walk(bs imap.BodyStructure, path []int) emailinbound.BodyNode {
	var n emailinbound.BodyNode
	if len(path) > 0 {
		p := joinPath(path)
		n.Part = &p
	}
	switch b := bs.(type) {
	case *imap.BodyStructureMultiPart:
		for i, child := range b.Children {
			n.ChildNodes = append(n.ChildNodes, s.walk(child, append(append([]int(nil), path...), i+1)))
		}
		n.Type = "multipart/" + js.ToLower(b.Subtype)
		if b.Extended != nil {
			if b.Extended.Params != nil {
				n.Parameters = structuredParams(b.Extended.Params)
			}
			if d := b.Extended.Disposition; d != nil {
				n.Disposition = js.ToLower(d.Value)
				n.DispositionParameters = structuredParams(d.Params)
			}
		}
	case *imap.BodyStructureSinglePart:
		n.Type = js.ToLower(b.Type) + "/" + js.ToLower(b.Subtype)
		if b.Params != nil {
			n.Parameters = structuredParams(b.Params)
		}
		n.ID = b.ID
		if n.Type == "message/rfc822" && b.MessageRFC822 != nil && b.MessageRFC822.BodyStructure != nil {
			n.ChildNodes = []emailinbound.BodyNode{s.walk(b.MessageRFC822.BodyStructure, path)}
		}
		if b.Extended != nil && b.Extended.Disposition != nil {
			n.Disposition = js.ToLower(b.Extended.Disposition.Value)
			n.DispositionParameters = structuredParams(b.Extended.Disposition.Params)
		}
		if len(n.ChildNodes) == 0 {
			key := "1"
			if n.Part != nil {
				key = *n.Part
			}
			l := leaf{ctype: n.Type, encoding: lowerTrim(b.Encoding), disposition: lowerTrim(n.Disposition)}
			l.charset = lowerTrim(n.Parameters["charset"])
			if lowerTrim(n.Parameters["format"]) == "flowed" {
				l.flowed = true
				l.delSp = lowerTrim(n.Parameters["delsp"]) == "yes"
			}
			s.leaves[key] = l
		}
	}
	return n
}

func joinPath(path []int) string {
	parts := make([]string, len(path))
	for i, p := range path {
		parts[i] = strconv.Itoa(p)
	}
	return strings.Join(parts, ".")
}

// splitPart is "1.2" as go-imap's part path. ok is false for anything that is not dotted numbers.
func splitPart(part string) ([]int, bool) {
	var out []int
	for _, p := range strings.Split(part, ".") {
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 {
			return nil, false
		}
		out = append(out, n)
	}
	return out, true
}

var continuation = regexp.MustCompile(`\*((\d+)\*?)?$`)

// structuredParams is getStructuredParams' RFC 2231 pass: `filename*0`, `filename*1` and
// `filename*` fold into one `filename`, joined in order, a `charset'lang'` prefix dropped and
// its %XX bytes decoded. go-imap has lowercased the keys and decoded RFC 2047 words already.
// Only whether a name is there is ever read (emailinbound's file test), plus the plain
// charset, format and delsp; this is exact for those.
func structuredParams(in map[string]string) map[string]string {
	out := map[string]string{}
	type piece struct {
		nr    int
		value string
	}
	groups := map[string][]piece{}
	encoded := map[string]bool{}
	for k, v := range in {
		m := continuation.FindStringSubmatchIndex(k)
		if m == nil {
			if _, grouped := groups[k]; !grouped {
				out[k] = v
			}
			continue
		}
		base := js.ToLower(k[:m[0]])
		nr := 0
		if m[4] >= 0 {
			nr, _ = strconv.Atoi(k[m[4]:m[5]])
		}
		if nr == 0 && strings.HasSuffix(k, "*") {
			if i := strings.Index(v, "'"); i >= 0 {
				if j := strings.Index(v[i+1:], "'"); j >= 0 {
					v = v[i+1+j+1:]
					encoded[base] = true
				}
			}
		}
		groups[base] = append(groups[base], piece{nr, v})
		delete(out, base)
	}
	for base, ps := range groups {
		for i := 1; i < len(ps); i++ {
			for j := i; j > 0 && ps[j].nr < ps[j-1].nr; j-- {
				ps[j], ps[j-1] = ps[j-1], ps[j]
			}
		}
		var b strings.Builder
		for _, p := range ps {
			b.WriteString(p.value)
		}
		v := b.String()
		if encoded[base] {
			v = percentDecode(v)
		}
		out[base] = v
	}
	return out
}

func percentDecode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) {
			if n, err := strconv.ParseUint(s[i+1:i+3], 16, 8); err == nil {
				b.WriteByte(byte(n))
				i += 2
				continue
			}
		}
		b.WriteByte(s[i])
	}
	return js.ValidUTF8(b.String())
}

// ── The text part ───────────────────────────────────────────────────────────────

// decodeText turns a downloaded part into the text email-inbox read: imapflow's pipeline, then
// `new TextDecoder(meta.charset ?? "utf-8")`, falling back to UTF-8 for a label it does not know.
func decodeText(raw []byte, l leaf) string {
	b := transferDecode(raw, l.encoding)
	label := l.charset // "" is undefined
	textNode := l.ctype == "text/html" || l.ctype == "text/plain" || l.ctype == "text/x-amp-html"
	if textNode && (l.disposition == "" || l.disposition == "inline") {
		if l.flowed {
			// The flowed decoder buffers everything, so imapflow bounded what it was handed.
			b = decodeFlowed(capBytes(b, maxTextBytes), l.delSp)
		}
		if label != "" && !asciiOrUTF8(label) {
			if enc := converter(label); enc != nil {
				if out, err := enc.NewDecoder().Bytes(b); err == nil {
					b, label = out, "utf-8"
				}
			}
		}
	}
	return textDecode(label, capBytes(b, maxTextBytes))
}

func capBytes(b []byte, n int) []byte {
	if len(b) > n {
		return b[:n]
	}
	return b
}

var notAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// asciiOrUTF8 is imapflow's "no conversion needed" list.
func asciiOrUTF8(charset string) bool {
	switch notAlnum.ReplaceAllString(js.ToLower(charset), "") {
	case "ascii", "usascii", "utf8":
		return true
	}
	return false
}

var japaneseLabel = regexp.MustCompile(`^jis|^iso-?2022-?jp|^euc-?jp`)

// converter is getDecoder: imapflow's own Japanese decoder for the JIS family, else iconv-lite,
// here x/text's IANA (MIME) names. nil when the charset is unknown, which imapflow left
// unconverted for the TextDecoder to try.
func converter(charset string) encoding.Encoding {
	c := lowerTrim(charset)
	if japaneseLabel.MatchString(c) {
		if strings.HasPrefix(c, "euc") {
			return japanese.EUCJP
		}
		return japanese.ISO2022JP
	}
	enc, err := ianaindex.MIME.Encoding(c)
	if err != nil || enc == nil {
		return nil
	}
	return enc
}

// textDecode is `new TextDecoder(label)`: WHATWG labels, UTF-8 when the label is unknown, a
// leading BOM dropped, bad bytes as U+FFFD.
func textDecode(label string, b []byte) string {
	if label == "" {
		return utf8Decode(b)
	}
	enc, err := htmlindex.Get(label)
	if err != nil || enc == nil {
		return utf8Decode(b)
	}
	if name, _ := htmlindex.Name(enc); name == "utf-8" {
		return utf8Decode(b)
	}
	out, err := enc.NewDecoder().Bytes(b)
	if err != nil {
		return utf8Decode(b)
	}
	return js.ValidUTF8(string(out))
}

// utf8Decode is the WHATWG UTF-8 decoder TextDecoder runs: a BOM at the start is dropped, and
// each maximal broken sequence becomes ONE U+FFFD (Go's own conversion writes one per byte).
func utf8Decode(b []byte) string {
	b = bytes.TrimPrefix(b, []byte{0xEF, 0xBB, 0xBF})
	if utf8.Valid(b) {
		return string(b)
	}
	var out strings.Builder
	needed, seen := 0, 0
	var cp rune
	lower, upper := byte(0x80), byte(0xBF)
	for i := 0; i < len(b); i++ {
		c := b[i]
		if needed == 0 {
			switch {
			case c <= 0x7F:
				out.WriteByte(c)
			case c >= 0xC2 && c <= 0xDF:
				needed, cp = 1, rune(c&0x1F)
			case c >= 0xE0 && c <= 0xEF:
				if c == 0xE0 {
					lower = 0xA0
				}
				if c == 0xED {
					upper = 0x9F
				}
				needed, cp = 2, rune(c&0x0F)
			case c >= 0xF0 && c <= 0xF4:
				if c == 0xF0 {
					lower = 0x90
				}
				if c == 0xF4 {
					upper = 0x8F
				}
				needed, cp = 3, rune(c&0x07)
			default:
				out.WriteRune(utf8.RuneError)
			}
			continue
		}
		if c < lower || c > upper {
			needed, seen, cp = 0, 0, 0
			lower, upper = 0x80, 0xBF
			out.WriteRune(utf8.RuneError)
			i-- // the byte is read again on its own
			continue
		}
		lower, upper = 0x80, 0xBF
		cp = cp<<6 | rune(c&0x3F)
		seen++
		if seen == needed {
			out.WriteRune(cp)
			needed, seen, cp = 0, 0, 0
		}
	}
	if needed != 0 {
		out.WriteRune(utf8.RuneError)
	}
	return out.String()
}

// transferDecode undoes Content-Transfer-Encoding: base64 and quoted-printable as libbase64 and
// libqp decoded them (leniently: neither ever fails), anything else as it came.
func transferDecode(raw []byte, enc string) []byte {
	switch enc {
	case "base64":
		return base64Decode(raw)
	case "quoted-printable":
		return qpDecode(raw)
	}
	return raw
}

const b64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// base64Decode is libbase64's Decoder: characters outside the alphabet are dropped, the text is
// decoded segment by segment between runs of "=", and a short final group gives what bytes it
// holds (Node's Buffer.from(…, "base64")).
func base64Decode(raw []byte) []byte {
	var out []byte
	var seg []byte
	flush := func() {
		var acc uint32
		bits := 0
		for _, c := range seg {
			acc = acc<<6 | uint32(strings.IndexByte(b64Alphabet, c))
			bits += 6
			if bits >= 8 {
				bits -= 8
				out = append(out, byte(acc>>bits))
			}
		}
		seg = seg[:0]
	}
	for _, c := range raw {
		switch {
		case c == '=':
			flush()
		case strings.IndexByte(b64Alphabet, c) >= 0:
			seg = append(seg, c)
		}
	}
	flush()
	return out
}

// qpDecode is libqp's decode: spaces and tabs before a line end dropped, soft breaks ("=" at a
// line end, or at the very end) removed, then each =XX (either case) is a byte and anything
// else stays as it is.
func qpDecode(raw []byte) []byte {
	// /[\t ]+$/gm: a line end is \n, \r, or the end of the text.
	trimmed := make([]byte, 0, len(raw))
	for i := 0; i < len(raw); {
		if raw[i] == ' ' || raw[i] == '\t' {
			j := i
			for j < len(raw) && (raw[j] == ' ' || raw[j] == '\t') {
				j++
			}
			if j == len(raw) || raw[j] == '\n' || raw[j] == '\r' {
				i = j
				continue
			}
			trimmed = append(trimmed, raw[i:j]...)
			i = j
			continue
		}
		trimmed = append(trimmed, raw[i])
		i++
	}
	// /=(?:\r?\n|$)/g
	unwrapped := make([]byte, 0, len(trimmed))
	for i := 0; i < len(trimmed); i++ {
		if trimmed[i] == '=' {
			switch {
			case i+1 == len(trimmed):
				continue
			case trimmed[i+1] == '\n':
				i++
				continue
			case trimmed[i+1] == '\r' && i+2 < len(trimmed) && trimmed[i+2] == '\n':
				i += 2
				continue
			}
		}
		unwrapped = append(unwrapped, trimmed[i])
	}
	out := make([]byte, 0, len(unwrapped))
	for i := 0; i < len(unwrapped); i++ {
		if unwrapped[i] == '=' && i+2 < len(unwrapped) && isHex(unwrapped[i+1]) && isHex(unwrapped[i+2]) {
			n, _ := strconv.ParseUint(string(unwrapped[i+1:i+3]), 16, 8)
			out = append(out, byte(n))
			i += 2
			continue
		}
		out = append(out, unwrapped[i])
	}
	return out
}

func isHex(c byte) bool {
	return '0' <= c && c <= '9' || 'a' <= c && c <= 'f' || 'A' <= c && c <= 'F'
}

// decodeFlowed is libmime's decodeFlowed (RFC 3676) on bytes, as it ran on a "binary" string:
// a line ending in a space continues on the next (the space dropped with delsp=yes), except a
// paragraph that is exactly the signature line "-- "; then one leading space (stuffing) comes
// off every line.
func decodeFlowed(b []byte, delSp bool) []byte {
	// str.split(/\r?\n/)
	lines := bytes.Split(b, []byte("\n"))
	for i := 0; i < len(lines)-1; i++ {
		lines[i] = bytes.TrimSuffix(lines[i], []byte("\r"))
	}
	var result [][]byte
	var parts [][]byte
	open := false // parts !== null
	partsLength := 0
	push := func(p []byte) {
		if len(p) > 0 {
			parts = append(parts, p)
			partsLength += len(p)
		}
	}
	for _, line := range lines {
		var last []byte
		if open && len(parts) > 0 {
			last = parts[len(parts)-1]
		}
		soft := len(last) > 0 && last[len(last)-1] == ' ' && !(partsLength == 3 && string(bytes.Join(parts, nil)) == "-- ")
		if soft {
			if delSp {
				parts = parts[:len(parts)-1]
				partsLength -= len(last)
				push(last[:len(last)-1])
			}
			push(line)
			continue
		}
		if open {
			result = append(result, bytes.Join(parts, nil))
		}
		parts, open, partsLength = nil, true, 0
		push(line)
	}
	if open && partsLength > 0 {
		result = append(result, bytes.Join(parts, nil))
	}
	joined := bytes.Join(result, []byte("\n"))
	// .replace(/^ /gm, ""): a space at the start, or after \n or \r.
	out := make([]byte, 0, len(joined))
	for i, c := range joined {
		if c == ' ' && (i == 0 || joined[i-1] == '\n' || joined[i-1] == '\r') {
			continue
		}
		out = append(out, c)
	}
	return out
}
