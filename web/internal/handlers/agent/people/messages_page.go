package people

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screens 3.10.1 Agent Inbox and 3.10.2 Conversation Thread: one two-column page rendered
// from the URL (docs/GO-MIGRATION.md §4.9), ported from app/(agent)/agent/messages and
// components/agent/{AgentInboxHeader,AgentInboxList,AgentThreadView,AgentReplyBox}.tsx.
//
// READ ON GET, NOT FROM A SCRIPT. Next marks a thread read from an effect, because a React
// server render also happens on a prefetch and a thread marked read that nobody read is a
// client question that gets missed. Nothing here is prefetched — a GET of this URL is the
// advisor opening the thread — so the read runs server-side, up to the newest message this
// page is about to show and no further, which is what `seenUpTo` means in both.

var messagesSpec = page.Spec{
	File:   "agent/people/messages.html",
	Layout: shell.Agent,
	Slots: []string{
		"frame", "list-title-h1", "list-title-h2", "view-link", "headline",
		"chip-unread", "chip-overdue", "chip-client", "chip-trip",
		"search-form", "hid-view", "hid-unread", "hid-overdue", "hid-client", "hid-trip", "in-q", "clear-filter",
		"bulk-form", "bulk-flag", "receipt", "receipt-text", "bulk-bar", "bulk-submit", "empty", "list",
		"pager", "pg-newer", "pg-older",
		"pane-pick", "pick-text", "pane-thread", "pane-new", "new-banner",
		"new-title", "new-sub", "new-form", "new-client", "new-trip", "new-id", "new-draftfor", "new-error", "new-text", "new-nologin",
		"th-back", "th-name", "th-trip", "th-archived", "th-overdue", "th-replyby",
		"th-open", "th-open-text", "th-open-trip-icon", "th-open-client-icon",
		"th-archive-form", "th-archive-flag", "th-archive-btn",
		"th-truncated", "th-empty", "th-messages",
		"rp-form", "rp-id", "rp-seen", "rp-draftfor", "rp-error", "rp-label", "rp-text", "rp-note-label", "rp-note", "rp-nologin",
		"rp-picker", "rp-status", "list-error",
		"pk-scrim", "pk-form", "pk-body", "pk-note", "pk-id", "pk-empty", "pk-empty-new",
		"pk-search-field", "pk-search", "pk-body-grid", "pk-no-match", "pk-list",
		"pk-pick-one", "pk-preview", "pk-preview-for", "pk-preview-text", "pk-missing",
		"pk-missing-text", "pk-insert", "pk-insert-asis", "pk-sel", "pk-remind", "pk-draftfor",
	},
	Repeats: map[string][]string{
		"threads": {"r-item", "r-check", "r-link", "r-name", "r-time", "r-preview", "r-trip", "r-trip-name", "r-replyby", "r-unread"},
		"pk":      {"pk-group", "pk-item", "pk-item-name"},
		"tmsg":    {"m-box", "m-day", "m-day-label", "m-note", "m-note-body", "m-note-time", "m-bubble", "m-paper", "m-sender", "m-body", "m-time", "m-attach", "m-attach-name"},
	},
}

// The two sentences a send leaves behind, as the snackbar shows them.
var (
	flashSent      = web.NewFlash("agent.messages.sent", msgSent)
	flashNoteAdded = web.NewFlash("agent.messages.note", msgNoteAdded)
)

// msgState is what one rendering adds: an open thread, a failed send, and what was typed.
type msgState struct {
	Thread    *threadView
	Error     string
	Body      string
	Note      bool
	MessageID string
	Receipt   string
	// Target and NewQuery are "Message client" before the thread exists.
	Target   *messageTarget
	NewQuery newMessageQuery
	// NotFound: the client named in the URL is not one of theirs, or archived.
	NotFound bool
	// Picker is 3.10.3, open over this thread. Nil leaves it closed.
	Picker *picker
	// Status is the one-time line the reply box reads out ("Template added…").
	Status string
}

// takeArchiveReceipt is what a bulk archive left behind, on whichever messages page loads
// next: the thread beside the list counts too, so the line is not lost to a stray click.
func takeArchiveReceipt(w http.ResponseWriter, r *http.Request, secure bool) string {
	if rc, ok := takeReceipt(w, r, secure); ok && rc.Kind == "archive" {
		return messagesMoved(rc.Changed, rc.Added)
	}
	return ""
}

// nowOf is this request's clock, so the list and the thread agree on what "Today" is.
func nowOf(*http.Request) time.Time { return time.Now() }

// ── Reads ────────────────────────────────────────────────────────────────────────────────

type inboxArgs struct {
	Archived bool    `json:"p_archived"`
	Unread   bool    `json:"p_unread"`
	Overdue  bool    `json:"p_overdue"`
	ClientID *string `json:"p_client_id"`
	TripID   *string `json:"p_trip_id"`
	Search   *string `json:"p_search"`
	Limit    int     `json:"p_limit"`
	Offset   int     `json:"p_offset"`
}

func (q inboxQuery) args(limit, offset int) inboxArgs {
	a := inboxArgs{Archived: q.Archived, Unread: q.Unread, Overdue: q.Overdue, Limit: limit, Offset: offset}
	if q.ClientID != "" {
		a.ClientID = &q.ClientID
	}
	if q.TripID != "" {
		a.TripID = &q.TripID
	}
	if q.Search != "" {
		a.Search = &q.Search
	}
	return a
}

type conversationArgs struct {
	ConversationID string `json:"p_conversation_id"`
}

// loadInbox reads the summary and one page of threads. A page past the end (its last threads
// were just archived) carries no count, so it asks for one row of page one and the caller
// can send the advisor to the real last page.
func (a *app) loadInbox(r *http.Request, v visit, q inboxQuery, now time.Time) (inbox, error) {
	var summary []msgSummaryRow
	var rows []msgThreadRow
	rs := a.reads(r.Context(), v)
	read(rs, "agent_message_summary", nil, &summary)
	read(rs, "agent_message_threads", q.args(inboxPageSize, (q.Page-1)*inboxPageSize), &rows)
	if err := rs.wait(); err != nil {
		return inbox{}, err
	}
	// Not an advisor: the summary answers no row rather than a row of zeros.
	if len(summary) == 0 {
		return inbox{}, errNoSummary
	}
	in := buildInbox(summary[0], rows, q, v.me.TimeZone, now)
	if len(rows) == 0 && q.Page > 1 {
		var first []msgThreadRow
		rs2 := a.reads(r.Context(), v)
		read(rs2, "agent_message_threads", q.args(1, 0), &first)
		if err := rs2.wait(); err != nil {
			return inbox{}, err
		}
		if len(first) > 0 {
			in.Total = first[0].TotalCount
		}
		in.PageCount = pageCountOf(in.Total)
	}
	return in, nil
}

// errNoSummary is the summary read answering no row: the caller is not an advisor, which the
// guard has already ruled out, so it reads as a failed page rather than an empty inbox.
var errNoSummary = errNoSummaryType{}

type errNoSummaryType struct{}

func (errNoSummaryType) Error() string { return "people: no message summary row" }

// loadThread reads one thread. found is false for no such thread and for somebody else's
// alike, so ids cannot be probed.
func (a *app) loadThread(r *http.Request, v visit, conversationID string) (threadView, bool, error) {
	if !uuidPattern.MatchString(conversationID) {
		return threadView{}, false, nil
	}
	var convs []msgConversationRow
	var msgs []conversationMessageRow
	rs := a.reads(r.Context(), v)
	read(rs, "agent_conversation", conversationArgs{conversationID}, &convs)
	read(rs, "agent_conversation_messages", conversationArgs{conversationID}, &msgs)
	if err := rs.wait(); err != nil {
		return threadView{}, false, err
	}
	if len(convs) == 0 {
		return threadView{}, false, nil
	}
	return buildThread(convs[0], msgs, v.me.TimeZone), true, nil
}

// ── GET ──────────────────────────────────────────────────────────────────────────────────

func (a *app) serveMessages(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	st := msgState{Receipt: takeArchiveReceipt(w, r, a.d.SecureCookies)}
	a.renderMessages(w, r, v, inboxQueryFrom(r.URL.Query()), st, http.StatusOK)
}

func (a *app) serveThread(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	q := inboxQueryFrom(r.URL.Query())
	t, found, err := a.loadThread(r, v, r.PathValue("conversationId"))
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		web.Error(w, http.StatusNotFound)
		return
	}
	// Opening a thread reads it, up to the newest message this page shows and no further.
	if t.SeenUpTo != "" && t.Header.ConversationID != "" {
		a.d.API.Call(r.Context(), "agent-message", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: readBody{
			Op: "read", ConversationID: t.Header.ConversationID, SeenUpTo: t.SeenUpTo,
		}})
	}
	st := msgState{Thread: &t, Receipt: takeArchiveReceipt(w, r, a.d.SecureCookies)}
	// Trip Detail's "Remind the client" (§3.4.15) lands here with its milestone and wants the
	// picker already open on Payment reminder.
	if remind := uuidOrEmpty(r.URL.Query().Get("remind")); remind != "" {
		if pk, err := a.loadPicker(r, v, t.Header, remind); err == nil {
			pk.SelectedID = pk.openOn(pickerStartOn(remind, pk.Values))
			st.Picker = pk
		}
	}
	a.renderMessages(w, r, v, q, st, http.StatusOK)
}

func (a *app) renderMessages(w http.ResponseWriter, r *http.Request, v visit, q inboxQuery, st msgState, status int) {
	now := nowOf(r)
	in, err := a.loadInbox(r, v, q, now)
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	// A page past the end: the real last page, keeping the open thread and every filter.
	if len(in.Threads) == 0 && q.Page > in.PageCount {
		last := q
		last.Page = in.PageCount
		if st.Thread != nil {
			web.SeeOther(w, r, threadLink(st.Thread.Header.ConversationID, last))
		} else {
			web.SeeOther(w, r, last.href())
		}
		return
	}
	doc := a.messages.New()
	a.chrome(w, r, doc, v)
	fillMessages(doc, in, q, st, now)
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillMessages(doc *page.Doc, in inbox, q inboxQuery, st msgState, now time.Time) {
	active := ""
	if st.Thread != nil {
		active = st.Thread.Header.ConversationID
	}
	// Which column shows below lg: the list on the inbox itself, the thread anywhere below it.
	doc.Class("frame", "ppl-msg-thread-open", active != "")
	doc.Keep("frame")

	// What the poller compares against, so it only speaks when the numbers move.
	doc.Attr("new-banner", "data-counts", unreadBadge(in))
	doc.URL("new-banner", "href", q.href())
	fillInboxColumn(doc, in, q, st, active, now)

	// Exactly one right-hand pane: the thread, "Message client", or the prompt to pick one.
	keepIf(doc, "pane-thread", st.Thread != nil)
	keepIf(doc, "pane-new", st.Target != nil)
	keepIf(doc, "pane-pick", st.Thread == nil && st.Target == nil)
	switch {
	case st.Thread != nil:
		fillThreadPane(doc, *st.Thread, q, st, now)
	case st.Target != nil:
		fillNewPane(doc, *st.Target, st.NewQuery, st)
	case st.NotFound:
		// The client named in the URL is not one of theirs: one sentence where the thread goes.
		doc.Text("pick-text", msgNotFound)
	default:
		doc.Keep("pick-text")
	}
}

// hrefAt is a filter link: the same list, changed, back on page one, and beside an open
// thread it keeps that thread open.
func hrefAt(q inboxQuery, active string, patch func(*inboxQuery)) string {
	next := q
	patch(&next)
	next.Page = 1
	if active != "" {
		return threadLink(active, next)
	}
	return next.href()
}

func fillInboxColumn(doc *page.Doc, in inbox, q inboxQuery, st msgState, active string, now time.Time) {
	title := msgTitle
	if q.Archived {
		title = msgViewArchived
	}
	// The list's title is this page's h1 only when the list IS the page. Beside a thread or a
	// new message their own heading is the h1 and this drops to an h2, as Next's slot does.
	beside := st.Thread != nil || st.Target != nil
	keepIf(doc, "list-title-h1", !beside)
	keepIf(doc, "list-title-h2", beside)
	if beside {
		doc.Text("list-title-h2", title)
	} else {
		doc.Text("list-title-h1", title)
	}

	viewText := msgViewArchived
	if in.ArchivedThreads > 0 {
		viewText += " (" + enUS(in.ArchivedThreads) + ")"
	}
	if q.Archived {
		viewText = msgViewInbox
	}
	doc.URL("view-link", "href", hrefAt(q, active, func(n *inboxQuery) { n.Archived = !n.Archived }))
	doc.Text("view-link", viewText)

	if q.Archived {
		doc.Remove("headline")
	} else {
		doc.Text("headline", in.Headline)
	}

	chip := func(slot, href string, on bool) {
		doc.URL(slot, "href", href)
		doc.Class(slot, "chip-outlined", !on)
		doc.Class(slot, "chip-primary", on)
		if on {
			doc.Attr(slot, "aria-current", "true")
		}
	}
	chip("chip-unread", hrefAt(q, active, func(n *inboxQuery) { n.Unread = !n.Unread }), q.Unread)
	chip("chip-overdue", hrefAt(q, active, func(n *inboxQuery) { n.Overdue = !n.Overdue }), q.Overdue)
	if q.ClientID != "" {
		chip("chip-client", hrefAt(q, active, func(n *inboxQuery) { n.ClientID = "" }), false)
	} else {
		doc.Remove("chip-client")
	}
	if q.TripID != "" {
		chip("chip-trip", hrefAt(q, active, func(n *inboxQuery) { n.TripID = "" }), false)
	} else {
		doc.Remove("chip-trip")
	}

	// The search keeps every other filter as hidden fields, so searching narrows rather than
	// replaces what the advisor was looking at.
	searchAction := "/agent/messages"
	if active != "" {
		searchAction = "/agent/messages/" + url.PathEscape(active)
	}
	doc.URL("search-form", "action", searchAction)
	keepIf(doc, "hid-view", q.Archived)
	keepIf(doc, "hid-unread", q.Unread)
	keepIf(doc, "hid-overdue", q.Overdue)
	if q.ClientID != "" {
		doc.Attr("hid-client", "value", q.ClientID)
	} else {
		doc.Remove("hid-client")
	}
	if q.TripID != "" {
		doc.Attr("hid-trip", "value", q.TripID)
	} else {
		doc.Remove("hid-trip")
	}
	doc.Attr("in-q", "value", q.Search)

	switch {
	case q.Search != "":
		doc.URL("clear-filter", "href", hrefAt(q, active, func(n *inboxQuery) { n.Search = "" }))
	case q.ClientID != "" || q.TripID != "":
		doc.URL("clear-filter", "href", hrefAt(q, active, func(n *inboxQuery) {
			*n = inboxQuery{Archived: n.Archived, Page: 1}
		}))
	default:
		doc.Remove("clear-filter")
	}

	// The bulk form posts the ticked ids and comes back to this same filtered list.
	doc.URL("bulk-form", "action", q.href())
	doc.Attr("bulk-flag", "value", strconv.FormatBool(!q.Archived))
	doc.Text("bulk-submit", cmpOr(map[bool]string{true: msgRestoreSelect}[q.Archived], msgArchiveSelect))
	doc.Keep("bulk-bar")
	if st.Error != "" && st.Thread == nil && st.Target == nil {
		doc.Text("list-error", st.Error)
	} else {
		doc.Remove("list-error")
	}
	if st.Receipt != "" {
		doc.Keep("receipt")
		doc.Text("receipt-text", st.Receipt)
	} else {
		doc.Remove("receipt")
	}

	if len(in.Threads) == 0 {
		doc.Remove("list")
		doc.Keep("empty")
		switch {
		case q.Archived:
			doc.Text("empty", msgEmptyArchived)
		case q.narrowed():
			doc.Text("empty", msgEmptyNarrowed)
		default:
			doc.Text("empty", msgEmptyInbox)
		}
	} else {
		doc.Remove("empty")
		doc.Keep("list")
		doc.Repeat("threads", len(in.Threads), func(i int, row *page.Row) {
			t := in.Threads[i]
			row.Class("r-item", "ppl-msg-active", t.ID == active)
			row.Keep("r-item")
			row.Attr("r-check", "value", t.ID)
			row.Attr("r-check", "aria-label", "Select "+t.ClientName+" · "+t.TripLabel)
			row.URL("r-link", "href", t.Href)
			if t.ID == active {
				row.Attr("r-link", "aria-current", "page")
			}
			row.Text("r-name", t.ClientName)
			row.Class("r-name", "fw-700", t.Unread > 0)
			row.Class("r-time", "text-secondary", !t.Overdue)
			row.Class("r-time", "ppl-msg-overdue", t.Overdue)
			time := t.TimeLabel
			if t.Overdue {
				time = "Overdue · " + time
			}
			row.Text("r-time", time)
			row.Text("r-preview", t.Preview)
			row.Keep("r-trip")
			row.Text("r-trip-name", t.TripLabel)
			if t.ReplyByLabel != "" {
				row.Text("r-replyby", " · "+t.ReplyByLabel)
			} else {
				row.Remove("r-replyby")
			}
			if t.Unread > 0 {
				row.Text("r-unread", strconv.FormatInt(t.Unread, 10))
			} else {
				row.Remove("r-unread")
			}
		})
	}

	pageHref := func(n int) string {
		next := q
		next.Page = n
		if active != "" {
			return threadLink(active, next)
		}
		return next.href()
	}
	if in.PageCount > 1 {
		doc.Keep("pager")
		if in.Page > 1 {
			doc.URL("pg-newer", "href", pageHref(in.Page-1))
		} else {
			doc.Remove("pg-newer")
		}
		if in.Page < in.PageCount {
			doc.URL("pg-older", "href", pageHref(in.Page+1))
		} else {
			doc.Remove("pg-older")
		}
	} else {
		doc.Remove("pager")
	}
}

func fillThreadPane(doc *page.Doc, t threadView, q inboxQuery, st msgState, now time.Time) {
	h := t.Header
	// The filters ride on the form too: posting from a filtered list must come back to it.
	self := threadLink(h.ConversationID, q)
	doc.Attr("pane-thread", "aria-label", h.ClientName)
	doc.URL("th-back", "href", q.href())
	doc.Text("th-name", h.ClientName)
	doc.Text("th-trip", h.TripLabel)
	keepIf(doc, "th-archived", h.Archived)
	keepIf(doc, "th-overdue", h.Overdue)
	if h.ReplyByLabel != "" {
		doc.Text("th-replyby", h.ReplyByLabel)
	} else {
		doc.Remove("th-replyby")
	}
	doc.Keep("th-open")
	keepIf(doc, "th-open-trip-icon", h.TripID != "")
	keepIf(doc, "th-open-client-icon", h.TripID == "")
	if h.TripID != "" {
		doc.URL("th-open", "href", "/agent/trips/"+url.PathEscape(h.TripID))
		doc.Text("th-open-text", "Open trip")
	} else {
		doc.URL("th-open", "href", "/agent/clients/"+url.PathEscape(h.ClientID))
		doc.Text("th-open-text", "Open client")
	}
	doc.URL("th-archive-form", "action", self)
	doc.Attr("th-archive-flag", "value", strconv.FormatBool(!h.Archived))
	doc.Text("th-archive-btn", cmpOr(map[bool]string{true: msgRestoreThread}[h.Archived], msgArchiveThread))

	keepIf(doc, "th-truncated", t.Truncated)
	days := groupMessagesByDay(t.Messages, t.TimeZone, now)
	if len(days) == 0 {
		doc.Keep("th-empty")
		doc.Remove("th-messages")
	} else {
		doc.Remove("th-empty")
		doc.Keep("th-messages")
		fillThreadMessages(doc, days, t, h)
	}

	// 3.10.3 over the pane, and the button that opens it. A failed template read offers no
	// picker rather than an empty one.
	keepIf(doc, "pk-scrim", st.Picker != nil)
	doc.Keep("rp-picker")
	if st.Picker != nil {
		fillPicker(doc, *st.Picker, st, self)
	}

	if st.Status == "" {
		doc.Remove("rp-status")
	} else {
		doc.Text("rp-status", st.Status)
	}
	doc.URL("rp-form", "action", self)
	id := st.MessageID
	if id == "" {
		id = uuid.New()
	}
	doc.Attr("rp-id", "value", id)
	doc.Attr("rp-draftfor", "value", draftFingerprint(st.Body, st.Note))
	// A refused note must not come back as a reply: the whole note treatment, including
	// which button says "Add note", hangs off this checkbox.
	doc.Bool("rp-note", "checked", st.Note)
	doc.Keep("rp-note")
	if t.SeenUpTo != "" {
		doc.Attr("rp-seen", "value", t.SeenUpTo)
	} else {
		doc.Remove("rp-seen")
	}
	if st.Error != "" {
		doc.Text("rp-error", st.Error)
	} else {
		doc.Remove("rp-error")
	}
	doc.Text("rp-label", msgReplyLabel)
	doc.Text("rp-text", st.Body)
	doc.Keep("rp-note-label")
	if h.ClientCanSignIn {
		doc.Remove("rp-nologin")
	} else {
		doc.Text("rp-nologin", messagesNoLogin(h.ClientFirstName))
	}
}

// fillThreadMessages flattens the days into one repeat: a row is a day separator, an
// internal note, a bubble, one attachment, or the time under them. The page builder allows
// no nested repeat, and this shows every attachment rather than a fixed few. Next draws the
// bubble, then the attachments, then the time, so the time is a row of its own: it has to
// come after however many attachment rows there are.
func fillThreadMessages(doc *page.Doc, days []threadDay, t threadView, h threadHeader) {
	type row struct {
		kind       string // "day", "note", "msg", "attach", "time"
		label      string
		m          threadMessageView
		attachment string
	}
	var rows []row
	for _, d := range days {
		rows = append(rows, row{kind: "day", label: d.Label})
		for _, m := range d.Messages {
			// A note carries its own time inside its card, and is the one thing the client
			// never sees: Next draws no attachment row under it, so neither does this.
			if m.InternalNote {
				rows = append(rows, row{kind: "note", m: m})
				continue
			}
			rows = append(rows, row{kind: "msg", m: m})
			for _, att := range m.Attachments {
				rows = append(rows, row{kind: "attach", m: m, attachment: att.Filename})
			}
			rows = append(rows, row{kind: "time", m: m})
		}
	}

	doc.Repeat("tmsg", len(rows), func(i int, r *page.Row) {
		it := rows[i]
		mine := it.m.Sender == "agent"
		r.Class("m-box", "ppl-msg-mine", mine && it.kind != "day")
		// Every row carries the gap above it that Next gives this kind of row.
		r.Class("m-box", "ppl-msg-r-day", it.kind == "day")
		r.Class("m-box", "ppl-msg-r-attach", it.kind == "attach")
		r.Class("m-box", "ppl-msg-r-time", it.kind == "time")
		r.Keep("m-box")
		keepIf2(r, "m-day", it.kind == "day")
		keepIf2(r, "m-note", it.kind == "note")
		// Taking the wrapper out takes the three inside it too, so only a row that keeps the
		// wrapper may speak about them.
		bubble := it.kind == "msg" || it.kind == "attach" || it.kind == "time"
		keepIf2(r, "m-bubble", bubble)
		if bubble {
			keepIf2(r, "m-paper", it.kind == "msg")
			keepIf2(r, "m-attach", it.kind == "attach")
			keepIf2(r, "m-time", it.kind == "time")
		}
		switch it.kind {
		case "day":
			r.Text("m-day-label", it.label)
		case "note":
			r.Text("m-note-body", it.m.Body)
			r.Text("m-note-time", formatMessageTime(it.m.CreatedAt, t.TimeZone))
		case "msg":
			r.Class("m-paper", "ppl-msg-theirs", !mine)
			sender := h.ClientFirstName
			if mine {
				sender = "You"
			}
			r.Text("m-sender", sender+": ")
			r.Text("m-body", it.m.Body)
		case "attach":
			r.Text("m-attach-name", it.attachment)
		case "time":
			r.Text("m-time", messageTimeLine(it.m, t.TimeZone, mine))
		}
	})
}

// messageTimeLine is the bubble's time, with Stage 4's marks after it.
func messageTimeLine(m threadMessageView, zone string, mine bool) string {
	line := formatMessageTime(m.CreatedAt, zone)
	if mine && m.AutoReply {
		line += " · Automatic reply"
	}
	if mine && m.Emailed {
		line += " · Emailed"
	}
	if !mine && m.ByEmail {
		line += " · By email"
	}
	return line
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────

type sendBody struct {
	Op             string  `json:"op"`
	MessageID      string  `json:"messageId"`
	Body           string  `json:"body"`
	InternalNote   bool    `json:"internalNote"`
	SeenUpTo       *string `json:"seenUpTo,omitempty"`
	ConversationID string  `json:"conversationId,omitempty"`
	ClientID       string  `json:"clientId,omitempty"`
	TripID         string  `json:"tripId,omitempty"`
}

type readBody struct {
	Op             string `json:"op"`
	ConversationID string `json:"conversationId"`
	SeenUpTo       string `json:"seenUpTo"`
}

type msgArchiveBody struct {
	Op              string   `json:"op"`
	ConversationIDs []string `json:"conversationIds"`
	Archived        bool     `json:"archived"`
}

type messageReply struct {
	ConversationID *string `json:"conversationId"`
	Moved          *int64  `json:"moved"`
	Changed        *bool   `json:"changed"`
}

// postMessages is the inbox's bulk archive: the ticked ids, then back to the same filtered
// list with what moved.
func (a *app) postMessages(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	q := inboxQueryFrom(r.URL.Query())
	var ids []string
	for _, id := range f["conversationId"] {
		if uuidPattern.MatchString(id) {
			ids = append(ids, strings.ToLower(id))
		}
	}
	if f.Get("op") != "archive" || len(ids) == 0 {
		web.SeeOther(w, r, q.href())
		return
	}
	archived := f.Get("archived") == "true"
	res := a.d.API.Call(r.Context(), "agent-message", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: msgArchiveBody{
		Op: "archive", ConversationIDs: ids, Archived: archived,
	}})
	out := web.FromResult(res, msgArchiveFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		a.renderMessages(w, r, v, q, msgState{Error: archiveMessageOf(res)}, out.Status)
	default:
		var rep messageReply
		_ = json.Unmarshal(res.Data, &rep)
		moved := int64(0)
		if rep.Moved != nil {
			moved = *rep.Moved
		}
		setReceipt(w, receipt{Kind: "archive", Changed: moved, Requested: moved, Added: archived}, a.d.SecureCookies)
		web.SeeOther(w, r, q.href())
	}
}

func archiveMessageOf(res api.Result) string {
	if res.Kind == api.Rejected && res.Detail != "" {
		return res.Detail
	}
	return msgArchiveFailed
}

// postThread is the thread's reply (op=send) and its Archive / Move to inbox (op=archive).
func (a *app) postThread(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	conversationID := r.PathValue("conversationId")
	if !uuidPattern.MatchString(conversationID) {
		web.Error(w, http.StatusNotFound)
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	q := inboxQueryFrom(r.URL.Query())
	self := threadLink(conversationID, q)

	switch f.Get("op") {
	case "archive":
		archived := f.Get("archived") == "true"
		res := a.d.API.Call(r.Context(), "agent-message", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: msgArchiveBody{
			Op: "archive", ConversationIDs: []string{conversationID}, Archived: archived,
		}})
		out := web.FromResult(res, msgArchiveFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			a.redrawThread(w, r, v, q, conversationID, msgState{Error: archiveMessageOf(res)}, out.Status)
		default:
			web.SeeOther(w, r, self)
		}
	case "send":
		a.sendMessage(w, r, v, q, conversationID, f)
	default:
		if isPickerOp(f.Get("op")) {
			a.pickTemplate(w, r, v, q, conversationID, f)
			return
		}
		web.Error(w, http.StatusBadRequest)
	}
}

// isPickerOp: everything 3.10.3 posts, including a list button's "pick:<id>".
func isPickerOp(op string) bool {
	switch pickerOp(op) {
	case "picker", "pick", "search", "insert", "insert-asis", "close":
		return true
	}
	return false
}

// pickTemplate is every click inside 3.10.3, and the button that opens it. Each one carries
// the draft, the note switch and the draft's id back, so nothing typed is lost.
func (a *app) pickTemplate(w http.ResponseWriter, r *http.Request, v visit, q inboxQuery, conversationID string, f url.Values) {
	op := pickerOp(f.Get("op"))
	body := f.Get("body")
	note := f.Get("internalNote") == "true"
	st := msgState{Body: body, Note: note, MessageID: draftID(f, body, note)}
	if op == "close" {
		a.redrawThread(w, r, v, q, conversationID, st, http.StatusOK)
		return
	}

	t, found, err := a.loadThread(r, v, conversationID)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		web.Error(w, http.StatusNotFound)
		return
	}
	// The milestone rides in the picker's own form, because this is a POST and the door's
	// ?remind= was on the GET that opened the thread.
	milestone := uuidOrEmpty(f.Get("remind"))
	pk, err := a.loadPicker(r, v, t.Header, milestone)
	if err != nil {
		// Next offers no picker when the read fails; here the thread comes back without it.
		a.redrawThread(w, r, v, q, conversationID, st, http.StatusOK)
		return
	}
	pk.Search, pk.SelectedID = pickerFromForm(f)
	if op == "picker" {
		pk.SelectedID = pk.openOn(pickerStartOn(milestone, pk.Values))
	}

	if op == "insert" || op == "insert-asis" {
		chosen, ok := pk.selected()
		if !ok {
			a.redrawThread(w, r, v, q, conversationID, st, http.StatusOK)
			return
		}
		out := renderTemplate(chosen.Body, pk.Values)
		// "Insert as-is" is off while anything is missing; a post that says otherwise is
		// not one of our buttons.
		if op == "insert-asis" && len(out.Missing) > 0 {
			st.Picker = pk
			a.redrawThread(w, r, v, q, conversationID, st, http.StatusUnprocessableEntity)
			return
		}
		st.Body = insertTemplate(body, out.Text)
		// The words changed, so the draft's id is minted afresh for them.
		st.MessageID = uuid.New()
		st.Status = tplInserted
		a.redrawThread(w, r, v, q, conversationID, st, http.StatusOK)
		return
	}

	st.Picker = pk
	a.redrawThread(w, r, v, q, conversationID, st, http.StatusOK)
}

func (a *app) sendMessage(w http.ResponseWriter, r *http.Request, v visit, q inboxQuery, conversationID string, f url.Values) {
	body := f.Get("body")
	note := f.Get("internalNote") == "true"

	id := draftID(f, body, note)
	again := func(msg string, status int) {
		a.redrawThread(w, r, v, q, conversationID, msgState{Error: msg, Body: body, Note: note, MessageID: id}, status)
	}
	if jsTrim(body) == "" {
		again(msgSendFailed, http.StatusUnprocessableEntity)
		return
	}
	// A template inserted with "Insert & edit" leaves raw tokens behind. A client never reads
	// one, so Send refuses until they are replaced — here, and again in agent-message.
	if left := unfilledFields(body); len(left) > 0 {
		again(templateUnfilled(left), http.StatusUnprocessableEntity)
		return
	}
	send := sendBody{Op: "send", MessageID: id, Body: body, InternalNote: note, ConversationID: conversationID}
	if seen := f.Get("seenUpTo"); seen != "" {
		send.SeenUpTo = &seen
	}
	res := a.d.API.Call(r.Context(), "agent-message", v.st.AccessToken, api.Input{Method: http.MethodPost, Body: send})
	out := web.FromResult(res, msgSendFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
	case !out.OK:
		msg := msgSendFailed
		if res.Kind == api.Rejected && res.Detail != "" {
			msg = res.Detail
		}
		again(msg, out.Status)
	default:
		var rep messageReply
		_ = json.Unmarshal(res.Data, &rep)
		if str(rep.ConversationID) == "" {
			// A send with nowhere to put it is not a send, as Next's action says.
			again(msgSendFailed, http.StatusUnprocessableEntity)
			return
		}
		flash := flashSent
		if note {
			flash = flashNoteAdded
		}
		web.SetFlash(w, flash, a.d.SecureCookies)
		web.SeeOther(w, r, threadLink(str(rep.ConversationID), q))
	}
}

// draftFingerprint names the words a message id was minted for. The id is reused only for a
// retry of exactly those words, as Next's reply box does.
func draftFingerprint(body string, note bool) string {
	sum := sha256.Sum256([]byte(strconv.FormatBool(note) + "\x00" + body))
	return hex.EncodeToString(sum[:8])
}

// draftID is the id this send should carry. The box mints one when it is drawn and posts it
// back, so a double click or a retry of the same words lands once (the function refuses the
// second as already sent). It is re-minted when the words or the note flag changed since it
// was minted, and when it has aged out of the function's window for a client-minted v7 —
// otherwise an edited draft would be refused as already sent, and a box left open would
// become unsendable.
func draftID(f url.Values, body string, note bool) string {
	id := f.Get("messageId")
	if !uuid.IsV7(id) || f.Get("draftFor") != draftFingerprint(body, note) {
		return uuid.New()
	}
	at, err := uuid.Timestamp(id)
	if err != nil || time.Since(at) > 30*time.Minute || time.Until(at) > time.Minute {
		return uuid.New()
	}
	return id
}

// redrawThread draws the page again with this thread open: a refused send and its sentence,
// an insert that changed the draft, or the picker opening and closing.
func (a *app) redrawThread(w http.ResponseWriter, r *http.Request, v visit, q inboxQuery, conversationID string, st msgState, status int) {
	t, found, err := a.loadThread(r, v, conversationID)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
	case !found:
		web.Error(w, http.StatusNotFound)
	default:
		st.Thread = &t
		a.renderMessages(w, r, v, q, st, status)
	}
}
