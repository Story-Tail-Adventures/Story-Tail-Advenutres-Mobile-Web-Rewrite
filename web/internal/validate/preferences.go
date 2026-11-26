package validate

import (
	"strings"
)

// Screen 2.1.11 Travel Preferences and 2.5.3 — the rules, ported from
// web/lib/validation/preferences.ts.
//
// THE VOCABULARIES ARE CLOSED, and the labels are not the values. "Honeymoon" is what a
// person calls their trip; `romantic` is what Data-Model §6.2, Screen-Inventory §2.1.11 and
// the CHECK constraint in 20260904124903 all call it. The prototype shows only the label, so
// a straight transcription would store a value nothing else in the system recognises.

// PreferencesMessages are PREFERENCES_MESSAGES, word for word.
var PreferencesMessages = struct {
	DestinationsTooMany       string
	DestinationTooLong        string
	InvalidChars              string
	UnknownOption             string
	DietaryNoneAlone          string
	DietaryNoneWithNote       string
	AccessibilityNoneAlone    string
	AccessibilityNoneWithNote string
	NotesTooLong              string
	FavoritesTooLong          string
	LoyaltyNeedsProgram       string
	LoyaltyNumberShape        string
	LoyaltyProgramTooLong     string
	LoyaltyTooMany            string
	BudgetUnknown             string
}{
	DestinationsTooMany: "That's more than Gyasi can hold in his head — pick up to 12",
	DestinationTooLong:  "Keep a place name to 60 characters or fewer",
	InvalidChars:        "Some of those characters won't work here",
	UnknownOption:       "That isn't one of the options",
	DietaryNoneAlone:    `"No restrictions" doesn't go with the others — pick one or the other`,
	DietaryNoneWithNote: `You've said no restrictions, but written one below — untick "No restrictions" and ` +
		"we'll pass the note on",
	AccessibilityNoneAlone:    `"None" doesn't go with the others — pick one or the other`,
	AccessibilityNoneWithNote: "You've said none, but written one below — untick \"None\" and we'll pass the note on",
	NotesTooLong:              "Keep this to 500 characters or fewer",
	FavoritesTooLong:          "Keep this to 1000 characters or fewer",
	LoyaltyNeedsProgram:       "Which program is that number for?",
	LoyaltyNumberShape:        "A membership number is letters, digits and hyphens",
	LoyaltyProgramTooLong:     "Keep a program name to 60 characters or fewer",
	LoyaltyTooMany:            "That's as many programs as we can hold — up to 10",
	BudgetUnknown:             "Pick one of the ranges, or say you're not sure yet",
}

// PreferenceLimits are PREFERENCE_LIMITS.
var PreferenceLimits = struct {
	Destinations      int
	DestinationLength int
	Notes             int
	Favorites         int
	LoyaltyRows       int
	LoyaltyProgram    int
	LoyaltyNumber     int
}{
	Destinations: 12, DestinationLength: 60, Notes: 500, Favorites: 1000,
	LoyaltyRows: 10, LoyaltyProgram: 60, LoyaltyNumber: 40,
}

// Option is a chip: what a person reads, and what the column stores.
type Option struct {
	Label string
	Value string
}

// DestinationSuggestions are the eight chips the prototype offers. Free entry adds to the
// same array; see destinations below.
var DestinationSuggestions = []string{
	"Caribbean", "Bahamas", "Greece", "Mexico", "Costa Rica", "Italy", "Iceland", "Japan",
}

// The four closed vocabularies.
var (
	TravelStyleOptions = []Option{
		{"Resort", "resort"}, {"Cruise", "cruise"}, {"Adventure", "adventure"},
		{"Family", "family"},
		// The one place the label and the value genuinely differ.
		{"Honeymoon", "romantic"},
		{"Group", "group"},
	}
	DietaryOptions = []Option{
		{"No restrictions", "none"}, {"Vegetarian", "vegetarian"}, {"Pescatarian", "pescatarian"},
		{"Gluten-free", "gluten_free"}, {"Halal", "halal"},
	}
	AccessibilityOptions = []Option{
		{"None", "none"}, {"Mobility-friendly", "mobility"}, {"Quiet rooms", "quiet_room"},
		{"Service animal", "service_animal"},
	}
	// BudgetOptions: the dollar figures are labels rather than data.
	// travel_preference.budget_band stores only the slug, so these ranges can be re-cut when
	// Gyasi says where his trips actually sit — a copy change, not a migration.
	BudgetOptions = []Option{
		{"Up to $2,500", "budget"}, {"$2,500 – $5,000", "mid"},
		{"$5,000 – $10,000", "premium"}, {"$10,000+", "luxury"},
	}
)

// BudgetUnsureLabel is not decoration: a radio group cannot return to unselected, so without
// an explicit way to say nothing the first tap would be irreversible.
const BudgetUnsureLabel = "Not sure yet"

// None is the sentinel meaning "asked and answered: nothing to worry about".
const None = "none"

// LoyaltyRow is one membership.
type LoyaltyRow struct {
	Program string `json:"program"`
	Number  string `json:"number"`
}

// PreferencesForm is every control on the screen as posted, and the prefill shape.
type PreferencesForm struct {
	Destinations       []string
	DestinationOther   string
	TravelStyles       []string
	Dietary            []string
	DietaryNotes       string
	Accessibility      []string
	AccessibilityNotes string
	Loyalty            []LoyaltyRow
	BudgetBand         string
	FavoritePastTrips  string
}

// PreferencesFields is every key an error can be reported on.
var PreferencesFields = []string{
	"destinations", "travelStyles", "dietary", "dietaryNotes", "accessibility",
	"accessibilityNotes", "loyalty", "budgetBand", "favoritePastTrips",
}

// PreferencesPayload is the body supabase/functions/onboarding-preferences expects. Every
// key is always sent: the function reads an absent key as "leave it alone", so a group
// somebody cleared has to arrive as an empty array rather than not arrive at all.
type PreferencesPayload struct {
	Destinations       []string     `json:"destinations"`
	TravelStyles       []string     `json:"travelStyles"`
	Dietary            []string     `json:"dietary"`
	DietaryNotes       *string      `json:"dietaryNotes"`
	Accessibility      []string     `json:"accessibility"`
	AccessibilityNotes *string      `json:"accessibilityNotes"`
	Loyalty            []LoyaltyRow `json:"loyalty"`
	BudgetBand         *string      `json:"budgetBand"`
	FavoritePastTrips  *string      `json:"favoritePastTrips"`
	Advance            bool         `json:"advance,omitempty"`
}

// ParsePreferences validates what the form posted and builds the function's body.
func ParsePreferences(f PreferencesForm, advance bool) (PreferencesPayload, Errors) {
	errs := Errors{}

	destinations := parseDestinations(f, errs)
	travelStyles := closed(f.TravelStyles, TravelStyleOptions, "travelStyles", errs)
	dietary := sentinel(closed(f.Dietary, DietaryOptions, "dietary", errs), "dietary", PreferencesMessages.DietaryNoneAlone, errs)
	accessibility := sentinel(closed(f.Accessibility, AccessibilityOptions, "accessibility", errs), "accessibility", PreferencesMessages.AccessibilityNoneAlone, errs)

	dietaryNotes := notes(f.DietaryNotes, "dietaryNotes", PreferenceLimits.Notes, errs)
	accessibilityNotes := notes(f.AccessibilityNotes, "accessibilityNotes", PreferenceLimits.Notes, errs)

	// The sentinel cannot sit beside a NOTE either, and this is the likelier of the two
	// contradictions it forbids: the vocabulary has no slug for an allergy, so a real one
	// lands in the note. "No restrictions" plus "severe shellfish allergy" is what somebody
	// produces by ticking the reassuring chip and then typing the truth underneath.
	if contains(dietary, None) && dietaryNotes != nil {
		errs.Add("dietary", PreferencesMessages.DietaryNoneWithNote)
	}
	if contains(accessibility, None) && accessibilityNotes != nil {
		errs.Add("accessibility", PreferencesMessages.AccessibilityNoneWithNote)
	}

	favorites := notes(f.FavoritePastTrips, "favoritePastTrips", PreferenceLimits.Favorites, errs)
	loyalty := parseLoyalty(f.Loyalty, errs)
	budget := parseBudget(f.BudgetBand, errs)

	return PreferencesPayload{
		Destinations: destinations, TravelStyles: travelStyles,
		Dietary: dietary, DietaryNotes: dietaryNotes,
		Accessibility: accessibility, AccessibilityNotes: accessibilityNotes,
		Loyalty: loyalty, BudgetBand: budget, FavoritePastTrips: favorites,
		Advance: advance,
	}, errs
}

// parseDestinations is the eight chips plus whatever somebody typed, as one deduplicated
// list. Free entry is an ADDITION to the prototype: eight fixed chips is a picker only if
// your dream trip happens to be on the list. Commas split, because without JavaScript the
// "Add" button is just a text box.
func parseDestinations(f PreferencesForm, errs Errors) []string {
	all := make([]string, 0, len(f.Destinations)+4)
	all = append(all, f.Destinations...)
	for _, part := range strings.Split(f.DestinationOther, ",") {
		if p := JSTrim(part); p != "" {
			all = append(all, p)
		}
	}

	out := []string{}
	for _, entry := range all {
		value := JSTrim(entry)
		switch {
		case value == "":
			continue
		case UTF16Len(value) > PreferenceLimits.DestinationLength:
			errs.Add("destinations", PreferencesMessages.DestinationTooLong)
			continue
		case HasControl(value):
			errs.Add("destinations", PreferencesMessages.InvalidChars)
			continue
		}
		// Case-insensitive, keeping the casing that arrived first: "caribbean" typed into the
		// box after ticking "Caribbean" is the same place, and a list showing both looks broken.
		seen := false
		for _, have := range out {
			if strings.EqualFold(have, value) {
				seen = true
				break
			}
		}
		if !seen {
			out = append(out, value)
		}
	}
	if len(out) > PreferenceLimits.Destinations {
		errs.Add("destinations", PreferencesMessages.DestinationsTooMany)
		return out[:PreferenceLimits.Destinations]
	}
	return out
}

// closed keeps only values the chips offer. Anything else was not clicked, it was crafted.
func closed(values []string, options []Option, field string, errs Errors) []string {
	out := []string{}
	for _, value := range values {
		allowed := false
		for _, o := range options {
			if o.Value == value {
				allowed = true
				break
			}
		}
		if !allowed {
			errs.Add(field, PreferencesMessages.UnknownOption)
			continue
		}
		if !contains(out, value) {
			out = append(out, value)
		}
	}
	return out
}

// sentinel: `none` means "asked and answered", so it cannot sit beside a real answer.
func sentinel(values []string, field, message string, errs Errors) []string {
	if contains(values, None) && len(values) > 1 {
		errs.Add(field, message)
	}
	return values
}

func notes(value, field string, max int, errs Errors) *string {
	trimmed := JSTrim(value)
	if trimmed == "" {
		return nil
	}
	if UTF16Len(trimmed) > max {
		msg := PreferencesMessages.NotesTooLong
		if max == PreferenceLimits.Favorites {
			msg = PreferencesMessages.FavoritesTooLong
		}
		errs.Add(field, msg)
	}
	return &trimmed
}

// parseLoyalty drops the repeater's blank rows. A row with neither field is the last empty
// line of the repeater, not a mistake. A number with no program is a mistake worth naming:
// nobody can credit miles to "4ZE82Q".
func parseLoyalty(rows []LoyaltyRow, errs Errors) []LoyaltyRow {
	out := []LoyaltyRow{}
	for _, row := range rows {
		program := JSTrim(row.Program)
		number := JSTrim(row.Number)
		switch {
		case program == "" && number == "":
			continue
		case program == "":
			errs.Add("loyalty", PreferencesMessages.LoyaltyNeedsProgram)
			continue
		case UTF16Len(program) > PreferenceLimits.LoyaltyProgram:
			errs.Add("loyalty", PreferencesMessages.LoyaltyProgramTooLong)
			continue
		case number != "" && !isLoyaltyNumber(number):
			errs.Add("loyalty", PreferencesMessages.LoyaltyNumberShape)
			continue
		}
		out = append(out, LoyaltyRow{Program: program, Number: number})
	}
	if len(out) > PreferenceLimits.LoyaltyRows {
		errs.Add("loyalty", PreferencesMessages.LoyaltyTooMany)
		return out[:PreferenceLimits.LoyaltyRows]
	}
	return out
}

// isLoyaltyNumber is /^[A-Za-z0-9-]{1,40}$/: membership ids are alphanumeric, and anything
// else is a paste accident.
func isLoyaltyNumber(n string) bool {
	if n == "" || len(n) > PreferenceLimits.LoyaltyNumber {
		return false
	}
	for i := 0; i < len(n); i++ {
		c := n[i]
		if c == '-' || (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') {
			continue
		}
		return false
	}
	return true
}

func parseBudget(value string, errs Errors) *string {
	trimmed := JSTrim(value)
	if trimmed == "" {
		return nil
	}
	for _, o := range BudgetOptions {
		if o.Value == trimmed {
			return &trimmed
		}
	}
	errs.Add("budgetBand", PreferencesMessages.BudgetUnknown)
	return nil
}

func contains(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
