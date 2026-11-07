package auth

import (
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.8 Social Login / Account Linking (web/app/(auth)/link-account), reached from
// /auth/callback when an OAuth sign-in collides with an existing email account.
//
// The order is the whole security argument: SIGN IN FIRST, LINK SECOND. The password proves
// the person at the keyboard owns the existing account; the OAuth round trip linkIdentity
// starts proves the provider agrees they own the social one. Linking on the strength of a
// matching address is how accounts are taken over by anyone who can register that address at
// a provider.
//
// The provider travels in the URL (it is not personal data); the address never does, and an
// unknown provider is a 404 rather than a guess: "link Google" and "link Apple" are different
// promises, and this page asks for a password on the strength of the one it names.

var linkSpec = page.Spec{
	File:   "auth/link-account.html",
	Layout: shell.Auth,
	Slots:  slots([]string{"provider", "submit"}, formSlots("form"), fieldSlots("email", false), fieldSlots("password", false)),
}

func (a *area) mountLink(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(linkSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, provider, email string, errs validate.Errors, formError *web.AuthMessage) {
		d := tmpl.New()
		d.Attr("provider", "value", provider)
		d.Text("submit", "Sign in & link "+providerLabel[provider])
		fillFormError(d, "form", formError)
		fillFields(d, errs, field{slot: "email", value: email, echo: true}, field{slot: "password"})
		a.render(w, r, d, status, noIndexNoFollow)
	}

	rt.Public("GET /link-account", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		provider := r.URL.Query().Get("provider")
		if !isProvider(provider) {
			web.Error(w, http.StatusNotFound)
			return
		}
		show(w, r, http.StatusOK, provider, "", nil, nil)
	}))

	rt.Public("POST /link-account", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		raw, provider := form.Get("email"), form.Get("provider")
		email, errs := validate.Login(raw, form.Get("password"))
		if !isProvider(provider) {
			web.Error(w, http.StatusNotFound) // posted by hand: there is no screen to answer on
			return
		}
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, provider, raw, errs, nil)
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, provider, raw, nil, notConfigured())
			return
		}

		tok, err := a.Supa.SignIn(r.Context(), email, form.Get("password"), session.Who(r))
		if err != nil {
			// The same collapse as 2.1.1: never "no such account" apart from "wrong password".
			m := mapErr(err)
			show(w, r, statusFor(m), provider, raw, nil, &m)
			return
		}
		a.Sessions.Start(w, tok)

		p := supa.NewPKCE()
		target, err := a.Supa.LinkIdentityURL(r.Context(), tok.AccessToken, provider, a.callbackURL("/dashboard", ""), p, session.Who(r))
		if err != nil || !providerURL(target, a.Config.Env == config.Development) {
			if err != nil {
				a.logErr("auth identity link failed", err)
			}
			// They ARE signed in: the password worked. Losing the link is a disappointment, not
			// a dead end; they can retry from settings.
			web.SeeOther(w, r, "/dashboard")
			return
		}
		a.keepVerifier(w, p)
		w.Header().Set("Cache-Control", web.NoStore)
		http.Redirect(w, r, target, http.StatusSeeOther)
	}))
	return nil
}

// providerURL accepts only an absolute https address (http too in development, for a local
// stack) for the browser to be sent to: one of the two places a page here leaves the site.
func providerURL(raw string, allowHTTP bool) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		return false
	}
	return u.Scheme == "https" || (allowHTTP && u.Scheme == "http")
}
