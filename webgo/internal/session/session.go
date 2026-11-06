// Package session keeps the visitor's GoTrue session in one cookie and checks it on the
// routes that need it.
//
// There is no Next.js to share cookies with (docs/GO-MIGRATION.md §4.5), so the cookie is
// ours: sta-session, HttpOnly, SameSite=Lax, Secure outside local http, holding the access
// and refresh tokens. No browser code reads it, so unlike @supabase/ssr's cookies it is not
// reachable from a script, which is a real gain over the Next.js app.
//
// The rules carried over from web/lib/supabase/middleware.ts:
//
//   - No session cookie means no Supabase call at all. A crawler costs nothing (PR #168).
//   - The token is checked with GoTrue (getUser), never trusted from its claims alone.
//   - A refreshed session is written on the SAME response, redirect or not. GoTrue rotates
//     refresh tokens, so a response that dropped the new cookie would leave the browser
//     with a dead one: the "logs people out at random" bug the Next.js app shipped once.
//   - The sta-authed flag (not HttpOnly, no identity in it) tells cached public pages which
//     chrome to paint, and is written only when it would change.
package session

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

const (
	// CookieName holds the session.
	CookieName = "sta-session"
	// FlagCookie and FlagValue are the signed-in chrome flag (web/lib/auth/chrome-flag.ts).
	FlagCookie = "sta-authed"
	FlagValue  = "1"

	// refreshWithin: refresh when the access token has less than this left, so a request
	// never reaches a page with a token about to lapse mid-render.
	refreshWithin = 60 * time.Second
	// maxAge: rewritten on every refresh, so an active visitor never hits it. Long on the
	// flag too, because the flag is only rewritten when it changes (chrome-flag.ts).
	maxAge = 30 * 24 * time.Hour
)

// Auth is the part of GoTrue the session needs (*supa.Client in production, a fake in tests).
type Auth interface {
	Refresh(ctx context.Context, refreshToken string, who supa.Caller) (supa.Tokens, error)
	GetUser(ctx context.Context, accessToken string, who supa.Caller) (supa.User, error)
	SignOut(ctx context.Context, accessToken string, who supa.Caller) error
}

// State is what one request knows about its visitor.
type State struct {
	SignedIn    bool
	User        supa.User
	AccessToken string
	// AAL2: this session has verified a second factor. HasFactor: the account has one.
	// Together they give the gate's assurance (none / required / satisfied).
	AAL2      bool
	HasFactor bool
	// Unavailable: GoTrue could not be reached, so nobody knows. Not the same as signed out:
	// the cookie is kept and the flag is left alone.
	Unavailable bool
}

// Manager reads and writes the session cookie.
type Manager struct {
	auth   Auth
	secure bool
	now    func() time.Time
	log    *slog.Logger
}

// NewManager builds a Manager. secure sets the Secure attribute; it is false only for a
// local http:// server.
func NewManager(auth Auth, secure bool, log *slog.Logger) *Manager {
	return &Manager{auth: auth, secure: secure, now: time.Now, log: log}
}

// Who is the browser behind r, for GoTrue's session records.
func Who(r *http.Request) supa.Caller {
	addr, _ := clientaddr.From(r.Header)
	return supa.Caller{UserAgent: r.UserAgent(), Address: addr}
}

type stored struct {
	A string `json:"a"`
	R string `json:"r"`
	E int64  `json:"e"`
}

func encode(t supa.Tokens) string {
	b, _ := json.Marshal(stored{A: t.AccessToken, R: t.RefreshToken, E: t.ExpiresAt})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decode(v string) (supa.Tokens, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return supa.Tokens{}, false
	}
	var s stored
	if err := json.Unmarshal(raw, &s); err != nil || s.A == "" || s.R == "" {
		return supa.Tokens{}, false
	}
	return supa.Tokens{AccessToken: s.A, RefreshToken: s.R, ExpiresAt: s.E}, true
}

// Load checks the visitor's session, refreshing it when it is close to expiry, and writes
// any new cookie onto w. Call it only on routes that need to know (the gate does).
func (m *Manager) Load(w http.ResponseWriter, r *http.Request) State {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return State{} // no cookie, no network call
	}
	tok, ok := decode(c.Value)
	if !ok {
		m.clear(w)
		return State{}
	}
	ctx, who := r.Context(), Who(r)

	refreshed := false
	if time.Unix(tok.ExpiresAt, 0).Sub(m.now()) < refreshWithin {
		next, err := m.auth.Refresh(ctx, tok.RefreshToken, who)
		switch {
		case errors.Is(err, supa.ErrUnauthenticated):
			m.clear(w)
			return State{}
		case err != nil:
			m.log.Warn("session refresh unavailable", "err", err)
			return State{Unavailable: true}
		}
		tok, refreshed = next, true
		m.write(w, tok)
	}

	user, err := m.auth.GetUser(ctx, tok.AccessToken, who)
	if errors.Is(err, supa.ErrUnauthenticated) && !refreshed {
		// Revoked or expired early (a password change, a sign-out elsewhere). One refresh;
		// if that fails too, the session is over.
		next, rerr := m.auth.Refresh(ctx, tok.RefreshToken, who)
		if rerr == nil {
			tok = next
			m.write(w, tok)
			user, err = m.auth.GetUser(ctx, tok.AccessToken, who)
		} else if !errors.Is(rerr, supa.ErrUnauthenticated) {
			m.log.Warn("session refresh unavailable", "err", rerr)
			return State{Unavailable: true}
		}
	}
	switch {
	case errors.Is(err, supa.ErrUnauthenticated):
		m.clear(w)
		return State{}
	case err != nil:
		m.log.Warn("session check unavailable", "err", err)
		return State{Unavailable: true}
	}

	claims, _ := supa.ReadClaims(tok.AccessToken) // read only after GetUser accepted the token
	return State{
		SignedIn:    true,
		User:        user,
		AccessToken: tok.AccessToken,
		AAL2:        claims.AAL == "aal2",
		HasFactor:   user.HasVerifiedFactor(),
	}
}

// Start stores a new session after a sign-in, and sets the chrome flag.
func (m *Manager) Start(w http.ResponseWriter, t supa.Tokens) {
	m.write(w, t)
	m.setFlag(w)
}

// End signs the session out at GoTrue (best effort) and clears both cookies, whatever
// GoTrue says. It must sign out with a LIVE access token: GoTrue answers an expired one with
// 401, which looks like success, and the session (and its refresh token) would stay alive
// in the advisor's Login activity. So it uses the token the gate already checked this
// request, or refreshes the cookie's token first when it is near expiry, the way supabase-js
// refreshes before it calls logout.
func (m *Manager) End(w http.ResponseWriter, r *http.Request) {
	ctx, who := r.Context(), Who(r)
	token := ""
	if st, ok := From(ctx); ok && st.SignedIn {
		token = st.AccessToken
	} else if c, err := r.Cookie(CookieName); err == nil {
		if tok, ok := decode(c.Value); ok {
			token = tok.AccessToken
			if time.Unix(tok.ExpiresAt, 0).Sub(m.now()) < refreshWithin {
				if next, err := m.auth.Refresh(ctx, tok.RefreshToken, who); err == nil {
					token = next.AccessToken
				}
			}
		}
	}
	if token != "" {
		if err := m.auth.SignOut(ctx, token, who); err != nil {
			m.log.Warn("sign-out at GoTrue failed; cookies cleared anyway", "err", err)
		}
	}
	m.clear(w)
	m.clearFlag(w)
}

// SyncFlag sets or clears the chrome flag when it disagrees with signedIn, and writes
// nothing when it already agrees, which keeps a Set-Cookie off the steady-state response.
func (m *Manager) SyncFlag(w http.ResponseWriter, r *http.Request, signedIn bool) {
	current := ""
	has := false
	if c, err := r.Cookie(FlagCookie); err == nil {
		current, has = c.Value, true
	}
	switch {
	case signedIn && current != FlagValue:
		m.setFlag(w)
	case !signedIn && has:
		m.clearFlag(w)
	}
}

func (m *Manager) write(w http.ResponseWriter, t supa.Tokens) {
	v := encode(t)
	if len(v) > 3800 {
		m.log.Warn("session cookie is near the 4 KB browser limit", "bytes", len(v))
	}
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: v, Path: "/", MaxAge: int(maxAge.Seconds()),
		HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode,
	})
}

func (m *Manager) clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode,
	})
}

func (m *Manager) setFlag(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: FlagCookie, Value: FlagValue, Path: "/", MaxAge: int(maxAge.Seconds()),
		// Deliberately not HttpOnly: the pre-paint script reads it. It carries no identity.
		HttpOnly: false, Secure: m.secure, SameSite: http.SameSiteLaxMode,
	})
}

func (m *Manager) clearFlag(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: FlagCookie, Value: "", Path: "/", MaxAge: -1,
		Secure: m.secure, SameSite: http.SameSiteLaxMode,
	})
}

type ctxKey struct{}

// WithState stores a request's session state for its handler.
func WithState(ctx context.Context, s State) context.Context {
	return context.WithValue(ctx, ctxKey{}, s)
}

// From returns the state the gate stored, so a handler never calls GoTrue a second time.
func From(ctx context.Context) (State, bool) {
	s, ok := ctx.Value(ctxKey{}).(State)
	return s, ok
}
