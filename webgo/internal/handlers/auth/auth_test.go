package auth_test

import (
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
)

const (
	jordan   = "jordan.hayes@example.com"
	jordanPW = "GreenPastures1"
)

// --- 2.1.1 Login ---------------------------------------------------------------------------

func TestLoginErrorsAreMappedNeverEnumerated(t *testing.T) {
	hn := newHarness(t, opts{})
	c := hn.client()
	cases := []struct {
		status int
		reply  map[string]any
		want   string
		href   string
	}{
		{400, map[string]any{"code": "invalid_credentials"}, "That email and password don't match.", `href="/forgot-password"`},
		{400, map[string]any{"code": "email_not_confirmed"}, "Almost there — check your email for the verification link.", `href="/verify-email"`},
		{400, map[string]any{"code": "user_banned"}, "This account is on hold.", `href="mailto:info@adventures.story-tail.com"`},
		{429, map[string]any{"code": "over_request_rate_limit"}, "That's a few too many tries.", ""},
		{503, map[string]any{}, "We couldn't reach Story-Tail.", ""},
	}
	for _, tc := range cases {
		hn.f.on("POST /auth/v1/token", tc.status, tc.reply)
		rec := c.post("/login", url.Values{"email": {" " + jordan + " "}, "password": {"nope"}, "next": {"/trips/1"}})
		has(t, rec, esc(tc.want), `value="/trips/1"`)
		if tc.href != "" {
			has(t, rec, tc.href)
		}
		hasNot(t, rec, `value="nope"`)
		if len(c.cookies) != 0 {
			t.Errorf("a refused sign-in set %v", c.cookies)
		}
	}
	// The address went to GoTrue trimmed, with the browser's user agent and address.
	calls := hn.f.seen("POST /auth/v1/token")
	last := calls[len(calls)-1]
	if last.Body["email"] != jordan || last.Header.Get("User-Agent") != "Mozilla/5.0 (test browser)" || last.Header.Get("X-Forwarded-For") != "203.0.113.7" {
		t.Errorf("GoTrue saw %v ua=%q xff=%q", last.Body["email"], last.Header.Get("User-Agent"), last.Header.Get("X-Forwarded-For"))
	}
}

func TestLoginValidatesBeforeCallingGoTrue(t *testing.T) {
	hn := newHarness(t, opts{})
	rec := hn.client().post("/login", url.Values{"email": {"nope"}, "password": {""}})
	if rec.Code != 422 {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("That doesn't look like an email address"), esc("Don't forget your password"), `aria-invalid="true"`, `aria-describedby="email-error"`)
	if len(hn.f.seen("POST /auth/v1/token")) != 0 {
		t.Error("GoTrue was called for an invalid form")
	}
}

func TestLoginSucceedsToASafeNext(t *testing.T) {
	hn := newHarness(t, opts{})
	for next, want := range map[string]string{"/trips/9?tab=pay": "/trips/9?tab=pay", "//evil.example": "/dashboard", `/\evil.example`: "/dashboard", "https://evil.example": "/dashboard"} {
		c := hn.client()
		hn.f.on("POST /auth/v1/token", 200, map[string]any{"access_token": token("u1", "aal1"), "refresh_token": "r1"})
		where(t, c.post("/login", url.Values{"email": {jordan}, "password": {jordanPW}, "next": {next}}), 303, want)
		if c.cookies["sta-session"] == nil || c.cookies["sta-authed"] == nil {
			t.Errorf("cookies %v", c.cookies)
		}
	}
}

func TestLoginShowsOnlyKnownErrorParams(t *testing.T) {
	hn := newHarness(t, opts{})
	has(t, hn.client().get("/login?error=unknown"), "Something went sideways on our end.")
	rec := hn.client().get("/login?error=%3Cscript%3Ealert(1)%3C/script%3E")
	hasNot(t, rec, "alert(1)", `class="alert alert-error"`)
}

func TestSocialButtonsFollowConfigAndOwnTheirForm(t *testing.T) {
	off := newHarness(t, opts{}).client().get("/login")
	has(t, off, `disabled=""`, esc("Social sign-in isn't switched on yet"))
	hasNot(t, off, `value="google"`)
	on := newHarness(t, opts{google: true}).client().get("/login?next=/trips/2")
	has(t, on, `form="auth-oauth" name="provider" value="google"`, `id="auth-oauth"`)
	if strings.Count(on.Body.String(), `value="/trips/2"`) != 2 {
		t.Error("the OAuth form does not carry next")
	}
}

// --- 2.1.2 Registration --------------------------------------------------------------------

func registerForm(email string) url.Values {
	return url.Values{"firstName": {" Jordan "}, "lastName": {"Hayes"}, "email": {email}, "password": {jordanPW},
		"confirmPassword": {jordanPW}, "terms": {"on"}, "next": {"/trips/3"}, "agent_id": {"someone-elses"}}
}

func TestRegisterSendsOnlyTheNamesAsMetadata(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/signup", 200, map[string]any{"id": "u1"})
	c := hn.client()
	rec := c.post("/register", registerForm(jordan))
	has(t, rec, "Check your email", ">"+jordan+"<")
	call := hn.f.seen("POST /auth/v1/signup")[0]
	data, _ := call.Body["data"].(map[string]any)
	if len(data) != 2 || data["first_name"] != "Jordan" || data["last_name"] != "Hayes" {
		t.Errorf("metadata = %v", data)
	}
	if got := call.Query.Get("redirect_to"); got != "http://localhost:8080/auth/callback?next=%2Ftrips%2F3" {
		t.Errorf("redirect_to = %q", got)
	}
	// The verifier stays in this browser; only its challenge went to GoTrue.
	v := c.cookies["sta-pkce"]
	if v == nil || !v.HttpOnly || call.Body["code_challenge"] != s256(v.Value) || strings.Contains(rec.Body.String(), v.Value) {
		t.Errorf("PKCE cookie %+v, challenge %v", v, call.Body["code_challenge"])
	}
}

func s256(v string) string {
	sum := sha256.Sum256([]byte(v))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func TestRegisterATakenAddressLooksLikeSuccess(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/signup", 200, map[string]any{"id": "u1"})
	fresh := hn.client().post("/register", registerForm(jordan))
	hn.f.on("POST /auth/v1/signup", 422, map[string]any{"code": "user_already_exists"})
	taken := hn.client().post("/register", registerForm(jordan))
	if fresh.Code != taken.Code || fresh.Body.String() != taken.Body.String() {
		t.Errorf("taken differs from fresh: %d vs %d", taken.Code, fresh.Code)
	}
	if (fresh.Header().Get("Set-Cookie") == "") != (taken.Header().Get("Set-Cookie") == "") {
		t.Error("the cookies tell a taken address from a new one")
	}
}

func TestRegisterOutcomes(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/signup", 422, map[string]any{"code": "weak_password", "weak_password": map[string]any{"reasons": []string{"pwned"}}})
	rec := hn.client().post("/register", registerForm(jordan))
	has(t, rec, `id="password-error"`, "That password is a little too easy to guess.", `value=" Jordan "`)
	hasNot(t, rec, jordanPW)

	hn.f.on("POST /auth/v1/signup", 400, map[string]any{})
	rec = hn.client().post("/register", registerForm(jordan))
	has(t, rec, "Something went sideways on our end.")
	hasNot(t, rec, "Reset your password") // sign-in vocabulary has no place on a sign-up

	hn.f.on("POST /auth/v1/signup", 200, map[string]any{"access_token": token("u2", "aal1"), "refresh_token": "r2"})
	c := hn.client()
	where(t, c.post("/register", registerForm(jordan)), 303, "/trips/3")
	if c.cookies["sta-session"] == nil || c.cookies["sta-pkce"] != nil {
		t.Errorf("confirmations-off sign-up cookies %v", c.cookies)
	}
}

func TestRegisterValidation(t *testing.T) {
	hn := newHarness(t, opts{})
	f := registerForm("nope")
	f.Set("confirmPassword", "Different1Pw")
	f.Del("terms")
	rec := hn.client().post("/register", f)
	has(t, rec, esc("That doesn't look like an email address"), esc("Those two don't match yet"),
		"Check the box to agree to our terms", `id="confirmPassword-error"`, `aria-describedby="confirmPassword-error"`)
	if len(hn.f.seen("POST /auth/v1/signup")) != 0 {
		t.Error("GoTrue was called")
	}
}

// --- 2.1.4 / 2.1.5 Forgot and reset --------------------------------------------------------

func TestForgotAnswersTheSameForEveryAddress(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/recover", 200, map[string]any{})
	ok := hn.client().post("/forgot-password", url.Values{"email": {jordan}})
	hn.f.on("POST /auth/v1/recover", 400, map[string]any{"code": "email_address_invalid"})
	refused := hn.client().post("/forgot-password", url.Values{"email": {jordan}})
	if ok.Code != 200 || ok.Body.String() != refused.Body.String() {
		t.Errorf("answers differ: %d / %d", ok.Code, refused.Code)
	}
	has(t, ok, "Check your inbox")
	if got := hn.f.seen("POST /auth/v1/recover")[0].Query.Get("redirect_to"); got != "http://localhost:8080/auth/callback?next=%2Freset-password" {
		t.Errorf("redirect_to = %q", got)
	}
	hn.f.on("POST /auth/v1/recover", 429, map[string]any{"code": "over_email_send_rate_limit"})
	limited := hn.client().post("/forgot-password", url.Values{"email": {jordan}})
	has(t, limited, esc("That's a few too many tries."))
	if limited.Header().Get("Set-Cookie") != "" {
		t.Error("a refused request replaced the browser's verifier")
	}
}

func TestResetUsesTheSessionNeverTheForm(t *testing.T) {
	hn := newHarness(t, opts{})
	signedOut := hn.client()
	has(t, signedOut.get("/reset-password"), "That link has expired", "Send a new one")
	rec := signedOut.post("/reset-password", url.Values{"password": {jordanPW}, "confirmPassword": {jordanPW}})
	has(t, rec, "That link has expired — reset links are only good for an hour.")
	if len(hn.f.seen("PUT /auth/v1/user")) != 0 {
		t.Fatal("a password changed with no session")
	}

	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)
	hn.f.on("PUT /auth/v1/user", 200, map[string]any{"id": "u1"})
	where(t, c.post("/reset-password", url.Values{"password": {"StillWaters22"}, "confirmPassword": {"StillWaters22"}, "email": {"victim@example.com"}}), 303, "/dashboard")
	put := hn.f.seen("PUT /auth/v1/user")[0]
	if put.Header.Get("Authorization") != "Bearer "+tok || len(put.Body) != 1 || put.Body["password"] != "StillWaters22" {
		t.Errorf("update = %v %v", put.Header.Get("Authorization"), put.Body)
	}
}

// The lockout Next shipped: an account with a factor gets an aal1 recovery session, and GoTrue
// refuses the change until the factor is answered.
func TestResetSendsAHalfAssuredSessionThroughTheChallenge(t *testing.T) {
	hn := newHarness(t, opts{})
	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan, Factors: []map[string]any{{"id": "f1", "factor_type": "totp", "status": "verified"}}})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)
	where(t, c.get("/reset-password"), 303, "/login/mfa?next=%2Freset-password")
	where(t, c.post("/reset-password", url.Values{"password": {"StillWaters22"}, "confirmPassword": {"StillWaters22"}}), 303, "/login/mfa?next=%2Freset-password")
	if len(hn.f.seen("PUT /auth/v1/user")) != 0 {
		t.Error("tried the change without the factor")
	}
}

// --- /auth/callback, /auth/oauth -----------------------------------------------------------

func TestCallbackNeedsThisBrowsersVerifier(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/token", 200, map[string]any{"access_token": token("u1", "aal1"), "refresh_token": "r1"})
	where(t, hn.client().get("/auth/callback?code=abc&next=/trips/4"), 303, "/login")
	if len(hn.f.seen("POST /auth/v1/token")) != 0 {
		t.Error("exchanged a code with no verifier")
	}

	hn.f.on("POST /auth/v1/recover", 200, map[string]any{})
	c := hn.client()
	c.post("/forgot-password", url.Values{"email": {jordan}})
	verifier := c.cookies["sta-pkce"].Value
	where(t, c.get("/auth/callback?code=abc&next=//evil.example"), 303, "/dashboard")
	ex := hn.f.seen("POST /auth/v1/token")
	if len(ex) != 1 || ex[0].Query.Get("grant_type") != "pkce" || ex[0].Body["code_verifier"] != verifier || ex[0].Body["auth_code"] != "abc" {
		t.Errorf("exchange = %+v", ex)
	}
	if c.cookies["sta-session"] == nil || c.cookies["sta-pkce"] != nil {
		t.Errorf("after the exchange: %v", c.cookies)
	}
	// Spent: the same code again is a sign-in page.
	where(t, c.get("/auth/callback?code=abc"), 303, "/login")
}

func TestCallbackCollisionsGoToLinkAccount(t *testing.T) {
	hn := newHarness(t, opts{})
	where(t, hn.client().get("/auth/callback?error_code=identity_already_exists&provider=google"), 303, "/link-account?provider=google")
	where(t, hn.client().get("/auth/callback?error_code=identity_already_exists&provider=myspace"), 303, "/login")
	where(t, hn.client().get("/auth/callback?error_description=Hello+from+evil"), 303, "/login")
}

func TestOAuthStart(t *testing.T) {
	off := newHarness(t, opts{})
	rec := off.client().post("/auth/oauth", url.Values{"provider": {"google"}})
	if rec.Code != 204 || rec.Header().Get("Set-Cookie") != "" {
		t.Errorf("provider off = %d", rec.Code)
	}
	hn := newHarness(t, opts{google: true})
	c := hn.client()
	rec = c.post("/auth/oauth", url.Values{"provider": {"google"}, "next": {"/trips/5"}})
	u, _ := url.Parse(rec.Header().Get("Location"))
	q := u.Query()
	v := c.cookies["sta-pkce"]
	if rec.Code != 303 || u.Path != "/auth/v1/authorize" || q.Get("provider") != "google" || v == nil ||
		q.Get("code_challenge") != s256(v.Value) || q.Get("redirect_to") != "http://localhost:8080/auth/callback?next=%2Ftrips%2F5&provider=google" {
		t.Errorf("oauth start = %d %s", rec.Code, u)
	}
	if strings.Contains(u.String(), v.Value) {
		t.Error("the verifier left the server")
	}
	if rec := c.post("/auth/oauth", url.Values{"provider": {"facebook"}}); rec.Code != 204 {
		t.Errorf("unknown provider = %d", rec.Code)
	}
}

// --- /auth/confirm ---------------------------------------------------------------------------

func TestConfirmNeverSpendsTheLinkOnAGet(t *testing.T) {
	hn := newHarness(t, opts{})
	hash := strings.Repeat("ab", 28)
	hn.f.on("POST /auth/v1/verify", 200, map[string]any{"access_token": token("u1", "aal1"), "refresh_token": "r1"})
	for i := 0; i < 3; i++ { // a mail scanner, twice, then the person
		rec := hn.client().get("/auth/confirm?token_hash=" + hash + "&type=magiclink&next=/trips/6")
		has(t, rec, "Sign me in", `value="`+hash+`"`, `value="/trips/6"`)
		if rec.Header().Get("Referrer-Policy") != "no-referrer" || !strings.Contains(rec.Header().Get("X-Robots-Tag"), "nofollow") {
			t.Errorf("headers %v", rec.Header())
		}
	}
	if len(hn.f.seen("POST /auth/v1/verify")) != 0 {
		t.Fatal("a GET spent the link")
	}
	c := hn.client()
	where(t, c.post("/auth/confirm", url.Values{"token_hash": {hash}, "type": {"magiclink"}, "next": {"/trips/6"}}), 303, "/trips/6")
	if v := hn.f.seen("POST /auth/v1/verify"); len(v) != 1 || v[0].Body["token_hash"] != hash || c.cookies["sta-session"] == nil {
		t.Errorf("verify = %v", v)
	}

	// Recovery defaults to the reset form; a refused or malformed link to the failed page.
	where(t, hn.client().post("/auth/confirm", url.Values{"token_hash": {hash}, "type": {"recovery"}, "next": {"https://evil.example"}}), 303, "/reset-password")
	where(t, hn.client().post("/auth/confirm", url.Values{"token_hash": {"XYZ"}, "type": {"magiclink"}}), 303, "/auth/confirm?failed=1")
	where(t, hn.client().post("/auth/confirm", url.Values{"token_hash": {hash}, "type": {"signup"}}), 303, "/auth/confirm?failed=1")
	hn.f.on("POST /auth/v1/verify", 403, map[string]any{"code": "otp_expired"})
	where(t, hn.client().post("/auth/confirm", url.Values{"token_hash": {hash}, "type": {"invite"}}), 303, "/auth/confirm?failed=1")
	has(t, hn.client().get("/auth/confirm?failed=1"), "That link has already been used or has run out")
	has(t, hn.client().get("/auth/confirm?token_hash=nope&type=invite"), esc("This link isn't complete"))
}

// --- 2.1.6 / 2.1.7 MFA ---------------------------------------------------------------------

func TestMFAChallenge(t *testing.T) {
	hn := newHarness(t, opts{})
	aal1, aal2 := token("u1", "aal1"), token("u1", "aal2")
	verified := []map[string]any{{"id": "f-unverified", "factor_type": "totp", "status": "unverified"}, {"id": "f1", "factor_type": "totp", "status": "verified"}}
	hn.f.user(aal1, fakeUser{ID: "u1", Email: jordan, Factors: verified})
	hn.f.user(aal2, fakeUser{ID: "u1", Email: jordan, Factors: verified})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, aal1)
	where(t, c.get("/mfa/setup"), 303, "/login/mfa?next=%2Fmfa%2Fsetup")
	has(t, c.get("/login/mfa?next=/trips/7"), `value="/trips/7"`, "Lost your authenticator?")

	hn.f.on("POST /auth/v1/factors/f1/challenge", 200, map[string]any{"id": "ch1"})
	hn.f.on("POST /auth/v1/factors/f1/verify", 422, map[string]any{"code": "mfa_verification_failed"})
	rec := c.post("/login/mfa", url.Values{"code": {"123 456"}, "next": {"/trips/7"}, "factorId": {"f-unverified"}})
	has(t, rec, esc("That code didn't match."))
	hasNot(t, rec, "123 456", "123456")
	if v := hn.f.seen("POST /auth/v1/factors/f1/verify"); len(v) != 1 || v[0].Body["code"] != "123456" || v[0].Body["challenge_id"] != "ch1" {
		t.Errorf("verify = %v", v)
	}

	hn.f.on("POST /auth/v1/factors/f1/verify", 429, map[string]any{"code": "over_request_rate_limit"})
	has(t, c.post("/login/mfa", url.Values{"code": {"123456"}}), esc("That's a few too many tries."))

	// THE LOCKOUT: the aal2 tokens replace the cookie, so the gate lets them through.
	hn.f.on("POST /auth/v1/factors/f1/verify", 200, map[string]any{"access_token": aal2, "refresh_token": "r2", "expires_in": 3600})
	where(t, c.post("/login/mfa", url.Values{"code": {"654321"}, "next": {"/mfa/setup"}}), 303, "/mfa/setup")
	where(t, c.get("/mfa/setup"), 303, "/dashboard") // a verified factor: nothing to set up
	where(t, c.get("/login/mfa"), 303, "/dashboard")
}

func TestMFASetupEnrollsOnPostAndServesTheQRAsAnImage(t *testing.T) {
	hn := newHarness(t, opts{})
	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan, Factors: []map[string]any{{"id": "old", "factor_type": "totp", "status": "unverified"}}})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)

	rec := c.get("/mfa/setup?next=/trips/8")
	has(t, rec, "Show my setup code", "Not right now", `href="/trips/8"`)
	if len(hn.f.seen("POST /auth/v1/factors")) != 0 {
		t.Fatal("a GET enrolled a factor")
	}

	hn.f.on("DELETE /auth/v1/factors/old", 200, map[string]any{})
	hn.f.on("POST /auth/v1/factors", 200, map[string]any{"id": "new", "type": "totp", "totp": map[string]any{"qr_code": `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`, "secret": "JBSWY3DPEHPK3PXP", "uri": "otpauth://x"}})
	where(t, c.post("/mfa/setup", url.Values{"next": {"/trips/8"}}), 303, "/mfa/setup?next=%2Ftrips%2F8")
	if len(hn.f.seen("DELETE /auth/v1/factors/old")) != 1 {
		t.Error("the abandoned factor was not swept")
	}

	// GoTrue now lists the new factor, unverified.
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan, Factors: []map[string]any{{"id": "new", "factor_type": "totp", "status": "unverified"}}})
	rec = c.get("/mfa/setup?next=/trips/8")
	has(t, rec, "JBSWY3DPEHPK3PXP", `src="/mfa/setup/qr"`)
	hasNot(t, rec, "<rect", "data:image")
	qr := c.get("/mfa/setup/qr")
	if qr.Code != 200 || qr.Header().Get("Content-Type") != "image/svg+xml" || qr.Header().Get("Cache-Control") != "no-store" ||
		!strings.Contains(qr.Header().Get("Content-Security-Policy"), "sandbox") || !strings.Contains(qr.Body.String(), "<rect/>") {
		t.Errorf("qr = %d %v", qr.Code, qr.Header())
	}
	// Another user's browser gets nothing.
	other := token("u2", "aal1")
	hn.f.user(other, fakeUser{ID: "u2", Email: "other@example.com"})
	oc := hn.client()
	oc.signIn(t, "other@example.com", jordanPW, other)
	if rec := oc.get("/mfa/setup/qr"); rec.Code != 404 {
		t.Errorf("another user's QR = %d", rec.Code)
	}

	hn.f.on("POST /auth/v1/factors/new/challenge", 200, map[string]any{"id": "ch"})
	hn.f.on("POST /auth/v1/factors/new/verify", 422, map[string]any{"code": "mfa_verification_failed"})
	rec = c.post("/mfa/setup/verify", url.Values{"code": {"111111"}, "next": {"/trips/8"}, "factorId": {"someone-elses"}})
	has(t, rec, esc("That code didn't match."), "JBSWY3DPEHPK3PXP") // the same QR, still there
	if len(hn.f.seen("POST /auth/v1/factors/someone-elses/challenge")) != 0 {
		t.Error("verified a factor named by the form")
	}

	aal2 := token("u1", "aal2")
	hn.f.on("POST /auth/v1/factors/new/verify", 200, map[string]any{"access_token": aal2, "refresh_token": "r9"})
	where(t, c.post("/mfa/setup/verify", url.Values{"code": {"222222"}, "next": {"/trips/8"}}), 303, "/trips/8")
	hn.f.user(aal2, fakeUser{ID: "u1", Email: jordan, Factors: []map[string]any{{"id": "new", "factor_type": "totp", "status": "verified"}}})
	where(t, c.get("/mfa/setup?next=/trips/8"), 303, "/trips/8")
	if rec := c.get("/mfa/setup/qr"); rec.Code != 404 {
		t.Errorf("the QR outlived the enrollment: %d", rec.Code)
	}
}

func TestMFASetupIsRequiredForAnAdvisor(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.role = "agent"
	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)
	rec := c.get("/mfa/setup?next=/agent")
	has(t, rec, "The advisor side asks for a code")
	hasNot(t, rec, "Not right now", "storing payment cards")
}

// --- 2.1.3 Email verification --------------------------------------------------------------

func TestVerifyEmailTakesTheAddressFromTheSession(t *testing.T) {
	hn := newHarness(t, opts{})
	hn.f.on("POST /auth/v1/resend", 200, map[string]any{})
	anon := hn.client()
	has(t, anon.get("/verify-email"), `id="email"`, "Use a different address")
	has(t, anon.post("/verify-email", url.Values{"email": {jordan}}), "Sent — it should land within a minute.")
	if r := hn.f.seen("POST /auth/v1/resend"); len(r) != 1 || r[0].Body["email"] != jordan || r[0].Body["type"] != "signup" {
		t.Errorf("anonymous resend = %v", r)
	}

	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: "mine@example.com"})
	c := hn.client()
	c.signIn(t, "mine@example.com", jordanPW, tok)
	rec := c.get("/verify-email")
	has(t, rec, ">mine@example.com<", "Need to update your email?", "Sign out")
	hasNot(t, rec, `id="email"`)
	c.post("/verify-email", url.Values{"email": {"stranger@example.com"}})
	if r := hn.f.seen("POST /auth/v1/resend"); r[len(r)-1].Body["email"] != "mine@example.com" {
		t.Errorf("a signed-in resend went to %v", r[len(r)-1].Body["email"])
	}

	hn.f.on("PUT /auth/v1/user", 200, map[string]any{"id": "u1"})
	has(t, c.post("/verify-email/change", url.Values{"email": {"new@example.com"}}), "Check both inboxes")
	if p := hn.f.seen("PUT /auth/v1/user"); len(p) != 1 || p[0].Body["email"] != "new@example.com" || p[0].Header.Get("Authorization") != "Bearer "+tok {
		t.Errorf("change = %v", p)
	}
	// Without a session the change form is an account-takeover form: refused.
	where(t, hn.client().post("/verify-email/change", url.Values{"email": {"new@example.com"}}), 303, "/login?next=%2Fverify-email")

	confirmed := "2026-11-07T00:00:00Z"
	hn.f.user(tok, fakeUser{ID: "u1", Email: "mine@example.com", Confirmed: &confirmed})
	where(t, c.get("/verify-email"), 303, "/dashboard")
}

// --- 2.1.8 Link account --------------------------------------------------------------------

func TestLinkAccountSignsInBeforeItLinks(t *testing.T) {
	hn := newHarness(t, opts{})
	if rec := hn.client().get("/link-account?provider=myspace"); rec.Code != 404 {
		t.Errorf("unknown provider = %d", rec.Code)
	}
	has(t, hn.client().get("/link-account?provider=apple"), "Sign in &amp; link Apple")

	hn.f.on("POST /auth/v1/token", 400, map[string]any{"code": "invalid_credentials"})
	rec := hn.client().post("/link-account", url.Values{"provider": {"google"}, "email": {jordan}, "password": {"wrong"}})
	has(t, rec, esc("That email and password don't match."))
	if len(hn.f.seen("GET /auth/v1/user/identities/authorize")) != 0 {
		t.Fatal("linked on a wrong password")
	}

	tok := token("u1", "aal1")
	hn.f.on("POST /auth/v1/token", 200, map[string]any{"access_token": tok, "refresh_token": "r1"})
	hn.f.on("GET /auth/v1/user/identities/authorize", 200, map[string]any{"url": "https://accounts.google.com/o/oauth2/auth?x=1"})
	c := hn.client()
	where(t, c.post("/link-account", url.Values{"provider": {"google"}, "email": {jordan}, "password": {jordanPW}}), 303, "https://accounts.google.com/o/oauth2/auth?x=1")
	if l := hn.f.seen("GET /auth/v1/user/identities/authorize"); len(l) != 1 || l[0].Header.Get("Authorization") != "Bearer "+tok {
		t.Errorf("link = %v", l)
	}
	if c.cookies["sta-session"] == nil || c.cookies["sta-pkce"] == nil {
		t.Errorf("cookies %v", c.cookies)
	}

	// A provider URL that is not https never becomes a redirect.
	hn.f.on("GET /auth/v1/user/identities/authorize", 200, map[string]any{"url": "javascript:alert(1)"})
	where(t, hn.client().post("/link-account", url.Values{"provider": {"google"}, "email": {jordan}, "password": {jordanPW}}), 303, "/dashboard")
}

// --- Sign-out and the chrome endpoint ------------------------------------------------------

func TestSignOutStopsPushThenEndsTheSession(t *testing.T) {
	hn := newHarness(t, opts{})
	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan})
	hn.f.on("POST /functions/v1/push-device", 200, map[string]any{"ok": true})
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)
	where(t, c.post("/account/sign-out", url.Values{"push_endpoint": {"https://fcm.googleapis.com/fcm/send/abc"}}), 303, "/login")
	p := hn.f.seen("POST /functions/v1/push-device")
	if len(p) != 1 || p[0].Body["op"] != "unregister" || p[0].Body["endpoint"] != "https://fcm.googleapis.com/fcm/send/abc" || p[0].Header.Get("Authorization") != "Bearer "+tok {
		t.Errorf("push-device = %v", p)
	}
	if len(hn.f.seen("POST /auth/v1/logout")) != 1 || len(c.cookies) != 0 {
		t.Errorf("logout calls %d, cookies %v", len(hn.f.seen("POST /auth/v1/logout")), c.cookies)
	}
	// Signed out, or a junk endpoint: no call, and still a clean sign-out.
	where(t, hn.client().post("/account/sign-out", url.Values{"push_endpoint": {"https://fcm.googleapis.com/x"}}), 303, "/login")
	c.signIn(t, jordan, jordanPW, tok)
	c.post("/account/sign-out", url.Values{"push_endpoint": {"javascript:alert(1)"}})
	if len(hn.f.seen("POST /functions/v1/push-device")) != 1 {
		t.Error("push-device called without a session or with a junk endpoint")
	}
}

func TestChromeSaysTwoLettersAndNothingMore(t *testing.T) {
	hn := newHarness(t, opts{})
	rec := hn.client().get("/api/account/chrome")
	if rec.Body.String() != "{\"signedIn\":false}\n" || len(hn.f.calls) != 0 {
		t.Errorf("no cookie = %q, %d upstream calls", rec.Body.String(), len(hn.f.calls))
	}
	tok := token("u1", "aal1")
	hn.f.user(tok, fakeUser{ID: "u1", Email: jordan})
	hn.f.clientRows = []map[string]any{{"first_name": "Margaret", "last_name": "Smith", "preferred_name": "Peggy"}}
	c := hn.client()
	c.signIn(t, jordan, jordanPW, tok)
	rec = c.get("/api/account/chrome")
	if rec.Body.String() != "{\"signedIn\":true,\"initials\":\"PS\"}\n" || rec.Header().Get("Cache-Control") != "private, max-age=60" {
		t.Errorf("signed in = %q %q", rec.Body.String(), rec.Header().Get("Cache-Control"))
	}
	hn.f.clientRows = []map[string]any{{"first_name": "New", "last_name": "Traveler", "preferred_name": nil}}
	if rec := c.get("/api/account/chrome"); rec.Body.String() != "{\"signedIn\":true,\"initials\":\"\"}\n" {
		t.Errorf("placeholder = %q", rec.Body.String())
	}
}

// --- Without Supabase (development) --------------------------------------------------------

func TestWithoutSupabaseTheFormsSayNotReady(t *testing.T) {
	hn := newHarness(t, opts{noSupabase: true})
	rec := hn.client().post("/login", url.Values{"email": {jordan}, "password": {jordanPW}})
	if rec.Code != 503 {
		t.Errorf("status %d", rec.Code)
	}
	has(t, rec, esc("We're not quite ready to sign you in yet"))
	has(t, hn.client().get("/reset-password"), "Set a new password") // the design is still worth seeing
}

func TestEveryAuthPageRendersAndIsNeverCached(t *testing.T) {
	hn := newHarness(t, opts{env: config.Production})
	for _, path := range []string{"/login", "/register", "/forgot-password", "/reset-password", "/verify-email",
		"/link-account?provider=google", "/auth/confirm", "/auth/confirm?failed=1"} {
		rec := hn.client().get(path)
		if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("GET %s = %d %q", path, rec.Code, rec.Header().Get("Cache-Control"))
		}
	}
}

// Enter in a field submits the form's DEFAULT button: its first submit button. In Next that
// was a social button, so Enter did nothing while they were disabled. Every social button,
// live or not, belongs to the OAuth form here.
func TestNoSocialButtonBelongsToTheEmailForm(t *testing.T) {
	for _, o := range []opts{{}, {google: true}} {
		for _, path := range []string{"/login", "/register"} {
			body := newHarness(t, o).client().get(path).Body.String()
			for _, b := range strings.Split(body, "<button")[1:] {
				if strings.Contains(b, "Google") || strings.Contains(b, "Apple") {
					if !strings.Contains(b, `form="auth-oauth"`) {
						t.Errorf("%s: a social button the email form owns: <button%s", path, b[:120])
					}
				}
			}
		}
	}
}
