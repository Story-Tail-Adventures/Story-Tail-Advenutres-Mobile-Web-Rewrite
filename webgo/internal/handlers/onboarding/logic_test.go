package onboarding

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The parts of the wizard that are decisions rather than markup: where a step sits, what the
// summary says about a half-finished wizard, how a companion's line reads, and the two date
// formats. The screens' handler tests are in onboarding_test.go.

func TestWizardStepsAndTheCursor(t *testing.T) {
	// Six screens, five cursor values: the cover page is the ABSENCE of progress, which is
	// the same NULL the column holds before anybody starts.
	if len(wizardSteps) != 6 || wizardSteps[0].slug != "" {
		t.Fatalf("the wizard is %d steps starting %q", len(wizardSteps), wizardSteps[0].slug)
	}
	for _, c := range []struct {
		slug, overline, back, nextSlug, nextRoute string
	}{
		{"profile", "STEP 02 OF 06", "/welcome", "preferences", "/onboarding/preferences"},
		{"preferences", "STEP 03 OF 06", "/onboarding/profile", "companions", "/onboarding/companions"},
		{"companions", "STEP 04 OF 06", "/onboarding/preferences", "connect", "/onboarding/connect"},
		{"connect", "STEP 05 OF 06", "/onboarding/companions", "complete", "/onboarding/complete"},
	} {
		i := stepIndex(c.slug)
		if got := stepOverline(i); got != c.overline {
			t.Errorf("%s overline = %q", c.slug, got)
		}
		if got := previousRoute(i); got != c.back {
			t.Errorf("%s back = %q", c.slug, got)
		}
		slug, route := nextStep(i)
		if slug != c.nextSlug || route != c.nextRoute {
			t.Errorf("%s next = %q %q", c.slug, slug, route)
		}
	}
	if got := previousRoute(0); got != "" {
		t.Errorf("the cover page has a Back to %q", got)
	}
}

// Ported from web/app/(onboarding)/onboarding/complete/summary.test.ts.
func TestCompletionSubtitle(t *testing.T) {
	all := completionSummary{firstName: "Jordan", hasProfile: true, hasPreferences: true, hasCompanions: true}
	negril := &tripRow{Title: "Negril"}

	t.Run("celebrates everything only when everything is actually there", func(t *testing.T) {
		got := completionSubtitle(all)
		if got != completeSubNoTrip {
			t.Errorf("= %q", got)
		}
		if strings.Contains(got, "linked and waiting") {
			t.Error("it claims a trip is linked because the profile is complete")
		}
	})

	t.Run("names the trip when one is linked", func(t *testing.T) {
		s := all
		s.trip = negril
		if got := completionSubtitle(s); !strings.Contains(got, "your Negril trip is linked and waiting.") {
			t.Errorf("= %q", got)
		}
	})

	t.Run("lists only what was saved, joined the way a person would", func(t *testing.T) {
		s := completionSummary{hasProfile: true, hasCompanions: true}
		if got := completionSubtitle(s); !strings.Contains(got, "I've saved your details and who travels with you.") {
			t.Errorf("= %q", got)
		}
		s = completionSummary{hasProfile: true, hasPreferences: true, hasCompanions: true}
		s.hasCompanions = false
		if got := completionSubtitle(s); !strings.Contains(got, "your details and how you like to travel") {
			t.Errorf("= %q", got)
		}
		three := completionSummary{hasProfile: true, hasPreferences: true}
		three.hasCompanions = true
		three.trip = nil
		if got := completionSubtitle(three); got != completeSubNoTrip {
			t.Errorf("all three = %q", got)
		}
	})

	t.Run("says nothing was saved rather than congratulating them", func(t *testing.T) {
		if got := completionSubtitle(completionSummary{}); got != completeSubNothing {
			t.Errorf("= %q", got)
		}
	})

	// A trip on file is always named: it is the one thing on this screen they did not do
	// themselves, and the sentence that ignores it reads as though it was lost.
	t.Run("never says nothing was saved while a trip is on file", func(t *testing.T) {
		for _, s := range []completionSummary{
			{trip: negril},
			{hasProfile: true, trip: negril},
			{hasProfile: true, hasCompanions: true, trip: negril},
			{hasProfile: true, hasPreferences: true, hasCompanions: true, trip: negril},
		} {
			got := completionSubtitle(s)
			if !strings.Contains(got, "Negril") {
				t.Errorf("%+v = %q", s, got)
			}
		}
	})
}

// The tick beside each line is decoration, so the line has to say in words whether it was
// done: without that a screen reader hears four identical items.
func TestCompletionChecklistSaysSkippedInWords(t *testing.T) {
	lines := completionChecklist(completionSummary{})
	if len(lines) != 4 {
		t.Fatalf("%d lines", len(lines))
	}
	for _, l := range lines[:3] {
		if l.done || !strings.Contains(l.label, "skipped") {
			t.Errorf("%q done=%v", l.label, l.done)
		}
	}
	if lines[3].label != "No trip linked yet" || lines[3].done {
		t.Errorf("trip line = %+v", lines[3])
	}

	done := completionChecklist(completionSummary{
		hasProfile: true, hasPreferences: true, hasCompanions: true, trip: &tripRow{Title: "Negril"},
	})
	for _, l := range done {
		if !l.done || strings.Contains(l.label, "skipped") {
			t.Errorf("%q done=%v", l.label, l.done)
		}
	}
}

func TestCompanionMeta(t *testing.T) {
	now := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)
	str := func(s string) *string { return &s }

	meta, warn := companionMeta(companionRow{
		FirstName: "Sam", LastName: "Hayes", Relationship: str("Spouse"),
		DateOfBirth: str("1989-09-03"), PassportExpiry: str("2031-02-28"),
	}, now)
	if meta != "Spouse · Born 3 September 1989 · Passport expires Feb 2031" || warn {
		t.Errorf("= %q warn=%v", meta, warn)
	}

	// Inside the six-month window many countries insist on: the line says so and reads as a
	// warning rather than as another fact.
	meta, warn = companionMeta(companionRow{PassportExpiry: str("2026-11-30")}, now)
	if !warn || !strings.Contains(meta, "many countries want six months' validity") {
		t.Errorf("= %q warn=%v", meta, warn)
	}

	meta, warn = companionMeta(companionRow{}, now)
	if meta != companionsPassportNone || warn {
		t.Errorf("= %q warn=%v", meta, warn)
	}
}

func TestLinkedSentence(t *testing.T) {
	one := linkedSentence([]tripRow{{Title: "Aruba in April", StartDate: strPtr("2027-04-03")}})
	if one != "Already linked · Aruba in April — 3 Apr 2027. I started this one before you "+
		"signed up, and it's waiting on your dashboard." {
		t.Errorf("one = %q", one)
	}
	// A trip with no dates yet says so rather than showing an empty gap.
	if got := linkedSentence([]tripRow{{Title: "Aruba in April"}}); !strings.Contains(got, "dates to come") {
		t.Errorf("no dates = %q", got)
	}
	many := linkedSentence([]tripRow{{Title: "Aruba"}, {Title: "Negril"}})
	if many != "Already linked · 2 trips are on your dashboard: Aruba, Negril. I started "+
		"these before you signed up." {
		t.Errorf("many = %q", many)
	}
}

func strPtr(s string) *string { return &s }

// en-GB's short September is "Sept" and Go's is "Sep": a date rendered one way here and the
// other way in the Next app would show up in the parity pass and be chased as a bug.
func TestDateFormatsMatchIntlEnGB(t *testing.T) {
	for _, c := range []struct{ iso, long, short, month string }{
		{"2027-09-03", "3 September 2027", "3 Sept 2027", "Sept 2027"},
		{"1989-01-31", "31 January 1989", "31 Jan 1989", "Jan 1989"},
		{"2031-02-28", "28 February 2031", "28 Feb 2031", "Feb 2031"},
		{"2026-12-01", "1 December 2026", "1 Dec 2026", "Dec 2026"},
	} {
		if got := longDate(c.iso); got != c.long {
			t.Errorf("longDate(%s) = %q, want %q", c.iso, got, c.long)
		}
		if got := shortDate(c.iso); got != c.short {
			t.Errorf("shortDate(%s) = %q, want %q", c.iso, got, c.short)
		}
		if got := monthYear(c.iso); got != c.month {
			t.Errorf("monthYear(%s) = %q, want %q", c.iso, got, c.month)
		}
	}
	// A value that is not a date comes back as it was rather than as an empty gap.
	if got := longDate("soon"); got != "soon" {
		t.Errorf("longDate(soon) = %q", got)
	}
}

func TestChipSlotNames(t *testing.T) {
	for in, want := range map[string]string{
		"Costa Rica":  "dest-costa-rica",  // a space is not a slot-name character
		"gluten_free": "dest-gluten-free", // nor is an underscore
		"romantic":    "dest-romantic",
	} {
		if got := chipSlot("dest-", in); got != want {
			t.Errorf("chipSlot(%q) = %q, want %q", in, got, want)
		}
	}
}

// The explore card counts the public catalogue out loud. The Go port of that catalogue
// belongs to the public area, so until it lands this is a number with a test behind it.
func TestPublicTripCountMatchesTheCatalogue(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "web", "content", "public", "trips.ts")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	n := len(regexp.MustCompile(`(?m)^\s+slug: "`).FindAllString(string(raw), -1))
	if n != publicTripCount {
		t.Errorf("trips.ts has %d trips, the card says %s", n, strconv.Itoa(publicTripCount))
	}
}

// The sentences this package holds (the rest of the copy is in the page files) are the Next
// app's, word for word.
func TestScreenCopyMatchesTheNextApp(t *testing.T) {
	read := func(screen string) string {
		path := filepath.Join("..", "..", "..", "..", "web", "app", "(onboarding)", "onboarding", screen, "state.ts")
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		src := regexp.MustCompile(`['"]\s*\+\s*\n?\s*['"]`).ReplaceAllString(string(raw), "")
		return strings.NewReplacer(`\'`, "'", `\"`, `"`, "${firstName}", "", "${tripTitle}", "",
			"${savedList}", "", "`", "").Replace(src)
	}

	profile := read("profile")
	for name, want := range map[string]string{"formError": profileFormError} {
		if !strings.Contains(profile, want) {
			t.Errorf("profile %s is not in state.ts word for word:\n  %q", name, want)
		}
	}
	preferences := read("preferences")
	if !strings.Contains(preferences, preferencesFormError) {
		t.Errorf("preferences formError is not in state.ts word for word:\n  %q", preferencesFormError)
	}
	companions := read("companions")
	for name, want := range map[string]string{
		"errorSave":    companionsErrorSave,
		"errorRemove":  companionsErrorRemove,
		"errorLoad":    companionsErrorLoad,
		"formAddTitle": companionsFormAddTitle,
		"passportNone": companionsPassportNone,
	} {
		if !strings.Contains(companions, want) {
			t.Errorf("companions %s is not in state.ts word for word:\n  %q", name, want)
		}
	}
	connect := read("connect")
	if !strings.Contains(connect, connectFormError) {
		t.Errorf("connect formError is not in state.ts word for word:\n  %q", connectFormError)
	}
	for _, want := range []string{connectPrimary, connectPrimaryEmpty} {
		if !strings.Contains(connect, want) {
			t.Errorf("connect %q is not in state.ts", want)
		}
	}
	complete := read("complete")
	for name, want := range map[string]string{
		"titleNoName":        completeTitleNoName,
		"subNoTrip":          completeSubNoTrip,
		"subNothing":         completeSubNothing,
		"error":              completeError,
		"cardTripTitle":      completeCardTripTitle,
		"cardTripEmptyTitle": completeCardTripEmptyTitle,
		"cardTripEmptySub":   completeCardTripEmptySub,
	} {
		if !strings.Contains(complete, want) {
			t.Errorf("complete %s is not in state.ts word for word:\n  %q", name, want)
		}
	}
}
