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

// Screen 2.1.3 Email Verification (web/app/(auth)/verify-email).
//
// Two ways in, straight after sign-up and from sign-in's email_not_confirmed "Resend it", and
// neither has a session (GoTrue withholds one until the address is confirmed), so the resend
// form asks for the address. A session only turns up with confirmations off, or when somebody
// comes back after confirming; then:
//
//   - an already-verified visitor is sent to the dashboard, not told to do what they did;
//   - the address comes from the session and is NEVER taken from the form: a posted address on
//     an authenticated resend would let a signed-in person spray verification mail at strangers;
//   - they may move the account to another address (double_confirm_changes mails both), which
//     without a session would be an account-takeover form with a friendly label.

var verifySpec = page.Spec{
	File:   "auth/verify-email.html",
	Layout: shell.Auth,
	Slots: slots(
		[]string{
			"sub-known", "sub-email", "sub-unknown", "change-sent", "resend-form", "resend-sent",
			"email-field", "signed-in", "change", "change-toggle", "change-form", "signed-out",
		},
		formSlots("resend"), fieldSlots("email", false),
		formSlots("change"), fieldSlots("new-email", false),
	),
}

// verifyState is the page's two forms.
type verifyState struct {
	sessionEmail string // the signed-in address, or "" for the anonymous screen
	signedIn     bool

	resendEmail string // echoed in the anonymous field
	resendErrs  validate.Errors
	resendError *web.AuthMessage
	resendSent  bool

	changing    bool // the change-address form is open
	changeEmail string
	changeErrs  validate.Errors
	changeError *web.AuthMessage
	changeSent  bool
}

func (a *area) mountVerify(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(verifySpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, s verifyState) {
		d := tmpl.New()
		if s.sessionEmail != "" {
			d.Keep("sub-known")
			d.Text("sub-email", s.sessionEmail)
			d.Remove("sub-unknown")
		} else {
			d.Remove("sub-known")
			d.Keep("sub-unknown")
		}

		// The resend form, or the change-sent note in its place.
		if s.changeSent {
			d.Keep("change-sent")
			d.Remove("resend-form")
		} else {
			d.Remove("change-sent")
			d.Keep("resend-form")
			fillFormError(d, "resend", s.resendError)
			if s.resendSent {
				d.Keep("resend-sent")
			} else {
				d.Remove("resend-sent")
			}
			if s.sessionEmail != "" {
				d.Remove("email-field") // the session's address is the only one used
			} else {
				d.Keep("email-field")
				fillFields(d, s.resendErrs, field{slot: "email", value: s.resendEmail, echo: true})
			}
		}

		if !s.signedIn {
			d.Remove("signed-in")
			d.Keep("signed-out")
			a.render(w, r, d, status, noIndex)
			return
		}
		d.Keep("signed-in")
		d.Remove("signed-out")
		switch {
		case s.changeSent:
			d.Remove("change")
		case s.changing:
			d.Keep("change")
			d.Remove("change-toggle")
			d.Keep("change-form")
			fillFormError(d, "change", s.changeError)
			fillFields(d, s.changeErrs, field{slot: "new-email", id: "newEmail", key: "email", value: s.changeEmail, echo: true})
		default:
			d.Keep("change")
			d.Keep("change-toggle")
			d.Remove("change-form")
		}
		a.render(w, r, d, status, noIndex)
	}

	// who reads the session and, when there is one, the address and whether it is confirmed.
	who := func(w http.ResponseWriter, r *http.Request) (st session.State, email string, confirmed, ok bool) {
		st = a.loadSession(w, r)
		if !st.SignedIn {
			return st, "", false, true
		}
		u, err := a.Supa.CurrentUser(r.Context(), st.AccessToken, session.Who(r))
		if err != nil {
			a.logErr("auth verify-email user read failed", err)
			return st, "", false, false
		}
		return st, u.Email, u.Confirmed(), true
	}

	rt.Public("GET /verify-email", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, email, confirmed, ok := who(w, r)
		if ok && confirmed {
			web.SeeOther(w, r, "/dashboard")
			return
		}
		signedIn := st.SignedIn && ok
		show(w, r, http.StatusOK, verifyState{
			sessionEmail: email,
			signedIn:     signedIn,
			changing:     signedIn && r.URL.Query().Get("change") == "1",
		})
	}))

	// Resend the verification email.
	rt.Public("POST /verify-email", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		submitted := form.Get("email")
		if a.off {
			show(w, r, http.StatusServiceUnavailable, verifyState{resendEmail: submitted, resendError: notConfigured()})
			return
		}
		st, sessionEmail, _, _ := who(w, r)
		s := verifyState{sessionEmail: sessionEmail, signedIn: st.SignedIn && sessionEmail != ""}

		// A session, if there is one, outranks anything posted.
		target := submitted
		if sessionEmail != "" {
			target = sessionEmail
		}
		email, errs := validate.EmailForm(target)
		if !errs.Empty() {
			s.resendEmail, s.resendErrs = submitted, errs
			show(w, r, http.StatusUnprocessableEntity, s)
			return
		}

		p := supa.NewPKCE()
		err := a.Supa.ResendSignup(r.Context(), email, a.callbackURL("/dashboard", ""), p, session.Who(r))
		if err != nil {
			a.logErr("auth resend verification failed", err)
			// Worth showing: it explains a mail that is not going to arrive. Everything else
			// reports as sent, or "no account with that address" would be the oracle the
			// sign-up and sign-in screens go out of their way to avoid.
			if m := mapErr(err); m.Kind == web.RateLimited || m.Kind == web.NotConfigured {
				s.resendEmail, s.resendError = email, &m
				show(w, r, statusFor(m), s)
				return
			}
		}
		a.keepVerifier(w, p)
		s.resendEmail, s.resendSent = email, true
		show(w, r, http.StatusOK, s)
	}))

	// Move the account to another address (§2.1.3 key actions). Needs a session.
	rt.Public("POST /verify-email/change", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		submitted := form.Get("email")
		email, errs := validate.EmailForm(submitted)
		if !errs.Empty() || a.off {
			st, sessionEmail, _, _ := who(w, r)
			s := verifyState{sessionEmail: sessionEmail, signedIn: st.SignedIn && sessionEmail != "", changing: true,
				changeEmail: submitted, changeErrs: errs}
			status := http.StatusUnprocessableEntity
			if errs.Empty() {
				s.changeError, status = notConfigured(), http.StatusServiceUnavailable
			}
			show(w, r, status, s)
			return
		}

		st, sessionEmail, _, readOK := who(w, r)
		if !st.SignedIn || !readOK {
			// The session lapsed after the form was drawn. Next showed session_expired, whose
			// words are about reset links; sign in and come back to this screen instead.
			web.SeeOther(w, r, "/login?next="+url.QueryEscape("/verify-email"))
			return
		}
		if halfAssured(st) {
			// GoTrue moves an address only on an aal2 session once a factor exists (see
			// reset.go): answer it first, then come back to this form.
			web.SeeOther(w, r, shell.MFAChallengePath+"?next="+url.QueryEscape("/verify-email?change=1"))
			return
		}
		s := verifyState{sessionEmail: sessionEmail, signedIn: true, changing: true, changeEmail: submitted}

		p := supa.NewPKCE()
		if err := a.Supa.UpdateEmail(r.Context(), st.AccessToken, email, a.callbackURL("/dashboard", ""), p, session.Who(r)); err != nil {
			a.logErr("auth email change failed", err)
			// email_taken is safe to show here, unlike on sign-up: the caller is signed in, and
			// learning that an address is in use tells them nothing registering it would not.
			m := mapErr(err)
			s.changeError = &m
			show(w, r, statusFor(m), s)
			return
		}
		a.keepVerifier(w, p)
		s.changeSent = true
		show(w, r, http.StatusOK, s)
	}))
	return nil
}
