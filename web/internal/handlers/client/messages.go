package client

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screens 2.6.1 Messages Inbox, 2.6.2 Conversation Thread and 2.6.3 New Conversation.
//
// 2.6.1 and 2.6.2 are ONE PAGE. 2.6.2 is 2.6.1 with the thread in the right pane instead of
// the "pick one" state, which is what the React version does by rendering the same list
// component beside each.

var messagesSpec = page.Spec{
	File:   "client/messages.html",
	Layout: shell.Client,
	Slots: []string{
		"inbox", "new-cta", "search-form", "search-label", "search-input",
		"inbox-empty", "search-empty", "threads",
		"pick", "body", "not-found", "read-error",
		"back", "head-photo", "head-initials", "head-title", "head-sub",
		"open-trip", "open-trip-label",
		"empty", "empty-title", "empty-body", "rows",
		"send-error", "send-error-text",
		"quick-form", "quick-1", "quick-2", "quick-3", "quick-4",
		"send-form", "attach-wrap", "attach", "compose-label", "compose", "send",
	},
	Repeats: map[string][]string{
		"threads": {"row", "row-title", "row-time", "row-trip", "row-preview", "row-unread"},
		"rows": {
			"sep", "sep-label",
			"bubble", "bubble-avatar", "bubble-body", "bubble-time",
			"attachment", "attach-badge", "attach-link", "attach-size",
		},
	},
}

var messageNewSpec = page.Spec{
	File:   "client/message-new.html",
	Layout: shell.Client,
	Slots: []string{
		"title", "subtitle", "advisor", "advisor-photo", "advisor-initials",
		"advisor-name", "advisor-status",
		"send-error", "send-error-text", "new-form", "body-label", "body",
		"send", "attach-wrap", "attach",
	},
}

func (a *area) mountMessages(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(messagesSpec.File)
	if err != nil {
		return err
	}

	// show draws 2.6.1 or 2.6.2 — the same page, with or without a thread in the right pane.
	show := func(w http.ResponseWriter, r *http.Request, v visitor, conversationID string,
		status int, draft, sendError string) {

		conversations, err := a.loadInbox(r.Context(), v.AccessToken)
		if err != nil {
			// A FAILED READ IS NOT AN EMPTY INBOX. "No messages yet" shown to somebody with
			// six threads is a lie, and the one this screen must not tell.
			a.Log.Warn("client: inbox read failed", "err", err)
			d := tmpl.New()
			d.Remove("inbox")
			d.Remove("pick")
			d.Remove("body")
			d.Remove("not-found")
			d.Keep("read-error")
			a.render(w, r, v, d, http.StatusServiceUnavailable)
			return
		}

		var thread *ConversationThreadView
		if conversationID != "" {
			var found bool
			thread, found, err = a.loadConversationThread(r.Context(), v.AccessToken, conversationID)
			if err != nil {
				a.Log.Warn("client: conversation read failed", "err", err)
				d := tmpl.New()
				d.Remove("inbox")
				d.Remove("pick")
				d.Remove("body")
				d.Remove("not-found")
				d.Keep("read-error")
				a.render(w, r, v, d, http.StatusServiceUnavailable)
				return
			}
			if !found {
				// No row, not yours, and archived are ONE answer: conversation_self_select
				// makes all three invisible, so none of them can be told apart and none of
				// them should be.
				d := tmpl.New()
				d.Remove("inbox")
				d.Remove("pick")
				d.Remove("body")
				d.Remove("read-error")
				d.Keep("not-found")
				a.render(w, r, v, d, http.StatusNotFound)
				return
			}
		}

		d := tmpl.New()
		d.Remove("read-error")
		d.Remove("not-found")
		d.Keep("inbox")
		a.fillInbox(d, r, v, conversations, conversationID)

		if thread == nil {
			d.Remove("body")
			d.Keep("pick")
		} else {
			d.Remove("pick")
			d.Keep("body")
			// Below 1200px an open thread is the whole screen and the list is where Back
			// returns to (§4.4's push); at that width the list comes back beside it.
			d.Class("inbox", "is-aside", true)
			a.fillConversation(d, r, v, thread, draft, sendError)
		}
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /messages", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, "", http.StatusOK, "", "")
	}))

	rt.Protected("GET /messages/{conversationId}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, r.PathValue("conversationId"), http.StatusOK, "", "")
	}))

	rt.Protected("POST /messages/{conversationId}", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		id := r.PathValue("conversationId")
		back := "/messages/" + id

		if quick := form.Get("quick"); quick != "" {
			if !isQuickReply(quick) {
				web.SeeOther(w, r, back)
				return
			}
			show(w, r, v, id, http.StatusOK, quick, "")
			return
		}

		body := strings.TrimSpace(form.Get("body"))
		if body == "" || a.off {
			web.SeeOther(w, r, back)
			return
		}

		// Addressed by CONVERSATION, not trip. A general thread has trip_id IS NULL and no
		// trip to key on, so the 2.2.7 send cannot serve this screen at all.
		res := a.API.Call(r.Context(), "trip-message", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body:   sendToConversation{MessageID: uuid.New(), ConversationID: id, Body: body},
		})
		out := web.FromResult(res, MessagesCopy.NewFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = MessagesCopy.NewFailed
			}
			show(w, r, v, id, out.Status, body, msg)
		default:
			web.SeeOther(w, r, back)
		}
	}))

	rt.Protected("POST /messages/{conversationId}/read", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		a.markConversationRead(r, v, r.PathValue("conversationId"), form.Get("seenUpTo"))
		w.WriteHeader(http.StatusNoContent)
	}))
	return nil
}

// sendToConversation is trip-message addressed by conversation.
type sendToConversation struct {
	MessageID      string `json:"messageId"`
	ConversationID string `json:"conversationId"`
	Body           string `json:"body"`
}

// startConversation is trip-message with NEITHER id, which is what tells it to find-or-create
// against trip_id IS NULL.
type startConversation struct {
	MessageID string `json:"messageId"`
	Body      string `json:"body"`
}

// fillInbox draws the list pane.
func (a *area) fillInbox(d *page.Doc, r *http.Request, v visitor, conversations []InboxConversation, activeID string) {
	d.Text("new-cta", MessagesCopy.NewCta)
	d.Keep("new-cta")

	loc := Location(a.travelerZone(r.Context(), v.AccessToken))
	all := InboxRows(conversations, loc, a.now(), activeID)

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	// Search earns its place only once there is something to search. One thread and a search
	// box is furniture.
	if len(all) > 1 {
		d.Keep("search-form")
		// The action is THIS path, so searching from an open thread filters the list beside
		// it and leaves the thread open — and a reload keeps both.
		d.URL("search-form", "action", r.URL.Path)
		d.Text("search-label", MessagesCopy.SearchPlaceholder)
		d.Attr("search-input", "placeholder", MessagesCopy.SearchPlaceholder)
		d.Attr("search-input", "value", query)
	} else {
		d.Remove("search-form")
	}

	visible := FilterRows(all, query)
	switch {
	case len(all) == 0:
		d.Keep("inbox-empty")
		d.Remove("search-empty")
		d.Remove("threads")
	case len(visible) == 0:
		d.Remove("inbox-empty")
		d.Keep("search-empty")
		d.Text("search-empty", MessagesCopy.SearchEmpty)
		d.Remove("threads")
	default:
		d.Remove("inbox-empty")
		d.Remove("search-empty")
		d.Keep("threads")
		fillThreadList(d, visible, r.URL.RawQuery)
	}
}

func fillThreadList(d *page.Doc, rows []InboxRow, rawQuery string) {
	d.Repeat("threads", len(rows), func(i int, row *page.Row) {
		t := rows[i]
		href := t.Href
		if rawQuery != "" {
			// The search survives following a row, so the list beside the thread is still
			// the filtered one they were looking at.
			href += "?" + rawQuery
		}
		row.URL("row", "href", href)
		if t.Active {
			row.Class("row", "is-active", true)
			row.Attr("row", "aria-current", "page")
		}
		row.Text("row-title", t.Title)
		row.Text("row-time", t.Time)
		if t.TripLabel == "" {
			row.Remove("row-trip")
		} else {
			row.Text("row-trip", t.TripLabel)
		}
		row.Text("row-preview", t.Preview)
		// client_unread_count is granted and drawn, but nothing in this repo raises it yet:
		// trip-message sets it to 0 at creation and only increments the agent's side. The
		// badge is ready for the day the agent send path lands.
		if t.UnreadCount <= 0 {
			row.Remove("row-unread")
		} else {
			row.Text("row-unread", strconv.Itoa(t.UnreadCount))
		}
	})
}

// fillConversation draws the thread in the right pane: 2.2.7's body with a different header.
func (a *area) fillConversation(d *page.Doc, r *http.Request, v visitor,
	view *ConversationThreadView, draft, sendError string) {

	d.Attr("back", "aria-label", MessagesCopy.BackToMessages)
	d.Keep("back")

	card := a.loadAdvisorCard(r.Context(), v.AccessToken)
	if card != nil && card.AvatarURL != "" {
		d.URL("head-photo", "src", card.AvatarURL)
		d.Remove("head-initials")
	} else {
		d.Remove("head-photo")
		initials := MessagesCopy.AdvisorInitials
		if card != nil && card.Initials != "" {
			initials = card.Initials
		}
		d.Text("head-initials", initials)
	}

	d.Text("head-title", view.Title)
	d.Text("head-sub", threadSubtitle(0, card))

	// Only when there is a trip to open. The general thread has none.
	if view.TripID == "" {
		d.Remove("open-trip")
	} else {
		d.URL("open-trip", "href", "/trips/"+view.TripID)
		d.Attr("open-trip", "aria-label", ThreadMessages.OpenTrip)
		d.Text("open-trip-label", ThreadMessages.OpenTrip)
	}

	// A general thread has no trip library to open, so its attachments point at the
	// account-wide one. A trip thread keeps its own.
	documentsHref := "/documents"
	if view.TripID != "" {
		documentsHref = "/trips/" + view.TripID + "/documents"
	}

	rows := threadRows(&TripThreadView{TimeZone: view.TimeZone, Messages: view.Messages}, a.now())
	if len(rows) == 0 {
		d.Keep("empty")
		d.Text("empty-title", ThreadMessages.EmptyTitle)
		// The shared default names a trip. Right on a trip thread, wrong on the one kind of
		// thread that has none.
		body := ThreadMessages.EmptyBody
		if view.TripID == "" {
			body = MessagesCopy.ThreadEmptyBody
		}
		d.Text("empty-body", body)
		d.Remove("rows")
	} else {
		d.Remove("empty")
		d.Keep("rows")
		fillThreadRows(d, rows, documentsHref)
	}

	if sendError == "" {
		d.Remove("send-error")
	} else {
		d.Keep("send-error")
		d.Text("send-error-text", sendError)
	}

	action := "/messages/" + view.ConversationID
	d.URL("quick-form", "action", action)
	for i, q := range QuickReplies {
		slot := "quick-" + strconv.Itoa(i+1)
		d.Text(slot, q)
		d.Attr(slot, "value", q)
	}
	d.URL("send-form", "action", action)
	d.Attr("attach-wrap", "title", MessagesCopy.AttachDeferred)
	d.Keep("attach-wrap")
	d.Attr("attach", "title", MessagesCopy.AttachDeferred)
	d.Attr("attach", "aria-label", ThreadMessages.AttachLabel)
	d.Keep("attach")
	d.Text("compose-label", ThreadMessages.ComposePlaceholder)
	d.Attr("compose", "placeholder", ThreadMessages.ComposePlaceholder)
	d.Text("compose", draft)
	d.Keep("send")

	if view.UnreadCount > 0 && len(view.Messages) > 0 {
		d.Attr("body", "data-conversation", view.ConversationID)
		d.Attr("body", "data-seen-up-to", view.Messages[len(view.Messages)-1].CreatedAt)
		d.Attr("body", "data-read-url", action+"/read")
	}
}

// mountMessageNew is Screen 2.6.3.
func (a *area) mountMessageNew(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(messageNewSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, v visitor, status int, draft, sendError string) {
		d := tmpl.New()
		d.Text("title", MessagesCopy.NewTitle)
		d.Text("subtitle", MessagesCopy.NewSubtitle)

		card := a.loadAdvisorCard(r.Context(), v.AccessToken)
		if card != nil && card.AvatarURL != "" {
			d.URL("advisor-photo", "src", card.AvatarURL)
			d.Remove("advisor-initials")
		} else {
			d.Remove("advisor-photo")
			initials := MessagesCopy.AdvisorInitials
			if card != nil && card.Initials != "" {
				initials = card.Initials
			}
			d.Text("advisor-initials", initials)
		}
		name, status2 := MessagesCopy.AdvisorName, MessagesCopy.ReplyWindow
		if card != nil {
			if card.DisplayName != "" {
				name = card.DisplayName
			}
			status2 = threadSubtitle(0, card)
		}
		d.Text("advisor-name", name)
		d.Text("advisor-status", status2)
		d.Keep("advisor")

		if sendError == "" {
			d.Remove("send-error")
		} else {
			d.Keep("send-error")
			d.Text("send-error-text", sendError)
		}
		d.Text("body-label", MessagesCopy.NewBodyLabel)
		d.Attr("body", "placeholder", MessagesCopy.NewPlaceholder)
		d.Text("body", draft)
		d.Keep("new-form")
		d.Keep("send")
		d.Attr("attach-wrap", "title", MessagesCopy.AttachDeferred)
		d.Keep("attach-wrap")
		d.Attr("attach", "title", MessagesCopy.AttachDeferred)
		d.Attr("attach", "aria-label", ThreadMessages.AttachLabel)
		d.Keep("attach")
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /messages/new", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, http.StatusOK, "", "")
	}))

	rt.Protected("POST /messages/new", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		body := strings.TrimSpace(form.Get("body"))
		if body == "" || a.off {
			web.SeeOther(w, r, "/messages/new")
			return
		}

		// NEITHER ID. That is what tells trip-message to find-or-create against
		// trip_id IS NULL, so a traveler who writes twice lands in one thread rather than
		// two.
		res := a.API.Call(r.Context(), "trip-message", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body:   startConversation{MessageID: uuid.New(), Body: body},
		})
		var reply startedConversation
		if res.OK && len(res.Data) > 0 {
			// A body that does not parse is not worth failing a message that was sent: the
			// fallback below lands them in the inbox, where it is.
			_ = json.Unmarshal(res.Data, &reply)
		}
		out := web.FromResult(res, MessagesCopy.NewFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = MessagesCopy.NewFailed
			}
			show(w, r, v, out.Status, body, msg)
		case reply.ConversationID != "":
			// Into the thread it just created or appended to, because the screen it is
			// leaving has nothing left to show.
			web.SeeOther(w, r, "/messages/"+reply.ConversationID)
		default:
			// A reply with no conversation id should not strand the traveler on a screen
			// whose message has already been sent. The inbox is the honest fallback, and
			// their message is in it.
			web.SeeOther(w, r, "/messages")
		}
	}))
	return nil
}

// startedConversation is what trip-message answers with when it creates the thread.
type startedConversation struct {
	ConversationID string `json:"conversationId"`
}
