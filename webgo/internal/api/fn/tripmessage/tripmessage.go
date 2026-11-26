// Package tripmessage ports supabase/functions/trip-message: a traveler posts a message into a
// thread. Screens 2.2.7, 2.6.2 and 2.6.3. Mobile calls it.
//
// STILL NAMED trip-message although it now serves three ways to address a thread (a trip, an
// existing conversation, or the general thread); renaming a deployed function moves
// config.toml, CI, the contract and both clients together, so it waits.
//
// WHY A FUNCTION. `message` has SELECT-only RLS, so a client insert matches zero rows and
// looks like it worked. This also creates the thread on the first message, keeps the thread's
// time and preview, and bumps the advisor's unread count.
//
// NOT ATOMIC. The message, the thread update and the attachment rows are separate round trips;
// a failure between them leaves a stale preview or an attachment-less message. Kept as Deno
// had it.
//
// CARD DIGITS. The Deno function neither refuses nor masks card numbers in a message; it
// stores the text as the traveler wrote it, and so does this port. (Push text is masked where
// it is built, in _shared/push.ts, not here.)
package tripmessage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	maxBody        = 8000
	maxAttachments = 10
	// previewLength: the inbox row shows a snippet, not the message.
	previewLength = 140
)

// request is the parsed body.
type request struct {
	MessageID string
	// TripGiven is false when tripId was absent (undefined: the audit metadata leaves the key
	// out); TripID is nil for an explicit null.
	TripGiven      bool
	TripID         *string
	ConversationID *string
	Body           string
	Attachments    []string
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	clientID, err := trip.RequireClientID(c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	req, err := parse(payload, d.Now())
	if err != nil {
		return nil, err
	}
	ctx := r.Context()

	conversationID, err := thread(ctx, d.DB, clientID, req)
	if err != nil {
		return nil, err
	}

	var inserted []struct {
		ID        string `json:"id"`
		CreatedAt string `json:"created_at"`
	}
	err = d.DB.From("message").Select("id, created_at").Insert(ctx, js.O(
		"id", req.MessageID,
		"conversation_id", conversationID,
		"sender_user_id", c.PlatformUserID,
		"sender_role", "client",
		"body", req.Body,
		// A client cannot write an internal note; set explicitly because the read policy
		// filters on it.
		"is_internal_note", false,
	), &inserted)
	if err != nil {
		if dbCode(err) == "23505" {
			return nil, problem.BadRequest("That message was already sent.")
		}
		return nil, fmt.Errorf("message insert failed: %w", err)
	}
	if len(inserted) != 1 { // .single()
		return nil, errors.New("message insert failed: not one row")
	}

	if len(req.Attachments) > 0 {
		// Only documents this client owns and already registered through trip-document:
		// filtering here is what stops a client attaching somebody else's passport. A failed
		// read attaches nothing, as Deno ignored the error and read data as null.
		var owned []struct {
			ID string `json:"id"`
		}
		if err := d.DB.From("document").Select("id").In("id", req.Attachments).
			Eq("client_id", clientID).Is("archived_at", nil).Rows(ctx, &owned); err != nil {
			owned = nil
		}
		if len(owned) > 0 {
			rows := make([]js.Ordered, len(owned))
			for i, doc := range owned {
				rows[i] = js.O("id", uuid.New(), "message_id", req.MessageID, "document_id", doc.ID)
			}
			if err := d.DB.From("message_attachment").Insert(ctx, rows, nil); err != nil {
				return nil, fmt.Errorf("attachment insert failed: %w", err)
			}
		}
	}

	// The thread's time, preview and the advisor's count in ONE statement (§3.10). The
	// client's own count is untouched.
	var bumped json.RawMessage
	if err := d.DB.RPC(ctx, "conversation_record_client_message", js.O("p_message_id", req.MessageID), &bumped); err != nil {
		return nil, fmt.Errorf("conversation update failed: %w", err)
	}
	if strings.TrimSpace(string(bumped)) != "true" {
		return nil, errors.New("conversation update matched no thread")
	}

	var tripMeta any = js.Undef
	if req.TripGiven {
		tripMeta = req.TripID
	}
	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    "message.created",
		TargetEntity: "message",
		TargetID:     req.MessageID,
		Metadata:     js.O("tripId", tripMeta, "conversationId", conversationID, "attachments", len(req.Attachments)),
	}); err != nil {
		return nil, err
	}

	return &edge.Reply{Status: http.StatusCreated, Body: js.O(
		"messageId", inserted[0].ID,
		"conversationId", conversationID,
		"createdAt", inserted[0].CreatedAt,
	)}, nil
}

// parse reads the body in the order the TypeScript checks it.
func parse(p js.Value, now time.Time) (request, error) {
	var req request
	id, ok := p.Get("messageId").Str()
	if !ok {
		return req, problem.BadRequest("Send a messageId.")
	}
	if msg := recentV7Problem(id, now); msg != "" {
		return req, problem.BadRequest("messageId must be a recent UUID v7: " + msg)
	}
	req.MessageID = id

	// THREE WAYS TO ADDRESS A THREAD, at most one id per call: tripId (§2.2.7), conversationId
	// (§2.6.2), neither (§2.6.3, the general thread). Both is refused rather than picking a
	// winner, since they can disagree.
	tripV, convV := p.Get("tripId"), p.Get("conversationId")
	if !tripV.IsNullish() && tripV.Kind() != js.String {
		return req, problem.BadRequest("tripId must be a string.")
	}
	if !convV.IsNullish() && convV.Kind() != js.String {
		return req, problem.BadRequest("conversationId must be a string.")
	}
	tripID, tripIsStr := tripV.Str()
	convID, convIsStr := convV.Str()
	if tripIsStr && convIsStr {
		return req, problem.BadRequest("Send a tripId or a conversationId, not both.")
	}
	req.TripGiven = !tripV.IsUndefined()
	if tripIsStr {
		req.TripID = &tripID
	}
	if convIsStr {
		req.ConversationID = &convID
	}

	if s, ok := p.Get("body").Str(); ok {
		req.Body = js.Trim(s)
	}
	if req.Body == "" {
		return req, problem.BadRequest("A message needs something in it.")
	}
	if js.Len(req.Body) > maxBody {
		return req, problem.BadRequest("Keep it under " + strconv.Itoa(maxBody) + " characters.")
	}

	atts, err := normaliseAttachments(p.Get("attachmentDocumentIds"))
	if err != nil {
		return req, err
	}
	req.Attachments = atts
	return req, nil
}

func normaliseAttachments(v js.Value) ([]string, error) {
	if v.IsNullish() {
		return nil, nil
	}
	items, ok := v.Array()
	if !ok {
		return nil, problem.BadRequest("attachmentDocumentIds must be an array.")
	}
	if len(items) > maxAttachments {
		return nil, problem.BadRequest("At most " + strconv.Itoa(maxAttachments) + " attachments.")
	}
	ids := make([]string, 0, len(items))
	for _, it := range items {
		if s, ok := it.Str(); ok {
			ids = append(ids, s)
		}
	}
	if len(ids) != len(items) {
		return nil, problem.BadRequest("attachmentDocumentIds must be strings.")
	}
	// [...new Set(ids)]: first occurrence wins its place.
	seen := make(map[string]bool, len(ids))
	out := ids[:0]
	for _, s := range ids {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out, nil
}

// thread finds (or names, or creates) the conversation the message goes into.
func thread(ctx context.Context, db *service.Client, clientID string, req request) (string, error) {
	if req.ConversationID != nil {
		// §2.6.2: named directly; ownership is checked on the conversation, which may have no
		// trip.
		conv, err := guard.RequireOwnedConversation(ctx, db, clientID, *req.ConversationID)
		if err != nil {
			return "", err
		}
		return conv.ID, nil
	}

	var owned *guard.OwnedTrip
	if req.TripID != nil {
		t, err := guard.RequireOwnedTrip(ctx, db, clientID, *req.TripID)
		if err != nil {
			return "", err
		}
		owned = &t
	}

	// FIND OR CREATE. The general thread is `.is("trip_id", null)`, never `.eq`: trip_id=eq.null
	// matches nothing, and every §2.6.3 message would mint a new thread.
	findLive := func() (string, error) {
		q := db.From("conversation").Select("id").Eq("client_id", clientID).Is("archived_at", nil)
		if owned != nil {
			q = q.Eq("trip_id", owned.ID)
		} else {
			q = q.Is("trip_id", nil)
		}
		var row struct {
			ID string `json:"id"`
		}
		found, err := q.MaybeSingle(ctx, &row)
		if err != nil {
			return "", fmt.Errorf("conversation lookup failed: %w", err)
		}
		if !found {
			return "", nil
		}
		return row.ID, nil
	}

	id, err := findLive()
	if err != nil || id != "" {
		return id, err
	}

	// conversation.agent_id is NOT NULL: the trip has it; the general thread reads it off the
	// client (a client caller's own agent id is always null).
	var agentID string
	if owned != nil {
		agentID = owned.AgentID
	} else if agentID, err = guard.RequireClientAgentID(ctx, db, clientID); err != nil {
		return "", err
	}

	newID := uuid.New()
	var tripCol, subject any // null for the general thread, which has no trip to borrow a name from
	if owned != nil {
		tripCol, subject = owned.ID, owned.Title
	}
	err = db.From("conversation").Insert(ctx, js.O(
		"id", newID,
		"client_id", clientID,
		"agent_id", agentID,
		"trip_id", tripCol,
		"subject", subject,
		// last_message_at is left to the column default (the database's clock), so the message
		// inserted next is never older than the thread it starts.
		"last_message_preview", previewJSON(req.Body),
		"client_unread_count", 0,
		"agent_unread_count", 0,
	), nil)
	var se *service.Error
	switch {
	case err != nil && errors.As(err, &se) && se.Code == "23505" && strings.Contains(se.Message, "conversation_one_live"):
		// The advisor started this thread a moment ago (one live thread per trip, and per
		// client with no trip, is a unique index since §3.10). Write in theirs.
		id, err := findLive()
		if err != nil {
			return "", err
		}
		if id == "" {
			return "", errors.New("conversation vanished after a unique clash")
		}
		return id, nil
	case err != nil:
		return "", fmt.Errorf("conversation insert failed: %w", err)
	}
	return newID, nil
}

func dbCode(err error) string {
	var se *service.Error
	if errors.As(err, &se) {
		return se.Code
	}
	return ""
}

var spaceRun = js.Regexp(`\s+`, "")

// previewUnits is preview(): one line, trimmed on a word boundary where one is close enough,
// so a preview never cuts mid-word. In UTF-16 units, as the TypeScript counted, so a cut can
// land between the halves of an emoji.
func previewUnits(body string) []uint16 {
	oneLine := utf16.Encode([]rune(js.Trim(spaceRun.ReplaceAllString(body, " "))))
	if len(oneLine) <= previewLength {
		return oneLine
	}
	cut := oneLine[:previewLength]
	lastSpace := -1
	for i := len(cut) - 1; i >= 0; i-- {
		if cut[i] == ' ' {
			lastSpace = i
			break
		}
	}
	if lastSpace > previewLength-20 {
		cut = cut[:lastSpace]
	}
	return append(append(make([]uint16, 0, len(cut)+1), cut...), 0x2026) // U+2026, the ellipsis
}

// previewJSON is the preview as JSON.stringify wrote it into the insert. A cut through an
// emoji leaves a lone surrogate, which JSON.stringify escapes (\ud83d) and Postgres then
// refuses: the Deno insert failed there, and sending the same bytes fails the same way.
func previewJSON(body string) json.RawMessage {
	units := previewUnits(body)
	var b strings.Builder
	b.WriteByte('"')
	for i := 0; i < len(units); i++ {
		u := units[i]
		switch {
		case utf16.IsSurrogate(rune(u)) && u < 0xdc00 && i+1 < len(units) && units[i+1] >= 0xdc00 && units[i+1] <= 0xdfff:
			b.WriteRune(utf16.DecodeRune(rune(u), rune(units[i+1])))
			i++
		case utf16.IsSurrogate(rune(u)):
			fmt.Fprintf(&b, `\u%04x`, u)
		default:
			s, _ := js.Marshal(string(rune(u)))
			b.WriteString(string(s[1 : len(s)-1]))
		}
	}
	b.WriteByte('"')
	return json.RawMessage(b.String())
}

// recentV7Problem is the message assertRecentUuidV7 threw, which the function quotes in its
// 400; "" when the id is a recent v7. internal/uuid's errors carry other sentences, so the
// Deno ones are rebuilt here. Judged on a millisecond clock, as Date.now() is.
func recentV7Problem(id string, now time.Time) string {
	err := uuid.CheckRecent(id, now.Truncate(time.Millisecond))
	switch {
	case err == nil:
		return ""
	case errors.Is(err, uuid.ErrTooOld):
		return "UUID v7 timestamp is more than 3600000ms old"
	case errors.Is(err, uuid.ErrInFuture):
		return "UUID v7 timestamp is more than 3600000ms in the future"
	default:
		return "Not a UUID v7: " + id
	}
}
