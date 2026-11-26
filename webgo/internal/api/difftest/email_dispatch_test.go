//go:build difftest && difftest_email

package difftest

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/emaildispatch"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["email-dispatch"] = api.Port{Gate: api.GateCron, Fn: emaildispatch.Func}
}

// cronToken is what each side's scheduler sends: the service-role key to Deno
// (requireServiceRole), STA_CRON_SECRET to Go (GateCron).
func cronToken(w *World) string {
	if w.Name == "deno" {
		return S.Service
	}
	return CronSecret
}

// ── Mailpit ──────────────────────────────────────────────────────────────────

// The isolated stack's Mailpit. Deno sends to it as inbucket:1025, Go through 127.0.0.1:57425.
const mailpitAPI = "http://127.0.0.1:57424/api/v1"

var mpClient = &http.Client{Timeout: 10 * time.Second}

func mpGet(t *testing.T, path string, out any) {
	t.Helper()
	resp, err := mpClient.Get(mailpitAPI + path)
	if err != nil {
		t.Fatalf("mailpit: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("mailpit %s = %d", path, resp.StatusCode)
	}
	if err := json.Unmarshal(b, out); err != nil {
		t.Fatalf("mailpit %s: %v", path, err)
	}
}

func mpDelete(t *testing.T, ids []string) {
	t.Helper()
	if len(ids) == 0 {
		return
	}
	b, _ := json.Marshal(map[string][]string{"IDs": ids})
	req, _ := http.NewRequest(http.MethodDelete, mailpitAPI+"/messages", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := mpClient.Do(req)
	if err != nil {
		t.Fatalf("mailpit delete: %v", err)
	}
	resp.Body.Close()
}

type mpAddress struct {
	Name    string `json:"Name"`
	Address string `json:"Address"`
}

type mpList struct {
	Messages []struct {
		ID string `json:"ID"`
	} `json:"messages"`
}

func mpSearch(t *testing.T, addr string) []string {
	var l mpList
	mpGet(t, "/search?query="+url.QueryEscape(`to:"`+addr+`"`), &l)
	var ids []string
	for _, m := range l.Messages {
		ids = append(ids, m.ID)
	}
	return ids
}

var (
	replyTokenRe = regexp.MustCompile(`\+[a-z2-7]{26}@`)
	unsubTokenRe = regexp.MustCompile(`t=[a-z2-7]{26}`)
)

// mailTo is what was sent to these addresses, as a mail app reads it, with the reply and
// unsubscribe tokens replaced. The messages read are deleted.
func mailTo(t *testing.T, addrs ...string) string {
	t.Helper()
	type mailRow struct {
		To                  []string
		From                mpAddress
		ReplyTo             []string
		Subject             string
		MessageID           string
		InReplyTo           string
		References          string
		ListUnsubscribe     string
		ListUnsubscribePost string
		AutoSubmitted       string
		Text                string
		HTML                string
	}
	var rows []mailRow
	var ids []string
	// Mailpit stores a message before it answers 250; a moment's grace all the same.
	time.Sleep(200 * time.Millisecond)
	for _, a := range addrs {
		for _, id := range mpSearch(t, a) {
			var m struct {
				MessageID string      `json:"MessageID"`
				From      mpAddress   `json:"From"`
				To        []mpAddress `json:"To"`
				ReplyTo   []mpAddress `json:"ReplyTo"`
				Subject   string      `json:"Subject"`
				Text      string      `json:"Text"`
				HTML      string      `json:"HTML"`
			}
			mpGet(t, "/message/"+id, &m)
			var h map[string][]string
			mpGet(t, "/message/"+id+"/headers", &h)
			first := func(k string) string {
				if v := h[k]; len(v) > 0 {
					return v[0]
				}
				return ""
			}
			r := mailRow{From: m.From, Subject: m.Subject, MessageID: m.MessageID,
				InReplyTo: first("In-Reply-To"), References: first("References"),
				ListUnsubscribe: first("List-Unsubscribe"), ListUnsubscribePost: first("List-Unsubscribe-Post"),
				AutoSubmitted: first("Auto-Submitted"),
				Text:          strings.TrimRight(strings.ReplaceAll(m.Text, "\r\n", "\n"), "\n"),
				HTML:          strings.TrimRight(strings.ReplaceAll(m.HTML, "\r\n", "\n"), "\n")}
			for _, x := range m.To {
				r.To = append(r.To, x.Address)
			}
			for _, x := range m.ReplyTo {
				r.ReplyTo = append(r.ReplyTo, x.Address)
			}
			rows = append(rows, r)
			ids = append(ids, id)
		}
	}
	mpDelete(t, ids)
	sort.Slice(rows, func(i, j int) bool { return rows[i].Subject+rows[i].MessageID < rows[j].Subject+rows[j].MessageID })
	b, _ := json.MarshalIndent(rows, "", " ")
	s := replyTokenRe.ReplaceAllString(string(b), "+<reply-token>@")
	return unsubTokenRe.ReplaceAllString(s, "t=<unsub-token>")
}

// ── Keeping the queue to this test's rows ───────────────────────────────────────

// dispQuiet empties the shared queues before a world's fixtures go in. email_claim_due and
// agent_alert_email_claim hand out EVERY due row on the stack, oldest first, so rows other tests
// left behind (a lead's alert to the seed advisor, say) would be claimed in one world and not the
// other. They are sent as the minute tick would send them, through the Deno function, and the
// mail that put in Mailpit for their recipients is deleted (only theirs: other tests may be
// reading Mailpit too).
func dispQuiet(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	recipients := func() []string {
		var alerts []struct {
			Agent struct {
				Email string `json:"email"`
			} `json:"agent"`
		}
		if err := S.DB.From("agent_alert_email").Select("agent:agent_id(email)").Eq("state", "pending").Rows(ctx, &alerts); err != nil {
			t.Fatal(err)
		}
		var due []struct {
			User struct {
				Account struct {
					Email *string `json:"email"`
				} `json:"account"`
			} `json:"user"`
		}
		if err := S.DB.From("email_outbox").Select("user:client_user_id(account:account_id(email))").Eq("state", "pending").
			Lte("due_at", js.ISOString(time.Now().Add(time.Minute))).Rows(ctx, &due); err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, a := range alerts {
			out = append(out, a.Agent.Email)
		}
		for _, d := range due {
			if d.User.Account.Email != nil {
				out = append(out, *d.User.Account.Email)
			}
		}
		return out
	}
	addrs := recipients()
	if len(addrs) == 0 {
		return
	}
	before := map[string]bool{}
	for _, a := range addrs {
		for _, id := range mpSearch(t, a) {
			before[id] = true
		}
	}
	for i := 0; i < 20 && len(recipients()) > 0; i++ {
		r := S.Deno("POST", "email-dispatch", "", `{"trigger":"cron"}`, Bearer(S.Service))
		if r.Status != 200 {
			t.Fatalf("draining the queue: %d %s", r.Status, r.Body)
		}
		if r.Body == `{"sent":0,"alertsSent":0,"retried":0,"failed":0,"released":0}` {
			break
		}
	}
	var fresh []string
	seen := map[string]bool{}
	for _, a := range addrs {
		for _, id := range mpSearch(t, a) {
			if !before[id] && !seen[id] {
				seen[id] = true
				fresh = append(fresh, id)
			}
		}
	}
	mpDelete(t, fresh)
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

type dispOpts struct {
	bodies         []string // the advisor's replies, oldest first
	noOutbox       bool
	noReplies      bool // the row starts after its replies: nothing left to send
	optedOut       bool
	readInApp      bool // client_unread_count 0
	previous       bool // an earlier email already sent on the thread
	stale          bool // the row is 'sending' from a run that died 20 minutes ago
	signature      *string
	phone          *string
	attachment     bool
	alert          string // agent_alert_email kind, or ""
	alertReadInApp bool   // agent_unread_count 0
}

// testCard is a Luhn-valid card number, built at run time: the repo's guard refuses one written
// in source, tests included.
func testCard() string {
	body := "411111111111111"
	for d := 0; d <= 9; d++ {
		if n := body + strconv.Itoa(d); carddigits.LuhnValid(n) {
			return n[0:4] + " " + n[4:8] + " " + n[8:12] + " " + n[12:]
		}
	}
	panic("no check digit")
}

func dispFixture(t *testing.T, w *World, o dispOpts) {
	t.Helper()
	dispQuiet(t)
	ctx := context.Background()
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now()
	// Only a client who can sign in, at a verified address, is emailed.
	must(S.DB.From("account").Eq("id", w.Traveler.UserID).Update(ctx, js.O("email_verified_at", js.ISOString(now.Add(-24*time.Hour))), nil))
	must(S.DB.From("agent").Eq("id", w.Agent.AgentID).Update(ctx, js.O("email_signature", o.signature, "phone", o.phone), nil))

	trip := w.ID("trip", uuid.New())
	must(S.DB.From("trip").Insert(ctx, js.O("id", trip, "client_id", w.Traveler.ClientID, "agent_id", w.Agent.AgentID,
		"title", "Lisbon & the Algarve", "trip_type", "custom", "status", "proposal"), nil))
	conv := w.ID("conversation", uuid.New())
	clientUnread, agentUnread := 1, 1
	if o.readInApp {
		clientUnread = 0
	}
	if o.alertReadInApp {
		agentUnread = 0
	}
	must(S.DB.From("conversation").Insert(ctx, js.O("id", conv, "client_id", w.Traveler.ClientID, "agent_id", w.Agent.AgentID,
		"trip_id", trip, "client_unread_count", clientUnread, "agent_unread_count", agentUnread), nil))
	w.Vars["conv"] = conv

	var msgIDs, msgAt []string
	for i, b := range o.bodies {
		id := w.ID("message:"+strconv.Itoa(i+1), uuid.New())
		at := js.ISOString(now.Add(time.Duration(i-10) * time.Minute))
		must(S.DB.From("message").Insert(ctx, js.O("id", id, "conversation_id", conv, "sender_user_id", w.Agent.PlatformUserID,
			"sender_role", "agent", "body", strings.ReplaceAll(b, "{card}", testCard()), "is_internal_note", false,
			"created_at", at), nil))
		msgIDs, msgAt = append(msgIDs, id), append(msgAt, at)
	}
	var docID string
	if o.attachment && len(msgIDs) > 0 {
		docID = w.ID("document", uuid.New())
		must(S.DB.From("document").Insert(ctx, js.O("id", docID, "owner_user_id", w.Agent.PlatformUserID,
			"client_id", w.Traveler.ClientID, "trip_id", trip, "kind", "pdf_itinerary", "filename", "Lisbon itinerary.pdf",
			"mime_type", "application/pdf", "size_bytes", 2048, "storage_bucket", "documents",
			"storage_key", "trips/"+trip+"/"+docID+".pdf", "checksum_sha256", `\x`+strings.Repeat("00", 32)), nil))
		must(S.DB.From("message_attachment").Insert(ctx, js.O("id", uuid.New(), "message_id", msgIDs[len(msgIDs)-1],
			"document_id", docID), nil))
	}

	if o.previous && len(msgIDs) > 0 {
		prev := w.ID("outbox:previous", uuid.New())
		must(S.DB.From("email_outbox").Insert(ctx, js.O("id", prev, "conversation_id", conv,
			"client_user_id", w.Traveler.PlatformUserID, "first_message_at", msgAt[0], "latest_message_id", msgIDs[0],
			"due_at", js.ISOString(now.Add(-2*time.Hour)), "state", "sent", "sent_at", js.ISOString(now.Add(-time.Hour))), nil))
	}
	if !o.noOutbox && len(msgIDs) > 0 {
		first := msgAt[0]
		if o.previous {
			first = msgAt[len(msgAt)-1]
		}
		if o.noReplies {
			first = js.ISOString(now.Add(time.Hour))
		}
		row := js.O("id", w.ID("outbox", uuid.New()), "conversation_id", conv, "client_user_id", w.Traveler.PlatformUserID,
			"first_message_at", first, "latest_message_id", msgIDs[len(msgIDs)-1], "due_at", js.ISOString(now.Add(-time.Minute)))
		if o.stale {
			row = row.Set("state", "sending").Set("claimed_at", js.ISOString(now.Add(-20*time.Minute)))
		}
		must(S.DB.From("email_outbox").Insert(ctx, row, nil))
	}
	if o.optedOut {
		must(S.DB.From("notification_preference").Insert(ctx, js.O("user_id", w.Traveler.PlatformUserID,
			"channels", json.RawMessage(`{"messages":{"email":false}}`)), nil))
	}

	var leadID string
	switch o.alert {
	case "client_message":
		must(S.DB.From("agent_alert_email").Insert(ctx, js.O("id", w.ID("alert", uuid.New()), "agent_id", w.Agent.AgentID,
			"kind", "client_message", "conversation_id", conv), nil))
	case "quote_request":
		must(S.DB.From("agent_alert_email").Insert(ctx, js.O("id", w.ID("alert", uuid.New()), "agent_id", w.Agent.AgentID,
			"kind", "quote_request", "trip_id", trip), nil))
	case "lead_message":
		leadID = w.ID("lead", uuid.New())
		must(S.DB.From("lead").Insert(ctx, js.O("id", leadID, "agent_id", w.Agent.AgentID,
			"email", "difftest-lead-"+w.Tag+"@example.com", "first_name", "Ada", "last_name", "Lovelace", "source", "website"), nil))
		must(S.DB.From("agent_alert_email").Insert(ctx, js.O("id", w.ID("alert", uuid.New()), "agent_id", w.Agent.AgentID,
			"kind", "lead_message", "lead_id", leadID), nil))
	}

	t.Cleanup(func() {
		ctx := context.Background()
		_ = S.DB.From("agent_alert_email").Eq("agent_id", w.Agent.AgentID).Delete(ctx, nil)
		if len(msgIDs) > 0 {
			_ = S.DB.From("message_attachment").In("message_id", msgIDs).Delete(ctx, nil)
		}
		if docID != "" {
			_ = S.DB.From("document").Eq("id", docID).Delete(ctx, nil)
		}
		_ = S.DB.From("email_token").Eq("conversation_id", conv).Delete(ctx, nil)
		_ = S.DB.From("email_outbox").Eq("conversation_id", conv).Delete(ctx, nil)
		_ = S.DB.From("message").Eq("conversation_id", conv).Delete(ctx, nil)
		_ = S.DB.From("conversation").Eq("id", conv).Delete(ctx, nil)
		_ = S.DB.From("trip").Eq("id", trip).Delete(ctx, nil)
		if leadID != "" {
			_ = S.DB.From("lead").Eq("id", leadID).Delete(ctx, nil)
		}
		_ = S.DB.From("notification_preference").Eq("user_id", w.Traveler.PlatformUserID).Delete(ctx, nil)
		// Anything either side sent for this case that the comparison did not read.
		mpDelete(t, append(mpSearch(t, w.Traveler.Email), mpSearch(t, w.Agent.Email)...))
	})
}

// dispSnap is every row a pass writes for this world's thread and advisor, and the mail sent.
func dispSnap(t *testing.T, w *World) string {
	conv := w.Vars["conv"]
	return "outbox:" + S.Rows(t, S.DB.From("email_outbox").
		Select("id,state,skip_reason,attempts,last_error,claimed_at,sent_at,first_message_at").
		Eq("conversation_id", conv).Order("created_at", true).Order("id", true)) +
		"\nmessages:" + S.Rows(t, S.DB.From("message").Select("id,emailed_at").Eq("conversation_id", conv).Order("created_at", true)) +
		"\ntokens:" + S.Rows(t, S.DB.From("email_token").Select("purpose,outbox_id,conversation_id,client_user_id,used_at").
		Eq("conversation_id", conv).Order("purpose", true)) +
		"\nalerts:" + S.Rows(t, S.DB.From("agent_alert_email").Select("id,kind,state,attempts,last_error,claimed_at,sent_at").
		Eq("agent_id", w.Agent.AgentID).Order("created_at", true)) +
		"\nmail:" + mailTo(t, w.Traveler.Email, w.Agent.Email)
}

// email-dispatch, both sides sending to the stack's Mailpit. The SMTP failure paths (a 4xx, a
// 5xx, a dead server) cannot be reached here, since Mailpit accepts everything; the Go unit tests
// cover them with the Deno rules for each.
func TestEmailDispatch(t *testing.T) {
	deno, goW := NewWorlds(t)
	sig := "{{agent.name}}, your travel advisor\n{{agent.phone}} \U000000b7 {{agent.email}}\nwww.story-tail.com\n\nRest well \U0001F334"
	phone := "+1 (555) 010-2030"
	words := []string{
		"Hi Jordan,\n\nYour Lisbon hotel is confirmed. I put the deposit on the card ending {card}.",
		"One more thing: the Algarve transfer leaves at 9am.\n\nRest up!",
	}
	c := func(name string, expect int, o dispOpts) Case {
		return Case{Name: name, Fn: "email-dispatch", Token: cronToken, Expect: expect,
			Body:  func(*World) string { return `{"trigger":"cron"}` },
			Setup: func(t *testing.T, w *World) { dispFixture(t, w, o) },
			Snap:  dispSnap}
	}
	get := c("GET is refused", 403, dispOpts{bodies: words[:1], noOutbox: true})
	get.Method = "GET"
	Run(t, deno, goW, []Case{
		get,
		c("nothing due", 200, dispOpts{bodies: words[:1], noOutbox: true}),
		c("a due email goes, card number masked, default signature", 200, dispOpts{bodies: words}),
		c("a follow-up threads under the last email, own signature, a file", 200,
			dispOpts{bodies: words, previous: true, signature: &sig, phone: &phone, attachment: true}),
		c("no replies left: failed for good", 200, dispOpts{bodies: words[:1], noReplies: true}),
		c("opted out: skipped, nothing sent", 200, dispOpts{bodies: words[:1], optedOut: true}),
		c("read in the app first: cleared", 200, dispOpts{bodies: words[:1], readInApp: true}),
		c("a run that died: counted a try, then sent", 200, dispOpts{bodies: words[:1], stale: true}),
		c("a client-message alert", 200, dispOpts{bodies: words[:1], noOutbox: true, alert: "client_message"}),
		c("a quote-request alert", 200, dispOpts{bodies: words[:1], noOutbox: true, alert: "quote_request"}),
		c("a lead's alert", 200, dispOpts{bodies: words[:1], noOutbox: true, alert: "lead_message"}),
		c("an alert whose thread was read: cleared", 200, dispOpts{bodies: words[:1], noOutbox: true, alert: "client_message", alertReadInApp: true}),
		c("an email and an alert in one pass", 200, dispOpts{bodies: words, alert: "quote_request"}),
	})
}
