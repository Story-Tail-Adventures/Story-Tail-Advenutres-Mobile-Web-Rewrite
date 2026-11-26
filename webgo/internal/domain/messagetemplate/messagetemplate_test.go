package messagetemplate

import (
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/message"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/messageTemplate_test.ts, one Go test per Deno.test.

func str(s string) js.Value { return js.StringValue(s) }

// detailOf is the Deno helper: the sentence a 400 carries.
func detailOf(tb testing.TB, err error) string {
	tb.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != 400 {
		tb.Fatalf("want a 400 HttpError, got %v", err)
	}
	return p.Detail
}

func mustBadRequest(tb testing.TB, err error, what string) {
	tb.Helper()
	p, ok := problem.As(err)
	if !ok || p.Status != 400 {
		tb.Fatalf("%s: want a 400 HttpError, got %v", what, err)
	}
}

func eqStrings(tb testing.TB, got, want []string) {
	tb.Helper()
	if got == nil || !slices.Equal(got, want) {
		tb.Errorf("got %q want %q", got, want)
	}
}

func includes(tb testing.TB, s, sub string) {
	tb.Helper()
	if !strings.Contains(s, sub) {
		tb.Errorf("%q does not include %q", s, sub)
	}
}

// Deno.test("unknownTokens: names each unknown inside once, ignores the known ones")
func TestUnknownTokensNamesEachUnknownOnce(t *testing.T) {
	eqStrings(t, UnknownTokens("Hi {{client.firstName}}, {{ trip.dates }}"), []string{})
	eqStrings(t, UnknownTokens("{{client.firstname}} {{trip.when}} {{client.firstname}}"), []string{
		"client.firstname",
		"trip.when",
	})
	eqStrings(t, UnknownTokens("a {single} brace and {{ }}"), []string{""})
}

// Deno.test("refuseUnfilledFields: only known fields count")
func TestRefuseUnfilledFieldsOnlyKnownFieldsCount(t *testing.T) {
	if err := RefuseUnfilledFields("All filled in, Maya."); err != nil {
		t.Errorf("filled: %v", err)
	}
	if err := RefuseUnfilledFields("A client's own {{braces}} are not a field"); err != nil {
		t.Errorf("own braces: %v", err)
	}
	eqStrings(t, UnfilledFields("{{trip.dates}} and {{ trip.dates }} and {{payment.amount}}"), []string{
		"trip.dates",
		"payment.amount",
	})
	includes(t, detailOf(t, RefuseUnfilledFields("See you {{trip.dates}}")), "Fill in {{trip.dates}}")
}

// Deno.test("readTemplateBody: keeps its shape, under one message, known fields only")
func TestReadTemplateBodyKeepsItsShape(t *testing.T) {
	got, err := ReadTemplateBody(str("Hi {{client.firstName}},\n\n"))
	if err != nil || got != "Hi {{client.firstName}},\n\n" {
		t.Errorf("got %q, %v", got, err)
	}
	got, err = ReadTemplateBody(str(strings.Repeat("x", message.MaxMessageBody)))
	if err != nil || js.Len(got) != message.MaxMessageBody {
		t.Errorf("at the ceiling: %d, %v", js.Len(got), err)
	}
	for _, v := range []js.Value{str(strings.Repeat("x", message.MaxMessageBody+1)), str("   "), js.NullValue()} {
		_, err := ReadTemplateBody(v)
		mustBadRequest(t, err, fmt.Sprint(v))
	}
	_, err = ReadTemplateBody(str("Hi {{client.firstname}}"))
	includes(t, detailOf(t, err), "{{client.firstname}} isn't a merge field")
}

// Deno.test("readTemplateName and readCategory")
func TestReadTemplateNameAndReadCategory(t *testing.T) {
	got, err := ReadTemplateName(str("  Lead response "))
	if err != nil || got != "Lead response" {
		t.Errorf("got %q, %v", got, err)
	}
	got, err = ReadTemplateName(str(strings.Repeat("n", 80)))
	if err != nil || js.Len(got) != 80 {
		t.Errorf("80: %d, %v", js.Len(got), err)
	}
	_, err = ReadTemplateName(str(strings.Repeat("n", 81)))
	mustBadRequest(t, err, "81")
	_, err = ReadTemplateName(str(" "))
	mustBadRequest(t, err, "blank")
	cat, err := ReadCategory(str("payment_reminder"))
	if err != nil || cat != "payment_reminder" {
		t.Errorf("category: %q, %v", cat, err)
	}
	_, err = ReadCategory(str("newsletter"))
	mustBadRequest(t, err, "newsletter")
}

// Deno.test("readTags: trimmed, no blanks or repeats, first spelling kept, limits")
func TestReadTagsTrimmedNoBlanksOrRepeats(t *testing.T) {
	got, err := ReadTags(js.UndefinedValue())
	if err != nil {
		t.Fatal(err)
	}
	eqStrings(t, got, []string{})
	got, err = ReadTags(js.ArrayValue(str("Beach"), str(" beach "), str(""), str("Honeymoon")))
	if err != nil {
		t.Fatal(err)
	}
	eqStrings(t, got, []string{"Beach", "Honeymoon"})
	many := make([]js.Value, MaxTags+1)
	for i := range many {
		many[i] = str(fmt.Sprintf("t%d", i))
	}
	_, err = ReadTags(js.ArrayValue(many...))
	mustBadRequest(t, err, "too many")
	_, err = ReadTags(js.ArrayValue(str(strings.Repeat("x", 31))))
	mustBadRequest(t, err, "too long")
	_, err = ReadTags(str("Beach"))
	mustBadRequest(t, err, "not a list")
}
