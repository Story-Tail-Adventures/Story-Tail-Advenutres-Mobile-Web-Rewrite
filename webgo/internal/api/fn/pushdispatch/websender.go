package pushdispatch

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/webpush"
)

// Sending to a browser: Web Push with our own VAPID keys (_shared/webPush.ts). The Deno version
// let web-push 3.6.7 build the request and posted it with its own fetch; here package webpush
// encrypts and signs (standard library only, docs/WebPush-Go-Library-Security-Review.md §5) and
// this file posts it. The endpoint was checked against the push-service list when the device
// registered, and is checked again here, so a row written any other way still cannot aim the
// dispatcher somewhere else.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: URL the
// push services can reach us at). The private key never leaves the process.

// webTTL is how long a push service keeps an undelivered notification. A day-old "new message"
// is noise.
const webTTL = 12 * 3600

// maxWebReply is what is read of a push service's answer before it is closed: the status is all
// that is used.
const maxWebReply = 4 << 10

// errWebUnreachable is a send whose request never got an answer. Fixed text: Go's own error
// quotes the URL, which is a device address.
var errWebUnreachable = errors.New("web push: the push service did not answer")

type vapidConfig struct {
	publicKey, privateKey, subject string
}

// vapidFromEnv is the three VAPID_* secrets, or nil when any is unset or empty.
func vapidFromEnv(env func(string) string) *vapidConfig {
	pub, priv, sub := env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"), env("VAPID_SUBJECT")
	if pub == "" || priv == "" || sub == "" {
		return nil
	}
	return &vapidConfig{publicKey: pub, privateKey: priv, subject: sub}
}

var notTopic = regexp.MustCompile(`[^A-Za-z0-9_-]`)

// topicFor is the push service's "topic": a later notification with the same topic replaces one
// still waiting undelivered (a phone in a drawer gets the newest, not three). At most 32
// URL-safe characters: the tag with anything else removed, then cut. Dashes are URL-safe and
// stay, so a thread's topic is its uuid's first 32 characters (the Deno comment said "a uuid
// without its dashes"; its code, which this follows, never removed them).
func topicFor(p push.Payload) string {
	t := notTopic.ReplaceAllString(p.PayloadTag(), "")
	if len(t) > 32 {
		t = t[:32] // ASCII only by now
	}
	return t
}

type webSender struct {
	ctx      context.Context
	vapid    *webpush.VAPID
	vapidErr error
	hc       *http.Client
	now      func() time.Time
}

// newWebSender builds the web sender for a pass. Keys that are set but unusable (not a P-256
// pair, a public key that is not the private key's, a subject that is not mailto: or https:)
// make every web send an error, as web-push threw on each one: the rows retry and then fail,
// visibly, and nothing signed with a wrong key is ever posted.
func newWebSender(ctx context.Context, c vapidConfig, hc *http.Client, now func() time.Time) *webSender {
	v, err := webpush.NewVAPID(c.publicKey, c.privateKey, c.subject)
	return &webSender{ctx: ctx, vapid: v, vapidErr: err, hc: hc, now: now}
}

func text(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (s *webSender) send(d push.Device, p push.Payload) (push.DeviceOutcome, error) {
	if d.Platform != "web" {
		return push.OutcomeSkipped, nil
	}
	endpoint, p256dh, auth := text(d.WebEndpoint), text(d.WebP256dh), text(d.WebAuth)
	if endpoint == "" || p256dh == "" || auth == "" || !push.IsAllowedPushEndpoint(endpoint) {
		return push.OutcomeGone, nil
	}
	if s.vapidErr != nil {
		return "", s.vapidErr
	}
	plaintext, err := js.Marshal(p) // JSON.stringify(payload)
	if err != nil {
		return "", err
	}
	body, err := webpush.Encrypt(plaintext, p256dh, auth)
	if err != nil {
		return "", err
	}
	authorization, err := s.vapid.Authorization(endpoint, s.now())
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(s.ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", webpush.ErrBadEndpoint
	}
	h := req.Header
	h.Set("TTL", strconv.Itoa(webTTL))
	// A dismiss should land while the notification is still on screen.
	if p.PayloadKind() == "dismiss" {
		h.Set("Urgency", "high")
	} else {
		h.Set("Urgency", "normal")
	}
	if topic := topicFor(p); topic != "" {
		h.Set("Topic", topic)
	}
	h.Set("Content-Encoding", "aes128gcm")
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Authorization", authorization)

	resp, err := s.hc.Do(req)
	if err != nil {
		return "", errWebUnreachable
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxWebReply))
	_ = resp.Body.Close()
	// A redirect is not a delivery (it is never followed).
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return push.OutcomeError, nil
	}
	return push.OutcomeForStatus(resp.StatusCode), nil
}
