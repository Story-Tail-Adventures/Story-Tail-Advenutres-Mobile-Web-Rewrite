package supa

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// jwt builds an unsigned token with the given claims (signature is never checked here).
func jwt(claims map[string]any) string {
	b, _ := json.Marshal(claims)
	return "eyJhbGciOiJIUzI1NiJ9." + base64.RawURLEncoding.EncodeToString(b) + ".sig"
}

type seen struct {
	method, path, query, auth, apikey, ua, xff, body string
}

func fakeGoTrue(t *testing.T, status int, reply any) (*Client, *seen) {
	t.Helper()
	s := &seen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		*s = seen{r.Method, r.URL.Path, r.URL.RawQuery, r.Header.Get("Authorization"), r.Header.Get("apikey"),
			r.Header.Get("User-Agent"), r.Header.Get("X-Forwarded-For"), string(body)}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(reply)
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL+"/", "anon-key", nil), s
}

var who = Caller{UserAgent: "Mozilla/5.0 test", Address: "203.0.113.9"}

func TestSignInSendsCallerAndParsesTokens(t *testing.T) {
	access := jwt(map[string]any{"sub": "u1", "exp": 2000000000, "aal": "aal1"})
	c, s := fakeGoTrue(t, 200, map[string]any{"access_token": access, "refresh_token": "r1", "expires_at": 1999999999})
	tok, err := c.SignInWithPassword(context.Background(), "ada@example.com", "pw", who)
	if err != nil {
		t.Fatal(err)
	}
	if tok.AccessToken != access || tok.RefreshToken != "r1" || tok.ExpiresAt != 1999999999 {
		t.Errorf("tokens = %+v", tok)
	}
	if s.method != "POST" || s.path != "/auth/v1/token" || s.query != "grant_type=password" {
		t.Errorf("request = %s %s?%s", s.method, s.path, s.query)
	}
	if s.apikey != "anon-key" || s.auth != "" {
		t.Errorf("apikey=%q auth=%q", s.apikey, s.auth)
	}
	// §3.9.6: GoTrue records the browser, not the server.
	if s.ua != who.UserAgent || s.xff != who.Address {
		t.Errorf("caller headers ua=%q xff=%q", s.ua, s.xff)
	}
	if !strings.Contains(s.body, `"email":"ada@example.com"`) {
		t.Errorf("body = %s", s.body)
	}
}

func TestSignInFillsExpiryFromTheToken(t *testing.T) {
	access := jwt(map[string]any{"exp": 1888888888})
	c, _ := fakeGoTrue(t, 200, map[string]any{"access_token": access, "refresh_token": "r"})
	tok, err := c.SignInWithPassword(context.Background(), "a", "b", Caller{})
	if err != nil || tok.ExpiresAt != 1888888888 {
		t.Errorf("tok=%+v err=%v", tok, err)
	}
}

func TestStatusMapping(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		status int
		call   func(*Client) error
		want   error
	}{
		{"bad password", 400, func(c *Client) error { _, err := c.SignInWithPassword(ctx, "a", "b", who); return err }, ErrInvalidCredentials},
		{"sign-in outage", 503, func(c *Client) error { _, err := c.SignInWithPassword(ctx, "a", "b", who); return err }, ErrUnavailable},
		{"dead refresh token", 400, func(c *Client) error { _, err := c.Refresh(ctx, "r", who); return err }, ErrUnauthenticated},
		{"refresh outage", 500, func(c *Client) error { _, err := c.Refresh(ctx, "r", who); return err }, ErrUnavailable},
		{"revoked access token", 401, func(c *Client) error { _, err := c.GetUser(ctx, "t", who); return err }, ErrUnauthenticated},
		{"forbidden", 403, func(c *Client) error { _, err := c.GetUser(ctx, "t", who); return err }, ErrUnauthenticated},
		{"user outage", 502, func(c *Client) error { _, err := c.GetUser(ctx, "t", who); return err }, ErrUnavailable},
	}
	for _, tc := range cases {
		c, _ := fakeGoTrue(t, tc.status, map[string]any{"msg": "no"})
		if err := tc.call(c); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", tc.name, err, tc.want)
		}
	}
}

func TestGetUserSendsTheTokenAndReadsFactors(t *testing.T) {
	c, s := fakeGoTrue(t, 200, map[string]any{"id": "u1", "email": "gyasi@example.com",
		"factors": []map[string]any{{"id": "f1", "factor_type": "totp", "status": "verified"}}})
	u, err := c.GetUser(context.Background(), "tok-123", who)
	if err != nil {
		t.Fatal(err)
	}
	if s.auth != "Bearer tok-123" || s.path != "/auth/v1/user" || s.method != "GET" {
		t.Errorf("request = %s %s auth=%q", s.method, s.path, s.auth)
	}
	if u.ID != "u1" || !u.HasVerifiedFactor() {
		t.Errorf("user = %+v", u)
	}
}

func TestUnreachableIsUnavailableAndHidesTheURL(t *testing.T) {
	c := New("http://127.0.0.1:1", "anon", nil) // nothing listens on port 1
	_, err := c.GetUser(context.Background(), "secret-token", who)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v", err)
	}
	if strings.Contains(err.Error(), "secret-token") || strings.Contains(err.Error(), "127.0.0.1") {
		t.Errorf("error leaks request details: %v", err)
	}
}

func TestReadClaims(t *testing.T) {
	c, err := ReadClaims(jwt(map[string]any{"sub": "u1", "exp": 5, "aal": "aal2"}))
	if err != nil || c.Sub != "u1" || c.Exp != 5 || c.AAL != "aal2" {
		t.Errorf("claims=%+v err=%v", c, err)
	}
	for _, bad := range []string{"", "a.b", "a.!!!.c", "a." + base64.RawURLEncoding.EncodeToString([]byte("not json")) + ".c"} {
		if _, err := ReadClaims(bad); err == nil {
			t.Errorf("ReadClaims(%q) accepted it", bad)
		}
	}
}
