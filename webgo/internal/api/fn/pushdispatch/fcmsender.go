package pushdispatch

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/fcm"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// Sending to an Android phone: Firebase Cloud Messaging's HTTP v1 API, with no Firebase SDK
// (the I/O half of _shared/fcm.ts; package fcm holds the pure half). The service-account key
// signs a short-lived RS256 JWT, Google trades it for an access token, and one POST per device
// sends the message. The payload carries no words (fcm.AndroidData decides what Google sees).
//
// Secret: FCM_SERVICE_ACCOUNT_JSON, the key file Firebase hands out.

// fcmSendBase is the FCM v1 API; the project id goes after it.
const fcmSendBase = "https://fcm.googleapis.com/v1/projects/"

// The access token is reused for 50 minutes (Google issues an hour), and a new one is fetched
// once fewer than 60 seconds of that remain.
const (
	tokenLifetime = 50 * time.Minute
	tokenMargin   = 60 * time.Second
)

// maxGoogleReply bounds what is read of a token or send reply.
const maxGoogleReply = 64 << 10

// serviceAccount is FCM_SERVICE_ACCOUNT_JSON's three fields. usable is false when a field is
// present but is not text: Deno kept such a key and failed every Android send with it, so this
// does too (the pass still runs, and those rows retry and fail visibly).
type serviceAccount struct {
	fcm.ServiceAccount
	usable bool
}

// serviceAccountFromEnv reads FCM_SERVICE_ACCOUNT_JSON, or nil when it is unset. Set but
// unusable is not the same as unset, and says so (never the value). A multi-line paste is the
// usual cause; see supabase/README.md.
func serviceAccountFromEnv(env func(string) string, log *slog.Logger) *serviceAccount {
	raw := env("FCM_SERVICE_ACCOUNT_JSON")
	if raw == "" {
		return nil
	}
	if v, err := js.Parse([]byte(raw)); err == nil {
		pid, email, key := v.Get("project_id"), v.Get("client_email"), v.Get("private_key")
		if pid.Truthy() && email.Truthy() && key.Truthy() {
			sa := &serviceAccount{usable: true}
			var ok [3]bool
			sa.ProjectID, ok[0] = pid.Str()
			sa.ClientEmail, ok[1] = email.Str()
			sa.PrivateKey, ok[2] = key.Str()
			sa.usable = ok[0] && ok[1] && ok[2]
			return sa
		}
	}
	log.Error("push: FCM_SERVICE_ACCOUNT_JSON is set but is not a usable service-account key")
	return nil
}

// tokenCache holds one access token, or the exchange in flight for one, so a pass that sends to
// several phones at once signs and exchanges once, not per phone (Deno cached the PROMISE).
// Safe for concurrent use. A failed exchange is not remembered.
type tokenCache struct {
	mu  sync.Mutex
	cur *tokenCall
}

type tokenCall struct {
	key       string // which service account it is for
	expiresAt time.Time
	done      chan struct{}
	token     string
	err       error
}

// get returns a token for key, exchanging a new one with fetch when none is fresh. Callers that
// arrive while an exchange is in flight wait for it and share its result.
func (c *tokenCache) get(ctx context.Context, key string, now time.Time, fetch func(context.Context) (string, error)) (string, error) {
	c.mu.Lock()
	if cur := c.cur; cur != nil && cur.key == key && cur.expiresAt.Add(-tokenMargin).After(now) {
		c.mu.Unlock()
		select {
		case <-cur.done:
			return cur.token, cur.err
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	call := &tokenCall{key: key, expiresAt: now.Add(tokenLifetime), done: make(chan struct{})}
	c.cur = call
	c.mu.Unlock()

	// Not tied to one caller: the others are waiting on this exchange too.
	call.token, call.err = fetch(context.WithoutCancel(ctx))
	close(call.done)
	if call.err != nil {
		c.mu.Lock()
		if c.cur == call {
			c.cur = nil
		}
		c.mu.Unlock()
	}
	return call.token, call.err
}

// forget drops the cached token: Google said 401, so it was revoked or rotated, and the next
// send exchanges afresh.
func (c *tokenCache) forget() {
	c.mu.Lock()
	c.cur = nil
	c.mu.Unlock()
}

type fcmSender struct {
	ctx   context.Context
	sa    serviceAccount
	key   string
	url   string
	hc    *http.Client
	cache *tokenCache
	now   func() time.Time
	log   *slog.Logger
}

func newFCMSender(ctx context.Context, sa serviceAccount, hc *http.Client, cache *tokenCache, now func() time.Time, log *slog.Logger) *fcmSender {
	sum := sha256.Sum256([]byte(sa.ProjectID + "\x00" + sa.ClientEmail + "\x00" + sa.PrivateKey))
	return &fcmSender{
		ctx: ctx, sa: sa, key: hex.EncodeToString(sum[:]),
		url: fcmSendBase + encodeURIComponent(sa.ProjectID) + "/messages:send",
		hc:  hc, cache: cache, now: now, log: log,
	}
}

var (
	errSAUnusable     = errors.New("FCM service account is not usable")
	errFCMUnreachable = errors.New("FCM did not answer")
	errNoToken        = errors.New("FCM token exchange returned no token")
)

// exchange trades a signed assertion for an access token (RFC 7523).
func (s *fcmSender) exchange(ctx context.Context, now time.Time) (string, error) {
	assertion, err := fcm.SignedAssertion(s.sa.ServiceAccount, now.Unix())
	if err != nil {
		return "", errSAUnusable
	}
	// URLSearchParams order: grant_type, then assertion.
	form := "grant_type=" + url.QueryEscape("urn:ietf:params:oauth:grant-type:jwt-bearer") +
		"&assertion=" + url.QueryEscape(assertion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fcm.TokenURL, strings.NewReader(form))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.hc.Do(req)
	if err != nil {
		return "", errors.New("FCM token exchange failed: no answer")
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxGoogleReply))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("FCM token exchange failed: %d", resp.StatusCode)
	}
	var body struct {
		AccessToken string `json:"access_token"`
	}
	if json.Unmarshal(raw, &body) != nil || body.AccessToken == "" {
		return "", errNoToken
	}
	return body.AccessToken, nil
}

// fcmError is the part of FCM's error body that is read: the first details[] entry that names
// an errorCode.
type fcmError struct {
	Error struct {
		Details []struct {
			ErrorCode string `json:"errorCode"`
		} `json:"details"`
	} `json:"error"`
}

func (s *fcmSender) send(d push.Device, p push.Payload) (push.DeviceOutcome, error) {
	if d.Platform != "android" {
		return push.OutcomeSkipped, nil
	}
	if d.FCMToken == nil || *d.FCMToken == "" {
		return push.OutcomeGone, nil
	}
	if !s.sa.usable {
		return "", errSAUnusable
	}
	now := s.now()
	token, err := s.cache.get(s.ctx, s.key, now, func(ctx context.Context) (string, error) { return s.exchange(ctx, now) })
	if err != nil {
		return "", err
	}
	body, err := js.Marshal(fcm.FCMMessage(*d.FCMToken, p))
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(s.ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return "", errSAUnusable
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.hc.Do(req)
	if err != nil {
		return "", errFCMUnreachable
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxGoogleReply))
	errorCode := ""
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var e fcmError
		if json.Unmarshal(raw, &e) == nil {
			for _, det := range e.Error.Details {
				if det.ErrorCode != "" {
					errorCode = det.ErrorCode
					break
				}
			}
		}
		// Status and code only: never the token, the request or the response body.
		if errorCode != "" {
			s.log.Error("push: FCM answered", "status", resp.StatusCode, "code", errorCode)
		} else {
			s.log.Error("push: FCM answered", "status", resp.StatusCode)
		}
		// A revoked or rotated access token: forget it, so the next send exchanges afresh.
		if resp.StatusCode == http.StatusUnauthorized {
			s.cache.forget()
		}
	}
	return fcm.FCMOutcome(resp.StatusCode, errorCode), nil
}

// encodeURIComponent escapes everything but A-Z a-z 0-9 - _ . ! ~ * ' ( ), UTF-8 first.
func encodeURIComponent(s string) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			strings.IndexByte("-_.!~*'()", c) >= 0:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&0xf])
		}
	}
	return b.String()
}
