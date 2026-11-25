package onboarding_test

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// The six screens of the wizard, end to end: the gate in front of them, what each one reads,
// what each one posts, and what a refusal shows.

var wizard = []string{
	"/welcome", "/onboarding/profile", "/onboarding/preferences",
	"/onboarding/companions", "/onboarding/connect", "/onboarding/complete",
}

func TestEveryScreenNeedsASession(t *testing.T) {
	hn := newHarness(t)
	for _, path := range wizard {
		where(t, hn.client().get(path), http.StatusSeeOther, "/login?next="+url.QueryEscape(path))
	}
}

// The (onboarding) layout's own gate: somebody who has finished the wizard, and anybody who
// is not a traveler, has no business back inside it. 2.1.10 to 2.1.12 all have a second
// entry point in account settings, which is where editing belongs once the first run is over.
func TestAFinishedWizardIsClosed(t *testing.T) {
	hn := newHarness(t)
	hn.f.completedAt = "2026-11-01T00:00:00Z"
	c := hn.signedIn()
	for _, path := range wizard {
		where(t, c.get(path), http.StatusSeeOther, "/dashboard")
	}
}

func TestAnAgentHasNoWizard(t *testing.T) {
	hn := newHarness(t)
	hn.f.role = "agent"
	c := hn.signedIn()
	where(t, c.get("/welcome"), http.StatusSeeOther, "/dashboard")
	where(t, c.post("/onboarding/profile", url.Values{"action": {"save"}}), http.StatusSeeOther, "/dashboard")
	if calls := hn.f.seen("POST /functions/v1/onboarding-profile"); len(calls) != 0 {
		t.Errorf("an agent's post reached the function: %v", calls)
	}
}

// --- 2.1.9 Welcome ---------------------------------------------------------------------------

func TestWelcomeGreetsByThePreferredName(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "Jordan", "preferred_name": "Jo"})
	has(t, hn.signedIn().get("/welcome"), esc("So glad you're here, Jo."))
}

// handle_new_user() writes the literal 'New' when a sign-up carried no name at all, which a
// social provider that sends no name claims produces. Greeting somebody as "New" is worse
// than greeting them as nobody in particular.
func TestWelcomeNeverGreetsSomebodyAsNew(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "New", "preferred_name": nil})
	rec := hn.signedIn().get("/welcome")
	has(t, rec, esc("So glad you're here."))
	hasNot(t, rec, "New.")
}

func TestWelcomeStartsTheWizard(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/welcome", url.Values{"action": {"start"}})
	where(t, rec, http.StatusSeeOther, "/onboarding/profile")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-step").Body["step"]; got != "profile" {
		t.Errorf("the cursor moved to %v", got)
	}
}

// Skipping and finishing are the same write: §2.1.9 offers skipping as a real choice, and
// somebody who declines must not be asked again on every sign-in.
func TestWelcomeSkipEndsTheWizard(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/welcome", url.Values{"action": {"skip"}})
	where(t, rec, http.StatusSeeOther, "/dashboard")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-step").Body["complete"]; got != true {
		t.Errorf("complete = %v", got)
	}
}

// A failed skip is reported rather than swallowed: silently failing would greet them with
// this screen on every single sign-in, with no idea why. The escape hatch is a real link.
func TestWelcomeSkipFailureKeepsTheWayOut(t *testing.T) {
	hn := newHarness(t)
	hn.f.fails("onboarding-step", 500, "")
	rec := hn.signedIn().post("/welcome", url.Values{"action": {"skip"}})
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't save that just now"), `href="/dashboard"`)
}

// --- 2.1.10 Profile --------------------------------------------------------------------------

func TestProfilePrefillsWhatIsOnFile(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{
		"phone": "+13055550184", "date_of_birth": "1989-09-03",
		"emergency_contact":  map[string]any{"name": "Sam Hayes", "phone": "+13055550186", "relationship": "Spouse"},
		"mailing_address_id": "addr-1",
	})
	hn.f.rows("address", map[string]any{
		"line1": "1240 Brickell Bay Dr", "line2": nil, "city": "Miami",
		"region": "FL", "postal_code": "33131", "country": "US",
	})
	hn.f.rows("travel_document", map[string]any{"expires_on": "2019-08-14", "issuing_country": "GB"})

	rec := hn.signedIn().get("/onboarding/profile")
	has(t, rec,
		`value="+13055550184"`, `value="1989-09-03"`, `value="Sam Hayes"`, `value="Spouse"`,
		`value="1240 Brickell Bay Dr"`, `value="Miami"`, `value="33131"`,
		`<option value="US" data-slot="country-us" selected=""`,
		`<option value="GB" data-slot="pcountry-gb" selected=""`,
		// An expiry already past is kept and flagged — that record is why reminders exist.
		esc("That passport has expired."))
}

func TestProfileRefusesAPhoneThatCannotRing(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/profile", url.Values{
		"action": {"save"}, "phone": {"1234567890"}, "addressCountry": {"US"},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("That doesn't look like a phone number yet"), `value="1234567890"`, `aria-invalid="true"`)
	if calls := hn.f.seen("POST /functions/v1/onboarding-profile"); len(calls) != 0 {
		t.Error("a refused form reached the function")
	}
}

// The group rules land on the group, not on one of its boxes.
func TestProfileRefusesAHalfWrittenAddressOnTheGroup(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/profile", url.Values{
		"action": {"save"}, "addressLine1": {"1240 Brickell Bay Dr"}, "addressCountry": {"US"},
	})
	has(t, rec, esc("An address needs at least a street, a city and a country"),
		`aria-describedby="address-error"`)
}

func TestProfileSavesEveryKeyAndAdvances(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/profile", url.Values{
		"action": {"save"}, "phone": {"(305) 555-0184"}, "dateOfBirth": {"1989-09-03"},
		"addressLine1": {"1240 Brickell Bay Dr"}, "addressCity": {"Miami"},
		"addressRegion": {"FL"}, "addressPostalCode": {"33131"}, "addressCountry": {"us"},
		"emergencyName": {"Sam Hayes"}, "emergencyPhone": {"3055550186"},
		"passportExpiry": {"2031-02-28"}, "passportCountry": {"US"},
	})
	where(t, rec, http.StatusSeeOther, "/onboarding/preferences")

	body := hn.f.one(t, "POST /functions/v1/onboarding-profile").Body
	if body["phone"] != "+13055550184" {
		t.Errorf("phone went as %v, not E.164", body["phone"])
	}
	if body["advance"] != true {
		t.Errorf("advance = %v", body["advance"])
	}
	// Every key present, so an emptied field clears rather than being ignored.
	for _, key := range []string{"phone", "dateOfBirth", "address", "emergencyContact", "passport"} {
		if _, ok := body[key]; !ok {
			t.Errorf("the body left out %q", key)
		}
	}
	address, _ := body["address"].(map[string]any)
	if address["country"] != "US" || address["line2"] != nil {
		t.Errorf("address = %v", address)
	}
	contact, _ := body["emergencyContact"].(map[string]any)
	if contact["phone"] != "+13055550186" || contact["relationship"] != nil {
		t.Errorf("emergencyContact = %v", contact)
	}
	// There is no passport number field, and no key for one.
	passport, _ := body["passport"].(map[string]any)
	if _, ok := passport["number"]; ok {
		t.Errorf("the body carries a passport number: %v", passport)
	}
}

// Skipping writes the cursor and nothing else: calling the profile function with an empty
// body would spend an audit row saying somebody changed nothing.
func TestProfileSkipWritesOnlyTheCursor(t *testing.T) {
	hn := newHarness(t)
	where(t, hn.signedIn().post("/onboarding/profile", url.Values{"action": {"skip"}}),
		http.StatusSeeOther, "/onboarding/preferences")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-step").Body["step"]; got != "preferences" {
		t.Errorf("the cursor moved to %v", got)
	}
	if calls := hn.f.seen("POST /functions/v1/onboarding-profile"); len(calls) != 0 {
		t.Error("a skip wrote the profile")
	}
}

// The no-JavaScript relabel: the country's own labels, everything typed still there, and
// nothing saved.
func TestProfileRelabelsWithoutSaving(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/profile", url.Values{
		"action": {"relabel"}, "addressCountry": {"CA"}, "addressCity": {"Toronto"},
	})
	if rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, ">Region<", ">Postal code<", `value="Toronto"`)
	hasNot(t, rec, ">ZIP code<")
	if calls := hn.f.seen("POST /functions/v1/onboarding-profile"); len(calls) != 0 {
		t.Error("a relabel saved the form")
	}
}

func TestProfileShowsTheFunctionsOwnSentence(t *testing.T) {
	hn := newHarness(t)
	hn.f.fails("onboarding-profile", 400, "An address needs a street, a city and a country.")
	rec := hn.signedIn().post("/onboarding/profile", url.Values{"action": {"save"}, "addressCountry": {"US"}})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("An address needs a street, a city and a country."))
}

// --- 2.1.11 Preferences ----------------------------------------------------------------------

func TestPreferencesPrefillsTheChips(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("travel_preference", map[string]any{
		"preferred_destinations": []string{"Caribbean", "Kenya"},
		"travel_styles":          []string{"romantic"},
		"dietary_restrictions":   []string{"halal"},
		"dietary_notes":          "No shellfish",
		"accessibility_needs":    []string{},
		"loyalty_programs":       []map[string]any{{"program": "AAdvantage", "number": nil}},
		"budget_band":            "premium",
		"favorite_past_trips":    "Santorini, 2019",
	})
	rec := hn.signedIn().get("/onboarding/preferences")
	has(t, rec,
		`value="Caribbean" data-slot="dest-caribbean" checked=""`,
		`value="romantic" data-slot="style-romantic" checked=""`,
		`value="halal" data-slot="diet-halal" checked=""`,
		`value="premium" data-slot="budget-premium" checked=""`,
		`value="AAdvantage"`, "Santorini, 2019",
		// A place that is not one of the eight suggestions comes back as its own chip
		// rather than disappearing.
		`value="Kenya"`)
}

// A membership with no number yet is kept: the function stores number as null, and a reader
// that demanded two strings would drop the row — and the next save would delete the program.
func TestPreferencesKeepsAProgramWithNoNumber(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("travel_preference", map[string]any{
		"loyalty_programs": []map[string]any{{"program": "IHG Rewards", "number": nil}},
	})
	has(t, hn.signedIn().get("/onboarding/preferences"), `value="IHG Rewards"`)
}

// "No restrictions" beside a written restriction is the likelier of the two contradictions
// the sentinel forbids: the vocabulary has no slug for an allergy, so a real one lands in
// the note.
func TestPreferencesRefusesNoRestrictionsBesideANote(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/preferences", url.Values{
		"action": {"save"}, "dietary": {"none"}, "dietaryNotes": {"Severe shellfish allergy"},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc(`You've said no restrictions, but written one below`), `value="Severe shellfish allergy"`)
	if calls := hn.f.seen("POST /functions/v1/onboarding-preferences"); len(calls) != 0 {
		t.Error("a refused form reached the function")
	}
}

func TestPreferencesAddsALoyaltyRowWithoutSaving(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/preferences", url.Values{
		"action":         {"add-row"},
		"loyaltyProgram": {"AAdvantage", ""},
		"loyaltyNumber":  {"4ZE82Q", ""},
	})
	if rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, `value="AAdvantage"`)
	if rows := strings.Count(rec.Body.String(), `name="loyaltyProgram"`); rows != 3 {
		t.Errorf("the repeater has %d rows, want the two posted plus one", rows)
	}
	if calls := hn.f.seen("POST /functions/v1/onboarding-preferences"); len(calls) != 0 {
		t.Error("adding a row saved the form")
	}
}

func TestPreferencesSendsSlugsAndEveryKey(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/preferences", url.Values{
		"action": {"save"}, "destinations": {"Caribbean"}, "destinationOther": {"Kenya, caribbean"},
		"travelStyles": {"romantic"}, "budgetBand": {"premium"},
	})
	where(t, rec, http.StatusSeeOther, "/onboarding/companions")
	body := hn.f.one(t, "POST /functions/v1/onboarding-preferences").Body
	destinations, _ := body["destinations"].([]any)
	if len(destinations) != 2 || destinations[0] != "Caribbean" || destinations[1] != "Kenya" {
		t.Errorf("destinations = %v, want the chip and the typed one, deduplicated", destinations)
	}
	for _, key := range []string{"destinations", "travelStyles", "dietary", "dietaryNotes",
		"accessibility", "accessibilityNotes", "loyalty", "budgetBand", "favoritePastTrips"} {
		if _, ok := body[key]; !ok {
			t.Errorf("the body left out %q, so a cleared group would not clear", key)
		}
	}
	if body["advance"] != true {
		t.Errorf("advance = %v", body["advance"])
	}
}

// --- 2.1.12 Companions -----------------------------------------------------------------------

func seedCompanion(hn *harness) {
	hn.f.rows("companion", map[string]any{
		"id": "c-1", "first_name": "Sam", "last_name": "Hayes", "relationship": "Spouse",
		"date_of_birth": "1989-09-03", "passport_expiry": "2031-02-28", "passport_country": "US",
	})
}

func TestCompanionsListsWhoIsOnFile(t *testing.T) {
	hn := newHarness(t)
	seedCompanion(hn)
	rec := hn.signedIn().get("/onboarding/companions")
	has(t, rec, "Sam Hayes", esc("Spouse · Born 3 September 1989 · Passport expires Feb 2031"),
		`href="/onboarding/companions?edit=c-1"`, `aria-label="Remove Sam Hayes from your travelers"`)
	hasNot(t, rec, "No one added yet")
}

func TestCompanionsShowsTheEmptyState(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/onboarding/companions")
	has(t, rec, "No one added yet", "Add your first traveler")
}

func TestCompanionsEditPrefillsAndSaves(t *testing.T) {
	hn := newHarness(t)
	seedCompanion(hn)
	c := hn.signedIn()
	has(t, c.get("/onboarding/companions?edit=c-1"), "Edit Sam Hayes", `value="Sam"`, `value="Hayes"`,
		`<option value="US" data-slot="ccountry-us" selected=""`)

	rec := c.post("/onboarding/companions", url.Values{
		"action": {"save"}, "id": {"c-1"}, "firstName": {"Sam"}, "lastName": {"Rivers"},
	})
	where(t, rec, http.StatusSeeOther, "/onboarding/companions")
	body := hn.f.one(t, "POST /functions/v1/onboarding-companions").Body
	if body["action"] != "edit" || body["id"] != "c-1" || body["lastName"] != "Rivers" {
		t.Errorf("body = %v", body)
	}
}

// A new companion carries a client-minted UUID v7, so a retry after a dropped connection
// cannot add the same person twice.
func TestCompanionsAddCarriesAV7Id(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/companions", url.Values{
		"action": {"save"}, "firstName": {"Sam"}, "lastName": {"Hayes"},
	})
	where(t, rec, http.StatusSeeOther, "/onboarding/companions")
	body := hn.f.one(t, "POST /functions/v1/onboarding-companions").Body
	id, _ := body["id"].(string)
	if body["action"] != "add" || len(id) != 36 || id[14] != '7' {
		t.Errorf("body = %v", body)
	}
}

func TestCompanionsNeedsBothHalvesOfTheName(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/companions", url.Values{
		"action": {"save"}, "firstName": {"Sam"}, "lastName": {"  "},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("And their last name — suppliers need both for ticketing"))
	if calls := hn.f.seen("POST /functions/v1/onboarding-companions"); len(calls) != 0 {
		t.Error("a refused form reached the function")
	}
}

func TestCompanionsRemoveIsAPost(t *testing.T) {
	hn := newHarness(t)
	seedCompanion(hn)
	rec := hn.signedIn().post("/onboarding/companions", url.Values{"action": {"remove"}, "id": {"c-1"}})
	where(t, rec, http.StatusSeeOther, "/onboarding/companions")
	body := hn.f.one(t, "POST /functions/v1/onboarding-companions").Body
	if body["action"] != "remove" || body["id"] != "c-1" {
		t.Errorf("body = %v", body)
	}
}

func TestCompanionsContinueOnlyMovesTheCursor(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/companions", url.Values{"action": {"continue"}})
	where(t, rec, http.StatusSeeOther, "/onboarding/connect")
	body := hn.f.one(t, "POST /functions/v1/onboarding-companions").Body
	if body["action"] != "none" || body["advance"] != true {
		t.Errorf("body = %v", body)
	}
}

// A stale edit link (the row was removed in another tab) shows the list rather than a form
// posting a dead id.
func TestCompanionsStaleEditLinkGoesBackToTheList(t *testing.T) {
	hn := newHarness(t)
	where(t, hn.signedIn().get("/onboarding/companions?edit=gone"), http.StatusSeeOther, "/onboarding/companions")
}

// --- 2.1.13 Connect --------------------------------------------------------------------------

func TestConnectNamesTheTripsAlreadyLinked(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("trip", map[string]any{"title": "Aruba in April", "start_date": "2027-04-03"})
	has(t, hn.signedIn().get("/onboarding/connect"),
		esc("Already linked · Aruba in April — 3 Apr 2027."),
		esc("Linked to "+jordan+"."))
}

func TestConnectSaysWhenNothingIsLinked(t *testing.T) {
	hn := newHarness(t)
	has(t, hn.signedIn().get("/onboarding/connect"), esc("Nothing linked yet"))
}

func TestConnectLeavesAnEmptyCodeOut(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/onboarding/connect", url.Values{"action": {"save"}, "code": {"  "}})
	where(t, rec, http.StatusSeeOther, "/onboarding/complete")
	body := hn.f.one(t, "POST /functions/v1/onboarding-connect").Body
	if _, ok := body["code"]; ok {
		t.Errorf("an empty box sent a code: %v", body)
	}
	if body["advance"] != true {
		t.Errorf("advance = %v", body["advance"])
	}
}

func TestConnectSendsACodeAndShowsARefusal(t *testing.T) {
	hn := newHarness(t)
	hn.f.fails("onboarding-connect", 400, "That code has already been used.")
	rec := hn.signedIn().post("/onboarding/connect", url.Values{"action": {"save"}, "code": {"sta-7hx2j9"}})
	has(t, rec, esc("That code has already been used."), `value="sta-7hx2j9"`)
	if got := hn.f.one(t, "POST /functions/v1/onboarding-connect").Body["code"]; got != "sta-7hx2j9" {
		t.Errorf("code = %v", got)
	}
}

// --- 2.1.14 Complete -------------------------------------------------------------------------

func TestCompleteSaysWhatWasSaved(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{"first_name": "Jordan", "preferred_name": nil, "phone": "+13055550184"})
	hn.f.rows("travel_preference", map[string]any{"id": "p-1"})
	hn.f.rows("companion", map[string]any{"id": "c-1"})
	hn.f.rows("trip", map[string]any{"title": "Aruba in April", "start_date": "2027-04-03"})
	rec := hn.signedIn().get("/onboarding/complete")
	has(t, rec, esc("That's everything, Jordan."),
		esc("and your Aruba in April trip is linked and waiting."),
		esc("Your trip with Gyasi, linked"),
		esc("Aruba in April · 3 Apr 2027"))
}

// Skipping everything is a real choice, and the summary says so without making it sound
// like a failure.
func TestCompleteIsKindAboutAnEmptyWizard(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/onboarding/complete")
	has(t, rec, esc("Nothing to save yet, and that's completely fine"),
		esc("Your details — skipped, add it any time"),
		esc("No trip linked yet"),
		esc("Nothing on the calendar yet"))
}

func TestCompleteFinishesTheWizard(t *testing.T) {
	hn := newHarness(t)
	where(t, hn.signedIn().post("/onboarding/complete", url.Values{}), http.StatusSeeOther, "/dashboard")
	if got := hn.f.one(t, "POST /functions/v1/onboarding-step").Body["complete"]; got != true {
		t.Errorf("complete = %v", got)
	}
}

// Reaching the summary is not the same as finishing: a failure here keeps them on the page
// with a way out rather than pretending the wizard is behind them.
func TestCompleteFailureOffersTheDashboard(t *testing.T) {
	hn := newHarness(t)
	hn.f.fails("onboarding-step", 500, "")
	rec := hn.signedIn().post("/onboarding/complete", url.Values{})
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We couldn't finish that just now"), `href="/dashboard"`)
}

// --- The chrome ------------------------------------------------------------------------------

// Pattern G (§4.3): a traveler can jump back to a completed step, and the steps ahead are
// not links. The prototype draws them all as inert text, which leaves somebody who mistyped
// their phone number on the previous step with no way back to it.
func TestTheRailLinksBackwardsOnly(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/onboarding/companions")
	has(t, rec, `href="/welcome"`, `href="/onboarding/profile"`, `href="/onboarding/preferences"`,
		`aria-current="step"`, "STEP 04 OF 06")
	hasNot(t, rec, `href="/onboarding/connect"`, `href="/onboarding/complete"`)
}

// Every page is personal, and none of them may be kept by a cache anywhere.
func TestNoWizardPageIsCached(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	for _, path := range wizard {
		if got := c.get(path).Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s Cache-Control = %q", path, got)
		}
	}
}
