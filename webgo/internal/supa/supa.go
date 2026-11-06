// Package supa talks to the Supabase project over plain net/http: GoTrue (auth) here, and
// PostgREST, RPC and Storage as pages need them. It is security-relevant transport, so it is
// ours rather than a community SDK (docs/GO-MIGRATION.md §4.2).
//
// This package holds only the ANON key. Requests run as the visitor, with their access
// token, so RLS and column grants still decide what they can read. The service-role key
// belongs to internal/api alone (ruling 14) and never appears here.
package supa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is safe for concurrent use.
type Client struct {
	baseURL string
	anonKey string
	http    *http.Client
}

// New returns a client for the project at baseURL (SUPABASE_URL). A nil hc gets a client with
// a timeout; never pass http.DefaultClient, which has none.
func New(baseURL, anonKey string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), anonKey: anonKey, http: hc}
}

// Caller is the browser behind a request. GoTrue records it on the session, so without it
// the advisor's Login activity would show every traveler signing in from the server (§3.9.6).
type Caller struct {
	UserAgent string
	Address   string
}

// Tokens is a GoTrue session.
type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"` // unix seconds
}

// Factor is one enrolled second factor.
type Factor struct {
	ID         string `json:"id"`
	FactorType string `json:"factor_type"`
	Status     string `json:"status"` // "verified" or "unverified"
}

// User is the part of a GoTrue user the web app reads.
type User struct {
	ID      string   `json:"id"`
	Email   string   `json:"email"`
	Factors []Factor `json:"factors"`
}

// HasVerifiedFactor reports whether a second factor is enrolled and verified.
func (u User) HasVerifiedFactor() bool {
	for _, f := range u.Factors {
		if f.Status == "verified" {
			return true
		}
	}
	return false
}

var (
	// ErrInvalidCredentials: GoTrue refused the email and password.
	ErrInvalidCredentials = errors.New("supa: invalid credentials")
	// ErrUnauthenticated: the token is missing, expired, revoked or malformed.
	ErrUnauthenticated = errors.New("supa: unauthenticated")
	// ErrUnavailable: GoTrue could not be reached or failed (network error or 5xx).
	ErrUnavailable = errors.New("supa: auth unavailable")
)

// SignInWithPassword exchanges an email and password for a session.
func (c *Client) SignInWithPassword(ctx context.Context, email, password string, who Caller) (Tokens, error) {
	var t Tokens
	status, err := c.auth(ctx, http.MethodPost, "/auth/v1/token?grant_type=password", "",
		map[string]string{"email": email, "password": password}, who, &t)
	switch {
	case err != nil:
		return Tokens{}, err
	case status == http.StatusBadRequest || status == http.StatusUnauthorized || status == http.StatusUnprocessableEntity:
		return Tokens{}, ErrInvalidCredentials
	case status != http.StatusOK:
		return Tokens{}, fmt.Errorf("%w: sign-in returned %d", ErrUnavailable, status)
	}
	return t.fill()
}

// Refresh trades a refresh token for a new session. GoTrue rotates refresh tokens, so the
// old one stops working once this succeeds; the caller must store the new pair.
func (c *Client) Refresh(ctx context.Context, refreshToken string, who Caller) (Tokens, error) {
	var t Tokens
	status, err := c.auth(ctx, http.MethodPost, "/auth/v1/token?grant_type=refresh_token", "",
		map[string]string{"refresh_token": refreshToken}, who, &t)
	switch {
	case err != nil:
		return Tokens{}, err
	case status >= 400 && status < 500:
		return Tokens{}, ErrUnauthenticated
	case status != http.StatusOK:
		return Tokens{}, fmt.Errorf("%w: refresh returned %d", ErrUnavailable, status)
	}
	return t.fill()
}

// GetUser asks GoTrue who an access token belongs to. This is the check: it verifies the
// token against the auth server, unlike reading the token's claims (which anyone can write).
func (c *Client) GetUser(ctx context.Context, accessToken string, who Caller) (User, error) {
	var u User
	status, err := c.auth(ctx, http.MethodGet, "/auth/v1/user", accessToken, nil, who, &u)
	switch {
	case err != nil:
		return User{}, err
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return User{}, ErrUnauthenticated
	case status != http.StatusOK:
		return User{}, fmt.Errorf("%w: get user returned %d", ErrUnavailable, status)
	}
	if u.ID == "" {
		return User{}, ErrUnauthenticated
	}
	return u, nil
}

// SignOut ends this session at GoTrue (scope=local: this device only).
func (c *Client) SignOut(ctx context.Context, accessToken string, who Caller) error {
	status, err := c.auth(ctx, http.MethodPost, "/auth/v1/logout?scope=local", accessToken, nil, who, nil)
	if err != nil {
		return err
	}
	if status >= 500 {
		return fmt.Errorf("%w: sign-out returned %d", ErrUnavailable, status)
	}
	return nil // a 401 means the session was already gone, which is what sign-out wants
}

func (c *Client) auth(ctx context.Context, method, path, token string, body any, who Caller, out any) (int, error) {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rd)
	if err != nil {
		return 0, err
	}
	req.Header.Set("apikey", c.anonKey)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if who.UserAgent != "" {
		req.Header.Set("User-Agent", truncate(who.UserAgent, 500))
	}
	if who.Address != "" {
		// GoTrue takes the first X-Forwarded-For entry as the client.
		req.Header.Set("X-Forwarded-For", who.Address)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		// Never wrap err itself into anything a page shows: it can carry the URL.
		return 0, fmt.Errorf("%w: %s %s", ErrUnavailable, method, path)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK && out != nil {
		if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out); err != nil {
			return resp.StatusCode, fmt.Errorf("%w: bad response from %s", ErrUnavailable, path)
		}
	} else {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	}
	return resp.StatusCode, nil
}

func (t Tokens) fill() (Tokens, error) {
	if t.AccessToken == "" || t.RefreshToken == "" {
		return Tokens{}, fmt.Errorf("%w: session without tokens", ErrUnavailable)
	}
	if t.ExpiresAt == 0 {
		if c, err := ReadClaims(t.AccessToken); err == nil {
			t.ExpiresAt = c.Exp
		}
	}
	return t, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// Claims are the access-token fields the web app reads.
type Claims struct {
	Sub string `json:"sub"`
	Exp int64  `json:"exp"`
	AAL string `json:"aal"` // "aal1" or "aal2"
}

// ReadClaims decodes an access token's payload WITHOUT checking its signature. Only read
// claims from a token GetUser has already accepted; on their own they prove nothing. This is
// what supabase-js's getAuthenticatorAssuranceLevel does after getUser.
func ReadClaims(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("supa: not a JWT")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, errors.New("supa: bad JWT payload")
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, errors.New("supa: bad JWT payload")
	}
	return c, nil
}
