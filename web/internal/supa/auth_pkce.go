package supa

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/url"
)

// PKCE is one proof-key flow (RFC 7636): the verifier the starting browser keeps, and the
// challenge sent to GoTrue with the request that mails a link or starts an OAuth sign-in. The
// code that comes back on /auth/callback is worth nothing without the verifier, so a link that
// leaks (a forwarded email, a log) cannot be finished in another browser.
type PKCE struct {
	Verifier  string
	Challenge string
}

// PKCEMethod is the challenge method supabase-js sends.
const PKCEMethod = "s256"

// NewPKCE makes a flow: 56 random bytes as hex, the verifier shape supabase-js uses (112
// characters, inside RFC 7636's 43 to 128).
func NewPKCE() PKCE {
	b := make([]byte, 56)
	_, _ = rand.Read(b) // crypto/rand never returns an error (Go 1.24+); it crashes instead
	v := hex.EncodeToString(b)
	return PKCE{Verifier: v, Challenge: PKCEChallenge(v)}
}

// PKCEChallenge is S256: base64url(sha256(verifier)) without padding.
func PKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// AuthorizeURL is where an OAuth sign-in starts (signInWithOAuth with skipBrowserRedirect): the
// browser is sent to GoTrue's /authorize, which sends it to the provider and then back to
// redirectTo with a code. It is built, not fetched: there is nothing to ask GoTrue yet.
func (c *Client) AuthorizeURL(provider, redirectTo string, p PKCE) string {
	q := url.Values{
		"provider":              {provider},
		"redirect_to":           {redirectTo},
		"code_challenge":        {p.Challenge},
		"code_challenge_method": {PKCEMethod},
	}
	return c.baseURL + "/auth/v1/authorize?" + q.Encode()
}

// LinkIdentityURL asks GoTrue for the provider URL that links a social identity to the signed-in
// account (linkIdentity). It needs the session, so unlike AuthorizeURL it is a request.
func (c *Client) LinkIdentityURL(ctx context.Context, accessToken, provider, redirectTo string, p PKCE, who Caller) (string, error) {
	q := url.Values{
		"provider":              {provider},
		"redirect_to":           {redirectTo},
		"code_challenge":        {p.Challenge},
		"code_challenge_method": {PKCEMethod},
		"skip_http_redirect":    {"true"},
	}
	var out struct {
		URL string `json:"url"`
	}
	if err := c.call(ctx, http.MethodGet, "/user/identities/authorize", q, accessToken, nil, who, &out); err != nil {
		return "", err
	}
	if out.URL == "" {
		return "", &AuthError{Status: http.StatusOK, Retryable: true}
	}
	return out.URL, nil
}
