// Package prefsform renders the traveler's travel preferences.
//
// SHARED BY TWO SCREENS, for the same reason internal/profileform is: 2.1.11 asks for these
// in the wizard and 2.5.3 asks for the same ones from the account, over the same validation
// and the same Edge Function. Two screens rendering one set of fields from two places is
// how they come to disagree.
package prefsform

import (
	"context"
	"log/slog"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/profileform"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/validate"
)

// InitialLoyaltyRows is the repeater's starting height (INITIAL_LOYALTY_ROWS).
const InitialLoyaltyRows = 2

// Repeats are the two repeats these fields contribute.
var Repeats = map[string][]string{
	"extra-destinations": {"extra-input", "extra-label"},
	"loyalty-rows":       {"loyalty-program", "loyalty-number"},
}

func Slots() []string {
	out := []string{
		"destinations-error", "destination-other",
		"travel-styles-error",
		"dietary-error", "dietary-notes", "dietary-notes-error",
		"accessibility-error", "accessibility-notes", "accessibility-notes-error",
		"loyalty-error", "add-row",
		"budget-error", "favorites", "favorites-error",
	}
	for _, d := range validate.DestinationSuggestions {
		out = append(out, ChipSlot("dest-", d))
	}
	for _, o := range validate.TravelStyleOptions {
		out = append(out, ChipSlot("style-", o.Value))
	}
	for _, o := range validate.DietaryOptions {
		out = append(out, ChipSlot("diet-", o.Value))
	}
	for _, o := range validate.AccessibilityOptions {
		out = append(out, ChipSlot("access-", o.Value))
	}
	for _, o := range validate.BudgetOptions {
		out = append(out, ChipSlot("budget-", o.Value))
	}
	return append(out, "budget-unsure")
}

// Read is the posted form. A chip group posts one entry per ticked box, so an untouched
// group posts nothing at all — correctly an empty array, and not "leave this alone".
func Read(form url.Values) validate.PreferencesForm {
	return validate.PreferencesForm{
		Destinations:       form["destinations"],
		DestinationOther:   form.Get("destinationOther"),
		TravelStyles:       form["travelStyles"],
		Dietary:            form["dietary"],
		DietaryNotes:       form.Get("dietaryNotes"),
		Accessibility:      form["accessibility"],
		AccessibilityNotes: form.Get("accessibilityNotes"),
		BudgetBand:         form.Get("budgetBand"),
		FavoritePastTrips:  form.Get("favoritePastTrips"),
		Loyalty:            PostedLoyalty(form["loyaltyProgram"], form["loyaltyNumber"]),
	}
}

// Pad tops the repeater up to its starting height.
func Pad(rows []validate.LoyaltyRow) []validate.LoyaltyRow {
	return PadTo(rows, InitialLoyaltyRows)
}

// PadTo tops it up to n, which is how "Add another" grows it without JavaScript: one more
// empty row, nothing saved, nothing validated.
func PadTo(rows []validate.LoyaltyRow, n int) []validate.LoyaltyRow { return padLoyalty(rows, n) }

// Fill draws every chip, box and loyalty row, with whatever was refused about them.
func Fill(d *page.Doc, f validate.PreferencesForm, errs validate.Errors) {
	// Destinations: the eight suggestions, then anything the traveler added themselves,
	// matched case-insensitively so "caribbean" typed into the box does not come back as
	// a second chip beside the one they ticked.
	profileform.FillGroupError(d, "destinations-error", errs.First("destinations"))
	for _, name := range validate.DestinationSuggestions {
		chip(d, ChipSlot("dest-", name), containsFold(f.Destinations, name))
	}
	extra := extraDestinations(f.Destinations)
	d.Repeat("extra-destinations", len(extra), func(i int, row *page.Row) {
		row.Keep("extra-input")
		row.Attr("extra-input", "value", extra[i])
		row.Bool("extra-input", "checked", true)
		row.Text("extra-label", extra[i])
	})
	d.Attr("destination-other", "value", f.DestinationOther)

	profileform.FillGroupError(d, "travel-styles-error", errs.First("travelStyles"))
	for _, o := range validate.TravelStyleOptions {
		chip(d, ChipSlot("style-", o.Value), contains(f.TravelStyles, o.Value))
	}

	profileform.FillGroupError(d, "dietary-error", errs.First("dietary"))
	for _, o := range validate.DietaryOptions {
		chip(d, ChipSlot("diet-", o.Value), contains(f.Dietary, o.Value))
	}
	profileform.FillInput(d, "dietary-notes", f.DietaryNotes, errs.First("dietaryNotes"), false)

	profileform.FillGroupError(d, "accessibility-error", errs.First("accessibility"))
	for _, o := range validate.AccessibilityOptions {
		chip(d, ChipSlot("access-", o.Value), contains(f.Accessibility, o.Value))
	}
	profileform.FillInput(d, "accessibility-notes", f.AccessibilityNotes, errs.First("accessibilityNotes"), false)

	profileform.FillGroupError(d, "loyalty-error", errs.First("loyalty"))
	d.Repeat("loyalty-rows", len(f.Loyalty), func(i int, row *page.Row) {
		row.Attr("loyalty-program", "value", f.Loyalty[i].Program)
		row.Attr("loyalty-number", "value", f.Loyalty[i].Number)
	})
	if len(f.Loyalty) < validate.PreferenceLimits.LoyaltyRows {
		d.Keep("add-row")
	} else {
		d.Remove("add-row")
	}

	profileform.FillGroupError(d, "budget-error", errs.First("budgetBand"))
	for _, o := range validate.BudgetOptions {
		chip(d, ChipSlot("budget-", o.Value), f.BudgetBand == o.Value)
	}
	chip(d, "budget-unsure", f.BudgetBand == "")

	d.Text("favorites", f.FavoritePastTrips)
	if msg := errs.First("favoritePastTrips"); msg == "" {
		d.Remove("favorites-error")
	} else {
		d.Text("favorites-error", msg)
		d.Attr("favorites", "aria-invalid", "true")
		d.Attr("favorites", "aria-describedby", "favoritePastTrips-error")
	}

}

func ChipSlot(prefix, value string) string {
	return prefix + strings.Map(func(r rune) rune {
		switch {
		case r >= 'A' && r <= 'Z':
			return r + ('a' - 'A')
		case r == ' ' || r == '_':
			return '-'
		}
		return r
	}, value)
}

func chip(d *page.Doc, slot string, on bool) {
	d.Keep(slot)
	d.Bool(slot, "checked", on)
}

func PostedLoyalty(programs, numbers []string) []validate.LoyaltyRow {
	n := max(len(programs), len(numbers))
	rows := make([]validate.LoyaltyRow, n)
	for i := range rows {
		if i < len(programs) {
			rows[i].Program = programs[i]
		}
		if i < len(numbers) {
			rows[i].Number = numbers[i]
		}
	}
	return rows
}

func padLoyalty(rows []validate.LoyaltyRow, n int) []validate.LoyaltyRow {
	n = min(n, validate.PreferenceLimits.LoyaltyRows)
	for len(rows) < n {
		rows = append(rows, validate.LoyaltyRow{})
	}
	return rows
}

func extraDestinations(chosen []string) []string {
	var out []string
	for _, d := range chosen {
		if !containsFold(validate.DestinationSuggestions, d) {
			out = append(out, d)
		}
	}
	return out
}

func contains(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}

func containsFold(values []string, want string) bool {
	for _, v := range values {
		if strings.EqualFold(v, want) {
			return true
		}
	}
	return false
}

type loyaltyJSON struct {
	Program *string `json:"program"`
	Number  *string `json:"number"`
}

type travelPreferenceRow struct {
	PreferredDestinations []string      `json:"preferred_destinations"`
	TravelStyles          []string      `json:"travel_styles"`
	DietaryRestrictions   []string      `json:"dietary_restrictions"`
	DietaryNotes          *string       `json:"dietary_notes"`
	AccessibilityNeeds    []string      `json:"accessibility_needs"`
	AccessibilityNotes    *string       `json:"accessibility_notes"`
	LoyaltyPrograms       []loyaltyJSON `json:"loyalty_programs"`
	BudgetBand            *string       `json:"budget_band"`
	FavoritePastTrips     *string       `json:"favorite_past_trips"`
}

// Load reads what is on file, padded to the repeater's starting height. A read that fails
// leaves the boxes empty rather than failing the page.
func Load(ctx context.Context, c *supa.Client, token string, log *slog.Logger) validate.PreferencesForm {
	f := validate.PreferencesForm{Loyalty: padLoyalty(nil, InitialLoyaltyRows)}
	row, found, err := supa.MaybeOne[travelPreferenceRow](ctx, c, token, "travel_preference",
		supa.Q().Select("preferred_destinations,travel_styles,dietary_restrictions,dietary_notes,"+
			"accessibility_needs,accessibility_notes,loyalty_programs,budget_band,favorite_past_trips"))
	if err != nil {
		log.Warn("prefsform: travel preferences read failed", "err", err)
		return f
	}
	if !found {
		return f
	}
	f.Destinations = row.PreferredDestinations
	f.TravelStyles = row.TravelStyles
	f.Dietary = row.DietaryRestrictions
	f.DietaryNotes = trimmed(row.DietaryNotes)
	f.Accessibility = row.AccessibilityNeeds
	f.AccessibilityNotes = trimmed(row.AccessibilityNotes)
	f.BudgetBand = trimmed(row.BudgetBand)
	f.FavoritePastTrips = trimmed(row.FavoritePastTrips)

	var saved []validate.LoyaltyRow
	for _, l := range row.LoyaltyPrograms {
		program, number := trimmed(l.Program), trimmed(l.Number)
		if program == "" && number == "" {
			continue
		}
		saved = append(saved, validate.LoyaltyRow{Program: program, Number: number})
	}
	f.Loyalty = padLoyalty(saved, InitialLoyaltyRows)
	return f
}

func trimmed(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}
