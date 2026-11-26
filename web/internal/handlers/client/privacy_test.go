package client_test

import (
	"strings"
	"testing"
)

// Screens 2.5.9 Privacy & Data and 2.5.10 Account Closure. Both are read-only today, and
// what they must never do is claim otherwise.

func TestPrivacySaysWhatIsHeldAndOffersNoSwitchItCannotHonour(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/account/privacy")

	has(t, rec, esc("Privacy & data"), esc("What we hold, and what we don’t."),
		"Download your data", "Request an export",
		"TRACKING", esc("We don’t run advertising trackers."),
		"Read the cookie policy", `href="/legal/cookies"`,
		"Close your account", `href="/account/close"`)

	// Of the artboard's three tracking toggles, none is drawn: essential cookies are not a
	// choice, Marketing does not exist, and the analytics switch belongs to the surface
	// that configures the tracker. A switch that does nothing is worse than a sentence.
	for _, slot := range formSlots(rec.Body.String()) {
		f := readForm(t, rec.Body.String(), slot)
		for _, b := range f.submits {
			t.Errorf("2.5.9 offers a submit %q; nothing on it can be submitted", b.value)
		}
	}
}

// trackingBody is a privacy CLAIM bound to the published cookie policy. If a tracker is
// added or changed, both move in the same commit.
func TestTheTrackingClaimIsTheWholeSentence(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/account/privacy")
	has(t, rec,
		esc("Nothing counts your visit unless you allow it"),
		esc("The only other cookies are the ones that keep you signed in"))
}

func TestClosureStatesTheIntentAndNotADeadlineNothingEnforces(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/account/close")

	has(t, rec, "Close your account?", "WHAT HAPPENS",
		esc("Your trips are archived — ask for a final PDF first if you want one"),
		"Your personal details are anonymized",
		"Booking and tax records are kept, because the law requires it",
		// The offer to talk to Gyasi stays: it is useful.
		"Message him first", `href="/messages/new"`,
		"Close my account", "Keep my account")

	// Data-Model §18.5 describes a 30-day anonymization window and NOTHING implements it.
	// The copy states the intent and omits the deadline until the scrubber ships.
	for _, never := range []string{"30 days", "30-day", "within 30"} {
		if strings.Contains(rec.Body.String(), never) {
			t.Errorf("the page promises %q, which nothing enforces", never)
		}
	}
}

// No function writes to `account`, so every control here is off — including the two fields,
// rather than collecting something nothing consumes.
func TestNothingOnTheClosureScreenCanBeSubmitted(t *testing.T) {
	hn := newHarness(t)
	body := hn.signedIn().get("/account/close").Body.String()
	for _, slot := range formSlots(body) {
		f := readForm(t, body, slot)
		for _, b := range f.submits {
			t.Errorf("form %q offers a submit %q", slot, b.value)
		}
	}
	for _, field := range []string{`id="reason"`, `id="confirm"`} {
		i := strings.Index(body, field)
		if i < 0 {
			t.Errorf("%s is missing", field)
			continue
		}
		tag := body[strings.LastIndex(body[:i], "<"):]
		if j := strings.Index(tag, ">"); j >= 0 {
			tag = tag[:j]
		}
		if !strings.Contains(tag, "disabled") {
			t.Errorf("%s is live, and nothing consumes it", field)
		}
	}
}

// The closure screen is reached from 2.5.9, not from the hub, so that link has to work.
func TestPrivacyIsTheWayToTheClosureScreen(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	if !strings.Contains(c.get("/account/privacy").Body.String(), `href="/account/close"`) {
		t.Fatal("2.5.9 does not link to 2.5.10")
	}
	if code := c.get("/account/close").Code; code != 200 {
		t.Errorf("/account/close = %d", code)
	}
}
