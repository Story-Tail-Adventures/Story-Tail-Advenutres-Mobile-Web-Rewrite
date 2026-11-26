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

// Screen 2.1.7 MFA Challenge (web/app/(auth)/login/mfa). Reached by the gate's redirect: a
// session with a verified factor that has not answered it yet. The gate also guards the page's
// own preconditions (signed out goes to /login, nothing to prove goes to /dashboard), so by the
// time a handler runs there is a factor waiting.
//
//   - The factor comes from the session, never from the form: a posted factor id would be a
//     request to be challenged on a factor of the caller's choosing.
//   - A wrong code is a field error and nothing else: no attempt counter, no "3 tries left".
//     GoTrue rate-limits verification, and a countdown mostly tells an attacker their budget.
//   - THE LOCKOUT TO AVOID: a verified code raises the session to aal2 in NEW tokens. They must
//     replace the cookie before the redirect, or the browser keeps its aal1 tokens and the gate
//     sends it straight back here, forever (the trap the mobile gate fell into, §nav state).

var mfaChallengeSpec = page.Spec{
	File:   "auth/mfa-challenge.html",
	Layout: shell.Auth,
	Slots:  slots([]string{"next"}, formSlots("form"), fieldSlots("code", false)),
}

// wrongCode reads like a nudge: a code that just rolled over is the ordinary case.
const wrongCode = "That code didn't match. Codes roll over every 30 seconds — try the current one."

// verifiedTOTP is the session's verified TOTP factor (listFactors().totp), or "".
func verifiedTOTP(u supa.User) string {
	for _, f := range u.Factors {
		if f.FactorType == "totp" && f.Status == "verified" {
			return f.ID
		}
	}
	return ""
}

func (a *area) mountMFAChallenge(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(mfaChallengeSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, next string, errs validate.Errors, formError *web.AuthMessage) {
		d := tmpl.New()
		d.Attr("next", "value", next)
		fillFormError(d, "form", formError)
		fillFields(d, errs, field{slot: "code"}) // never echoed: a live credential for 30 seconds
		a.render(w, r, d, status, noIndexNoFollow)
	}

	rt.MFAChallengeRoute("GET", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		show(w, r, http.StatusOK, nextFrom(r), nil, nil)
	}))

	rt.MFAChallengeRoute("POST", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		next := postedNext(form)
		code, errs := validate.MFACode(form.Get("code"))
		if !errs.Empty() {
			show(w, r, http.StatusUnprocessableEntity, next, errs, nil)
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, next, nil, notConfigured())
			return
		}

		st := gated(r)
		factor := verifiedTOTP(st.User)
		if factor == "" {
			// The factor was removed from another device while this form sat open.
			show(w, r, http.StatusUnprocessableEntity, next, nil, msg(web.AuthError(web.SessionExpired)))
			return
		}
		tok, err := a.Supa.ChallengeAndVerify(r.Context(), st.AccessToken, factor, code, session.Who(r))
		if err != nil {
			a.logErr("auth mfa challenge failed", err) // never the code
			if supa.AsAuthError(err).Code == "over_request_rate_limit" {
				show(w, r, http.StatusTooManyRequests, next, nil, msg(web.AuthError(web.RateLimited)))
				return
			}
			show(w, r, http.StatusUnprocessableEntity, next, validate.Errors{"code": {wrongCode}}, nil)
			return
		}
		a.Sessions.Start(w, tok) // the aal2 tokens: see THE LOCKOUT TO AVOID above
		web.SeeOther(w, r, next)
	}))
	return nil
}
