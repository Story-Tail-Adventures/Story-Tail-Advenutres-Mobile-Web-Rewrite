package auth

import (
	"net/http"
	"net/url"
	"regexp"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The PKCE flows: an emailed link (sign-up, resend, reset, change of address) or an OAuth
// sign-in starts here with a verifier this browser keeps, and /auth/callback finishes it.
// Ports web/app/auth/callback/route.ts and signInWithProviderAction (web/lib/auth/actions.ts).

// The verifier cookie. HttpOnly, so no script can read it; Lax, so it comes back on the
// top-level redirect from GoTrue or the provider; an hour, as long as an emailed link lives.
// One slot: a newer flow replaces an older one, and GoTrue replaces the older email's token
// too, so the two agree about which link still works.
const (
	pkceCookie       = "sta-pkce"
	securePKCECookie = "__Host-sta-pkce"
	pkceMaxAge       = 3600
)

var verifierShape = regexp.MustCompile(`^[0-9a-f]{43,128}$`)

func (a *area) pkceName() string {
	if a.SecureCookies {
		return securePKCECookie
	}
	return pkceCookie
}

// keepVerifier stores a flow's verifier in this browser. Call it only once the email or the
// redirect it belongs to has actually gone out, so a refused request leaves the browser's
// earlier flow alone.
func (a *area) keepVerifier(w http.ResponseWriter, p supa.PKCE) {
	http.SetCookie(w, &http.Cookie{
		Name: a.pkceName(), Value: p.Verifier, Path: "/", MaxAge: pkceMaxAge,
		HttpOnly: true, Secure: a.SecureCookies, SameSite: http.SameSiteLaxMode,
	})
}

// verifier reads this browser's verifier. It is cleared only after an exchange WORKS: a
// failed one (a crafted /auth/callback?code=... link, a scanner, a stale code) must not burn
// the verifier a genuine email link in flight still needs. Reusing a verifier is harmless:
// each code is tied to its own flow, whose challenge only that flow's verifier answers. A
// malformed cookie is cleared.
func (a *area) verifier(w http.ResponseWriter, r *http.Request) string {
	c, err := r.Cookie(a.pkceName())
	if err != nil {
		return ""
	}
	if !verifierShape.MatchString(c.Value) {
		a.clearPKCE(w)
		return ""
	}
	return c.Value
}

func (a *area) clearPKCE(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: a.pkceName(), Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: a.SecureCookies, SameSite: http.SameSiteLaxMode,
	})
}

// The OAuth providers the app offers (web/lib/auth/providers.ts).
var providerLabel = map[string]string{"google": "Google", "apple": "Apple"}

func isProvider(v string) bool { _, ok := providerLabel[v]; return ok }

// isIdentityCollision is GoTrue saying "this social identity's address already has an account,
// and I will not link them for you": Screen 2.1.8's way in. Supabase links automatically when
// the existing address is confirmed, so reaching this means the match proved nothing.
func isIdentityCollision(code string) bool {
	switch code {
	case "identity_already_exists", "email_exists", "user_already_exists":
		return true
	}
	return false
}

func (a *area) providerEnabled(p string) bool {
	switch p {
	case "google":
		return a.Config.GoogleAuthEnabled
	case "apple":
		return a.Config.AppleAuthEnabled
	}
	return false
}

func (a *area) mountCallback(rt *gate.Router) error {
	// Start an OAuth sign-in (Screens 2.1.1, 2.1.2, 2.0.6): the social buttons post here with
	// the form's next. A provider that is off, or a server with no Supabase, answers 204 and
	// the browser stays where it was, as Next's action returned without a word: the buttons
	// are already drawn disabled, and anyone past that is posting by hand.
	rt.Public("POST /auth/oauth", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		provider := form.Get("provider")
		if !isProvider(provider) || !a.providerEnabled(provider) || a.off {
			w.Header().Set("Cache-Control", web.NoStore)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		p := supa.NewPKCE()
		a.keepVerifier(w, p)
		// The provider rides on the callback URL so a collision can name it on 2.1.8; GoTrue's
		// error redirect does not carry it. Not personal data, unlike the address.
		target := a.Supa.AuthorizeURL(provider, a.callbackURL(postedNext(form), provider), p)
		w.Header().Set("Cache-Control", web.NoStore)
		http.Redirect(w, r, target, http.StatusSeeOther)
	}))

	// Finish a PKCE flow: an emailed link (via GoTrue's /verify) or a provider sends the
	// browser here with ?code=. A failure goes to /login with nothing appended: GoTrue's
	// error_description is not traveler-facing copy, and echoing it would let a crafted link
	// put any text on the sign-in page.
	rt.Public("GET /auth/callback", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		next := gate.SafeNext(q.Get("next"), "/dashboard")
		provider := q.Get("provider")
		w.Header().Set("Referrer-Policy", "no-referrer") // the URL carries a one-time code

		// The provider refused before there was a code; GoTrue sends its own error parameters.
		if isIdentityCollision(q.Get("error_code")) && isProvider(provider) {
			web.SeeOther(w, r, "/link-account?provider="+url.QueryEscape(provider))
			return
		}

		exchanged := false
		if code := q.Get("code"); code != "" && !a.off {
			verifier := a.verifier(w, r)
			if verifier == "" {
				// Another browser, or the cookie ran out: the link can only be finished where
				// it was asked for ("only in the browser you opened them in").
				a.Log.Warn("auth callback without a verifier")
			} else {
				tok, err := a.Supa.ExchangeCode(r.Context(), code, verifier, session.Who(r))
				if err != nil {
					a.logErr("auth callback exchange failed", err)
					if isIdentityCollision(supa.AsAuthError(err).Code) && isProvider(provider) {
						web.SeeOther(w, r, "/link-account?provider="+url.QueryEscape(provider))
						return
					}
				} else {
					a.clearPKCE(w) // spent
					a.Sessions.Start(w, tok)
					exchanged = true
				}
			}
		}
		if exchanged {
			web.SeeOther(w, r, next)
			return
		}
		web.SeeOther(w, r, "/login")
	}))
	return nil
}
