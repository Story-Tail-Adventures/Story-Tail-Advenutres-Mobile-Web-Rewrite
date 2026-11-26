package money

import (
	"net/http"
	"strings"
	"testing"
)

// §3.12 driven the way a BROWSER drives it: the fields come off the rendered page, not from
// a url.Values the test author remembered. A handler test that hand-builds the post tests
// the handler against itself — it can send a field no control writes, or a name the page
// does not carry, and pass while the screen is unusable. Five of the people area's six
// part-5 defects were invisible to green handler tests of exactly that kind.

// ── The names on the page are the names the handler reads ───────────────────────────────

func TestAvailabilitySavesWhatThePageCarries(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	body := wd.get("/agent/settings?tab=availability").Body.String()
	f := readForm(t, body, "av-form")

	// The page's own action, its own fields, and the one button a click sends.
	if f.action != "/agent/settings?tab=availability" {
		t.Fatalf("the hours form posts to %q", f.action)
	}
	rec := wd.click(f, f.defaultSubmit(t))
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("saving the page as it stands answered %d: %s", rec.Code, rec.Body.String())
	}
	if len(wd.fake.calls) != 1 {
		t.Fatalf("%d calls", len(wd.fake.calls))
	}
	b := wd.fake.calls[0].Body
	// The fixture is Monday 08:00–16:00 and every other day off. If a single name differed
	// between the page and scheduleFromForm, this would come back as the default week or an
	// all-off one, and a hand-built post could never tell.
	week := string(b["weeklySchedule"])
	if !strings.Contains(week, `"mon":{"start":"08:00","end":"16:00"}`) {
		t.Errorf("Monday went as %s", week)
	}
	for _, d := range []string{"tue", "wed", "thu", "fri", "sat", "sun"} {
		if !strings.Contains(week, `"`+d+`":null`) {
			t.Errorf("%s did not go as off: %s", d, week)
		}
	}
	if string(b["timeZone"]) != `"America/New_York"` || string(b["responseTimeHours"]) != "4" {
		t.Errorf("the zone and reply time went as %v", b)
	}
}

func TestProfileSavesWhatThePageCarries(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	f := readForm(t, wd.get("/agent/settings").Body.String(), "pf-form")
	if rec := wd.click(f, f.defaultSubmit(t)); rec.Code != http.StatusSeeOther {
		t.Fatalf("saving the profile as it stands answered %d: %s", rec.Code, rec.Body.String())
	}
	b := wd.fake.calls[0].Body
	if string(b["displayName"]) != `"Gyasi Story"` || string(b["pronouns"]) != `"he/him"` ||
		string(b["phone"]) != `"+1 (305) 555-0184"` || string(b["bio"]) != `"A few warm lines."` {
		t.Errorf("the profile went as %v", b)
	}
	if !strings.Contains(string(b["socialLinks"]), "https://instagram.com/story.tail") {
		t.Errorf("the stored link did not come back: %s", b["socialLinks"])
	}
	// Email is read-only AND nameless, so a browser sends nothing for it: the sign-in
	// address cannot be changed from this screen even by a forged post.
	if _, ok := f.fields["email"]; ok {
		t.Error("the page would send the email address")
	}
}

func TestNotificationsSendOnlyTheTickedBoxes(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	f := readForm(t, wd.get("/agent/settings?tab=notifications").Body.String(), "nt-form")
	// The fixture has clientMessages email on / push off, quoteRequests push on / email off.
	if _, on := f.fields["clientMessagesEmail"]; !on {
		t.Error("a ticked box is not in the post")
	}
	if _, off := f.fields["clientMessagesPush"]; off {
		t.Error("an unticked box is in the post; a browser leaves it out")
	}
	if rec := wd.click(f, f.defaultSubmit(t)); rec.Code != http.StatusSeeOther {
		t.Fatalf("saving the switches answered %d", rec.Code)
	}
	b := wd.fake.calls[0].Body
	if string(b["clientMessagesEmail"]) != "true" || string(b["clientMessagesPush"]) != "false" ||
		string(b["quoteRequestsPush"]) != "true" || string(b["quoteRequestsEmail"]) != "false" {
		t.Errorf("the switches went as %v", b)
	}
}

func TestSignatureSavesTheTextareaAsItStands(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	f := readForm(t, wd.get("/agent/settings?tab=signature").Body.String(), "sg-form")
	if rec := wd.click(f, f.defaultSubmit(t)); rec.Code != http.StatusSeeOther {
		t.Fatalf("saving the signature answered %d", rec.Code)
	}
	if got := string(wd.fake.calls[0].Body["signature"]); got != `"{{agent.name}}, Travel Advisor"` {
		t.Errorf("the signature went as %s", got)
	}

	// "Use the default" is its own form, so Enter in the editor can never reach it.
	reset := readForm(t, wd.get("/agent/settings?tab=signature").Body.String(), "sg-reset")
	if _, ok := reset.fields["signature"]; !ok {
		t.Error("the reset form sends no signature, so it would not clear anything")
	}
	if got := reset.fields.Get("signature"); got != "" {
		t.Errorf("the reset form sends %q, not the empty that means 'use the default'", got)
	}
}

func TestTheTimeAwayEditorPostsItsOwnFields(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	const id = "0195a2c0-1a00-7000-8000-0000000000a1"
	f := readForm(t, wd.get("/agent/settings?tab=availability&away="+id).Body.String(), "away-form")
	// The editor posts back to the URL it was drawn at, so a refusal comes back holding the
	// advisor's words.
	if !strings.Contains(f.action, "away="+id) {
		t.Fatalf("the editor posts to %q", f.action)
	}
	if rec := wd.click(f, f.defaultSubmit(t)); rec.Code != http.StatusSeeOther {
		t.Fatalf("saving the block as it stands answered %d: %s", rec.Code, rec.Body.String())
	}
	b := wd.fake.calls[0].Body
	// The block's OWN id, not a fresh one, and its stored dates.
	if string(b["timeOffId"]) != `"`+id+`"` || string(b["isNew"]) != "false" ||
		string(b["startsOn"]) != `"2026-12-01"` || string(b["endsOn"]) != `"2026-12-05"` {
		t.Errorf("the block went as %v", b)
	}
}

// ── Enter presses the FIRST submit in the form ──────────────────────────────────────────

// A settings area is full of destructive buttons next to text inputs. The people area
// shipped a form whose first submit was Archive, so Enter in a name box archived the record
// and threw away every unsaved edit. Here the first submit of every form that holds a text
// box must be the SAFE one.
func TestEnterPressesTheSafeButton(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	for _, c := range []struct{ target, form, want string }{
		{"/agent/settings", "pf-form", "Save"},
		{"/agent/settings?tab=availability", "av-form", "Save"},
		{"/agent/settings?tab=availability&away=new", "away-form", "Save"},
		{"/agent/settings?tab=notifications", "nt-form", "Save"},
		{"/agent/settings?tab=signature", "sg-form", "Save"},
	} {
		f := readForm(t, wd.get(c.target).Body.String(), c.form)
		got := f.defaultSubmit(t)
		if got.label != c.want {
			t.Errorf("%s: Enter presses %q, want %q (buttons in order: %v)", c.form, got.label, c.want, f.submits)
		}
	}

	// The photo's two forms are separate from the fields, so neither is reachable by Enter
	// in a text box, and Remove is a form of its own rather than a second submit beside it.
	profile := wd.get("/agent/settings").Body.String()
	if n := len(readForm(t, profile, "pf-form").submits); n != 1 {
		t.Errorf("the profile form has %d submits; Enter should have one safe choice", n)
	}
	if got := readForm(t, profile, "pf-remove-form").defaultSubmit(t).label; got != "Remove" {
		t.Errorf("the remove-photo form's button is %q", got)
	}
}

// Clicking Remove on the photo sends exactly one op and nothing else: it is its own form, so
// it cannot carry the fields of the one beside it.
func TestRemovingThePhotoAsABrowserClicksIt(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	f := readForm(t, wd.get("/agent/settings").Body.String(), "pf-remove-form")
	rec := wd.click(f, f.submitLabelled(t, "Remove"))
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("Remove answered %d", rec.Code)
	}
	b := wd.fake.calls[0].Body
	if string(b["op"]) != `"remove_avatar"` || len(b) != 1 {
		t.Errorf("Remove sent %v", b)
	}
}

// A form whose op sits in a hidden field is only unambiguous while no button carries a name:
// a browser serializes in tree order and url.Values.Get takes the first, so a named button
// would silently beat the hidden one. Nothing here may grow a named submit.
func TestNoSettingsButtonCarriesAName(t *testing.T) {
	wd := newWorld(t)
	seedSettings(wd)
	for _, c := range []struct{ target, form string }{
		{"/agent/settings", "pf-form"},
		{"/agent/settings", "pf-photo-form"},
		{"/agent/settings", "pf-remove-form"},
		{"/agent/settings?tab=availability", "av-form"},
		{"/agent/settings?tab=availability&away=new", "away-form"},
		{"/agent/settings?tab=notifications", "nt-form"},
		{"/agent/settings?tab=signature", "sg-form"},
		{"/agent/settings?tab=signature", "sg-reset"},
	} {
		f := readForm(t, wd.get(c.target).Body.String(), c.form)
		if got := f.fields.Get("op"); got == "" {
			t.Errorf("%s sends no op", c.form)
		}
		for _, b := range f.submits {
			if b.name != "" {
				t.Errorf("%s has a named submit %q=%q, which would beat the hidden op", c.form, b.name, b.value)
			}
		}
	}
}
