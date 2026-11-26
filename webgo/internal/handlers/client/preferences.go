package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/prefsform"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.5.3 Travel Preferences (web/app/(client)/account/preferences).
//
// THE SAME WRITE AS 2.1.11, WITHOUT THE WIZARD: `advance` is omitted, which takes the write
// and leaves the onboarding cursor alone. The fields come from internal/prefsform, so the
// closed vocabularies the CHECK constraints enforce are parsed in one place — a second set
// of rules here is exactly what the Screen Inventory note at 2.5.3 says not to build.

// AccountPreferencesCopy is ACCOUNT_PREFERENCES, word for word.
var AccountPreferencesCopy = struct{ Title, Subtitle, Save, Cancel string }{
	Title:    "Travel preferences",
	Subtitle: "None of this is required. It just saves Gyasi asking you twice.",
	Save:     "Save",
	Cancel:   "Cancel",
}

var accountPreferencesSpec = page.Spec{
	File:   "client/account-preferences.html",
	Layout: shell.Client,
	Slots: append([]string{
		"title", "subtitle", "form-error", "preferences-form", "save", "cancel",
	}, prefsform.Slots()...),
	Repeats: prefsform.Repeats,
}

// accountPreferencesFailed is the sentence a refusal with no detail shows. The wizard's
// offers to skip; there is nothing to skip from the account, so this one stops there.
const accountPreferencesFailed = "That didn't save — nothing's lost, your answers are " +
	"still here. Give it another try."

func (a *area) mountAccountPreferences(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(accountPreferencesSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, v visitor, status int,
		f validate.PreferencesForm, errs validate.Errors, formError string) {

		d := tmpl.New()
		d.Text("title", AccountPreferencesCopy.Title)
		d.Text("subtitle", AccountPreferencesCopy.Subtitle)
		if formError == "" {
			d.Remove("form-error")
		} else {
			d.Text("form-error", formError)
		}
		prefsform.Fill(d, f, errs)
		d.Keep("preferences-form")
		d.Text("save", AccountPreferencesCopy.Save)
		d.Text("cancel", AccountPreferencesCopy.Cancel)
		d.URL("cancel", "href", "/account")
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /account/preferences", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, http.StatusOK, a.currentPreferences(r, v), nil, "")
	}))

	rt.Protected("POST /account/preferences", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		f := prefsform.Read(form)
		if form.Get("action") == prefsAddRow {
			// The no-JavaScript stand-in for the repeater's "Add another": one more empty
			// row, nothing saved, nothing validated.
			f.Loyalty = prefsform.PadTo(f.Loyalty, len(f.Loyalty)+1)
			show(w, r, v, http.StatusOK, f, nil, "")
			return
		}

		// advance: false — the write, without the cursor move.
		payload, errs := validate.ParsePreferences(f, false)
		if !errs.Empty() {
			f.Loyalty = prefsform.Pad(f.Loyalty)
			show(w, r, v, http.StatusUnprocessableEntity, f, errs, "")
			return
		}
		if a.off {
			web.SeeOther(w, r, "/account")
			return
		}

		res := a.API.Call(r.Context(), "onboarding-preferences", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body:   payload,
		})
		out := web.FromResult(res, accountPreferencesFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = accountPreferencesFailed
			}
			f.Loyalty = prefsform.Pad(f.Loyalty)
			show(w, r, v, out.Status, f, nil, msg)
		default:
			web.SeeOther(w, r, "/account")
		}
	}))
	return nil
}

// prefsAddRow is the repeater's own op, the same value 2.1.11 posts.
const prefsAddRow = "add-row"

func (a *area) currentPreferences(r *http.Request, v visitor) validate.PreferencesForm {
	if a.off {
		return validate.PreferencesForm{Loyalty: prefsform.Pad(nil)}
	}
	return prefsform.Load(r.Context(), a.Supa, v.AccessToken, a.Log)
}
