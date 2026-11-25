package money

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
)

// §3.12's rules, a port of web/lib/agent/settingsRules.test.ts. THE SAME VECTORS as
// supabase/functions/_shared/agentSettings_test.ts, which is the implementation that
// actually decides: change one, change all three.

func TestNormalizeSocialLink(t *testing.T) {
	for _, c := range [][3]string{
		{"instagram", "@story.tail", "https://instagram.com/story.tail"},
		{"instagram", "story_tail", "https://instagram.com/story_tail"},
		{"instagram", "instagram.com/story.tail", "https://instagram.com/story.tail"},
		{"instagram", "https://www.instagram.com/story.tail/", "https://www.instagram.com/story.tail/"},
		{"facebook", "@storytail", "https://facebook.com/storytail"},
		{"linkedin", "linkedin.com/in/gyasistory", "https://linkedin.com/in/gyasistory"},
		{"website", "story-tail.com", "https://story-tail.com"},
		{"website", "HTTPS://story-tail.com/about", "https://story-tail.com/about"},
		{"website", "  ", ""},
	} {
		got, problem := normalizeSocialLink(c[0], c[1])
		if problem != "" {
			t.Errorf("%s %q was refused: %s", c[0], c[1], problem)
			continue
		}
		if got != c[2] {
			t.Errorf("%s %q became %q, want %q", c[0], c[1], got, c[2])
		}
	}

	for _, c := range [][2]string{
		{"website", "http://story-tail.com"},
		{"website", "javascript:alert(1)"},
		{"website", "https://story tail.com"},
		{"website", "https://user:pw@story-tail.com"},
		{"website", "localhost"},
		{"instagram", "https://evil.example.com/story"},
		{"linkedin", "gyasistory"},
		{"facebook", "https://facebook.com.evil.example/x"},
		{"instagram", "instagram.com"},
		{"instagram", "https://www.instagram.com/"},
	} {
		if got, problem := normalizeSocialLink(c[0], c[1]); problem == "" {
			t.Errorf("%s %q was accepted as %q", c[0], c[1], got)
		}
	}
}

func TestPhoneProblem(t *testing.T) {
	if phoneProblem("+1 (305) 555-0184") != "" || phoneProblem("") != "" {
		t.Error("a real number or an empty box was refused")
	}
	for _, bad := range []string{"call me", "12345"} {
		if !strings.Contains(phoneProblem(bad), "doesn't look right") {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestScheduleProblem(t *testing.T) {
	full := defaultWeeklySchedule()
	if scheduleProblem(full) != "" {
		t.Error("the default schedule was refused")
	}
	allDay := defaultWeeklySchedule()
	allDay["mon"] = &dayHours{Start: "00:00", End: "24:00"}
	if scheduleProblem(allDay) != "" {
		t.Error("a whole day was refused")
	}

	for name, bad := range map[string]weeklySchedule{
		"empty":        {},
		"quarter hour": withDay("mon", &dayHours{Start: "09:15", End: "17:00"}),
		"backwards":    withDay("mon", &dayHours{Start: "17:00", End: "09:00"}),
		"start at 24":  withDay("mon", &dayHours{Start: "24:00", End: "24:00"}),
		"missing day":  missingDay("sun"),
	} {
		if scheduleProblem(bad) == "" {
			t.Errorf("%s was accepted", name)
		}
	}

	if got := scheduleProblem(withDay("fri", &dayHours{Start: "17:00", End: "09:00"})); got != "Friday's hours have to end after they start." {
		t.Errorf("a backwards Friday reads %q", got)
	}
}

func withDay(day string, h *dayHours) weeklySchedule {
	ws := defaultWeeklySchedule()
	ws[day] = h
	return ws
}

func missingDay(day string) weeklySchedule {
	ws := defaultWeeklySchedule()
	delete(ws, day)
	return ws
}

func TestScheduleFromJSON(t *testing.T) {
	// A stored schedule this screen recognises comes back as it stands.
	good := `{"mon":{"start":"08:00","end":"16:00"},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null}`
	ws := scheduleFromJSON(json.RawMessage(good))
	if ws["mon"] == nil || ws["mon"].Start != "08:00" || ws["tue"] != nil {
		t.Errorf("a good schedule read as %+v", ws)
	}
	// Anything else falls back to the default rather than failing the page.
	for _, bad := range []string{``, `null`, `[]`, `{"mon":5}`, `{"mon":{"start":"09:15","end":"17:00"}}`,
		`{"mon":{"start":"08:00","end":"16:00","extra":1},"tue":null,"wed":null,"thu":null,"fri":null,"sat":null,"sun":null}`} {
		got := scheduleFromJSON(json.RawMessage(bad))
		if got["mon"] == nil || got["mon"].Start != "07:00" {
			t.Errorf("%q did not fall back to the default: %+v", bad, got)
		}
	}
}

func TestTimeHelpers(t *testing.T) {
	h := halfHours()
	if len(h) != 49 || h[0] != "00:00" || h[48] != "24:00" {
		t.Errorf("half hours are %d from %q to %q", len(h), h[0], h[len(h)-1])
	}
	for in, want := range map[string]string{
		"07:00": "7am", "21:30": "9:30pm", "12:00": "noon", "24:00": "midnight", "00:00": "midnight",
	} {
		if got := timeLabel(in); got != want {
			t.Errorf("timeLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestOutOfOffice(t *testing.T) {
	const today = "2026-10-17"
	for _, c := range [][4]string{
		{"2026-11-26", "2026-11-29", today, ""},
		{"2026-10-17", "2026-10-17", today, ""},
		{"2026-10-16", "2026-10-18", today, "Time away can start today or later."},
		{"2026-11-29", "2026-11-26", today, "The last day away can't be before the first."},
		{"2026-02-30", "2026-03-01", today, "Pick the first day away."},
	} {
		if got := timeOffProblem(c[0], c[1], c[2]); got != c[3] {
			t.Errorf("timeOffProblem(%q, %q) = %q, want %q", c[0], c[1], got, c[3])
		}
	}
	if !strings.Contains(timeOffProblem("2026-11-01", "2027-12-01", today), "up to a year") {
		t.Error("a thirteen-month block was accepted")
	}

	for _, c := range [][4]string{
		{"2026-07-04", "2026-07-07", "2026-06-01", "Jul 4 – Jul 7"},
		{"2026-07-04", "2026-07-04", "2026-06-01", "Jul 4"},
		{"2026-12-24", "2027-01-02", today, "Dec 24 – Jan 2, 2027"},
	} {
		if got := dateRangeLabel(c[0], c[1], c[2]); got != c[3] {
			t.Errorf("dateRangeLabel(%q, %q) = %q, want %q", c[0], c[1], got, c[3])
		}
	}

	for _, c := range [][4]string{
		{"2026-10-18", "2026-10-20", today, "upcoming"},
		{"2026-10-17", "2026-10-20", today, "running"},
		{"2026-10-10", "2026-10-16", today, "past"},
	} {
		if got := timeOffPhase(c[0], c[1], c[2]); got != c[3] {
			t.Errorf("timeOffPhase(%q, %q) = %q, want %q", c[0], c[1], got, c[3])
		}
	}
}

func TestAvatarSrc(t *testing.T) {
	if got := avatarSrc("/storage/v1/object/public/agent-avatars/a/b.jpg", "http://127.0.0.1:56321"); got != "http://127.0.0.1:56321/storage/v1/object/public/agent-avatars/a/b.jpg" {
		t.Errorf("a stored path became %q", got)
	}
	// Anything that is not our bucket's path draws nothing: agent.avatar_url holds a PATH,
	// and an absolute one would point the browser somewhere we do not control.
	for _, bad := range []string{
		"http://kong:8000/storage/v1/object/public/agent-avatars/a/b.jpg",
		"//evil.example/x.jpg",
		"",
		"/storage/v1/object/public/other-bucket/a.jpg",
	} {
		if got := avatarSrc(bad, "https://x.supabase.co"); got != "" {
			t.Errorf("avatarSrc(%q) = %q, want nothing", bad, got)
		}
	}
}

func TestSignature(t *testing.T) {
	const name, phone, email = "Gyasi Story", "+1 (305) 555-0184", "gyasi@story-tail.com"
	want := []string{
		"Gyasi Story, Travel Advisor",
		"+1 (305) 555-0184 · gyasi@story-tail.com",
		"adventures.story-tail.com",
		"",
		"Making travel an adventure",
		"",
		lockedSignatureLine,
	}
	got := signatureLines(defaultSignature, name, phone, email)
	if len(got) != len(want) {
		t.Fatalf("%d lines: %q", len(got), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("line %d is %q, want %q", i, got[i], want[i])
		}
	}
	// A missing phone leaves a dangling separator; the renderer tidies it.
	if line := signatureLines(defaultSignature, name, "", email)[1]; line != email {
		t.Errorf("with no phone the second line is %q", line)
	}

	if signatureProblem(defaultSignature) != "" {
		t.Error("the default signature was refused")
	}
	if got := signatureProblem(strings.Repeat("x\n", 8) + "ninth"); !strings.Contains(got, "8 lines") {
		t.Errorf("nine lines read %q", got)
	}
	if got := signatureProblem(strings.Repeat("x", 501)); !strings.Contains(got, "500 characters") {
		t.Errorf("501 characters read %q", got)
	}
	if got := signatureProblem("{{client.firstName}}"); !strings.Contains(got, "We don't have a") {
		t.Errorf("an unknown field read %q", got)
	}
}

func TestAutoReply(t *testing.T) {
	if autoReplyProblem(false, "") != "" {
		t.Error("an empty reply that is off was refused")
	}
	if got := autoReplyProblem(true, "  "); !strings.Contains(got, "Add the words") {
		t.Errorf("an empty reply that is on reads %q", got)
	}
	if got := autoReplyProblem(true, "Back {{agent.name}}"); !strings.Contains(got, "We don't have a") {
		t.Errorf("an unknown field reads %q", got)
	}
	if autoReplyProblem(true, "Back {{return_date}}") != "" {
		t.Error("the one field it has was refused")
	}
	if got := returnDateLabel("2026-07-07"); got != "Wednesday, July 8" {
		t.Errorf("the return date reads %q", got)
	}
}

func TestInitialsOf(t *testing.T) {
	for in, want := range map[string]string{
		"Gyasi Story": "GS", "Gyasi": "G", "  ": "?", "ada b lovelace": "AL",
	} {
		if got := initialsOf(in); got != want {
			t.Errorf("initialsOf(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestScheduleFromForm(t *testing.T) {
	form := url.Values{}
	for _, d := range weekdays {
		form.Set("on-"+d, "1")
		form.Set("from-"+d, "07:00")
		form.Set("to-"+d, "21:00")
	}
	form.Del("on-sun")
	ws := scheduleFromForm(form)
	if ws["sun"] != nil {
		t.Error("an unticked day did not come back as off")
	}
	if ws["mon"] == nil || ws["mon"].Start != "07:00" || ws["mon"].End != "21:00" {
		t.Errorf("Monday read as %+v", ws["mon"])
	}
	if scheduleProblem(ws) != "" {
		t.Error("a schedule straight from the form was refused")
	}
	// The times are read AS TYPED, so the advisor gets the sentence rather than a silent
	// correction to the nearest half hour.
	form.Set("from-mon", "09:15")
	if got := scheduleProblem(scheduleFromForm(form)); got != "Working hours go in half-hour steps." {
		t.Errorf("a quarter-hour start reads %q", got)
	}
}

func TestWeekWindow(t *testing.T) {
	// The picture spans 8am to 8pm, widened to whatever the advisor actually works, and both
	// ends land on a whole hour so the labels line up.
	lo, hi := weekWindow(defaultWeeklySchedule())
	if lo != 14 || hi != 42 {
		t.Errorf("the default week spans %d to %d", lo, hi)
	}
	ws := defaultWeeklySchedule()
	ws["mon"] = &dayHours{Start: "00:00", End: "24:00"}
	lo, hi = weekWindow(ws)
	if lo != 0 || hi != 48 {
		t.Errorf("a whole day spans %d to %d", lo, hi)
	}
	// Every count it can produce is even and inside the rules money.css carries.
	for _, c := range []weeklySchedule{defaultWeeklySchedule(), ws, {}} {
		l, h := weekWindow(c)
		if (h-l)%2 != 0 || h-l < 24 || h-l > 48 {
			t.Errorf("a week of %d columns has no rule", h-l)
		}
	}
}

// ── What an independent review proved ───────────────────────────────────────────────────

// Go's `\s` is [\t\n\f\r ] and JavaScript's is the whole Unicode set, so a regex written
// with Go's disagrees with the Edge Function about every other space. A NON-BREAKING space
// is what a paste from Word, or Option-Space on a Mac, puts between the braces — and the
// function ACCEPTS that, so a signature the server stored would have locked this tab for
// good: the field error is recomputed on every plain GET, and the character is invisible.
func TestMergeFieldsAcceptEveryKindOfSpaceTheServerDoes(t *testing.T) {
	for _, space := range []string{" ", " ", "\t", " ", "　", "\ufeff", " "} {
		sig := "{{" + space + "agent.name" + space + "}}"
		if got := signatureProblem(sig); got != "" {
			t.Errorf("a signature spaced with %q was refused: %s", space, got)
		}
		lines := signatureLines(sig, "Gyasi Story", "", "")
		if lines[0] != "Gyasi Story" {
			t.Errorf("a signature spaced with %q previewed as %q", space, lines[0])
		}
		if got := autoReplyProblem(true, "Back {{"+space+"return_date"+space+"}}"); got != "" {
			t.Errorf("an auto-reply spaced with %q was refused: %s", space, got)
		}
		if got := autoReplyPreview("Back {{"+space+"return_date"+space+"}}", "2026-07-07"); got != "Back Wednesday, July 8" {
			t.Errorf("an auto-reply spaced with %q previewed as %q", space, got)
		}
	}
	// A field that really is unknown is still refused, whatever it is spaced with.
	if got := signatureProblem("{{ client.firstName }}"); got != "We don't have a {{client.firstName}} field. You can use {{agent.name}}, {{agent.phone}} or {{agent.email}}." {
		t.Errorf("an unknown field reads %q", got)
	}
}

// trimEnd() strips all Unicode whitespace, so a line ending in one is not a line with
// trailing text on it.
func TestSignatureTrimsTheSpacesJavaScriptTrims(t *testing.T) {
	if got := normalizeSignature("trailing  "); got != "trailing" {
		t.Errorf("normalizeSignature left %q", got)
	}
	if got := normalizeSignature("a  \nb　"); got != "a\nb" {
		t.Errorf("normalizeSignature left %q", got)
	}
}

// A link with a space in it is refused whatever kind of space it is, because the server
// refuses it and the page should not send a round trip to be told so.
func TestASpacedLinkIsRefused(t *testing.T) {
	for _, space := range []string{" ", " ", " ", "　"} {
		if _, problem := normalizeSocialLink("website", "example.com/a"+space+"b"); problem == "" {
			t.Errorf("a link spaced with %q was accepted", space)
		}
	}
}

// `https://@instagram.com` has an EMPTY userinfo, which a browser's URL reads as none at
// all: the answer is the one about a missing handle, not the one about a disguised link.
func TestAnEmptyUserinfoIsNotAUserinfo(t *testing.T) {
	_, problem := normalizeSocialLink("instagram", "@instagram.com")
	if problem != "Add your handle or the link to your Instagram page." {
		t.Errorf("@instagram.com reads %q", problem)
	}
	// A real one is still the phishing disguise it always was.
	if _, problem := normalizeSocialLink("website", "https://user:pw@story-tail.com"); problem == "" {
		t.Error("a link with a username was accepted")
	}
}
