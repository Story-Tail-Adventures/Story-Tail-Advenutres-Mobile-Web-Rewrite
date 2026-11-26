package onboarding

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/profileform"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 2.1.10 Profile Completion (web/app/(onboarding)/onboarding/profile).

var profileSpec = page.Spec{
	File:    "onboarding/profile.html",
	Layout:  shell.Onboarding,
	Slots:   profileSlots(),
	Repeats: chromeRepeats,
}

// profileSlots is everything this page fills: the wizard's own chrome plus the fields,
// which 2.5.2 fills too and which therefore live in internal/profileform.
func profileSlots() []string {
	out := append(chromeSlots(), "form-error", "profile-form")
	return append(out, profileform.Slots()...)
}

// profileFormError is PROFILE_TEXT.formError, the sentence a refusal with no `detail` shows.
// The spec's suggested copy ended with a "message Gyasi" link; there is nowhere to link to
// from here, and the skip below is a real exit, so the copy points at that instead.
const profileFormError = "That didn't save — nothing's lost. Give it another try, or skip " +
	"for now and we'll pick this up later."

var profileStep = stepIndex("profile")

func (a *area) mountProfile(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(profileSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, f validate.ProfileForm, errs validate.Errors, formError string) {
		d := tmpl.New()
		fillChrome(d, profileStep, true)
		d.Keep("profile-form")

		if formError == "" {
			d.Remove("form-error")
		} else {
			d.Text("form-error", formError)
		}

		profileform.Fill(d, f, errs, a.now())

		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/profile", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, profileform.Load(r.Context(), a.Supa, st.AccessToken, a.Log), nil, "")
	}))

	rt.Protected("POST /onboarding/profile", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		slug, route := nextStep(profileStep)

		if form.Get("action") == actionSkip {
			// Nothing is written but the cursor: calling the profile function with an empty
			// body would spend an audit row saying somebody changed nothing.
			a.advance(w, r, st, slug, route)
			return
		}

		// The RAW strings, echoed straight back: showing somebody +13055550184 after they
		// typed (305) 555-0184 and got a different field wrong would be its own small insult.
		f := profileform.Read(form)

		if form.Get("action") == actionRelabel {
			// The no-JavaScript stand-in for Next's live relabel: the page comes back with
			// everything the traveler has typed and the chosen country's own labels. It
			// validates nothing, because they have not finished filling the form in.
			show(w, r, http.StatusOK, f, nil, "")
			return
		}

		values, errs := validate.ParseProfile(f, a.now())
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, f, errs, "")
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, f, nil, profileFormError)
			return
		}

		// An Edge Function and not a PostgREST write because `client` is a sensitive table
		// under CLAUDE.md rule 3 and owes an audit_event on every mutation.
		res := a.call(r.Context(), st, "onboarding-profile", values.Payload(true))
		out := web.FromResult(res, profileFormError)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			// `detail` only ever comes from a 4xx the function built from its own badRequest
			// messages — plain English, and more use than a generic failure.
			show(w, r, out.Status, f, nil, out.Message)
		default:
			web.SeeOther(w, r, route)
		}
	}))
	return nil
}

// actionRelabel re-renders with the chosen country's address labels, saving nothing.
const actionRelabel = "relabel"

// emergencyContact is client.emergency_contact, jsonb with no CHECK on its shape. Data-Model
// §6.1 documents {name, phone, relationship} and the function writes exactly that, but a

// fillInput fills one text input: its value, its error line, and the aria wiring that ties
// them together. hint says whether the field has a hint line the input is also described by.
