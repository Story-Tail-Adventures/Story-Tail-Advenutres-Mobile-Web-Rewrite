package supa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// The GoTrue calls the sign-in screens make (Phase 3): sign-up, recover, resend, the PKCE code
// exchange, OTP verification, user updates, OAuth and MFA. They live in the auth_*.go files and
// share call() below, which keeps the rules supa.go set for sign-in and refresh:
//
//   - the anon key only, and the visitor's own token when the call needs one;
//   - the browser's user agent and address passed on (Caller), so GoTrue's session records and
//     the advisor's Login activity show the traveler, not this server (§3.9.6);
//   - redirects never followed (New sets CheckRedirect), so no token is copied to another host;
//   - a failure carries GoTrue's error CODE and HTTP status, never its message: the message is
//     not traveler-facing copy, and it can echo what was sent.

// apiVersion makes GoTrue report its error code in `code`, the header supabase-js sends
// (X-Supabase-Api-Version), so the codes web.MapAuthError reads arrive in the same field.
const (
	apiVersionHeader = "X-Supabase-Api-Version"
	apiVersion       = "2024-01-01"
)

// maxAuthResponse bounds a GoTrue reply. The largest is an MFA enrollment, whose QR code is raw
// SVG with one rect per module.
const maxAuthResponse = 2 << 20

// AuthError is GoTrue refusing a call, or the call failing on the way.
type AuthError struct {
	// Status is the HTTP status, 0 when the request never got an answer.
	Status int
	// Code is GoTrue's error code ("invalid_credentials", "weak_password", ...), or "".
	Code string
	// Retryable is supabase-js's AuthRetryableFetchError: no answer, or a 502/503/504. Those
	// read as "check your connection", not as a refusal.
	Retryable bool
}

func (e *AuthError) Error() string {
	return fmt.Sprintf("supa: gotrue refused (status %d, code %q)", e.Status, e.Code)
}

// AsAuthError returns err's *AuthError, or a Retryable one for anything else (a transport
// failure is the only other error these calls return).
func AsAuthError(err error) *AuthError {
	var ae *AuthError
	if errors.As(err, &ae) {
		return ae
	}
	return &AuthError{Retryable: true}
}

// gotrueError is GoTrue's error body: `code` (a string) with the API version header. Older
// servers send `code` as the HTTP status NUMBER and the string in `error_code`, so `code` is
// read raw and used only when it is a string.
type gotrueError struct {
	Code         json.RawMessage `json:"code"`
	ErrorCode    *string         `json:"error_code"`
	WeakPassword *struct {
		Reasons []string `json:"reasons"`
	} `json:"weak_password"`
}

// call makes one GoTrue request. query is added to the path; body, when not nil, is sent as
// JSON; out, when not nil, receives a 2xx reply.
func (c *Client) call(ctx context.Context, method, path string, query url.Values, token string, body any, who Caller, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return &AuthError{Retryable: true}
		}
		rd = bytes.NewReader(b)
	}
	target := c.baseURL + "/auth/v1" + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, target, rd)
	if err != nil {
		return &AuthError{Retryable: true}
	}
	req.Header.Set("apikey", c.anonKey)
	req.Header.Set(apiVersionHeader, apiVersion)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json;charset=UTF-8")
	}
	if who.UserAgent != "" {
		req.Header.Set("User-Agent", truncate(who.UserAgent, 500))
	}
	if who.Address != "" {
		req.Header.Set("X-Forwarded-For", who.Address) // GoTrue takes the first hop as the client
	}

	resp, err := c.http.Do(req)
	if err != nil {
		// Never wrap err: it can carry the URL, and with it a token hash or a code.
		return &AuthError{Retryable: true}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxAuthResponse))

	switch s := resp.StatusCode; {
	case s >= 200 && s < 300:
		if out != nil && len(bytes.TrimSpace(raw)) > 0 {
			if err := json.Unmarshal(raw, out); err != nil {
				return &AuthError{Status: s, Retryable: true}
			}
		}
		return nil
	case s == http.StatusBadGateway || s == http.StatusServiceUnavailable || s == http.StatusGatewayTimeout:
		return &AuthError{Status: s, Retryable: true}
	default:
		ae := &AuthError{Status: s}
		var e gotrueError
		if json.Unmarshal(raw, &e) == nil {
			var code string
			switch {
			case json.Unmarshal(e.Code, &code) == nil && code != "":
				ae.Code = code
			case e.ErrorCode != nil:
				ae.Code = *e.ErrorCode
			case e.WeakPassword != nil && len(e.WeakPassword.Reasons) > 0:
				ae.Code = "weak_password"
			}
		}
		return ae
	}
}

// session is GoTrue's session reply (token, verify, factors/verify, and sign-up with
// confirmations off). Sign-up with confirmations on answers a user instead, with no tokens.
type session struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
}

func (s session) tokens() (Tokens, error) {
	return Tokens(s).fill()
}
