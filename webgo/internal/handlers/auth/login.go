package auth

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.1 Login (web/app/(auth)/login).

var loginSpec = page.Spec{
	File:   "auth/login.html",
	Layout: shell.Auth,
	Slots: slots(
		[]string{"next", "oauth-next", "google-on", "google-off", "apple-on", "apple-off"},
		formSlots("form"),
		fieldSlots("email", false), fieldSlots("password", false),
	),
}

type loginState struct {
	next      string
	email     string
	errs      validate.Errors
	formError *web.AuthMessage
}

func (a *area) mountLogin(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(loginSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, s loginState) {
		d := tmpl.New()
		d.Attr("next", "value", s.next)
		d.Attr("oauth-next", "value", s.next)
		fillSocial(d, a.Config.GoogleAuthEnabled, a.Config.AppleAuthEnabled)
		if p := a.enabledProviders(); len(p) > 0 {
			a.allowFormRedirects(w, p...)
		}
		fillFormError(d, "form", s.formError)
		fillFields(d, s.errs,
			field{slot: "email", value: s.email, echo: true},
			field{slot: "password"},
		)
		a.render(w, r, d, status, "")
	}

	rt.AuthOnly("GET /login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /auth/oauth sends people back here with ?error= when the handshake never starts.
		// The value is a KEY into a closed table and never rendered itself.
		var formError *web.AuthMessage
		if m, ok := web.AuthErrorFromParam(r.URL.Query().Get("error")); ok {
			formError = &m
		}
		show(w, r, http.StatusOK, loginState{next: nextFrom(r), formError: formError})
	}))

	rt.AuthOnly("POST /login", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		s := loginState{next: postedNext(form), email: form.Get("email")}
		email, errs := validate.Login(s.email, form.Get("password"))
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

		tok, err := a.Supa.SignIn(r.Context(), email, form.Get("password"), session.Who(r))
		if err != nil {
			// Never "no such account" apart from "wrong password": both are invalid_credentials.
			// One state does show, as in Next: GoTrue checks a ban before the password, so a
			// locked account reads "This account is on hold." (§3.9.5's chosen wording).
			m := mapErr(err)
			s.formError = &m
			show(w, r, statusFor(m), s)
			return
		}
		a.Sessions.Start(w, tok)
		// The gate does the rest: a session with a factor still to answer is sent to the
		// challenge on its way to next.
		web.SeeOther(w, r, s.next)
	}))
	return nil
}
