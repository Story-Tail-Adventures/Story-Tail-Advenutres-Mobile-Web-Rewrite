package paylink

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/payLink_test.ts, one test per Deno.test.
//
// Card numbers are BUILT AT RUNTIME: the repo's guard refuses any Luhn-valid literal in
// source, tests included. withCheckDigit appends the digit that makes a body Luhn-valid,
// found by trying all ten, which only needs LuhnValid to be right (tested below against the
// textbook example first).
func withCheckDigit(body string) string {
	for d := 0; d <= 9; d++ {
		if LuhnValid(body + strconv.Itoa(d)) {
			return body + strconv.Itoa(d)
		}
	}
	panic("unreachable")
}

func wrongCheckDigit(body string) string {
	good := withCheckDigit(body)
	last := int(good[len(good)-1] - '0')
	return body + strconv.Itoa((last+1)%10)
}

func card16() string { return withCheckDigit("4" + strings.Repeat("1", 14)) }

// groupEvery4 is digits.replace(/(\d{4})(?=\d)/g, "$1" + sep) on an all-digit string.
func groupEvery4(digits, sep string) string {
	var b strings.Builder
	for i := 0; i < len(digits); i += 4 {
		end := min(i+4, len(digits))
		b.WriteString(digits[i:end])
		if end-i == 4 && end < len(digits) {
			b.WriteString(sep)
		}
	}
	return b.String()
}

func grouped(digits string) string { return groupEvery4(digits, " ") }

func str(s string) js.Value { return js.StringValue(s) }

func wantNil(t *testing.T, got *string, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Fatalf("got %q, want null", *got)
	}
}

func wantString(t *testing.T, got *string, err error, want string) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v (want %q)", err, want)
	}
	if got == nil {
		t.Fatalf("got null, want %q", want)
	}
	if *got != want {
		t.Fatalf("got %q, want %q", *got, want)
	}
}

// wantBadRequest checks for a 400; detail "" accepts any sentence (assertThrows(fn, HttpError)).
func wantBadRequest(t *testing.T, err error, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("got %v, want a 400", err)
	}
	if p.Status != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", p.Status)
	}
	if detail != "" && p.Detail != detail {
		t.Fatalf("detail %q, want %q", p.Detail, detail)
	}
}

const (
	notALink   = "That doesn't look like a link. Paste the full address, starting https://"
	notHTTPS   = "Pay links must start with https:// so the client's payment is secure."
	hasUser    = "A pay link can't carry a user name or password."
	notNamed   = "Use the supplier's web address, not a number or a local address."
	notText    = "The pay link must be text."
	tooLong    = "That link is too long."
	cardRefuse = "That looks like a card number. Card numbers never go in the app."
)

// Deno.test("luhn: the textbook example")
func TestLuhnTextbookExample(t *testing.T) {
	if !LuhnValid("79927398713") {
		t.Fatal("79927398713 should pass")
	}
	if LuhnValid("79927398710") {
		t.Fatal("79927398710 should fail")
	}
}

// Deno.test("hasCardNumber: a Luhn-valid run, solid or grouped")
func TestHasCardNumberSolidOrGrouped(t *testing.T) {
	for _, text := range []string{
		card16(),
		"paid with " + grouped(card16()) + " today",
		groupEvery4(card16(), "-"),
		groupEvery4(card16(), " "),
	} {
		if !HasCardNumber(text) {
			t.Errorf("HasCardNumber(%q) = false", text)
		}
	}
}

// Deno.test("hasCardNumber: references that are not card numbers pass")
func TestHasCardNumberReferencesPass(t *testing.T) {
	if HasCardNumber("SRB-220119-FINAL") {
		t.Error("SRB-220119-FINAL")
	}
	if HasCardNumber(wrongCheckDigit("4" + strings.Repeat("1", 14))) {
		t.Error("fails Luhn")
	}
	if HasCardNumber("123456789012") {
		t.Error("12 digits is too short")
	}
	if HasCardNumber("") {
		t.Error("empty")
	}
}

// Deno.test("hasCardNumber: what one greedy match used to miss")
func TestHasCardNumberGreedyMisses(t *testing.T) {
	pan := card16()
	for why, text := range map[string]string{
		"a short number in front":             "Paid 12 " + pan,
		"letters touching the front":          "ref" + pan,
		"an underscore and a trailing letter": "x_" + pan + "x",
		"inside a query value":                "https://a.com/pay?x=ref" + pan,
		"double spaces":                       groupEvery4(pan, "  "),
		"a spaced dash":                       groupEvery4(pan, " - "),
	} {
		if !HasCardNumber(text) {
			t.Errorf("%s: HasCardNumber(%q) = false", why, text)
		}
	}
	if HasCardNumber("Invoice 2026 10 16 booking 4471") {
		t.Error("short numbers pass")
	}
}

// Deno.test("isNamedHost: only a dotted name")
func TestIsNamedHost(t *testing.T) {
	for _, h := range []string{"sandals.com", "xn--sndals-3nf.com"} {
		if !IsNamedHost(h) {
			t.Errorf("IsNamedHost(%q) = false", h)
		}
	}
	for _, h := range []string{"203.0.113.9", "[::1]", "intranet", "pay.localhost"} {
		if IsNamedHost(h) {
			t.Errorf("IsNamedHost(%q) = true", h)
		}
	}
}

// Deno.test("readPayUrl: null, undefined and blank remove the link")
func TestReadPayURLNullUndefinedBlank(t *testing.T) {
	got, err := ReadPayURL(js.NullValue())
	wantNil(t, got, err)
	got, err = ReadPayURL(js.UndefinedValue())
	wantNil(t, got, err)
	got, err = ReadPayURL(str("   "))
	wantNil(t, got, err)
}

// Deno.test("readPayUrl: stores the parsed href")
func TestReadPayURLStoresParsedHref(t *testing.T) {
	got, err := ReadPayURL(str("  https://WWW.Sandals.com/pay/SRB-220119  "))
	wantString(t, got, err, "https://www.sandals.com/pay/SRB-220119")
	got, err = ReadPayURL(str("https://travefy.com"))
	wantString(t, got, err, "https://travefy.com/")

	// A look-alike host (a Cyrillic "а" in place of the Latin "a") is stored in its ASCII
	// punycode form, which is what the client is shown, so it cannot pass as sandals.com.
	got, err = ReadPayURL(str("https://sand\U00000430ls.com/pay"))
	if err != nil || got == nil {
		t.Fatalf("look-alike: %v %v", got, err)
	}
	lookalike := *got
	if !strings.HasPrefix(lookalike, "https://xn--") || !strings.HasSuffix(lookalike, ".com/pay") {
		t.Fatal(lookalike)
	}
	for i := 0; i < len(lookalike); i++ {
		if lookalike[i] < 0x20 || lookalike[i] > 0x7e {
			t.Fatalf("stored as plain ASCII: %q", lookalike)
		}
	}

	// Go-only: the WHATWG URL parser is hand-written here, so these pin what Deno 2.9.6's
	// new URL() stored for each input (checked with readPayUrl itself).
	for _, c := range []struct{ in, want string }{
		{"https://sand\U00000430ls.com/pay", "https://xn--sandls-6nf.com/pay"},
		{"https:sandals.com/pay", "https://sandals.com/pay"},
		{"https:\\\\sandals.com\\pay", "https://sandals.com/pay"},
		{"https://sandals.com:443/a/../b/./c?q=a b&x=<>\"'#f g<>`", "https://sandals.com/b/c?q=a%20b&x=%3C%3E%22%27#f%20g%3C%3E%60"},
		{"https://\U0000FF53\U0000FF41\U0000FF4E\U0000FF44\U0000FF41\U0000FF4C\U0000FF53.com/x", "https://sandals.com/x"},
		{"https://M\U000000DCNCHEN.de/x", "https://xn--mnchen-3ya.de/x"},
		{"https://sandals.com./x", "https://sandals.com./x"},
		{"https://a..com", "https://a..com/"},
		{"https://sandals.com:8443/x", "https://sandals.com:8443/x"},
		{"https://sandals.com:0/x", "https://sandals.com:0/x"},
		{"HTTPS://Sandals.COM/X", "https://sandals.com/X"},
		{"https://a.com/^{}`|[]\\\"<>' %25%zz;=@:,!$&()*+~", "https://a.com/^%7B%7D%60|[]/%22%3C%3E'%20%25%zz;=@:,!$&()*+~"},
		{"https://a.com/x?^{}`|[]\\\"<>' #^{}`|[]\\\"<>'", "https://a.com/x?^{}`|[]\\%22%3C%3E%27%20#^{}%60|[]\\%22%3C%3E'"},
		{"https://a.com/\U0001F600?\U000000E9#\U000000E9", "https://a.com/%F0%9F%98%80?%C3%A9#%C3%A9"},
		{"https://fa\U000000DF.de/", "https://xn--fa-hia.de/"},
		{"https://\U00000130stanbul.com/", "https://xn--istanbul-o0e.com/"},
		{"https://a\U00003002com/", "https://a.com/"},
		{"https://a_b.com/", "https://a_b.com/"},
		{"https://xn--sandls-6nf.com/pay", "https://xn--sandls-6nf.com/pay"},
		{"https://xn--ls8h.la/", "https://xn--ls8h.la/"},
		{"https://\U000000AD.com/", "https://.com/"},
		{"https://a\U000000ADb.com/", "https://ab.com/"},
		{"https://a.1e/", "https://a.1e/"},
		{"https://0x.com/", "https://0x.com/"},
		{"HTTPS:sandals.com", "https://sandals.com/"},
		{"https:/sandals.com", "https://sandals.com/"},
		{"https:///sandals.com", "https://sandals.com/"},
		{" https://a.com/ ", "https://a.com/"},
		{"\x01https://a.com/a\tb\nc\x00", "https://a.com/abc"},
	} {
		got, err := ReadPayURL(str(c.in))
		if err != nil || got == nil || *got != c.want {
			t.Errorf("ReadPayURL(%q) = %v, %v; want %q", c.in, deref(got), err, c.want)
		}
	}
}

func deref(s *string) string {
	if s == nil {
		return "<null>"
	}
	return *s
}

// Deno.test("readPayUrl: refuses anything but a clean https link")
func TestReadPayURLRefusesAllButCleanHTTPS(t *testing.T) {
	// The Deno test only asserts an HttpError; the sentences are Deno's own, so they are
	// pinned too.
	for _, c := range []struct {
		in     js.Value
		detail string
	}{
		{str("http://www.sandals.com/pay"), notHTTPS},
		{str("javascript:alert(1)"), notHTTPS},
		{str("ftp://sandals.com/x"), notHTTPS},
		{str("sandals.com/pay"), notALink},
		{str("https://jordan:secret@sandals.com/pay"), hasUser},
		{str("https://jordan@sandals.com/pay"), hasUser},
		{str("not a link"), notALink},
		{js.NumberValue(42), notText},
		// Go-only: more of what Deno 2.9.6 answered, for the hand-written parser.
		{str("https://203.0.113.9/pay"), notNamed},
		{str("https://[::1]/pay"), notNamed},
		{str("https://intranet/pay"), notNamed},
		{str("https://pay.localhost/x"), notNamed},
		{str("https://0x7f.1/"), notNamed},
		{str("https://a.0x"), notALink},
		{str("https://xn--abc.com"), notALink},
		{str("https://a b.com"), notALink},
		{str("file:///etc/passwd"), notHTTPS},
		{str("file://a b/"), notALink},
		{str("foo://[::1"), notALink},
		{str("foo://a b"), notALink},
		{str("https://"), notALink},
		{str("https://1.2.3.4.5/"), notALink},
		{str("wss://a.com"), notHTTPS},
	} {
		got, err := ReadPayURL(c.in)
		if got != nil {
			t.Errorf("%v: got %q, want a refusal", c.in, *got)
			continue
		}
		wantBadRequest(t, err, c.detail)
	}
}

// Deno.test("readPayUrl: length is checked on what would be stored")
func TestReadPayURLLengthOnStored(t *testing.T) {
	base := "https://sandals.com/"
	got, err := ReadPayURL(str(base + strings.Repeat("a", MaxPayURL-len(base))))
	if err != nil || got == nil || js.Len(*got) != MaxPayURL {
		t.Fatalf("got %v, %v; want %d characters", deref(got), err, MaxPayURL)
	}
	_, err = ReadPayURL(str(base + strings.Repeat("a", MaxPayURL-len(base)+1)))
	wantBadRequest(t, err, tooLong)
}

// Deno.test("readPayUrl: refuses a card number anywhere in the link")
func TestReadPayURLRefusesCardNumber(t *testing.T) {
	_, err := ReadPayURL(str("https://pay.example.com/c/" + card16()))
	wantBadRequest(t, err, cardRefuse)
	_, err = ReadPayURL(str("https://pay.example.com/?card=" + card16()))
	wantBadRequest(t, err, cardRefuse)
	// A long booking number that is not a card number is fine.
	notCard := wrongCheckDigit("4" + strings.Repeat("1", 14))
	got, err := ReadPayURL(str("https://pay.example.com/b/" + notCard))
	wantString(t, got, err, "https://pay.example.com/b/"+notCard)
}

// Deno.test("readPaidReference / readPaidNote: absent keeps, blank clears, trimmed")
func TestReadPaidTextAbsentBlankTrimmed(t *testing.T) {
	got, err := ReadPaidReference(js.UndefinedValue())
	wantNil(t, got, err)
	got, err = ReadPaidReference(js.NullValue())
	wantNil(t, got, err)
	got, err = ReadPaidReference(str("   "))
	wantString(t, got, err, "")
	got, err = ReadPaidReference(str("  SRB-220119-FINAL "))
	wantString(t, got, err, "SRB-220119-FINAL")
	got, err = ReadPaidNote(str(" Paid on sandals.com. "))
	wantString(t, got, err, "Paid on sandals.com.")
}

// Deno.test("readPaidReference / readPaidNote: length and card numbers")
func TestReadPaidTextLengthAndCards(t *testing.T) {
	got, err := ReadPaidReference(str(strings.Repeat("R", 100)))
	wantString(t, got, err, strings.Repeat("R", 100))
	_, err = ReadPaidReference(str(strings.Repeat("R", 101)))
	wantBadRequest(t, err, "Confirmation number is too long.")
	got, err = ReadPaidNote(str(strings.Repeat("n", 1000)))
	wantString(t, got, err, strings.Repeat("n", 1000))
	_, err = ReadPaidNote(str(strings.Repeat("n", 1001)))
	wantBadRequest(t, err, "Note is too long.")
	_, err = ReadPaidReference(str(grouped(card16())))
	wantBadRequest(t, err, cardRefuse)
	_, err = ReadPaidNote(str("Jordan paid with " + card16()))
	wantBadRequest(t, err, cardRefuse)
	_, err = ReadPaidReference(js.NumberValue(12345))
	wantBadRequest(t, err, "Confirmation number must be text.")
}

// Deno.test("readPaidOn: a real date, not in the future")
func TestReadPaidOn(t *testing.T) {
	now := time.Date(2026, 10, 16, 15, 0, 0, 0, time.UTC)
	got, err := ReadPaidOn(js.UndefinedValue(), now)
	wantNil(t, got, err)
	got, err = ReadPaidOn(str(""), now)
	wantNil(t, got, err)
	got, err = ReadPaidOn(str("2026-10-14"), now)
	wantString(t, got, err, "2026-10-14")
	// Tomorrow in UTC: the SQL decides.
	got, err = ReadPaidOn(str("2026-10-17"), now)
	wantString(t, got, err, "2026-10-17")
	_, err = ReadPaidOn(str("2026-10-18"), now)
	wantBadRequest(t, err, "The date paid can't be in the future.")
	_, err = ReadPaidOn(str("2026-02-30"), now)
	wantBadRequest(t, err, "Pick a real date for when this was paid.")
	_, err = ReadPaidOn(str("10/14/2026"), now)
	wantBadRequest(t, err, "Pick a real date for when this was paid.")
}
