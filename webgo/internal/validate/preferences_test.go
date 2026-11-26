package validate

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
)

// Ported case for case from web/lib/validation/preferences.test.ts.

func prefs(t *testing.T, f PreferencesForm) PreferencesPayload {
	t.Helper()
	p, errs := ParsePreferences(f, false)
	if !errs.Empty() {
		t.Fatalf("expected a parse, got %v", errs)
	}
	return p
}

func prefErrors(f PreferencesForm) Errors {
	_, errs := ParsePreferences(f, false)
	return errs
}

func TestParsePreferencesAcceptsAnUntouchedForm(t *testing.T) {
	b, err := json.Marshal(prefs(t, PreferencesForm{}))
	if err != nil {
		t.Fatal(err)
	}
	// Every key present, and an untouched group is an empty array rather than a missing
	// key: the function reads an absent key as "leave it alone".
	const want = `{"destinations":[],"travelStyles":[],"dietary":[],"dietaryNotes":null,` +
		`"accessibility":[],"accessibilityNotes":null,"loyalty":[],"budgetBand":null,` +
		`"favoritePastTrips":null}`
	if string(b) != want {
		t.Errorf("body = %s\nwant   %s", b, want)
	}
}

func TestTravelStyles(t *testing.T) {
	t.Run("stores romantic for the chip that reads Honeymoon", func(t *testing.T) {
		var honeymoon Option
		for _, o := range TravelStyleOptions {
			if o.Label == "Honeymoon" {
				honeymoon = o
			}
		}
		if honeymoon.Value != "romantic" {
			t.Fatalf("Honeymoon stores %q", honeymoon.Value)
		}
		got := prefs(t, PreferencesForm{TravelStyles: []string{"romantic"}}).TravelStyles
		if !slices.Equal(got, []string{"romantic"}) {
			t.Errorf("travelStyles = %v", got)
		}
	})

	t.Run("refuses the prototype's own label as a value, and anything nobody could click", func(t *testing.T) {
		for _, value := range []string{"Honeymoon", "backpacking"} {
			errs := prefErrors(PreferencesForm{TravelStyles: []string{value}})
			if got := errs.First("travelStyles"); got != PreferencesMessages.UnknownOption {
				t.Errorf("%q: travelStyles = %q", value, got)
			}
		}
	})
}

func TestTheNoneSentinel(t *testing.T) {
	t.Run("keeps none when it is the only answer", func(t *testing.T) {
		got := prefs(t, PreferencesForm{Dietary: []string{"none"}}).Dietary
		if !slices.Equal(got, []string{"none"}) {
			t.Errorf("dietary = %v", got)
		}
	})

	t.Run("refuses no-restrictions beside a real restriction", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{Dietary: []string{"none", "halal"}})
		if got := errs.First("dietary"); got != PreferencesMessages.DietaryNoneAlone {
			t.Errorf("dietary = %q", got)
		}
	})

	t.Run("refuses the same contradiction on accessibility", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{Accessibility: []string{"none", "mobility"}})
		if got := errs.First("accessibility"); got != PreferencesMessages.AccessibilityNoneAlone {
			t.Errorf("accessibility = %q", got)
		}
	})

	t.Run("refuses no-restrictions beside a note, the likelier contradiction", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{Dietary: []string{"none"}, DietaryNotes: "Severe shellfish allergy"})
		if got := errs.First("dietary"); got != PreferencesMessages.DietaryNoneWithNote {
			t.Errorf("dietary = %q", got)
		}
		errs = prefErrors(PreferencesForm{Accessibility: []string{"none"}, AccessibilityNotes: "CPAP by the bed"})
		if got := errs.First("accessibility"); got != PreferencesMessages.AccessibilityNoneWithNote {
			t.Errorf("accessibility = %q", got)
		}
	})

	t.Run("allows a note when the sentinel is not ticked", func(t *testing.T) {
		if errs := prefErrors(PreferencesForm{DietaryNotes: "Severe shellfish allergy"}); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})
}

func TestDestinations(t *testing.T) {
	t.Run("merges the chips with what somebody typed", func(t *testing.T) {
		got := prefs(t, PreferencesForm{
			Destinations: []string{"Caribbean"}, DestinationOther: "Kenya, New Zealand",
		}).Destinations
		if !slices.Equal(got, []string{"Caribbean", "Kenya", "New Zealand"}) {
			t.Errorf("destinations = %v", got)
		}
	})

	t.Run("does not list a place twice because the casing differs", func(t *testing.T) {
		got := prefs(t, PreferencesForm{
			Destinations: []string{"Caribbean"}, DestinationOther: "caribbean",
		}).Destinations
		if !slices.Equal(got, []string{"Caribbean"}) {
			t.Errorf("destinations = %v", got)
		}
	})

	t.Run("refuses more than a dozen", func(t *testing.T) {
		many := make([]string, 0, PreferenceLimits.Destinations+1)
		for i := 0; i <= PreferenceLimits.Destinations; i++ {
			many = append(many, fmt.Sprintf("Place %d", i))
		}
		errs := prefErrors(PreferencesForm{Destinations: many})
		if got := errs.First("destinations"); got != PreferencesMessages.DestinationsTooMany {
			t.Errorf("destinations = %q", got)
		}
	})

	t.Run("refuses a control character in a typed place name", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{DestinationOther: "Ken\u0007ya"})
		if got := errs.First("destinations"); got != PreferencesMessages.InvalidChars {
			t.Errorf("destinations = %q", got)
		}
	})

	t.Run("refuses a place name longer than the column", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{
			DestinationOther: strings.Repeat("x", PreferenceLimits.DestinationLength+1),
		})
		if got := errs.First("destinations"); got != PreferencesMessages.DestinationTooLong {
			t.Errorf("destinations = %q", got)
		}
	})
}

func TestLoyaltyPrograms(t *testing.T) {
	t.Run("drops the repeater's blank rows", func(t *testing.T) {
		got := prefs(t, PreferencesForm{Loyalty: []LoyaltyRow{
			{"AAdvantage", "4ZE82Q"}, {"", ""},
		}}).Loyalty
		if !slices.Equal(got, []LoyaltyRow{{"AAdvantage", "4ZE82Q"}}) {
			t.Errorf("loyalty = %v", got)
		}
	})

	t.Run("asks which program a lone number belongs to", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{Loyalty: []LoyaltyRow{{"", "4ZE82Q"}}})
		if got := errs.First("loyalty"); got != PreferencesMessages.LoyaltyNeedsProgram {
			t.Errorf("loyalty = %q", got)
		}
	})

	t.Run("keeps a two-word program name whole", func(t *testing.T) {
		got := prefs(t, PreferencesForm{Loyalty: []LoyaltyRow{{"Marriott Bonvoy", "123"}}}).Loyalty
		if !slices.Equal(got, []LoyaltyRow{{"Marriott Bonvoy", "123"}}) {
			t.Errorf("loyalty = %v", got)
		}
	})

	t.Run("refuses a membership number that is a paste accident", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{Loyalty: []LoyaltyRow{{"AAdvantage", "4ZE 82Q!"}}})
		if got := errs.First("loyalty"); got != PreferencesMessages.LoyaltyNumberShape {
			t.Errorf("loyalty = %q", got)
		}
	})

	t.Run("accepts a program with no number yet", func(t *testing.T) {
		got := prefs(t, PreferencesForm{Loyalty: []LoyaltyRow{{"IHG Rewards", ""}}}).Loyalty
		if !slices.Equal(got, []LoyaltyRow{{"IHG Rewards", ""}}) {
			t.Errorf("loyalty = %v", got)
		}
	})
}

func TestBudgetBand(t *testing.T) {
	t.Run("stores the slug, never the dollar label", func(t *testing.T) {
		got := prefs(t, PreferencesForm{BudgetBand: "premium"}).BudgetBand
		if got == nil || *got != "premium" {
			t.Errorf("budgetBand = %v", got)
		}
	})

	t.Run("treats 'Not sure yet' — an empty value — as no answer", func(t *testing.T) {
		if got := prefs(t, PreferencesForm{BudgetBand: ""}).BudgetBand; got != nil {
			t.Errorf("budgetBand = %v", got)
		}
	})

	t.Run("refuses a band outside the documented four", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{BudgetBand: "lavish"})
		if got := errs.First("budgetBand"); got != PreferencesMessages.BudgetUnknown {
			t.Errorf("budgetBand = %q", got)
		}
	})
}

func TestPreferencesFreeText(t *testing.T) {
	t.Run("keeps the notes out of the slug arrays", func(t *testing.T) {
		sent := prefs(t, PreferencesForm{
			Dietary: []string{"pescatarian"}, DietaryNotes: " Severe tree nut allergy ",
		})
		if !slices.Equal(sent.Dietary, []string{"pescatarian"}) {
			t.Errorf("dietary = %v", sent.Dietary)
		}
		if sent.DietaryNotes == nil || *sent.DietaryNotes != "Severe tree nut allergy" {
			t.Errorf("dietaryNotes = %v", sent.DietaryNotes)
		}
	})

	t.Run("stores an emptied note as null rather than an empty string", func(t *testing.T) {
		if got := prefs(t, PreferencesForm{DietaryNotes: "   "}).DietaryNotes; got != nil {
			t.Errorf("dietaryNotes = %v", got)
		}
	})

	t.Run("refuses a note longer than the column expects", func(t *testing.T) {
		errs := prefErrors(PreferencesForm{DietaryNotes: strings.Repeat("x", PreferenceLimits.Notes+1)})
		if got := errs.First("dietaryNotes"); got != PreferencesMessages.NotesTooLong {
			t.Errorf("dietaryNotes = %q", got)
		}
		errs = prefErrors(PreferencesForm{FavoritePastTrips: strings.Repeat("x", PreferenceLimits.Favorites+1)})
		if got := errs.First("favoritePastTrips"); got != PreferencesMessages.FavoritesTooLong {
			t.Errorf("favoritePastTrips = %q", got)
		}
	})
}
