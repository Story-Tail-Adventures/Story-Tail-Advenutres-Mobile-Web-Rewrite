package onboarding

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/prefsform"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.11 Travel Preferences (web/app/(onboarding)/onboarding/preferences).

var preferencesSpec = page.Spec{
	File:    "onboarding/preferences.html",
	Layout:  shell.Onboarding,
	Slots:   preferencesSlots(),
	Repeats: mergeRepeats(chromeRepeats, prefsform.Repeats),
}

func preferencesSlots() []string {
	out := append(chromeSlots(), "form-error", "preferences-form")
	return append(out, prefsform.Slots()...)
}

// preferencesFormError is PREFERENCES_TEXT.formError.
const preferencesFormError = "That didn't save — nothing's lost, your answers are still " +
	"here. Try again, or skip for now and we'll pick this up later."

// prefsform.InitialLoyaltyRows is the repeater's starting height (INITIAL_LOYALTY_ROWS).

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

		prefsform.Fill(d, f, errs)

		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/preferences", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, prefsform.Load(r.Context(), a.Supa, st.AccessToken, a.Log), nil, "")
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
		f := prefsform.Read(form)

		if action == actionAddRow {
			// The no-JavaScript stand-in for the repeater's "Add another": one more empty
			// row, nothing saved, nothing validated.
			f.Loyalty = prefsform.PadTo(f.Loyalty, len(f.Loyalty)+1)
			show(w, r, http.StatusOK, f, nil, "")
			return
		}

		payload, errs := validate.ParsePreferences(f, true)
		f.Loyalty = prefsform.Pad(f.Loyalty)
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

// postedLoyalty pairs the repeater's two parallel lists by index. The row count is the
// LONGER of the two, not just the programs: the rendered form always posts them in pairs,
// but a hand-built post with one more number than program would otherwise lose that number
// silently instead of failing with "which program is that number for?".

// padLoyalty keeps at least n rows on the screen, never more than the limit.

// extraDestinations are the places that are not one of the eight chips, so the page can show
// them as chips of their own rather than losing them.

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

// loyaltyJSON is one stored membership. Both halves are optional because the function writes
// `number: optionalText(...) ?? null`, so "typed a program, left the number blank" is stored
// as {program: "AAdvantage", number: null}. A reader that demanded two strings would drop
// that row, and because the function replaces loyalty_programs wholesale, the next save
// would delete the program from the traveler's record. §2.5.3 hand-copied this once and lost
// exactly that case.
