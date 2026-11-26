package onboarding

import (
	"net/http"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.11 Travel Preferences (web/app/(onboarding)/onboarding/preferences).

var preferencesSpec = page.Spec{
	File:   "onboarding/preferences.html",
	Layout: shell.Onboarding,
	Slots:  preferencesSlots(),
	Repeats: mergeRepeats(chromeRepeats, map[string][]string{
		"extra-destinations": {"extra-input", "extra-label"},
		"loyalty-rows":       {"loyalty-program", "loyalty-number"},
	}),
}

func preferencesSlots() []string {
	out := append(chromeSlots(),
		"form-error", "preferences-form",
		"destinations-error", "destination-other",
		"travel-styles-error",
		"dietary-error", "dietary-notes", "dietary-notes-error",
		"accessibility-error", "accessibility-notes", "accessibility-notes-error",
		"loyalty-error", "add-row",
		"budget-error", "favorites", "favorites-error",
	)
	for _, d := range validate.DestinationSuggestions {
		out = append(out, chipSlot("dest-", d))
	}
	for _, o := range validate.TravelStyleOptions {
		out = append(out, chipSlot("style-", o.Value))
	}
	for _, o := range validate.DietaryOptions {
		out = append(out, chipSlot("diet-", o.Value))
	}
	for _, o := range validate.AccessibilityOptions {
		out = append(out, chipSlot("access-", o.Value))
	}
	for _, o := range validate.BudgetOptions {
		out = append(out, chipSlot("budget-", o.Value))
	}
	return append(out, "budget-unsure")
}

// chipSlot is one chip's slot name: the prefix and the value, lower-cased with the
// characters a slot name may not carry (a space in "Costa Rica", the underscore in
// "gluten_free") turned into hyphens.
func chipSlot(prefix, value string) string {
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

// preferencesFormError is PREFERENCES_TEXT.formError.
const preferencesFormError = "That didn't save — nothing's lost, your answers are still " +
	"here. Try again, or skip for now and we'll pick this up later."

// initialLoyaltyRows is the repeater's starting height (INITIAL_LOYALTY_ROWS).
const initialLoyaltyRows = 2

var preferencesStep = stepIndex("preferences")

func (a *area) mountPreferences(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(preferencesSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, f validate.PreferencesForm, errs validate.Errors, formError string) {
		d := tmpl.New()
		fillChrome(d, preferencesStep, true)
		d.Keep("preferences-form")
		if formError == "" {
			d.Remove("form-error")
		} else {
			d.Text("form-error", formError)
		}

		// Destinations: the eight suggestions, then anything the traveler added themselves,
		// matched case-insensitively so "caribbean" typed into the box does not come back as
		// a second chip beside the one they ticked.
		fillGroupError(d, "destinations-error", errs.First("destinations"))
		for _, name := range validate.DestinationSuggestions {
			chip(d, chipSlot("dest-", name), containsFold(f.Destinations, name))
		}
		extra := extraDestinations(f.Destinations)
		d.Repeat("extra-destinations", len(extra), func(i int, row *page.Row) {
			row.Keep("extra-input")
			row.Attr("extra-input", "value", extra[i])
			row.Bool("extra-input", "checked", true)
			row.Text("extra-label", extra[i])
		})
		d.Attr("destination-other", "value", f.DestinationOther)

		fillGroupError(d, "travel-styles-error", errs.First("travelStyles"))
		for _, o := range validate.TravelStyleOptions {
			chip(d, chipSlot("style-", o.Value), contains(f.TravelStyles, o.Value))
		}

		fillGroupError(d, "dietary-error", errs.First("dietary"))
		for _, o := range validate.DietaryOptions {
			chip(d, chipSlot("diet-", o.Value), contains(f.Dietary, o.Value))
		}
		fillInput(d, "dietary-notes", f.DietaryNotes, errs.First("dietaryNotes"), false)

		fillGroupError(d, "accessibility-error", errs.First("accessibility"))
		for _, o := range validate.AccessibilityOptions {
			chip(d, chipSlot("access-", o.Value), contains(f.Accessibility, o.Value))
		}
		fillInput(d, "accessibility-notes", f.AccessibilityNotes, errs.First("accessibilityNotes"), false)

		fillGroupError(d, "loyalty-error", errs.First("loyalty"))
		d.Repeat("loyalty-rows", len(f.Loyalty), func(i int, row *page.Row) {
			row.Attr("loyalty-program", "value", f.Loyalty[i].Program)
			row.Attr("loyalty-number", "value", f.Loyalty[i].Number)
		})
		if len(f.Loyalty) < validate.PreferenceLimits.LoyaltyRows {
			d.Keep("add-row")
		} else {
			d.Remove("add-row")
		}

		fillGroupError(d, "budget-error", errs.First("budgetBand"))
		for _, o := range validate.BudgetOptions {
			chip(d, chipSlot("budget-", o.Value), f.BudgetBand == o.Value)
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

		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/preferences", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, a.currentPreferences(r, st), nil, "")
	}))

	rt.Protected("POST /onboarding/preferences", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		slug, route := nextStep(preferencesStep)
		action := form.Get("action")
		if action == actionSkip {
			a.advance(w, r, st, slug, route)
			return
		}

		// A chip group posts one entry per ticked box, so an untouched group posts nothing
		// at all — correctly an empty array, and not "leave this alone".
		f := validate.PreferencesForm{
			Destinations:       form["destinations"],
			DestinationOther:   form.Get("destinationOther"),
			TravelStyles:       form["travelStyles"],
			Dietary:            form["dietary"],
			DietaryNotes:       form.Get("dietaryNotes"),
			Accessibility:      form["accessibility"],
			AccessibilityNotes: form.Get("accessibilityNotes"),
			BudgetBand:         form.Get("budgetBand"),
			FavoritePastTrips:  form.Get("favoritePastTrips"),
			Loyalty:            postedLoyalty(form["loyaltyProgram"], form["loyaltyNumber"]),
		}

		if action == actionAddRow {
			// The no-JavaScript stand-in for the repeater's "Add another": one more empty
			// row, nothing saved, nothing validated.
			f.Loyalty = padLoyalty(f.Loyalty, len(f.Loyalty)+1)
			show(w, r, http.StatusOK, f, nil, "")
			return
		}

		payload, errs := validate.ParsePreferences(f, true)
		f.Loyalty = padLoyalty(f.Loyalty, initialLoyaltyRows)
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, f, errs, "")
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, f, nil, preferencesFormError)
			return
		}
		// An Edge Function because travel_preference grants SELECT only and has no write
		// policy: a browser .update() would match zero rows and report success.
		out := web.FromResult(a.call(r.Context(), st, "onboarding-preferences", payload), preferencesFormError)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			show(w, r, out.Status, f, nil, out.Message)
		default:
			web.SeeOther(w, r, route)
		}
	}))
	return nil
}

// actionAddRow grows the loyalty repeater by one row.
const actionAddRow = "add-row"

// chip ticks or unticks one chip. A checkbox is a void element, so Keep is what handles it.
func chip(d *page.Doc, slot string, on bool) {
	d.Keep(slot)
	d.Bool(slot, "checked", on)
}

// postedLoyalty pairs the repeater's two parallel lists by index. The row count is the
// LONGER of the two, not just the programs: the rendered form always posts them in pairs,
// but a hand-built post with one more number than program would otherwise lose that number
// silently instead of failing with "which program is that number for?".
func postedLoyalty(programs, numbers []string) []validate.LoyaltyRow {
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

// padLoyalty keeps at least n rows on the screen, never more than the limit.
func padLoyalty(rows []validate.LoyaltyRow, n int) []validate.LoyaltyRow {
	n = min(n, validate.PreferenceLimits.LoyaltyRows)
	for len(rows) < n {
		rows = append(rows, validate.LoyaltyRow{})
	}
	return rows
}

// extraDestinations are the places that are not one of the eight chips, so the page can show
// them as chips of their own rather than losing them.
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

// mergeRepeats joins the chrome's repeats with a page's own.
func mergeRepeats(a, b map[string][]string) map[string][]string {
	out := make(map[string][]string, len(a)+len(b))
	for k, v := range a {
		out[k] = v
	}
	for k, v := range b {
		out[k] = v
	}
	return out
}

// travelPreferenceRow is the one row behind this screen.
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

// loyaltyJSON is one stored membership. Both halves are optional because the function writes
// `number: optionalText(...) ?? null`, so "typed a program, left the number blank" is stored
// as {program: "AAdvantage", number: null}. A reader that demanded two strings would drop
// that row, and because the function replaces loyalty_programs wholesale, the next save
// would delete the program from the traveler's record. §2.5.3 hand-copied this once and lost
// exactly that case.
type loyaltyJSON struct {
	Program *string `json:"program"`
	Number  *string `json:"number"`
}

func (a *area) currentPreferences(r *http.Request, st session.State) validate.PreferencesForm {
	f := validate.PreferencesForm{Loyalty: padLoyalty(nil, initialLoyaltyRows)}
	if a.off {
		return f
	}
	row := selectOne[travelPreferenceRow](r.Context(), a, st, "travel_preference",
		supa.Q().Select("preferred_destinations,travel_styles,dietary_restrictions,dietary_notes,"+
			"accessibility_needs,accessibility_notes,loyalty_programs,budget_band,favorite_past_trips"),
		"travel preferences")
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
	f.Loyalty = padLoyalty(saved, initialLoyaltyRows)
	return f
}
