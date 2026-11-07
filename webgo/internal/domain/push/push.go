// Package push ports supabase/functions/_shared/push.ts: what a notification says, and where it
// may be sent (§3.10 Stage 3b, Screen Inventory §3.10.7, Data-Model §12.6 / §12.7).
//
// Pure: no network, no database (problem only builds error values). `push-dispatch` claims rows
// and hands them here; the senders it injects into Deliver do the I/O.
//
// ── WHAT A PAYLOAD HOLDS ─────────────────────────────────────────────────────
//
// A web payload is end-to-end encrypted to the advisor's browser (RFC 8291), so it carries the
// words: the client's name, the trip and the first line. An Android payload goes through Google
// readable, so it carries the thread id and a count only (package fcm), and the app fetches the
// words itself. See docs/Push-Notifications-Security-Review.md §3.1. Neither ever holds card data.
//
// ── ONE NOTIFICATION PER THREAD ──────────────────────────────────────────────
//
// The tag is the conversation id, so the next message replaces the last one on the device, and
// a dismiss names the same tag to clear it. The morning summary has its own tag.
//
// The payload structs declare their fields in the order the Deno object literals wrote them,
// so js.Marshal writes the same JSON JSON.stringify did. maskCardNumbers, which push.ts
// re-exported from cardDigits.ts, is carddigits.MaskCardNumbers.
package push

import (
	"fmt"
	"log"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The kinds of a claimed row (§3.12.3; a lead's message since 2026-10-21, §3.8).
const (
	KindMessage      = "message"
	KindQuoteRequest = "quote_request"
	KindLeadMessage  = "lead_message"
)

// ClaimedRow is a row `push_claim_due` hands out. nil pointers are SQL nulls.
type ClaimedRow struct {
	OutboxID string `json:"outbox_id"`
	AgentID  string `json:"agent_id"`
	// Kind is KindMessage, KindQuoteRequest or KindLeadMessage.
	Kind string `json:"kind"`
	// ConversationID is set for a message; null for a quote request.
	ConversationID *string `json:"conversation_id"`
	// TripID is set for a quote request.
	TripID *string `json:"trip_id"`
	Held   bool    `json:"held"`
	// HoldReason is why a held row waited ("rest" or "away"): the summary says "while you
	// rested" or "while you were away".
	HoldReason   *string `json:"hold_reason"`
	MessageCount int     `json:"message_count"`
	ClientName   *string `json:"client_name"`
	TripTitle    *string `json:"trip_title"`
	Preview      *string `json:"preview"`
	// LatestCreatedAt is as PostgREST writes timestamptz, microseconds and all. Never parsed
	// into a time to send.
	LatestCreatedAt string `json:"latest_created_at"`
	// Destination, StartDate and EndDate: quote requests only ("Negril, Jamaica", and the
	// dates asked for).
	Destination *string `json:"destination"`
	StartDate   *string `json:"start_date"`
	EndDate     *string `json:"end_date"`
	// LeadID is set for a lead's message. Its ClientName is the lead's own name.
	LeadID *string `json:"lead_id"`
}

// Device is a row `push_devices_for_agent` returns.
type Device struct {
	DeviceID string `json:"device_id"`
	// Platform is "android", "web" or "ios".
	Platform    string  `json:"platform"`
	FCMToken    *string `json:"fcm_token"`
	WebEndpoint *string `json:"web_endpoint"`
	WebP256dh   *string `json:"web_p256dh"`
	WebAuth     *string `json:"web_auth"`
}

// Payload is one of Message, Summary, Dismiss, QuoteRequest and LeadMessage (PushPayload).
type Payload interface {
	// PayloadKind is the payload's `kind`.
	PayloadKind() string
	// PayloadTag is its `tag`.
	PayloadTag() string
	isPayload()
}

// Message is a client message notification.
type Message struct {
	V              int    `json:"v"`
	Kind           string `json:"kind"`
	Tag            string `json:"tag"`
	ConversationID string `json:"conversationId"`
	// SeenUpTo is the created_at of the newest message this is about, as text (agent-message's
	// `seenUpTo`). "Mark read" reads up to here and no further, so anything newer stays unread.
	SeenUpTo string `json:"seenUpTo"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	Count    int    `json:"count"`
	URL      string `json:"url"`
}

// Summary is the one morning notification for everything held.
type Summary struct {
	V    int    `json:"v"`
	Kind string `json:"kind"`
	Tag  string `json:"tag"`
	// Count is the messages it covers. The phone builds its own words from this (no names
	// through Google).
	Count int    `json:"count"`
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
}

// Dismiss clears a thread's notification.
type Dismiss struct {
	V    int    `json:"v"`
	Kind string `json:"kind"`
	Tag  string `json:"tag"`
	// ReadUpTo is the created_at (as text) of the newest message the dismissed notification was
	// about. A phone ignores a dismiss older than the notification it is showing, so a dismiss
	// that arrives late (FCM does not promise order) cannot cancel a newer message for the same
	// thread. nil is null.
	ReadUpTo *string `json:"readUpTo"`
}

// QuoteRequest is §3.12.3: a client asked for a trip. The title carries the client's name only
// (the locked-screen rule); the body adds where and when, when they said.
type QuoteRequest struct {
	V      int    `json:"v"`
	Kind   string `json:"kind"`
	Tag    string `json:"tag"`
	TripID string `json:"tripId"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	URL    string `json:"url"`
}

// LeadMessage is §3.8 (2026-10-21): somebody without an account wrote through the public form.
// The title is their name only; the body never carries what they wrote, on the web either: a
// stranger's words have not earned a place on a lock screen, and the lead page is one tap away.
type LeadMessage struct {
	V      int    `json:"v"`
	Kind   string `json:"kind"`
	Tag    string `json:"tag"`
	LeadID string `json:"leadId"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	URL    string `json:"url"`
}

func (p Message) PayloadKind() string      { return p.Kind }
func (p Message) PayloadTag() string       { return p.Tag }
func (Message) isPayload()                 {}
func (p Summary) PayloadKind() string      { return p.Kind }
func (p Summary) PayloadTag() string       { return p.Tag }
func (Summary) isPayload()                 {}
func (p Dismiss) PayloadKind() string      { return p.Kind }
func (p Dismiss) PayloadTag() string       { return p.Tag }
func (Dismiss) isPayload()                 {}
func (p QuoteRequest) PayloadKind() string { return p.Kind }
func (p QuoteRequest) PayloadTag() string  { return p.Tag }
func (QuoteRequest) isPayload()            {}
func (p LeadMessage) PayloadKind() string  { return p.Kind }
func (p LeadMessage) PayloadTag() string   { return p.Tag }
func (LeadMessage) isPayload()             {}

// SummaryTag is the morning summary's own tag.
const SummaryTag = "summary"

// InboxURL is the advisor's message list.
const InboxURL = "/agent/messages"

// ThreadURL is the thread, with the reply box ready (the web has no reply-in-notification;
// ruling 3).
func ThreadURL(conversationID string) string {
	return InboxURL + "/" + conversationID + "?reply=1"
}

// NoPreview is shown when a message has no text of its own (an attachment only).
const NoPreview = "Sent you a message."

// orElse is `p?.trim() || fallback`.
func orElse(p *string, fallback string) string {
	if p != nil {
		if t := js.Trim(*p); t != "" {
			return t
		}
	}
	return fallback
}

// MessageTitle is "Jordan Hayes · Anniversary Week in Negril", or the name alone for a thread
// with no trip.
func MessageTitle(clientName, tripTitle *string) string {
	name := orElse(clientName, "A client")
	if trip := orElse(tripTitle, ""); trip != "" {
		return name + " \U000000b7 " + trip
	}
	return name
}

// MessagePayload is a message's notification. Clients sometimes paste a card number into a
// message: the thread already holds it, but a notification would copy it onto a lock screen and
// into the system's notification history, so it shows the last four only (carddigits, the
// guard's rule, Data-Model §18).
func MessagePayload(row ClaimedRow) Message {
	conversationID := ""
	if row.ConversationID != nil {
		conversationID = *row.ConversationID
	}
	return Message{
		V:              1,
		Kind:           KindMessage,
		Tag:            conversationID,
		ConversationID: conversationID,
		SeenUpTo:       row.LatestCreatedAt,
		Title:          MessageTitle(row.ClientName, row.TripTitle),
		Body:           carddigits.MaskCardNumbers(orElse(row.Preview, NoPreview)),
		Count:          row.MessageCount,
		URL:            ThreadURL(conversationID),
	}
}

var (
	months    = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
	isoPrefix = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})`)
)

// shortDate is "Feb 10" from "2027-02-10", or "" for null. Read as a calendar date: no zone can
// move it. A month outside 01-12 reads "undefined", as MONTHS[n - 1] did.
func shortDate(iso *string) string {
	if iso == nil || *iso == "" {
		return ""
	}
	m := isoPrefix.FindStringSubmatch(*iso)
	if m == nil {
		return ""
	}
	month, _ := strconv.Atoi(m[2])
	day, _ := strconv.Atoi(m[3])
	name := "undefined"
	if month >= 1 && month <= 12 {
		name = months[month-1]
	}
	return name + " " + strconv.Itoa(day)
}

// QuoteRequestDetail is "Negril, Jamaica · Feb 10 – Feb 14", or what of it there is. Only
// Destination, StartDate and EndDate are read.
func QuoteRequestDetail(row ClaimedRow) string {
	from := shortDate(row.StartDate)
	to := shortDate(row.EndDate)
	when := from
	switch {
	case from != "" && to != "":
		if from != to {
			when = from + " \U00002013 " + to
		}
	case from == "":
		when = to
	}
	var parts []string
	if d := orElse(row.Destination, ""); d != "" {
		parts = append(parts, d)
	}
	if when != "" {
		parts = append(parts, when)
	}
	return strings.Join(parts, " \U000000b7 ")
}

// QuoteRequestPayload is a trip request's notification.
func QuoteRequestPayload(row ClaimedRow) QuoteRequest {
	tripID := ""
	if row.TripID != nil {
		tripID = *row.TripID
	}
	name := orElse(row.ClientName, "a client")
	detail := QuoteRequestDetail(row)
	if detail == "" {
		detail = "Open it to see what they're dreaming of."
	}
	return QuoteRequest{
		V:      1,
		Kind:   KindQuoteRequest,
		Tag:    "quote-" + tripID,
		TripID: tripID,
		Title:  "New trip request from " + name,
		Body:   carddigits.MaskCardNumbers(detail),
		URL:    "/agent/trips/" + tripID,
	}
}

// LeadMessagePayload is a lead's message notification.
func LeadMessagePayload(row ClaimedRow) LeadMessage {
	leadID := ""
	if row.LeadID != nil {
		leadID = *row.LeadID
	}
	name := orElse(row.ClientName, "Someone new")
	return LeadMessage{
		V:      1,
		Kind:   KindLeadMessage,
		Tag:    "lead-" + leadID,
		LeadID: leadID,
		// "note", not "message": a stranger's note must not look like a client's message on a
		// lock screen, and the public form and the summary both call it a note.
		Title: "New note from " + name,
		Body:  "They wrote from the website. Open it to read and reply.",
		URL:   "/agent/leads/" + leadID,
	}
}

// NameList is "Jordan Hayes", "Jordan Hayes and Maya Carter", "A, B and C", "A, B, C and 2 others".
func NameList(names []string) string {
	var unique []string
	seen := map[string]bool{}
	for _, n := range names {
		t := js.Trim(n)
		if t == "" || seen[t] {
			continue
		}
		seen[t] = true
		unique = append(unique, t)
	}
	switch {
	case len(unique) == 0:
		return "Your clients"
	case len(unique) == 1:
		return unique[0]
	case len(unique) <= 3:
		return strings.Join(unique[:len(unique)-1], ", ") + " and " + unique[len(unique)-1]
	}
	rest := len(unique) - 3
	word := "others"
	if rest == 1 {
		word = "other"
	}
	return fmt.Sprintf("%s and %d %s", strings.Join(unique[:3], ", "), rest, word)
}

// overnightHours is how far back "overnight" may honestly reach. A Sunday's messages are older.
const overnightHours = 11

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

// SummaryPayload is the one 7am notification for everything that waited through rest hours
// (ruling 6): "3 new messages while you rested" / "Jordan Hayes, Maya Carter and Sam Rivera
// reached out overnight." It says "overnight" only when every message really came overnight; a
// Sunday's worth reads "while you rested", which is true of both.
func SummaryPayload(rows []ClaimedRow, now time.Time) Summary {
	count, asks, leads := 0, 0, 0
	nowMs := float64(now.UnixMilli())
	oldest := math.Inf(1) // Math.min() of nothing
	away := false
	names := make([]string, 0, len(rows))
	for _, r := range rows {
		switch r.Kind {
		case KindMessage:
			count += max(1, r.MessageCount)
		case KindQuoteRequest:
			asks++
		case KindLeadMessage:
			leads++
		}
		// `Date.parse(...) || now`: an unreadable time, and the epoch itself, count as now.
		at := nowMs
		if t, ok := js.ParseDate(r.LatestCreatedAt); ok && t.UnixMilli() != 0 {
			at = float64(t.UnixMilli())
		}
		oldest = math.Min(oldest, at)
		if r.HoldReason != nil && *r.HoldReason == "away" {
			away = true
		}
		name := ""
		if r.ClientName != nil {
			name = *r.ClientName
		}
		names = append(names, name)
	}
	// §3.12.2: after time away it says so; otherwise the §3.10 words.
	overnight := !away && nowMs-oldest <= overnightHours*3_600_000

	var parts []string
	if count > 0 {
		parts = append(parts, fmt.Sprintf("%d new %s", count, plural(count, "message", "messages")))
	}
	if asks > 0 {
		parts = append(parts, fmt.Sprintf("%d trip %s", asks, plural(asks, "request", "requests")))
	}
	if leads > 0 {
		if leads == 1 {
			parts = append(parts, "1 note from someone new")
		} else {
			parts = append(parts, fmt.Sprintf("%d notes from new people", leads))
		}
	}
	said := "undefined" // parts[0] of no parts, as the template literal wrote it
	switch {
	case len(parts) > 1:
		said = strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
	case len(parts) == 1:
		said = parts[0]
	}
	title := said + " while you rested"
	if away {
		title = said + " while you were away"
	}
	// The title already says rested or away; "reached out" fits trip requests too.
	body := NameList(names) + " reached out."
	if overnight {
		body = NameList(names) + " reached out overnight."
	}
	link := "/agent/leads"
	if count > 0 {
		link = InboxURL
	} else if asks > 0 {
		link = "/agent/trips"
	}
	return Summary{V: 1, Kind: "summary", Tag: SummaryTag, Count: count + asks + leads, Title: title, Body: body, URL: link}
}

// DismissPayload clears a thread's notification. readUpTo nil is null.
func DismissPayload(conversationID string, readUpTo *string) Dismiss {
	return Dismiss{V: 1, Kind: "dismiss", Tag: conversationID, ReadUpTo: readUpTo}
}

// Send is what one claimed batch sends for one advisor: each live row alone, the held ones as one.
type Send struct {
	OutboxIDs []string
	// Payload is a Message, Summary, QuoteRequest or LeadMessage.
	Payload Payload
}

// PlanForAgent splits one advisor's claimed rows into sends.
func PlanForAgent(rows []ClaimedRow, now time.Time) []Send {
	sends := []Send{}
	var held []ClaimedRow
	for _, r := range rows {
		if r.Held {
			held = append(held, r)
			continue
		}
		var p Payload
		switch r.Kind {
		case KindQuoteRequest:
			p = QuoteRequestPayload(r)
		case KindLeadMessage:
			p = LeadMessagePayload(r)
		default:
			p = MessagePayload(r)
		}
		sends = append(sends, Send{OutboxIDs: []string{r.OutboxID}, Payload: p})
	}
	if len(held) > 0 {
		ids := make([]string, len(held))
		for i, r := range held {
			ids[i] = r.OutboxID
		}
		sends = append(sends, Send{OutboxIDs: ids, Payload: SummaryPayload(held, now)})
	}
	return sends
}

// AgentRows is one advisor's rows, as groupByAgent's Map held them.
type AgentRows struct {
	AgentID string
	Rows    []ClaimedRow
}

// GroupByAgent groups rows by advisor, advisors in the order first seen (a Map's order).
func GroupByAgent(rows []ClaimedRow) []AgentRows {
	var out []AgentRows
	at := map[string]int{}
	for _, r := range rows {
		i, ok := at[r.AgentID]
		if !ok {
			i = len(out)
			at[r.AgentID] = i
			out = append(out, AgentRows{AgentID: r.AgentID})
		}
		out[i].Rows = append(out[i].Rows, r)
	}
	return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Where a web subscription may point
// ─────────────────────────────────────────────────────────────────────────────

// pushServiceHosts is the browsers' own push services. A subscription endpoint is a URL the
// BROWSER chose, but it reaches us in a request body, and `push-dispatch` POSTs to it with our
// signature. Without this list an advisor's token could register `http://10.0.0.1/...` and turn
// the dispatcher into a request forwarder inside the network. So: https, the standard port,
// and one of these hosts or their subdomains, or the registration is refused.
var pushServiceHosts = []string{
	"fcm.googleapis.com",                // Chrome, Edge on Android, Opera, Brave
	"updates.push.services.mozilla.com", // Firefox
	"push.services.mozilla.com",
	"notify.windows.com", // Edge on Windows (wns2-*.notify.windows.com)
	"push.apple.com",     // Safari (web.push.apple.com)
}

// MaxEndpointLength bounds a subscription endpoint (UTF-16 units).
const MaxEndpointLength = 1024

// IsAllowedPushEndpoint reports whether a web subscription may point here.
//
// Deno read the URL with WHATWG `new URL`; this reads it with net/url after WHATWG's own first
// step (outer C0 controls and spaces trimmed, tabs and line breaks removed), with the default
// port 443 counting as no port, as WHATWG drops it. Every endpoint a browser hands out (canonical
// `https://host/path`) gets the same answer. The forms the two parsers read differently are
// refused here even where WHATWG accepted them: no `//` after the scheme, a percent-encoded or
// non-ASCII host (WHATWG would have decoded or punycoded it). Refusing a non-ASCII host also
// keeps Go's lower-casing (İ to i) from ever making one equal an allowed host.
func IsAllowedPushEndpoint(endpoint string) bool {
	if js.Len(endpoint) > MaxEndpointLength {
		return false
	}
	u, err := url.Parse(whatwgPrepare(endpoint))
	if err != nil {
		return false
	}
	if u.Scheme != "https" || u.Opaque != "" || u.Host == "" {
		return false
	}
	if p := u.Port(); p != "" && !isPort443(p) {
		return false
	}
	if u.User != nil {
		if u.User.Username() != "" {
			return false
		}
		if pw, ok := u.User.Password(); ok && pw != "" {
			return false
		}
	}
	host := u.Hostname()
	for i := 0; i < len(host); i++ {
		if host[i] >= 0x80 {
			return false
		}
	}
	host = strings.ToLower(host) // ASCII only by now
	for _, h := range pushServiceHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

// whatwgPrepare is the URL parser's first step: strip leading and trailing C0 controls and
// spaces, and remove every tab, LF and CR.
func whatwgPrepare(s string) string {
	s = strings.TrimFunc(s, func(r rune) bool { return r <= 0x20 })
	return strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, s)
}

// isPort443 is a port WHATWG reads as https's default (leading zeros allowed).
func isPort443(p string) bool {
	trimmed := strings.TrimLeft(p, "0")
	if trimmed == "" || len(trimmed) > 5 {
		return false
	}
	for i := 0; i < len(trimmed); i++ {
		if trimmed[i] < '0' || trimmed[i] > '9' {
			return false
		}
	}
	n, err := strconv.Atoi(trimmed)
	return err == nil && n == 443
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a registration
// ─────────────────────────────────────────────────────────────────────────────

// WebSubscription is a registered browser.
type WebSubscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// keyPattern is base64url, as the Push API hands out keys. Long enough for a P-256 key, short
// enough to bound.
var keyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,200}={0,2}$`)

// ReadWebSubscription reads a browser's `PushSubscription.toJSON()`:
// `{ endpoint, keys: { p256dh, auth } }`. Refused unless the endpoint is one of the push
// services above.
func ReadWebSubscription(value js.Value) (WebSubscription, error) {
	endpoint, isText := value.Get("endpoint").Str()
	if !isText || !IsAllowedPushEndpoint(endpoint) {
		return WebSubscription{}, problem.BadRequest("This browser's notification address isn't one we can send to.")
	}
	keys := value.Get("keys")
	p256dh, p256dhText := keys.Get("p256dh").Str()
	auth, authText := keys.Get("auth").Str()
	if !p256dhText || !keyPattern.MatchString(p256dh) || !authText || !keyPattern.MatchString(auth) {
		return WebSubscription{}, problem.BadRequest("This browser's notification keys are missing.")
	}
	return WebSubscription{Endpoint: endpoint, P256dh: p256dh, Auth: auth}, nil
}

// ReadFCMToken reads an FCM registration token: opaque, URL-safe-ish, bounded. Never echoed
// back. /^[A-Za-z0-9_:\-]{20,4096}$/ by hand: RE2 caps a repeat count at 1000.
func ReadFCMToken(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok || !fcmTokenShape(s) {
		return "", problem.BadRequest("This phone's notification token is missing.")
	}
	return s, nil
}

func fcmTokenShape(s string) bool {
	if len(s) < 20 || len(s) > 4096 {
		return false // every allowed character is one byte, so bytes are units
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == ':' || c == '-') {
			return false
		}
	}
	return true
}

// MaxLabelLength bounds a device label (UTF-16 units).
const MaxLabelLength = 80

// ReadDeviceLabel reads "Chrome · macOS", shown later in §3.12.3's device list. Optional,
// trimmed, bounded; nil is null.
func ReadDeviceLabel(value js.Value) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest("label must be text.")
	}
	t := js.Slice(js.Trim(s), 0, MaxLabelLength)
	if t == "" {
		return nil, nil
	}
	return &t, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery
// ─────────────────────────────────────────────────────────────────────────────

// DeviceOutcome is what one device said. Gone is the push service telling us the subscription
// is dead (404 or 410): the device is forgotten, and that is not a failure of the send. Skipped
// is a platform this build cannot reach yet (iOS until Xcode).
type DeviceOutcome string

// The outcomes.
const (
	OutcomeOK      DeviceOutcome = "ok"
	OutcomeGone    DeviceOutcome = "gone"
	OutcomeError   DeviceOutcome = "error"
	OutcomeSkipped DeviceOutcome = "skipped"
)

// DeviceSender sends one payload to one device. A returned error is a thrown one.
type DeviceSender func(device Device, payload Payload) (DeviceOutcome, error)

// DeliveryResult is one payload's fate across an advisor's devices.
type DeliveryResult struct {
	// OK means the row may be marked sent: at least one device took it, or nothing was left to try.
	OK            bool
	GoneDeviceIDs []string
}

// Deliver sends one payload to every device of one advisor, all at once (Promise.all). It
// counts as delivered if ANY device took it, because the advisor will see it there, and reading
// it anywhere clears it everywhere. It counts as failed only when a device errored and none
// succeeded, so a retry is worth it. Every device gone or skipped is "nothing left to try":
// retrying would only repeat that. A sender that fails (an error, or a panic, as a throw) is an
// error for that device, not for the batch.
func Deliver(devices []Device, payload Payload, send DeviceSender) DeliveryResult {
	outcomes := make([]DeviceOutcome, len(devices))
	var wg sync.WaitGroup
	for i, d := range devices {
		wg.Add(1)
		go func() {
			defer wg.Done()
			outcomes[i] = sendOne(d, payload, send)
		}()
	}
	wg.Wait()
	result := DeliveryResult{GoneDeviceIDs: []string{}}
	anyOK, anyError := false, false
	for i, o := range outcomes {
		switch o {
		case OutcomeGone:
			result.GoneDeviceIDs = append(result.GoneDeviceIDs, devices[i].DeviceID)
		case OutcomeOK:
			anyOK = true
		case OutcomeError:
			anyError = true
		}
	}
	result.OK = anyOK || !anyError
	return result
}

func sendOne(d Device, payload Payload, send DeviceSender) (outcome DeviceOutcome) {
	defer func() {
		if r := recover(); r != nil {
			msg := "unknown"
			if err, ok := r.(error); ok {
				msg = err.Error()
			}
			log.Printf("push: %s send failed: %s", d.Platform, msg)
			outcome = OutcomeError
		}
	}()
	o, err := send(d, payload)
	if err != nil {
		// The sender's own message only (a status, never a token, key or body).
		log.Printf("push: %s send failed: %s", d.Platform, err.Error())
		return OutcomeError
	}
	return o
}

// OutcomeForStatus is the push service's answer, as a DeviceOutcome.
func OutcomeForStatus(status int) DeviceOutcome {
	if status >= 200 && status < 300 {
		return OutcomeOK
	}
	if status == 404 || status == 410 {
		return OutcomeGone
	}
	return OutcomeError
}
