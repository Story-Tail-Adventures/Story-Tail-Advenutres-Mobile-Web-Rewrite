package emailinbox

import (
	"bytes"
	"strings"
	"testing"

	"github.com/emersion/go-imap/v2"
)

// The decoding imapflow did, case by case (libbase64, libqp, libmime.decodeFlowed, iconv-lite,
// TextDecoder).

func TestBase64IsLenient(t *testing.T) {
	for in, want := range map[string]string{
		"SGVsbG8=":                "Hello",
		"SGVs\r\nbG8=\r\n":        "Hello",
		"SGVs bG8!":               "Hello",       // characters outside the alphabet are dropped
		"SGk=SGk=":                "HiHi",        // each padded segment on its own
		"SGVsbG8":                 "Hello",       // a short last group gives what it holds
		"SGVsbG8gd29ybGQ":         "Hello world", // and again
		"SGVsbG8gd29ybGQhX":       "Hello world!",
		"":                        "",
		"=====":                   "",
		"w6k=":                    "\U000000e9",
		"SGVs\r\nbG8gd29y\r\nbGQ": "Hello world",
	} {
		if got := string(base64Decode([]byte(in))); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
}

func TestQuotedPrintableIsLibqp(t *testing.T) {
	for in, want := range map[string]string{
		"Caf=E9":              "Caf\xe9",
		"caf=e9":              "caf\xe9",        // lower-case hex too
		"soft=\r\nbreak":      "softbreak",      // soft break
		"soft=\nbreak":        "softbreak",      // bare LF soft break
		"end=":                "end",            // "=" at the very end
		"trail   \r\nnext":    "trail\r\nnext",  // spaces before a line end go
		"trail \t":            "trail",          // and at the end
		"keep = this":         "keep = this",    // a lone "=" stays
		"bad=ZZ":              "bad=ZZ",         // not hex: as it is
		"space=20\r\nkept":    "space \r\nkept", // an encoded space survives
		"a=\r\n=3D=\r\nb":     "a=b",
		"before \r\n=20after": "before\r\n after",
		"cr only \rnext":      "cr only\rnext", // \r is a line end to /$/m
		"=E2=82=AC=":          "\xe2\x82\xac",
		"x=\r":                "x=\r", // "=\r" without "\n" is not a soft break
	} {
		if got := string(qpDecode([]byte(in))); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
}

func TestFlowedIsLibmime(t *testing.T) {
	for _, tc := range []struct {
		in    string
		delSp bool
		want  string
	}{
		{"Hello \r\nworld\r\n", false, "Hello world"},
		{"Hello \r\nworld", true, "Helloworld"},
		{"one\r\ntwo", false, "one\ntwo"},
		{"para one \r\ncontinues\r\n\r\npara two", false, "para one continues\n\npara two"},
		{"-- \r\nGyasi", false, "-- \nGyasi"},                         // the signature line is never joined
		{" >not a quote\r\n From me", false, ">not a quote\nFrom me"}, // stuffing comes off
		{"  two spaces", false, " two spaces"},
		{"", false, ""},
		{"a \r\n", false, "a "},
	} {
		if got := string(decodeFlowed([]byte(tc.in), tc.delSp)); got != tc.want {
			t.Errorf("%q delsp=%v: got %q, want %q", tc.in, tc.delSp, got, tc.want)
		}
	}
}

func TestUTF8DecodeIsWHATWG(t *testing.T) {
	for in, want := range map[string]string{
		"plain":               "plain",
		"\xef\xbb\xbfBOM":     "BOM",          // a leading BOM is dropped
		"a\xe2\x82b":          "a\U0000fffdb", // one U+FFFD for the broken sequence, not two
		"a\xffb":              "a\U0000fffdb",
		"\xed\xa0\x80":        "\U0000fffd\U0000fffd\U0000fffd", // a surrogate is three
		"\xf0\x9f\x8c":        "\U0000fffd",                     // cut at the end
		"ok \xf0\x9f\x8c\xb4": "ok \U0001f334",
	} {
		if got := utf8Decode([]byte(in)); got != want {
			t.Errorf("%q: got %q, want %q", in, got, want)
		}
	}
}

func TestDecodeTextIsTheDownloadPipeline(t *testing.T) {
	plain := leaf{ctype: "text/plain"}
	for _, tc := range []struct {
		name string
		raw  string
		l    leaf
		want string
	}{
		{"utf-8 by default", "Caf\xc3\xa9", plain, "Caf\U000000e9"},
		{"latin-1, quoted-printable, flowed", "Caf=E9 sounds good=20\r\nto us.",
			leaf{ctype: "text/plain", encoding: "quoted-printable", charset: "iso-8859-1", flowed: true},
			"Caf\U000000e9 sounds good to us."},
		{"windows-1252 quotes", "\x93Hi\x94", leaf{ctype: "text/plain", charset: "windows-1252"}, "\U0000201cHi\U0000201d"},
		// iconv-lite does not know it, so TextDecoder is given the label; WHATWG reads
		// "us-ascii" as windows-1252.
		{"us-ascii with a stray high byte", "na\xefve", leaf{ctype: "text/plain", charset: "us-ascii"}, "na\U000000efve"},
		{"an unknown charset falls back to UTF-8", "Caf\xc3\xa9", leaf{ctype: "text/plain", charset: "x-made-up"}, "Caf\U000000e9"},
		{"base64 html", "PHA+SGk8L3A+", leaf{ctype: "text/html", encoding: "base64"}, "<p>Hi</p>"},
		// A disposition other than inline: no flowed unwrapping and no conversion, but the
		// TextDecoder still reads the label.
		{"odd disposition", "Caf\xe9 a \r\nb", leaf{ctype: "text/plain", charset: "iso-8859-1", flowed: true, disposition: "x-odd"},
			"Caf\U000000e9 a \r\nb"},
	} {
		if got := decodeText([]byte(tc.raw), tc.l); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestDecodeTextCutsAtExactly80000Bytes(t *testing.T) {
	// 79,999 bytes then a three-byte character: the cut lands inside it, and TextDecoder
	// writes U+FFFD for what is left.
	raw := strings.Repeat("a", maxTextBytes-1) + "\U000020ac" + "tail"
	got := decodeText([]byte(raw), leaf{ctype: "text/plain"})
	if !strings.HasSuffix(got, "a\U0000fffd") || len(got) != maxTextBytes-1+3 {
		t.Errorf("len %d, ends %q", len(got), got[len(got)-5:])
	}
	// Latin-1 doubles on conversion; the cut is on the converted text.
	l1 := decodeText(bytes.Repeat([]byte{0xe9}, maxTextBytes), leaf{ctype: "text/plain", charset: "iso-8859-1"})
	if len(l1) != maxTextBytes || strings.ContainsRune(l1, 0xfffd) {
		t.Errorf("latin-1: %d bytes", len(l1))
	}
}

func TestStructureIsImapflowsTree(t *testing.T) {
	bs := &imap.BodyStructureMultiPart{Subtype: "MIXED", Children: []imap.BodyStructure{
		&imap.BodyStructureMultiPart{Subtype: "alternative", Children: []imap.BodyStructure{
			&imap.BodyStructureSinglePart{Type: "TEXT", Subtype: "PLAIN", Encoding: "QUOTED-PRINTABLE",
				Params: map[string]string{"charset": "ISO-8859-1", "format": "Flowed", "delsp": "yes"}},
			&imap.BodyStructureSinglePart{Type: "text", Subtype: "html", Encoding: "7bit"},
		}},
		&imap.BodyStructureSinglePart{Type: "application", Subtype: "pdf", Encoding: "base64",
			Extended: &imap.BodyStructureSinglePartExt{Disposition: &imap.BodyStructureDisposition{Value: "ATTACHMENT",
				Params: map[string]string{"filename*0*": "utf-8''Lisbon%20", "filename*1": "plan.pdf"}}}},
		&imap.BodyStructureSinglePart{Type: "message", Subtype: "rfc822", MessageRFC822: &imap.BodyStructureMessageRFC822{
			BodyStructure: &imap.BodyStructureSinglePart{Type: "text", Subtype: "plain", Encoding: "8bit"}}},
	}}
	s := readStructure(bs)
	if s.root.Part != nil || s.root.Type != "multipart/mixed" || len(s.root.ChildNodes) != 3 {
		t.Fatalf("root %+v", s.root)
	}
	alt := s.root.ChildNodes[0]
	if *alt.Part != "1" || *alt.ChildNodes[0].Part != "1.1" || alt.ChildNodes[0].Type != "text/plain" {
		t.Errorf("alternative %+v", alt)
	}
	if l := s.leaves["1.1"]; l != (leaf{ctype: "text/plain", encoding: "quoted-printable", charset: "iso-8859-1", flowed: true, delSp: true}) {
		t.Errorf("1.1 %+v", l)
	}
	pdf := s.root.ChildNodes[1]
	if pdf.Disposition != "attachment" || pdf.DispositionParameters["filename"] != "Lisbon plan.pdf" {
		t.Errorf("pdf %+v", pdf)
	}
	// The inner message keeps its wrapper's number, as imapflow numbered it.
	inner := s.root.ChildNodes[2].ChildNodes[0]
	if *inner.Part != "3" || inner.Type != "text/plain" {
		t.Errorf("inner %+v", inner)
	}
	if one := readStructure(&imap.BodyStructureSinglePart{Type: "text", Subtype: "plain"}); one.root.Part != nil || one.leaves["1"].ctype != "text/plain" {
		t.Errorf("single part %+v", one)
	}
	if none := readStructure(nil); none.root != nil {
		t.Error("no structure is undefined")
	}
}

type literal struct {
	r    *strings.Reader
	size int64
}

func (l literal) Read(p []byte) (int, error) { return l.r.Read(p) }
func (l literal) Size() int64                { return l.size }

// go-imap hands over a literal the server cut short as if whole (PR #780): the count must match.
func TestShortLiteralIsRefused(t *testing.T) {
	if _, err := readLiteral(literal{strings.NewReader(strings.Repeat("a", 50)), 100}, maxMessageBytes); err == nil ||
		err.Error() != "literal cut short" {
		t.Errorf("%v", err)
	}
	if b, err := readLiteral(literal{strings.NewReader("abc"), 3}, maxMessageBytes); err != nil || string(b) != "abc" {
		t.Errorf("%q %v", b, err)
	}
	if _, err := readLiteral(literal{strings.NewReader(""), maxMessageBytes + 1}, maxMessageBytes); err == nil {
		t.Error("an over-size literal is read")
	}
	if b, err := readLiteral(literal{strings.NewReader(""), 0}, maxMessageBytes); err != nil || len(b) != 0 {
		t.Errorf("an empty literal: %q %v", b, err)
	}
}
