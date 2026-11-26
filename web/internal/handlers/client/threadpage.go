package client

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 2.2.7 Trip Messages (web/app/(client)/trips/[tripId]/messages).

var threadSpec = page.Spec{
	File:   "client/thread.html",
	Layout: shell.Client,
	Slots: []string{
		"not-found", "read-error", "error-back", "body",
		"back", "head-photo", "head-initials", "head-title", "head-sub",
		"open-trip", "open-trip-label",
		"empty", "empty-title", "empty-body", "rows",
		"send-error", "send-error-text",
		"quick-form", "quick-1", "quick-2", "quick-3", "quick-4",
		"send-form", "attach-wrap", "attach", "compose-label", "compose", "send",
	},
	Repeats: map[string][]string{
		"rows": {
			"sep", "sep-label",
			"bubble", "bubble-avatar", "bubble-body", "bubble-time",
			"attachment", "attach-badge", "attach-link", "attach-size",
		},
	},
}

// THREAD is the screen's web-only chrome. The rest of its copy is ThreadMessages, which the
// mobile twin renders too.
const (
	threadBack  = "Back to trip"
	threadTitle = "Messages"
	// advisorName is the one-word form the header uses. ThreadMessages has no twin for it:
	// the artboard's "last reply 2h ago" beneath it is deliberately dropped, because it
	// decays — a page cached for an hour tells the traveler a confident lie about how
	// recently their advisor spoke, while the timestamp on the last bubble cannot go stale.
	advisorName         = "Gyasi"
	threadAttachDefer   = "Attaching from the web arrives with the upload screen"
	threadReadErrTitle  = "We couldn't load this conversation"
	threadFallbackInits = "GS"
)

// threadUnreadLabel is THREAD.unreadLabel. 2.2.4 has its own, shorter, for a tile.
func threadUnreadLabel(count int) string {
	if count == 1 {
		return "1 new message"
	}
	return strconv.Itoa(count) + " new messages"
}

// bubbleRowClass keeps the two alignments literal, because internal/static/classes_test.go
// reads the names out of the source and a built string reads as a class no stylesheet has.
var bubbleRowClass = map[bool]string{true: "cl-row-mine", false: "cl-row-theirs"}

var bubbleClass = map[bool]string{true: "cl-bubble-mine", false: "cl-bubble-theirs"}

func (a *area) mountThread(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(threadSpec.File)
	if err != nil {
		return err
	}

	// show draws the screen. draft is what belongs in the compose box — what a refused send
	// handed back, or the quick reply they just picked — and sendError is the sentence above
	// it, if any.
	show := func(w http.ResponseWriter, r *http.Request, v visitor, tripID string, status int, draft, sendError string) {
		// The read happens BEFORE the page is built, so a trip that is not there and a read
		// that failed each get their own document rather than a half-filled one.
		view, found, err := a.loadTripThread(r.Context(), v.AccessToken, tripID)
		d := tmpl.New()
		switch {
		case err != nil:
			// A FAILED READ IS NOT AN EMPTY THREAD. Showing "no messages yet" to somebody
			// with a conversation full of them is a lie, and on this screen it is the lie
			// that makes them write the same question twice.
			a.Log.Warn("client: thread read failed", "err", err)
			d.Remove("not-found")
			d.Remove("body")
			d.Keep("read-error")
			d.URL("error-back", "href", "/trips/"+tripID)
			a.render(w, r, v, d, http.StatusServiceUnavailable)
			return
		case !found:
			d.Remove("read-error")
			d.Remove("body")
			d.Keep("not-found")
			a.render(w, r, v, d, http.StatusNotFound)
			return
		}

		d.Remove("not-found")
		d.Remove("read-error")
		d.Keep("body")
		a.fillThread(d, r, v, view, draft, sendError)
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /trips/{tripId}/messages", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, r.PathValue("tripId"), http.StatusOK, "", "")
	}))

	rt.Protected("POST /trips/{tripId}/messages", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")

		// A quick reply FILLS the box and sends nothing. With JavaScript the chip does that
		// in the page; this is the same thing without it, and the only reason it is a round
		// trip at all.
		if quick := form.Get("quick"); quick != "" {
			if !isQuickReply(quick) {
				// Only the four. A chip is copy, not an input, and a posted "quick" that is
				// not one of them was not drawn by this page.
				web.SeeOther(w, r, "/trips/"+tripID+"/messages")
				return
			}
			show(w, r, v, tripID, http.StatusOK, quick, "")
			return
		}

		body := strings.TrimSpace(form.Get("body"))
		if body == "" {
			// Nothing to send is not an error worth a sentence.
			web.SeeOther(w, r, "/trips/"+tripID+"/messages")
			return
		}
		if a.off {
			web.SeeOther(w, r, "/trips/"+tripID+"/messages")
			return
		}

		res := a.API.Call(r.Context(), "trip-message", v.AccessToken, api.Input{
			Method: http.MethodPost,
			// A client-minted UUID v7 makes the retry after a dropped connection safe: the
			// same id cannot post the message twice.
			Body: sendMessageBody{MessageID: uuid.New(), TripID: tripID, Body: body},
		})
		out := web.FromResult(res, ThreadMessages.SendFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			// The draft rides back. Losing a paragraph somebody typed because a request
			// timed out is the kind of small betrayal that stops people using a thread.
			//
			// The screen's OWN sentence for an outage, not the shared one: what the traveler
			// needs to read is that their message is still in the box. A rejection keeps the
			// function's own detail, as everywhere else.
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = ThreadMessages.SendFailed
			}
			show(w, r, v, tripID, out.Status, body, msg)
		default:
			web.SeeOther(w, r, "/trips/"+tripID+"/messages")
		}
	}))

	// Opening a thread reads it, up to the newest message that was on their screen. A POST
	// and not part of the GET: a render is not a reading, and a page drawn for a crawler or
	// a link preview must not clear somebody's unread count.
	rt.Protected("POST /trips/{tripId}/messages/read", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		a.markConversationRead(r, v, form.Get("conversationId"), form.Get("seenUpTo"))
		// Always 204, and never a redirect: the caller is a fetch from the page that is
		// already drawn, and a failure costs nothing but the badge, which the next open
		// clears.
		w.WriteHeader(http.StatusNoContent)
	}))
	return nil
}

// sendMessageBody is trip-message's body.
type sendMessageBody struct {
	MessageID string `json:"messageId"`
	TripID    string `json:"tripId"`
	Body      string `json:"body"`
}

// markReadArgs are client_mark_conversation_read's.
type markReadArgs struct {
	ConversationID string `json:"p_conversation_id"`
	// SeenUpTo is passed through as Postgres wrote it.
	SeenUpTo string `json:"p_seen_up_to"`
}

func (a *area) markConversationRead(r *http.Request, v visitor, conversationID, seenUpTo string) {
	if a.off || conversationID == "" || seenUpTo == "" {
		return
	}
	if _, err := supa.RPC[bool](r.Context(), a.Supa, v.AccessToken, "client_mark_conversation_read",
		markReadArgs{ConversationID: conversationID, SeenUpTo: seenUpTo}); err != nil {
		a.Log.Warn("client: mark conversation read failed", "err", err)
	}
}

// isQuickReply is whether a posted chip is one of the four this page draws.
func isQuickReply(s string) bool {
	for _, q := range QuickReplies {
		if q == s {
			return true
		}
	}
	return false
}

// threadRow is one line of the flattened repeat: a day separator, a bubble, or one
// attachment under the bubble above it. A repeat cannot nest inside a repeat, so the three
// shapes share one sequence and each row keeps the one it is.
type threadRow struct {
	kind string
	// sep
	label string
	// bubble
	mine      bool
	body      string
	time      string
	autoReply bool
	// attachment
	doc Document
}

// threadRows flattens the day buckets.
func threadRows(view *TripThreadView, now time.Time) []threadRow {
	loc := Location(view.TimeZone)
	var rows []threadRow
	for _, day := range GroupMessagesByDay(view.Messages, loc, now) {
		rows = append(rows, threadRow{kind: "sep", label: day.Label})
		for _, m := range day.Messages {
			mine := m.Sender == "client"
			rows = append(rows, threadRow{
				kind: "bubble", mine: mine, body: m.Body,
				time: FormatMessageTime(m.CreatedAt, loc), autoReply: m.AutoReply,
			})
			for _, doc := range m.Attachments {
				rows = append(rows, threadRow{kind: "attachment", mine: mine, doc: doc})
			}
		}
	}
	return rows
}

func (a *area) fillThread(d *page.Doc, r *http.Request, v visitor, view *TripThreadView, draft, sendError string) {
	tripHref := "/trips/" + view.TripID
	d.URL("back", "href", tripHref)
	d.Attr("back", "aria-label", threadBack)
	d.URL("open-trip", "href", tripHref)
	d.Text("open-trip-label", ThreadMessages.OpenTrip)
	d.Attr("open-trip", "aria-label", ThreadMessages.OpenTrip)

	card := a.loadAdvisorCard(r.Context(), v.AccessToken)
	if card != nil && card.AvatarURL != "" {
		d.URL("head-photo", "src", card.AvatarURL)
		d.Remove("head-initials")
	} else {
		d.Remove("head-photo")
		initials := threadFallbackInits
		if card != nil && card.Initials != "" {
			initials = card.Initials
		}
		d.Text("head-initials", initials)
	}

	d.Text("head-title", advisorName+" · "+view.TripTitle)
	d.Text("head-sub", threadSubtitle(view.UnreadCount, card))

	rows := threadRows(view, a.now())
	if len(rows) == 0 {
		d.Keep("empty")
		d.Text("empty-title", ThreadMessages.EmptyTitle)
		d.Text("empty-body", ThreadMessages.EmptyBody)
		d.Remove("rows")
	} else {
		d.Remove("empty")
		d.Keep("rows")
		fillThreadRows(d, rows, tripHref+"/documents")
	}

	// The compose bar.
	if sendError == "" {
		d.Remove("send-error")
	} else {
		d.Keep("send-error")
		d.Text("send-error-text", sendError)
	}
	d.URL("quick-form", "action", tripHref+"/messages")
	for i, q := range QuickReplies {
		slot := "quick-" + strconv.Itoa(i+1)
		d.Text(slot, q)
		d.Attr(slot, "value", q)
	}
	d.URL("send-form", "action", tripHref+"/messages")
	// A disabled MUI button has pointer-events: none, so the wrapping span carries the same
	// title and the reason still shows on hover. Kept the same way here.
	d.Attr("attach-wrap", "title", threadAttachDefer)
	d.Keep("attach-wrap")
	d.Attr("attach", "title", threadAttachDefer)
	d.Attr("attach", "aria-label", ThreadMessages.AttachLabel)
	d.Keep("attach")
	d.Text("compose-label", ThreadMessages.ComposePlaceholder)
	d.Attr("compose", "placeholder", ThreadMessages.ComposePlaceholder)
	// The textarea's value is its TEXT, which is why a refused send can hand the draft back
	// at all: there is no value attribute on a textarea to set.
	d.Text("compose", draft)
	d.Keep("send")

	// What the mark-read script needs, on the form it already has. Absent on a thread with
	// nothing unread, so the script has nothing to post.
	if view.ConversationID != "" && view.UnreadCount > 0 && len(view.Messages) > 0 {
		d.Attr("body", "data-conversation", view.ConversationID)
		d.Attr("body", "data-seen-up-to", view.Messages[len(view.Messages)-1].CreatedAt)
		d.Attr("body", "data-read-url", tripHref+"/messages/read")
	}
}

// threadSubtitle is the line under the advisor's name: what they have not read, else the
// advisor's own away or reply promise, else the fixed one.
func threadSubtitle(unread int, card *AdvisorCard) string {
	if unread > 0 {
		return threadUnreadLabel(unread)
	}
	if card != nil {
		if card.AwayLabel != "" {
			return card.AwayLabel
		}
		if card.ReplyLabel != "" {
			return card.ReplyLabel
		}
	}
	return ThreadMessages.ReplyWindow
}

func fillThreadRows(d *page.Doc, rows []threadRow, documentsHref string) {
	d.Repeat("rows", len(rows), func(i int, row *page.Row) {
		r := rows[i]
		switch r.kind {
		case "sep":
			row.Remove("bubble")
			row.Remove("attachment")
			row.Keep("sep")
			row.Text("sep-label", r.label)
		case "bubble":
			row.Remove("sep")
			row.Remove("attachment")
			row.Keep("bubble")
			row.Class("bubble", bubbleRowClass[r.mine], true)
			row.Class("bubble-body", bubbleClass[r.mine], true)
			row.Text("bubble-body", r.body)
			if r.mine {
				// The traveler's own bubbles carry no avatar: there is only one other person
				// in this conversation, and a row of their own initials beside every line
				// they wrote says nothing.
				row.Remove("bubble-avatar")
			} else {
				row.Text("bubble-avatar", threadFallbackInits)
			}
			stamp := r.time
			if !r.mine && r.autoReply {
				// §3.12.2: sent for the advisor while they were away.
				stamp += " · " + ThreadMessages.AutoReply
			}
			row.Text("bubble-time", stamp)
		default:
			row.Remove("sep")
			row.Remove("bubble")
			row.Keep("attachment")
			row.Class("attachment", bubbleRowClass[r.mine], true)
			row.Text("attach-badge", DocumentBadge(r.doc.MimeType))
			row.Text("attach-link", r.doc.Filename)
			row.URL("attach-link", "href", documentsHref)
			row.Text("attach-size", FormatFileSize(r.doc.SizeBytes))
		}
	})
}
