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

// Screen 2.1.4 Forgot Password (web/app/(auth)/forgot-password).
//
// The answer never depends on whether the account exists: "no account with that email" would
// make this an enumeration oracle. GoTrue already answers an unknown address with success; the
// only failures shown are rate limiting (it explains a mail that is not coming) and a server
// that is not set up. Everything else reports "sent".

var forgotSpec = page.Spec{
	File:   "auth/forgot-password.html",
	Layout: shell.Auth,
	Slots:  slots([]string{"sent", "sent-email", "form"}, formSlots("form"), fieldSlots("email", false)),
}

func (a *area) mountForgot(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(forgotSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, email string, errs validate.Errors, formError *web.AuthMessage, sent bool) {
		d := tmpl.New()
		if sent {
			d.Keep("sent")
			d.Text("sent-email", email)
			d.Remove("form")
		} else {
			d.Remove("sent")
			d.Keep("form")
			fillFormError(d, "form", formError)
			fillFields(d, errs, field{slot: "email", value: email, echo: true})
		}
		a.render(w, r, d, status, noIndex)
	}

	rt.AuthOnly("GET /forgot-password", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		show(w, r, http.StatusOK, "", nil, nil, false)
	}))

	rt.AuthOnly("POST /forgot-password", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		raw := form.Get("email")
		email, errs := validate.EmailForm(raw)
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, raw, errs, nil, false)
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, raw, nil, notConfigured(), false)
			return
		}

		// The link lands on the PKCE callback, which opens a recovery session and sends them to
		// the form that sets the password.
		p := supa.NewPKCE()
		err := a.Supa.Recover(r.Context(), email, a.callbackURL("/reset-password", ""), p, session.Who(r))
		if err != nil {
			a.logErr("auth password reset request failed", err)
			if m := mapErr(err); m.Kind == web.RateLimited || m.Kind == web.NotConfigured {
				show(w, r, statusFor(m), email, nil, &m, false)
				return
			}
			// Anything else, including an address GoTrue dislikes, reports as sent, and looks
			// exactly like it, verifier cookie included.
		}
		a.keepVerifier(w, p)
		show(w, r, http.StatusOK, email, nil, nil, true)
	}))
	return nil
}
