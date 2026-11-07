package auth

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.2 Registration (web/app/(auth)/register). The rules worth repeating, because
// getting any of them wrong is a security bug rather than a bug:
//
//   - Metadata is exactly { first_name, last_name } from validated fields (supa.SignUpMetadata).
//     handle_new_user() trusts it; agent_id from a form would attach anybody to any advisor.
//   - A taken address answers exactly like a fresh sign-up awaiting confirmation: the same
//     panel, status and cookies. There is no "that email is taken" branch.
//   - Never log a password, the email, or the names: a GoTrue code and status only.

var registerSpec = page.Spec{
	File:   "auth/register.html",
	Layout: shell.Auth,
	Slots: slots(
		[]string{"confirm", "confirm-email", "form", "next", "oauth-next", "google-on", "google-off", "apple-on", "apple-off"},
		formSlots("form"),
		fieldSlots("first-name", false), fieldSlots("last-name", false), fieldSlots("email", false),
		fieldSlots("password", true), fieldSlots("confirm-password", false), fieldSlots("terms", false),
	),
}

type registerState struct {
	next                       string
	firstName, lastName, email string // echoed; never either password
	errs                       validate.Errors
	formError                  *web.AuthMessage
	confirmEmail               string // set: the "Check your email" panel instead of the form
}

func (a *area) mountRegister(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(registerSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, s registerState) {
		d := tmpl.New()
		if s.confirmEmail != "" {
			d.Keep("confirm")
			d.Text("confirm-email", s.confirmEmail)
			d.Remove("form")
			d.Remove("oauth-next")
			a.render(w, r, d, status, noIndex)
			return
		}
		d.Remove("confirm")
		d.Keep("form")
		d.Attr("next", "value", s.next)
		d.Attr("oauth-next", "value", s.next)
		fillSocial(d, a.Config.GoogleAuthEnabled, a.Config.AppleAuthEnabled)
		if p := a.enabledProviders(); len(p) > 0 {
			a.allowFormRedirects(w, p...)
		}
		fillFormError(d, "form", s.formError)
		fillFields(d, s.errs,
			field{slot: "first-name", id: "firstName", key: "firstName", value: s.firstName, echo: true},
			field{slot: "last-name", id: "lastName", key: "lastName", value: s.lastName, echo: true},
			field{slot: "email", value: s.email, echo: true},
			field{slot: "password", hint: true},
			field{slot: "confirm-password", id: "confirmPassword", key: "confirmPassword"},
			field{slot: "terms"},
		)
		a.render(w, r, d, status, noIndex)
	}

	rt.AuthOnly("GET /register", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		show(w, r, http.StatusOK, registerState{next: nextFrom(r)})
	}))

	rt.AuthOnly("POST /register", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		s := registerState{
			next:      postedNext(form),
			firstName: form.Get("firstName"),
			lastName:  form.Get("lastName"),
			email:     form.Get("email"),
		}
		data, errs := validate.RegistrationWithConfirm(validate.RegistrationInput{
			FirstName:       s.firstName,
			LastName:        s.lastName,
			Email:           s.email,
			Password:        form.Get("password"),
			ConfirmPassword: form.Get("confirmPassword"),
			Terms:           form.Get("terms"),
		})
		if !errs.Empty() {
			s.errs = errs
			show(w, r, http.StatusUnprocessableEntity, s)
			return
		}
		if a.off {
			a.Log.Warn("auth: Supabase is not configured; set SUPABASE_URL and SUPABASE_ANON_KEY from `supabase status`")
			s.formError = notConfigured()
			show(w, r, http.StatusServiceUnavailable, s)
			return
		}

		// The confirmation link finishes this PKCE flow in this browser.
		p := supa.NewPKCE()
		tok, err := a.Supa.SignUp(r.Context(), data.Email, data.Password,
			supa.SignUpMetadata{FirstName: data.FirstName, LastName: data.LastName},
			a.callbackURL(s.next, ""), p, session.Who(r))
		if err != nil {
			m := mapErr(err)
			switch m.Kind {
			case web.EmailTaken:
				// The same answer as success-without-session, on purpose, cookie included.
				a.keepVerifier(w, p)
				show(w, r, http.StatusOK, registerState{confirmEmail: data.Email})
				return
			case web.EmailInvalid:
				s.errs = validate.Errors{"email": {m.Message}}
				show(w, r, http.StatusUnprocessableEntity, s)
				return
			case web.WeakPassword:
				// GoTrue's policy caught something the client rule did not; it belongs on the field.
				s.errs = validate.Errors{"password": {m.Message}}
				show(w, r, http.StatusUnprocessableEntity, s)
				return
			}
			a.logErr("auth sign-up failed", err)
			// A sign-up has no "wrong password": that fallback, and its reset link, is sign-in
			// vocabulary. Anything unrecognised is simply "try again".
			if m.Kind == web.InvalidCredentials {
				m = web.AuthError(web.Unknown)
			}
			s.formError = &m
			show(w, r, statusFor(m), s)
			return
		}
		if tok != nil {
			// Confirmations are off: they are signed in right now.
			a.Sessions.Start(w, *tok)
			web.SeeOther(w, r, s.next)
			return
		}
		a.keepVerifier(w, p)
		show(w, r, http.StatusOK, registerState{confirmEmail: data.Email})
	}))
	return nil
}
