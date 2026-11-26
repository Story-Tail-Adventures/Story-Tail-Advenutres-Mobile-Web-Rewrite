package client_test

import (
	"net/http"
	"net/url"
	"testing"
)

// Screen 2.5.3, Travel preferences. It is 2.1.11's write without the wizard, so these are
// the things only this screen does.

func TestAccountPreferencesShowsWhatIsOnFile(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("travel_preference", map[string]any{
		"preferred_destinations": []any{"Caribbean", "Kenya"},
		"travel_styles":          []any{"resort"},
		"dietary_restrictions":   []any{"vegetarian"},
		"dietary_notes":          "No shellfish",
		"accessibility_needs":    []any{},
		"accessibility_notes":    nil,
		"loyalty_programs":       []any{map[string]any{"program": "AAdvantage", "number": "ABC123"}},
		"budget_band":            "mid",
		"favorite_past_trips":    "Turks, 2026",
	})
	rec := hn.signedIn().get("/account/preferences")

	has(t, rec, "Travel preferences",
		esc("None of this is required. It just saves Gyasi asking you twice."),
		// A destination they typed themselves comes back as a ticked chip of its own.
		"Kenya", `value="AAdvantage"`, `value="ABC123"`, "No shellfish", "Turks, 2026",
		"Save", "Cancel")
}

// ADVANCE IS OMITTED, which is the whole difference from 2.1.11.
func TestSavingPreferencesDoesNotMoveTheWizard(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/account/preferences", url.Values{
		"action":       {"save"},
		"destinations": {"Caribbean"},
		"budgetBand":   {"mid"},
	})
	where(t, rec, http.StatusSeeOther, "/account")

	sent := hn.f.one(t, "POST /functions/v1/onboarding-preferences").Body
	if advance, ok := sent["advance"]; ok && advance == true {
		t.Error("advance went with it; 2.5.3 must not move the onboarding cursor")
	}
}

// Enter saves rather than adding a loyalty row — the same guard 2.1.11 carries, because the
// first submit in these fields is "Add another".
func TestEnterOnAccountPreferencesSaves(t *testing.T) {
	hn := newHarness(t)
	c := hn.signedIn()
	f := readForm(t, c.get("/account/preferences").Body.String(), "preferences-form")
	if got := f.submits[0].value; got != "save" {
		t.Fatalf("the default button is %q, so Enter does not save", got)
	}
	where(t, c.click(f, f.submits[0]), http.StatusSeeOther, "/account")
}

// "Add another" grows the repeater without saving anything.
func TestAddingALoyaltyRowSavesNothing(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/account/preferences", url.Values{
		"action":         {"add-row"},
		"loyaltyProgram": {"AAdvantage", ""},
		"loyaltyNumber":  {"ABC123", ""},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("= %d", rec.Code)
	}
	if calls := hn.f.seen("POST /functions/v1/onboarding-preferences"); len(calls) != 0 {
		t.Errorf("%d saves", len(calls))
	}
	has(t, rec, `value="AAdvantage"`)
}

// A refused save keeps the rows somebody filled in rather than collapsing the repeater.
func TestARefusedPreferencesSaveKeepsTheRows(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().post("/account/preferences", url.Values{
		"action":         {"save"},
		"loyaltyProgram": {""},
		"loyaltyNumber":  {"ABC123"},
	})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("= %d", rec.Code)
	}
	has(t, rec, "Which program is that number for?", `value="ABC123"`)
}
