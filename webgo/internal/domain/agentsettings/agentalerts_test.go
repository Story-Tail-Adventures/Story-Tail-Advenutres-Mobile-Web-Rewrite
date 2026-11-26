package agentsettings

import (
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// The two Deno tests in supabase/functions/_shared/agentAlerts_test.ts that exercise
// agentSettings.ts (the rest of that file is ported with the email and push packages).

// Deno.test("readSignature: plain text, 8 lines, 500 characters, three fields; empty means default")
func TestReadSignaturePlainTextEightLinesFiveHundredCharactersThreeFields(t *testing.T) {
	for _, v := range []js.Value{str("  \n\n"), js.NullValue()} {
		got, err := ReadSignature(v)
		if err != nil || got != nil {
			t.Errorf("%v: got %s, %v", v, show(got), err)
		}
	}
	got, err := ReadSignature(str("Hi  \r\nThere\n\n"))
	if err != nil || show(got) != "Hi\nThere" {
		t.Errorf("trimmed: got %q, %v", show(got), err)
	}
	for _, v := range []string{
		strings.Repeat("x\n", 8) + "ninth",
		strings.Repeat("x", 501),
		"{{client.firstName}}",
	} {
		_, err := ReadSignature(str(v))
		mustBadRequest(t, err, v)
	}
	if got := UnknownSignatureFields("{{agent.name}} {{ trip.title }} {{agent.phone}}"); !slices.Equal(got, []string{"trip.title"}) {
		t.Errorf("unknown fields: got %q", got)
	}
}

// Deno.test("readAutoReply: words required when on; only {{return_date}}")
func TestReadAutoReplyWordsRequiredWhenOnOnlyReturnDate(t *testing.T) {
	got, err := ReadAutoReply(js.BoolValue(false), str(""))
	if err != nil || got.Enabled || got.Text != nil {
		t.Errorf("off: got %+v, %v", got, err)
	}
	got, err = ReadAutoReply(js.BoolValue(true), str(" Back {{return_date}} "))
	if err != nil || !got.Enabled || show(got.Text) != "Back {{return_date}}" {
		t.Errorf("on: got %+v (%s), %v", got, show(got.Text), err)
	}
	for _, tc := range []struct {
		enabled js.Value
		text    string
	}{
		{js.BoolValue(true), "  "},
		{js.BoolValue(true), "Back {{agent.name}}"},
		{js.BoolValue(true), strings.Repeat("x", 601)},
		{str("yes"), "x"},
	} {
		_, err := ReadAutoReply(tc.enabled, str(tc.text))
		mustBadRequest(t, err, tc.text)
	}
}
