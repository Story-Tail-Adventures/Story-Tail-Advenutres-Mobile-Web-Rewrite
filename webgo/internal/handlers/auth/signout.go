package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Sign-out (signOutAction, web/lib/auth/actions.ts, and AgentSignOutForm's push step), and
// /api/account/chrome (web/app/api/account/chrome/route.ts).

// pushStopWithin bounds the push-device call, as stopPushHere gave up after two seconds:
// sign-out is never held hostage by it.
const pushStopWithin = 2 * time.Second

func (a *area) mountSignOut(rt *gate.Router) error {
	// Mounted with SignOutRoute: it loads the session (to revoke the LIVE token) but never
	// refuses. A half-assured session mid-MFA and a visitor during an auth outage must both be
	// able to sign out, and on a shared computer clearing the cookies matters most when
	// something else is wrong. Signs out this browser only (scope=local): ending every session
	// is Screen 2.5.7's explicit button, not something closing a laptop tab should do.
	rt.SignOutRoute("POST /account/sign-out", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, err := web.ParseForm(w, r)
		st := gated(r)
		if err == nil && st.SignedIn {
			// §3.10.7: "signing out stops that device's notifications at once". sign-out.js has
			// already dropped the browser's subscription; this tells push-device to forget its
			// row, with the session that is about to end.
			if endpoint := form.Get("push_endpoint"); pushEndpoint(endpoint) {
				ctx, cancel := withTimeout(r.Context(), pushStopWithin)
				addr, _ := clientaddr.From(r.Header)
				res := a.API.Call(ctx, "push-device", st.AccessToken, api.Input{
					Method:  http.MethodPost,
					Body:    pushUnregister{Op: "unregister", Endpoint: endpoint},
					Visitor: addr,
				})
				cancel()
				if !res.OK {
					a.Log.Warn("sign-out: push-device unregister did not complete") // never the endpoint
				}
			}
			a.enrollments.drop(st.User.ID)
		}
		a.Sessions.End(w, r)
		a.clearPKCE(w)
		web.SeeOther(w, r, "/login")
	}))
	return nil
}

type pushUnregister struct {
	Op       string `json:"op"`
	Endpoint string `json:"endpoint"`
}

// pushEndpoint accepts what a browser push service hands out: an absolute https URL, of a
// sane length. Anything else is not worth a call.
func pushEndpoint(raw string) bool {
	if raw == "" || len(raw) > 2048 {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}

// chromeReply is the whole answer: two letters, never a name, an email or an id. A public page
// is cached and has no business holding more than it draws.
type chromeReply struct {
	SignedIn bool    `json:"signedIn"`
	Initials *string `json:"initials,omitempty"`
}

type clientName struct {
	FirstName     *string `json:"first_name"`
	LastName      *string `json:"last_name"`
	PreferredName *string `json:"preferred_name"`
}

func (a *area) mountChrome(rt *gate.Router) error {
	// The two letters for the public bar's avatar. Cached public pages cannot read a session;
	// the sta-authed flag tells the browser THAT somebody is signed in, and this says what to
	// draw, fetched after paint by cookie holders only. It runs the same read and the same
	// initials rule as the client shell, so the two avatars cannot disagree. It asks GoTrue,
	// so a stale flag (they outlive their token by design) gets signedIn: false.
	rt.Public("GET /api/account/chrome", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reply := func(status int, v chromeReply, cache string) {
			h := w.Header()
			h.Set("Content-Type", "application/json")
			h.Set("Cache-Control", cache)
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(v)
		}
		st := a.loadSession(w, r)
		switch {
		case st.Unavailable:
			// Nobody knows; the caller keeps the avatar with the monogram rather than
			// flipping a signed-in visitor's bar to "Sign in" for an outage.
			w.Header().Set("Retry-After", "5")
			reply(http.StatusServiceUnavailable, chromeReply{}, web.NoStore)
			return
		case !st.SignedIn:
			reply(http.StatusOK, chromeReply{SignedIn: false}, web.NoStore)
			return
		}
		// client_self_select scopes this to the caller's own row; an advisor has none (or,
		// at aal2, sees their book: more than one row, which reads as none, as maybeSingle did).
		row, found, err := supa.MaybeOne[clientName](r.Context(), a.Supa, st.AccessToken, "client",
			supa.Q().Select("first_name,last_name,preferred_name").Limit(2))
		initials := ""
		if err == nil && found {
			first := row.PreferredName
			if first == nil {
				first = row.FirstName // ?? falls back on null only, never on ""
			}
			initials = shell.InitialsFor(deref(first), deref(row.LastName))
		}
		// Per browser and short: the name behind it changes at onboarding and at a profile edit.
		reply(http.StatusOK, chromeReply{SignedIn: true, Initials: &initials}, "private, max-age=60")
	}))
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
