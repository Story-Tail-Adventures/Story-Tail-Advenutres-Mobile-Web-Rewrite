package auth

import (
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.6 MFA Setup (web/app/(auth)/mfa/setup). MFA is optional for clients and required
// for advisors: the (agent) layout sends an advisor without a factor here, so for them the
// screen says why and offers no "Not right now" (which would only loop back).
//
//   - Enrolling is a write, so it is a POST ("Show my setup code"), never the GET: a GET that
//     enrolled would leave an unverified factor behind on every refresh, and GoTrue stops at 10.
//     For the same reason each new attempt first sweeps the unverified ones an abandoned
//     attempt left.
//   - Between the two steps the server keeps the enrollment (enrollStore): GoTrue hands the
//     secret and the QR code over once, the page builder will not put a data: URL in an <img>,
//     and the QR is raw SVG that must never go into the page as markup. So the QR is served by
//     its own route as an image, and a mistyped code re-renders the same QR instead of losing it.
//   - The factor verified is the one this server enrolled for this user, never an id from the
//     form.
//   - The verified code raises the session to aal2 in new tokens, stored before the redirect
//     (see mfa_challenge.go, THE LOCKOUT TO AVOID).
//
// Not built, deliberately, as in Next: SMS (off in supabase/config.toml, so the tile says "Not
// available yet") and backup codes (Supabase has none, and home-grown ones could never produce
// the aal2 session the gates check). The way back in is the advisor's sign-in link (§3.9.3).

var mfaSetupSpec = page.Spec{
	File:   "auth/mfa-setup.html",
	Layout: shell.Auth,
	Slots: slots(
		[]string{"sub", "begin", "begin-next", "enrollment", "qr", "secret", "verify-next", "skip"},
		formSlots("begin"), formSlots("verify"), fieldSlots("code", true),
	),
}

// MFA_SETUP_TEXT.agentSub: an advisor cannot skip this.
const mfaAgentSub = "The advisor side asks for a code from an authenticator app each time you sign in. " +
	"It keeps your travelers' details safe, and it only takes a minute to set up."

// pending is one user's enrollment between its two steps.
type pending struct {
	factorID string
	secret   string
	qr       []byte // GoTrue's SVG, served only as image/svg+xml
	expires  time.Time
}

// enrollStore keeps at most one pending enrollment per user, for enrollTTL. It is memory: a
// restart forgets it, and the screen then offers "Show my setup code" again, whose sweep
// removes the factor left behind. Keyed by the user id the gate verified with GoTrue, so
// nothing a browser sends can name another user's entry.
type enrollStore struct {
	mu  sync.Mutex
	m   map[string]pending
	now func() time.Time
}

const (
	enrollTTL     = 15 * time.Minute
	maxEnrollment = 1000 // far past one advisor and their travelers; bounds the memory
)

func newEnrollStore(now func() time.Time) *enrollStore {
	return &enrollStore{m: map[string]pending{}, now: now}
}

func (s *enrollStore) put(userID string, p pending) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	p.expires = now.Add(enrollTTL)
	if len(s.m) >= maxEnrollment {
		var oldest string
		for k, v := range s.m {
			if v.expires.Before(now) {
				delete(s.m, k)
				continue
			}
			if oldest == "" || v.expires.Before(s.m[oldest].expires) {
				oldest = k
			}
		}
		if len(s.m) >= maxEnrollment && oldest != "" {
			delete(s.m, oldest)
		}
	}
	s.m[userID] = p
}

func (s *enrollStore) get(userID string) (pending, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.m[userID]
	if !ok {
		return pending{}, false
	}
	if !p.expires.After(s.now()) {
		delete(s.m, userID)
		return pending{}, false
	}
	return p, true
}

func (s *enrollStore) drop(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.m, userID)
}

// live is the user's pending enrollment, if GoTrue still has its factor unverified.
func (a *area) live(u supa.User) (pending, bool) {
	p, ok := a.enrollments.get(u.ID)
	if !ok {
		return pending{}, false
	}
	for _, f := range u.Factors {
		if f.ID == p.factorID && f.Status != "verified" {
			return p, true
		}
	}
	a.enrollments.drop(u.ID) // removed elsewhere, or verified in another tab
	return pending{}, false
}

type setupState struct {
	next       string
	required   bool
	enrollment *pending
	beginError *web.AuthMessage
	errs       validate.Errors
	verifyErr  *web.AuthMessage
}

func (a *area) mountMFASetup(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(mfaSetupSpec.File)
	if err != nil {
		return err
	}
	show := func(w http.ResponseWriter, r *http.Request, status int, s setupState) {
		d := tmpl.New()
		if s.required {
			d.Text("sub", mfaAgentSub)
			d.Remove("skip")
		} else {
			d.Keep("sub")
			d.URL("skip", "href", s.next)
		}
		if s.enrollment == nil {
			d.Keep("begin")
			d.Attr("begin-next", "value", s.next)
			fillFormError(d, "begin", s.beginError)
			d.Remove("enrollment")
		} else {
			d.Remove("begin")
			d.Keep("enrollment")
			d.Keep("qr") // /mfa/setup/qr, the one route that serves it
			d.Text("secret", s.enrollment.secret)
			d.Attr("verify-next", "value", s.next)
			fillFormError(d, "verify", s.verifyErr)
			fillFields(d, s.errs, field{slot: "code", hint: true})
		}
		a.render(w, r, d, status, noIndexNoFollow)
	}

	// required is true for an advisor (onboardingStatus().role === "agent").
	required := func(r *http.Request, st session.State) bool {
		if a.off {
			return false
		}
		s := shell.LoadStatus(r.Context(), a.Supa, st.AccessToken, a.Log)
		return s != nil && s.Role == shell.RoleAgent
	}

	rt.Protected("GET /mfa/setup", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, next := gated(r), nextFrom(r)
		// A verified factor already: nothing to do here (a second one is Security Settings').
		if st.HasFactor {
			web.SeeOther(w, r, next)
			return
		}
		s := setupState{next: next, required: required(r, st)}
		if p, ok := a.live(st.User); ok {
			s.enrollment = &p
		}
		show(w, r, http.StatusOK, s)
	}))

	// Step one: enroll a TOTP factor, then show it (303 back to the GET, which draws it).
	rt.Protected("POST /mfa/setup", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		st, next := gated(r), postedNext(form)
		if st.HasFactor {
			web.SeeOther(w, r, next)
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, setupState{next: next, beginError: notConfigured()})
			return
		}
		who := session.Who(r)
		// Sweep what abandoned attempts left: after ten, enrolling fails for a reason nobody
		// could guess from the screen.
		for _, f := range st.User.Factors {
			if f.Status == "unverified" {
				if err := a.Supa.Unenroll(r.Context(), st.AccessToken, f.ID, who); err != nil {
					a.logErr("auth mfa sweep failed", err)
				}
			}
		}
		a.enrollments.drop(st.User.ID)
		e, err := a.Supa.EnrollTOTP(r.Context(), st.AccessToken,
			fmt.Sprintf("Authenticator · %s", a.now().UTC().Format("2006-01-02")), who)
		if err != nil {
			a.logErr("auth mfa enroll failed", err)
			m := mapErr(err)
			show(w, r, statusFor(m), setupState{next: next, required: required(r, st), beginError: &m})
			return
		}
		a.enrollments.put(st.User.ID, pending{factorID: e.ID, secret: e.TOTP.Secret, qr: []byte(e.TOTP.QRCode)})
		web.SeeOther(w, r, "/mfa/setup?next="+url.QueryEscape(next))
	}))

	// The QR code, as an image. Raw SVG from GoTrue: served with its own strict policy and
	// never cached, because it carries the secret.
	rt.Protected("GET /mfa/setup/qr", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := a.live(gated(r).User)
		if !ok || len(p.qr) == 0 {
			web.Error(w, http.StatusNotFound)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "image/svg+xml")
		h.Set("Cache-Control", web.NoStore)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
		h.Set("Content-Disposition", "inline")
		_, _ = w.Write(p.qr)
	}))

	// Step two: answer the new factor.
	rt.Protected("POST /mfa/setup/verify", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		st, next := gated(r), postedNext(form)
		p, live := a.live(st.User)
		code, errs := validate.MFACode(form.Get("code"))
		s := setupState{next: next, required: required(r, st)}
		if live {
			s.enrollment = &p
		}
		if !errs.Empty() {
			s.errs = errs
			show(w, r, http.StatusUnprocessableEntity, s)
			return
		}
		if a.off {
			s.verifyErr = notConfigured()
			show(w, r, http.StatusServiceUnavailable, s)
			return
		}
		if !live {
			// Nothing to verify: it expired, or another tab began again. Start over.
			s.beginError = msg(web.AuthError(web.Unknown))
			show(w, r, http.StatusUnprocessableEntity, s)
			return
		}
		tok, err := a.Supa.ChallengeAndVerify(r.Context(), st.AccessToken, p.factorID, code, session.Who(r))
		if err != nil {
			a.logErr("auth mfa verify failed", err) // never the code
			if supa.AsAuthError(err).Code == "over_request_rate_limit" {
				s.verifyErr = msg(web.AuthError(web.RateLimited))
				show(w, r, http.StatusTooManyRequests, s)
				return
			}
			s.errs = validate.Errors{"code": {wrongCode}}
			show(w, r, http.StatusUnprocessableEntity, s)
			return
		}
		a.enrollments.drop(st.User.ID)
		a.Sessions.Start(w, tok) // aal2 now, which changes what the gates let through
		web.SeeOther(w, r, next)
	}))
	return nil
}
