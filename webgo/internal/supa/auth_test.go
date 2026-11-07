package supa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
)

// recorded is one request the fake GoTrue saw.
type recorded struct {
	method, path string
	query        url.Values
	header       http.Header
	body         map[string]json.RawMessage
}

// fakeAuth answers each "METHOD /path" with a status and a JSON reply, and records requests.
type fakeAuth struct {
	mu      sync.Mutex
	replies map[string]func() (int, any)
	seen    []recorded
}

func newFakeAuth(t *testing.T) (*Client, *fakeAuth) {
	t.Helper()
	f := &fakeAuth{replies: map[string]func() (int, any){}}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return New(srv.URL, "anon-key", nil), f
}

func (f *fakeAuth) on(route string, status int, reply any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.replies[route] = func() (int, any) { return status, reply }
}

func (f *fakeAuth) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	raw, _ := io.ReadAll(r.Body)
	var body map[string]json.RawMessage
	_ = json.Unmarshal(raw, &body)
	f.seen = append(f.seen, recorded{r.Method, r.URL.Path, r.URL.Query(), r.Header.Clone(), body})
	reply, ok := f.replies[r.Method+" "+r.URL.Path]
	if !ok {
		w.WriteHeader(404)
		return
	}
	status, v := reply()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (f *fakeAuth) last() recorded {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.seen[len(f.seen)-1]
}

func str(raw json.RawMessage) string {
	var s string
	_ = json.Unmarshal(raw, &s)
	return s
}

func keys(m map[string]json.RawMessage) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestCallSendsTheCallerTheKeyAndTheAPIVersion(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("PUT /auth/v1/user", 200, map[string]any{"id": "u1"})
	if err := c.UpdatePassword(context.Background(), "tok", "GreenPastures1", who); err != nil {
		t.Fatal(err)
	}
	r := f.last()
	checks := map[string]string{
		"apikey":                 "anon-key",
		"Authorization":          "Bearer tok",
		"X-Supabase-Api-Version": "2024-01-01",
		"User-Agent":             who.UserAgent, // §3.9.6: the browser, not this server
		"X-Forwarded-For":        who.Address,
	}
	for h, want := range checks {
		if got := r.header.Get(h); got != want {
			t.Errorf("%s = %q, want %q", h, got, want)
		}
	}
	if str(r.body["password"]) != "GreenPastures1" || len(r.body) != 1 {
		t.Errorf("body keys = %v", keys(r.body))
	}
}

func TestErrorsCarryCodeAndStatusOnly(t *testing.T) {
	c, f := newFakeAuth(t)
	cases := []struct {
		status    int
		reply     any
		wantCode  string
		retryable bool
	}{
		{400, map[string]any{"code": "invalid_credentials", "msg": "Invalid login credentials"}, "invalid_credentials", false},
		{400, map[string]any{"error_code": "email_not_confirmed"}, "email_not_confirmed", false},
		{422, map[string]any{"weak_password": map[string]any{"reasons": []string{"length"}}}, "weak_password", false},
		{429, map[string]any{"code": "over_email_send_rate_limit"}, "over_email_send_rate_limit", false},
		{500, map[string]any{"msg": "boom"}, "", false},
		{503, map[string]any{"code": "x"}, "", true}, // supabase-js: AuthRetryableFetchError
		// Older GoTrue: `code` is the status NUMBER, the string is in error_code.
		{403, map[string]any{"code": 403, "error_code": "otp_expired", "msg": "Email link is invalid"}, "otp_expired", false},
		{422, map[string]any{"code": 422, "msg": "weak", "weak_password": map[string]any{"reasons": []string{"length"}}}, "weak_password", false},
	}
	for _, tc := range cases {
		f.on("POST /auth/v1/token", tc.status, tc.reply)
		_, err := c.SignIn(context.Background(), "a@b.co", "pw", who)
		ae := AsAuthError(err)
		if ae.Status != tc.status || ae.Code != tc.wantCode || ae.Retryable != tc.retryable {
			t.Errorf("%d %v -> %+v", tc.status, tc.reply, ae)
		}
		if strings.Contains(err.Error(), "Invalid login") || strings.Contains(err.Error(), "boom") {
			t.Errorf("error text carries GoTrue's message: %v", err)
		}
	}
}

func TestATransportFailureIsRetryable(t *testing.T) {
	c := New("http://127.0.0.1:1", "anon-key", nil)
	_, err := c.SignIn(context.Background(), "a@b.co", "pw", who)
	if ae := AsAuthError(err); !ae.Retryable || ae.Status != 0 {
		t.Errorf("transport failure = %+v", ae)
	}
	if strings.Contains(err.Error(), "127.0.0.1") {
		t.Errorf("error carries the URL: %v", err)
	}
}

func TestCallNeverFollowsARedirect(t *testing.T) {
	hits := 0
	elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits++ }))
	defer elsewhere.Close()
	gt := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.URL+"/steal", http.StatusTemporaryRedirect)
	}))
	defer gt.Close()
	c := New(gt.URL, "anon-key", nil)
	if err := c.UpdatePassword(context.Background(), "tok", "pw", who); err == nil {
		t.Error("a redirect reply counted as success")
	}
	if hits != 0 {
		t.Error("the redirect was followed, carrying the bearer token to another host")
	}
}

func TestSignUpSendsExactlyTheNamesAsMetadata(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("POST /auth/v1/signup", 200, map[string]any{"id": "u1", "email": "a@b.co"})
	p := NewPKCE()
	tok, err := c.SignUp(context.Background(), "a@b.co", "GreenPastures1",
		SignUpMetadata{FirstName: "Jordan", LastName: "Hayes"}, "http://localhost:8080/auth/callback?next=%2Fdashboard", p, who)
	if err != nil || tok != nil {
		t.Fatalf("awaiting confirmation = %v %v", tok, err)
	}
	r := f.last()
	var data map[string]string
	_ = json.Unmarshal(r.body["data"], &data)
	if len(data) != 2 || data["first_name"] != "Jordan" || data["last_name"] != "Hayes" {
		t.Errorf("metadata = %v", data)
	}
	if str(r.body["code_challenge"]) != p.Challenge || str(r.body["code_challenge_method"]) != "s256" {
		t.Errorf("PKCE not sent: %v", keys(r.body))
	}
	if r.query.Get("redirect_to") != "http://localhost:8080/auth/callback?next=%2Fdashboard" {
		t.Errorf("redirect_to = %q", r.query.Get("redirect_to"))
	}

	// Confirmations off: a session comes back.
	f.on("POST /auth/v1/signup", 200, map[string]any{"access_token": jwt(map[string]any{"exp": 2000000000}), "refresh_token": "r"})
	tok, err = c.SignUp(context.Background(), "a@b.co", "GreenPastures1", SignUpMetadata{}, "", p, who)
	if err != nil || tok == nil || tok.RefreshToken != "r" || tok.ExpiresAt != 2000000000 {
		t.Errorf("signed-in sign-up = %+v %v", tok, err)
	}
}

func TestEmailFlowsCarryTheirChallenge(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("POST /auth/v1/recover", 200, map[string]any{})
	f.on("POST /auth/v1/resend", 200, map[string]any{})
	p := NewPKCE()

	if err := c.Recover(context.Background(), "a@b.co", "http://x/auth/callback?next=%2Freset-password", p, who); err != nil {
		t.Fatal(err)
	}
	r := f.last()
	if str(r.body["email"]) != "a@b.co" || str(r.body["code_challenge"]) != p.Challenge || r.query.Get("redirect_to") == "" {
		t.Errorf("recover = %v %v", keys(r.body), r.query)
	}

	if err := c.ResendSignup(context.Background(), "a@b.co", "http://x/auth/callback", p, who); err != nil {
		t.Fatal(err)
	}
	if r := f.last(); str(r.body["type"]) != "signup" || str(r.body["code_challenge"]) != p.Challenge {
		t.Errorf("resend = %v", keys(r.body))
	}
}

func TestExchangeCodeAndVerifyTokenHash(t *testing.T) {
	c, f := newFakeAuth(t)
	access := jwt(map[string]any{"exp": 2000000000})
	f.on("POST /auth/v1/token", 200, map[string]any{"access_token": access, "refresh_token": "r"})
	f.on("POST /auth/v1/verify", 200, map[string]any{"access_token": access, "refresh_token": "r2", "expires_at": 1999})

	tok, err := c.ExchangeCode(context.Background(), "the-code", "the-verifier", who)
	if err != nil || tok.AccessToken != access {
		t.Fatalf("exchange = %+v %v", tok, err)
	}
	r := f.last()
	if r.query.Get("grant_type") != "pkce" || str(r.body["auth_code"]) != "the-code" || str(r.body["code_verifier"]) != "the-verifier" {
		t.Errorf("exchange request = %v %v", r.query, keys(r.body))
	}

	tok, err = c.VerifyTokenHash(context.Background(), "abc123", "magiclink", who)
	if err != nil || tok.RefreshToken != "r2" || tok.ExpiresAt != 1999 {
		t.Fatalf("verify = %+v %v", tok, err)
	}
	if r := f.last(); str(r.body["token_hash"]) != "abc123" || str(r.body["type"]) != "magiclink" || r.header.Get("Authorization") != "" {
		t.Errorf("verify request = %v", keys(r.body))
	}

	// A reply without tokens is not a session.
	f.on("POST /auth/v1/verify", 200, map[string]any{"user": map[string]any{"id": "u1"}})
	if _, err := c.VerifyTokenHash(context.Background(), "abc123", "invite", who); err == nil {
		t.Error("a tokenless verify counted as signed in")
	}
}

func TestPKCEIsRFC7636S256(t *testing.T) {
	// sha256("abc") is the FIPS 180-2 vector ba7816bf...15ad; this is it as unpadded base64url.
	if got := PKCEChallenge("abc"); got != "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0" {
		t.Errorf("challenge = %q", got)
	}
	a, b := NewPKCE(), NewPKCE()
	if len(a.Verifier) != 112 || a.Verifier == b.Verifier || a.Challenge != PKCEChallenge(a.Verifier) {
		t.Errorf("NewPKCE = %+v", a)
	}
}

func TestAuthorizeURL(t *testing.T) {
	c := New("https://proj.supabase.co", "anon-key", nil)
	p := PKCE{Verifier: "v", Challenge: "ch"}
	u, err := url.Parse(c.AuthorizeURL("google", "https://site/auth/callback?next=%2Fdashboard&provider=google", p))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if u.Host != "proj.supabase.co" || u.Path != "/auth/v1/authorize" || q.Get("provider") != "google" ||
		q.Get("redirect_to") != "https://site/auth/callback?next=%2Fdashboard&provider=google" ||
		q.Get("code_challenge") != "ch" || q.Get("code_challenge_method") != "s256" || q.Has("skip_http_redirect") {
		t.Errorf("authorize URL = %s", u)
	}
	if strings.Contains(u.String(), "=v&") || strings.HasSuffix(u.String(), "=v") {
		t.Error("the verifier left the server")
	}
}

func TestMFAEnrollChallengeVerify(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("POST /auth/v1/factors", 200, map[string]any{"id": "0195a2c0-1a00-7000-8000-00000000f001", "type": "totp", "totp": map[string]any{"qr_code": "<svg/>", "secret": "SECRET", "uri": "otpauth://x"}})
	f.on("POST /auth/v1/factors/0195a2c0-1a00-7000-8000-00000000f001/challenge", 200, map[string]any{"id": "ch1"})
	aal2 := jwt(map[string]any{"exp": 2000000000, "aal": "aal2"})
	f.on("POST /auth/v1/factors/0195a2c0-1a00-7000-8000-00000000f001/verify", 200, map[string]any{"access_token": aal2, "refresh_token": "r", "expires_in": 3600})
	f.on("DELETE /auth/v1/factors/0195a2c0-1a00-7000-8000-00000000f001", 200, map[string]any{"id": "0195a2c0-1a00-7000-8000-00000000f001"})

	e, err := c.EnrollTOTP(context.Background(), "tok", "Authenticator · 2026-11-07", who)
	if err != nil || e.ID != "0195a2c0-1a00-7000-8000-00000000f001" || e.TOTP.Secret != "SECRET" || e.TOTP.QRCode != "<svg/>" {
		t.Fatalf("enroll = %+v %v", e, err)
	}
	if r := f.last(); str(r.body["factor_type"]) != "totp" || r.header.Get("Authorization") != "Bearer tok" {
		t.Errorf("enroll request = %v", keys(r.body))
	}

	tok, err := c.ChallengeAndVerify(context.Background(), "tok", "0195a2c0-1a00-7000-8000-00000000f001", "123456", who)
	if err != nil || tok.AccessToken != aal2 || tok.ExpiresAt != 2000000000 {
		t.Fatalf("verify = %+v %v", tok, err)
	}
	if r := f.last(); str(r.body["challenge_id"]) != "ch1" || str(r.body["code"]) != "123456" {
		t.Errorf("verify request = %v", keys(r.body))
	}

	f.on("POST /auth/v1/factors/0195a2c0-1a00-7000-8000-00000000f001/verify", 422, map[string]any{"code": "mfa_verification_failed"})
	if _, err := c.ChallengeAndVerify(context.Background(), "tok", "0195a2c0-1a00-7000-8000-00000000f001", "000000", who); AsAuthError(err).Code != "mfa_verification_failed" {
		t.Errorf("wrong code = %v", err)
	}

	if err := c.Unenroll(context.Background(), "tok", "0195a2c0-1a00-7000-8000-00000000f001", who); err != nil {
		t.Error(err)
	}
	// A factor id is a UUID, never a path: "." and ".." survive url.PathEscape and climbed
	// out of /factors/ through Kong.
	before := len(f.seen)
	for _, id := range []string{"..", ".", "../user", "x/../../verify", ""} {
		if err := c.Unenroll(context.Background(), "tok", id, who); err == nil {
			t.Errorf("Unenroll(%q) was sent", id)
		}
		if _, err := c.ChallengeAndVerify(context.Background(), "tok", id, "123456", who); err == nil {
			t.Errorf("ChallengeAndVerify(%q) was sent", id)
		}
	}
	if len(f.seen) != before {
		t.Errorf("%d requests left for bad factor ids", len(f.seen)-before)
	}
}

func TestCurrentUserReadsConfirmation(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("GET /auth/v1/user", 200, map[string]any{"id": "u1", "email": "a@b.co", "email_confirmed_at": "2026-11-07T00:00:00Z"})
	u, err := c.CurrentUser(context.Background(), "tok", who)
	if err != nil || !u.Confirmed() || u.Email != "a@b.co" {
		t.Errorf("user = %+v %v", u, err)
	}
	f.on("GET /auth/v1/user", 200, map[string]any{"id": "u1", "email_confirmed_at": nil})
	if u, _ := c.CurrentUser(context.Background(), "tok", who); u.Confirmed() {
		t.Error("null email_confirmed_at read as confirmed")
	}
	f.on("GET /auth/v1/user", 401, map[string]any{"code": "bad_jwt"})
	if _, err := c.CurrentUser(context.Background(), "tok", who); !errors.As(err, new(*AuthError)) {
		t.Errorf("401 = %v", err)
	}
}

func TestLinkIdentityURL(t *testing.T) {
	c, f := newFakeAuth(t)
	f.on("GET /auth/v1/user/identities/authorize", 200, map[string]any{"url": "https://accounts.google.com/o/oauth2/auth?x=1"})
	u, err := c.LinkIdentityURL(context.Background(), "tok", "google", "http://x/auth/callback?next=%2Fdashboard", NewPKCE(), who)
	if err != nil || !strings.HasPrefix(u, "https://accounts.google.com/") {
		t.Fatalf("link = %q %v", u, err)
	}
	r := f.last()
	if r.query.Get("skip_http_redirect") != "true" || r.query.Get("provider") != "google" || r.header.Get("Authorization") != "Bearer tok" {
		t.Errorf("link request = %v", r.query)
	}
}
