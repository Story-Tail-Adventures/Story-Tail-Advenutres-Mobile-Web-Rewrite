package lead

import (
	"net/http"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/lead_test.ts, one test per Deno.test.
//
// The failures worth pinning: a card number getting into a lead at all, a bot that the two
// store-nothing checks let through, a malformed "what they were viewing" stopping a real
// person, and a direct caller choosing its own address for the per-address limit.

// Card numbers are BUILT AT RUNTIME, as in carddigits' tests: the repo's guard refuses any
// Luhn-valid literal in source, tests included.
func withCheckDigit(body string) string {
	for d := 0; d <= 9; d++ {
		if carddigits.LuhnValid(body + strconv.Itoa(d)) {
			return body + strconv.Itoa(d)
		}
	}
	panic("unreachable")
}

// card is written with spaces, the way a person types one.
func card() string {
	digits := withCheckDigit("4" + strings.Repeat("1", 14))
	var b strings.Builder
	for i := 0; i < len(digits); i += 4 {
		b.WriteString(digits[i:min(i+4, len(digits))])
		if i+4 < len(digits) {
			b.WriteByte(' ')
		}
	}
	return b.String()
}

func s(v string) js.Value  { return js.StringValue(v) }
func n(v float64) js.Value { return js.NumberValue(v) }

func form() js.Value {
	return js.ObjectValue(
		"firstName", s("  Dana "),
		"lastName", s("Reyes"),
		"email", s("dana@example.com"),
		"phone", s("(555) 010-0100"),
		"message", s("Thinking about a honeymoon in June.\nTwo of us."),
		"page", s("topic"),
		"about", js.ObjectValue("kind", s("topic"), "slug", s("honeymoons"), "label", s("a honeymoon")),
		"utm", js.ObjectValue("source", s("instagram"), "medium", s("social"), "campaign", s("fall")),
		"website", s(""),
		"startedAt", n(0),
	)
}

// with is `{ ...base, key: value, ... }`: an existing key keeps its place, a new one goes last.
func with(base js.Value, kv ...any) js.Value {
	o, _ := base.Object()
	all := make([]any, 0, 2*o.Len()+len(kv))
	for _, k := range o.Keys() {
		all = append(all, k, o.Get(k))
	}
	return js.ObjectValue(append(all, kv...)...)
}

// refusedWith is the Deno helper: a 400 whose detail equals text, or matches it when it is a
// *regexp.Regexp.
func refusedWith(t *testing.T, err error, text any) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("got %v, want a 400", err)
	}
	if p.Status != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", p.Status)
	}
	switch want := text.(type) {
	case string:
		if p.Detail != want {
			t.Fatalf("detail %q, want %q", p.Detail, want)
		}
	case *regexp.Regexp:
		if !want.MatchString(p.Detail) {
			t.Fatalf("detail %q, want a match for %s", p.Detail, want)
		}
	}
}

func mustParse(t *testing.T, payload js.Value) LeadFormInput {
	t.Helper()
	f, err := ParseLeadForm(payload)
	if err != nil {
		t.Fatalf("ParseLeadForm: %v", err)
	}
	return f
}

func deref(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

// Deno.test("the form's fields are trimmed and kept")
func TestFormFieldsTrimmedAndKept(t *testing.T) {
	f := mustParse(t, form())
	if f.FirstName != "Dana" || deref(f.LastName) != "Reyes" || f.Email != "dana@example.com" {
		t.Fatalf("%+v", f)
	}
	if f.Message != "Thinking about a honeymoon in June.\nTwo of us." {
		t.Fatalf("message %q", f.Message)
	}
	if deref(f.Page) != "topic" {
		t.Fatalf("page %v", deref(f.Page))
	}
	if got := []any{deref(f.AboutKind), deref(f.AboutSlug), deref(f.AboutLabel)}; !reflect.DeepEqual(got, []any{"topic", "honeymoons", "a honeymoon"}) {
		t.Fatalf("about %v", got)
	}
	if got := []any{deref(f.UTMSource), deref(f.UTMMedium), deref(f.UTMCampaign)}; !reflect.DeepEqual(got, []any{"instagram", "social", "fall"}) {
		t.Fatalf("utm %v", got)
	}
}

// Deno.test("first name, email and a message are required")
func TestFirstNameEmailMessageRequired(t *testing.T) {
	_, err := ParseLeadForm(with(form(), "firstName", s("  ")))
	refusedWith(t, err, regexp.MustCompile(`first name`))
	_, err = ParseLeadForm(with(form(), "email", s("not-an-email")))
	refusedWith(t, err, regexp.MustCompile(`email`))
	_, err = ParseLeadForm(with(form(), "message", s(" \n ")))
	refusedWith(t, err, regexp.MustCompile(`few words`))
	_, err = ParseLeadForm(with(form(), "message", s(strings.Repeat("x", 2001))))
	refusedWith(t, err, regexp.MustCompile(`under 2,000 characters`))
	if got := mustParse(t, with(form(), "message", s(strings.Repeat("x", 2000)))).Message; js.Len(got) != 2000 {
		t.Fatalf("length %d", js.Len(got))
	}
}

// Deno.test("a card number is refused, in a message, an Add lead note or a close note")
func TestCardNumberRefused(t *testing.T) {
	_, err := ParseLeadForm(with(form(), "message", s("My card is "+card())))
	refusedWith(t, err, CardNumberRefusal)
	// Gyasi's own screens get his own voice, never "Gyasi will never ask for one here".
	_, err = ParseManualLead(with(form(), "source", s("phone"), "message", s("card "+card())))
	refusedWith(t, err, CardNumberRefusalAdvisor)
	_, err = ParseClose(js.ObjectValue("reason", s("other"), "note", s("left "+card())))
	refusedWith(t, err, CardNumberRefusalAdvisor)
	// A phone number, a date and a confirmation code are not card numbers.
	f := mustParse(t, with(form(), "message", s("Call 555-010-0100 after 6/14. Ref SRB-220119.")))
	if deref(f.Page) != "topic" {
		t.Fatalf("page %v", deref(f.Page))
	}
}

// Deno.test("a malformed 'what they were viewing' is dropped, never a refusal")
func TestMalformedAboutDropped(t *testing.T) {
	f := mustParse(t, with(form(),
		"about", js.ObjectValue("kind", s("trip"), "slug", s("../../etc"), "label", s("x")),
		"page", s("nowhere"),
	))
	if got := []any{deref(f.AboutKind), deref(f.AboutSlug), deref(f.AboutLabel), deref(f.Page)}; !reflect.DeepEqual(got, []any{nil, nil, nil, nil}) {
		t.Fatalf("got %v", got)
	}
	g := mustParse(t, with(form(), "utm", js.ObjectValue("source", s(strings.Repeat("x", 101)))))
	if g.UTMSource != nil {
		t.Fatalf("utmSource %q", *g.UTMSource)
	}
}

// Deno.test("control characters and line breaks never reach a one-line field")
func TestControlCharactersAndLineBreaks(t *testing.T) {
	f := mustParse(t, with(form(), "firstName", s("Da\x00na\r\nX"), "lastName", s("\t")))
	if f.FirstName != "Dana X" {
		t.Fatalf("firstName %q", f.FirstName)
	}
	if f.LastName != nil {
		t.Fatalf("lastName %q", *f.LastName)
	}
}

// Deno.test("the hidden field and the clock catch a bot; a person passes")
func TestHiddenFieldAndClock(t *testing.T) {
	const now = 1_000_000
	for _, c := range []struct {
		payload js.Value
		want    bool
	}{
		{with(form(), "startedAt", n(now-MinFillMS-1)), false},
		{with(form(), "startedAt", n(now-500)), true},
		{with(form(), "website", s("http://spam"), "startedAt", n(0)), true},
		{with(form(), "website", n(1), "startedAt", n(0)), true},
	} {
		got, err := LooksAutomated(c.payload, now)
		if err != nil || got != c.want {
			t.Fatalf("LooksAutomated = %v, %v; want %v", got, err, c.want)
		}
	}
	_, err := LooksAutomated(with(form(), "startedAt", s("soon")), now)
	refusedWith(t, err, regexp.MustCompile(`startedAt`))
}

// Deno.test("Add lead takes one of five sources, never 'website', and speaks to the advisor")
func TestManualLeadSources(t *testing.T) {
	m, err := ParseManualLead(with(form(), "source", s("referral")))
	if err != nil || m.Source != "referral" {
		t.Fatalf("got %+v, %v", m, err)
	}
	_, err = ParseManualLead(with(form(), "source", s("phone"), "firstName", s(" ")))
	refusedWith(t, err, "Add a first name.")
	_, err = ParseManualLead(with(form(), "source", s("phone"), "message", s(" ")))
	refusedWith(t, err, regexp.MustCompile(`Add a few words`))
	_, err = ParseManualLead(with(form(), "source", s("website")))
	refusedWith(t, err, regexp.MustCompile(`source must be`))
}

// Deno.test("a close needs a listed reason; the note is optional")
func TestCloseReasonAndNote(t *testing.T) {
	c, err := ParseClose(js.ObjectValue("reason", s("no_reply")))
	if err != nil || !reflect.DeepEqual(c, CloseInput{Reason: "no_reply", Note: nil}) {
		t.Fatalf("got %+v, %v", c, err)
	}
	c, err = ParseClose(js.ObjectValue("reason", s("other"), "note", s("  booked direct  ")))
	if err != nil || deref(c.Note) != "booked direct" {
		t.Fatalf("got %+v, %v", c, err)
	}
	_, err = ParseClose(js.ObjectValue("reason", s("rude")))
	refusedWith(t, err, regexp.MustCompile(`reason must be`))
	_, err = ParseClose(js.ObjectValue("reason", s("other"), "note", s(strings.Repeat("x", 501))))
	refusedWith(t, err, regexp.MustCompile(`too long`))
}

// Deno.test("ops")
func TestOps(t *testing.T) {
	if op, err := RequireLeadOp(s("create")); err != nil || op != "create" {
		t.Fatalf("got %q, %v", op, err)
	}
	if op, err := RequireLeadOp(s("delete_spam")); err != nil || op != "delete_spam" {
		t.Fatalf("got %q, %v", op, err)
	}
	_, err := RequireLeadOp(s("shred"))
	refusedWith(t, err, regexp.MustCompile(`op must be`))
}

// Deno.test("the forwarded visitor address counts only with the right key")
func TestForwardedAddressNeedsTheKey(t *testing.T) {
	h := http.Header{}
	h.Set("x-sta-form-key", "k-123")
	h.Set("x-sta-client-ip", "203.0.113.9")
	h.Set("cf-connecting-ip", "198.51.100.1")
	h.Set("x-forwarded-for", "192.0.2.7, 10.0.0.1")
	want := func(got *string, w any) {
		t.Helper()
		if deref(got) != w {
			t.Fatalf("got %v, want %v", deref(got), w)
		}
	}
	want(ClientAddress(h, "k-123"), "203.0.113.9")
	want(ClientAddress(h, "other"), "198.51.100.1")
	want(ClientAddress(h, ""), "198.51.100.1") // "" stands for null: both are falsy
	h.Del("cf-connecting-ip")
	want(ClientAddress(h, ""), "192.0.2.7")
	// x-real-ip is the local gateway's own address, never the visitor's.
	g := http.Header{}
	g.Set("x-real-ip", "172.18.0.1")
	g.Set("x-forwarded-for", "192.0.2.7")
	want(ClientAddress(g, ""), "192.0.2.7")
	want(ClientAddress(http.Header{}, ""), nil)
	if !SameSecret("abc", "abc") {
		t.Fatal(`SameSecret("abc", "abc")`)
	}
	if SameSecret("abc", "abcd") {
		t.Fatal(`SameSecret("abc", "abcd")`)
	}
}
