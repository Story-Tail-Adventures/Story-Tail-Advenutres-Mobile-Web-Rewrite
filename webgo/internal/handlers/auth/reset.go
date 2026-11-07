package auth

import (
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.5 Reset Password (web/app/(auth)/reset-password).
//
// The authority is the recovery session /auth/callback (or /auth/confirm) opened, never
// anything in the form: there is no email field and no token field, which would make a
// password-reset oracle and would not be trusted anyway. The route is deliberately neither
// protected (the person arriving may look signed out for a moment) nor auth-only (a recovery
// session IS a session, and auth-only would bounce them to the dashboard).
//
// A DELIBERATE DEPARTURE FROM NEXT, because it was a lockout: with a verified factor on the
// account, the recovery session is only aal1, and GoTrue refuses the password change with
// insufficient_aal. Next mapped that to "That email and password don't match", so anyone with
// two-factor who forgot their password (every advisor: agent MFA is required) could never
// reset it. Here such a session answers its factor first: /login/mfa, then back to this form,
// now aal2, where the change goes through. Somebody who has lost the factor too is the
// challenge page's "Lost your authenticator?" case, as before.

var resetSpec = page.Spec{
	File:   "auth/reset-password.html",
	Layout: shell.Auth,
	Slots: slots(
		[]string{"title", "sub", "expired", "form"},
		formSlots("form"), fieldSlots("password", true), fieldSlots("confirm-password", false),
	),
}

const resetExpiredTitle = "That link has expired"

// resetViaChallenge is where a half-assured recovery session goes first.
var resetViaChallenge = shell.MFAChallengePath + "?next=" + url.QueryEscape("/reset-password")

// halfAssured: signed in, a verified factor on the account, not answered on this session.
func halfAssured(st session.State) bool { return gate.AssuranceOf(st) == gate.Required }

func (a *area) mountReset(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(resetSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, signedIn bool, errs validate.Errors, formError *web.AuthMessage) {
		d := tmpl.New()
		if !signedIn {
			// Opened without a recovery session: an expired link, a link opened in another
			// browser, or someone who came here directly.
			d.Text("title", resetExpiredTitle)
			d.Remove("sub")
			d.Keep("expired")
			d.Remove("form")
			a.render(w, r, d, status, noIndex)
			return
		}
		d.Keep("title")
		d.Keep("sub")
		d.Remove("expired")
		d.Keep("form")
		fillFormError(d, "form", formError)
		fillFields(d, errs, field{slot: "password", hint: true}, field{slot: "confirm-password", id: "confirmPassword", key: "confirmPassword"})
		a.render(w, r, d, status, noIndex)
	}

	rt.Public("GET /reset-password", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Before Supabase exists there is nothing to ask, and the design is still worth seeing.
		st := a.loadSession(w, r)
		if halfAssured(st) {
			web.SeeOther(w, r, resetViaChallenge)
			return
		}
		show(w, r, http.StatusOK, a.off || st.SignedIn || st.Unavailable, nil, nil)
	}))

	rt.Public("POST /reset-password", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		password, errs := validate.PasswordPair(form.Get("password"), form.Get("confirmPassword"))
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, true, errs, nil)
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, true, nil, notConfigured())
			return
		}

		// Checked again here, not trusted from the render: the recovery session can lapse
		// between the two, and "your password is updated" for a request that updated nothing
		// is the worst possible outcome.
		st := a.loadSession(w, r)
		switch {
		case st.Unavailable:
			show(w, r, http.StatusServiceUnavailable, true, nil, msg(web.AuthError(web.Unknown)))
			return
		case !st.SignedIn:
			show(w, r, http.StatusUnprocessableEntity, true, nil, msg(web.AuthError(web.SessionExpired)))
			return
		case halfAssured(st):
			web.SeeOther(w, r, resetViaChallenge)
			return
		}

		if err := a.Supa.UpdatePassword(r.Context(), st.AccessToken, password, session.Who(r)); err != nil {
			a.logErr("auth password update failed", err)
			if supa.AsAuthError(err).Code == "insufficient_aal" {
				web.SeeOther(w, r, resetViaChallenge) // a factor this session has not answered
				return
			}
			m := mapErr(err)
			if m.Kind == web.WeakPassword {
				show(w, r, http.StatusUnprocessableEntity, true, validate.Errors{"password": {m.Message}}, nil)
				return
			}
			show(w, r, statusFor(m), true, nil, &m)
			return
		}
		// They are signed in on the recovery session, so there is nothing to sign in to.
		web.SeeOther(w, r, "/dashboard")
	}))
	return nil
}
