package people

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// "Message client", from Client Detail (a general thread) and Trip Detail (that trip's
// thread): app/(agent)/agent/messages/new/page.tsx. A thread that already exists is not
// started twice — this goes straight to it. Otherwise it is a box addressed to the client,
// which starts the thread on send and then opens it.
//
// It is 3.10.2 before its first message, so it sits in the thread's pane with the inbox
// beside it, and shares this area's one page.
//
// A NEW THREAD CANNOT START WITH AN INTERNAL NOTE (the client would see a thread with
// nothing in it), so the switch is not offered here, as in Next.

// pgTimestamp is the newest message's created_at as TEXT, the way Postgres wrote it
// (agent-message checks it again). Never through a time value: that drops the microseconds
// Postgres compares on.
var pgTimestamp = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$`)

type messageTargetArgs struct {
	ClientID string  `json:"p_client_id"`
	TripID   *string `json:"p_trip_id"`
}

// newMessageQuery is the page's URL: who the message is for, and the milestone Trip Detail's
// "Remind the client" names. These are not filters; the list beside this page is unfiltered,
// as Next's @list/new slot is.
type newMessageQuery struct {
	ClientID string
	TripID   string
	Remind   string
}

func newMessageQueryFrom(q url.Values) (newMessageQuery, bool) {
	m := newMessageQuery{ClientID: uuidOrEmpty(q.Get("client")), TripID: uuidOrEmpty(q.Get("trip"))}
	if m.ClientID == "" || (q.Get("trip") != "" && m.TripID == "") {
		return m, false
	}
	// A milestone only means something on a trip.
	if m.TripID != "" {
		m.Remind = uuidOrEmpty(q.Get("remind"))
	}
	return m, true
}

func (m newMessageQuery) href() string {
	return newMessageHref(m.ClientID, m.TripID, m.Remind)
}

func (a *app) loadMessageTarget(r *http.Request, v visit, m newMessageQuery) (messageTarget, bool, error) {
	args := messageTargetArgs{ClientID: m.ClientID}
	if m.TripID != "" {
		args.TripID = &m.TripID
	}
	var rows []messageTargetRow
	rs := a.reads(r.Context(), v)
	read(rs, "agent_message_target", args, &rows)
	if err := rs.wait(); err != nil {
		return messageTarget{}, false, err
	}
	if len(rows) == 0 {
		return messageTarget{}, false, nil
	}
	return toMessageTarget(rows[0]), true, nil
}

func (a *app) serveNewMessage(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	m, ok := newMessageQueryFrom(r.URL.Query())
	if !ok {
		web.Error(w, http.StatusNotFound)
		return
	}
	a.renderNewMessage(w, r, v, m, msgState{}, http.StatusOK)
}

func (a *app) renderNewMessage(w http.ResponseWriter, r *http.Request, v visit, m newMessageQuery, st msgState, status int) {
	target, found, err := a.loadMessageTarget(r, v, m)
	switch {
	case err != nil:
		a.renderFailed(w, r, v, true)
		return
	case !found:
		// Not one of theirs, or archived: Next says so rather than showing a 404 page.
		a.renderMessagesNotFound(w, r, v)
		return
	}
	// A thread already exists: go to it instead of starting a second one.
	if target.ConversationID != "" {
		to := threadLink(target.ConversationID, emptyInboxQuery)
		if m.Remind != "" {
			to += "?remind=" + url.QueryEscape(m.Remind)
		}
		web.SeeOther(w, r, to)
		return
	}
	// The list beside it is unfiltered: this page's client and trip name who the message is
	// for, not a filter, and would otherwise narrow the list to a thread that does not exist.
	in, err := a.loadInbox(r, v, emptyInboxQuery, nowOf(r))
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	doc := a.messages.New()
	a.chrome(w, r, doc, v)
	st.Target = &target
	st.NewQuery = m
	fillMessages(doc, in, emptyInboxQuery, st, nowOf(r))
	web.Render(w, a.d.Log, doc, status, web.Private)
}

// renderMessagesNotFound is the inbox with one sentence where the thread goes.
func (a *app) renderMessagesNotFound(w http.ResponseWriter, r *http.Request, v visit) {
	in, err := a.loadInbox(r, v, emptyInboxQuery, nowOf(r))
	if err != nil {
		a.renderFailed(w, r, v, true)
		return
	}
	doc := a.messages.New()
	a.chrome(w, r, doc, v)
	fillMessages(doc, in, emptyInboxQuery, msgState{NotFound: true}, nowOf(r))
	web.Render(w, a.d.Log, doc, http.StatusNotFound, web.Private)
}

// fillNewPane fills "Message <first name>" and its box.
func fillNewPane(doc *page.Doc, t messageTarget, m newMessageQuery, st msgState) {
	doc.Text("new-title", messagesNewTo(t.ClientFirstName))
	doc.Text("new-sub", t.ClientName+" · "+t.TripLabel)
	doc.URL("new-form", "action", m.href())
	doc.Attr("new-client", "value", t.ClientID)
	if t.TripID != "" {
		doc.Attr("new-trip", "value", t.TripID)
	} else {
		doc.Remove("new-trip")
	}
	id := st.MessageID
	if id == "" {
		id = uuid.New()
	}
	doc.Attr("new-id", "value", id)
	doc.Attr("new-draftfor", "value", draftFingerprint(st.Body, false))
	if st.Error != "" {
		doc.Text("new-error", st.Error)
	} else {
		doc.Remove("new-error")
	}
	doc.Text("new-text", st.Body)
	if t.ClientCanSignIn {
		doc.Remove("new-nologin")
	} else {
		doc.Text("new-nologin", messagesNoLogin(t.ClientFirstName))
	}
}

// postNewMessage starts the thread and opens it.
func (a *app) postNewMessage(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	// The ids come from the form, which the page wrote from the read; the query says the same
	// thing, and either way the function checks them against this advisor.
	m, ok := newMessageQueryFrom(r.URL.Query())
	if !ok {
		m, ok = newMessageQueryFrom(url.Values{"client": {f.Get("client")}, "trip": {f.Get("trip")}})
		if !ok {
			web.Error(w, http.StatusNotFound)
			return
		}
	}
	body := f.Get("body")
	id := draftID(f, body, false)
	again := func(msg string, status int) {
		a.renderNewMessage(w, r, v, m, msgState{Error: msg, Body: body, MessageID: id}, status)
	}
	if jsTrim(body) == "" {
		again(msgSendFailed, http.StatusUnprocessableEntity)
		return
	}
	send := sendBody{Op: "send", MessageID: id, Body: body, ClientID: m.ClientID}
	if m.TripID != "" {
		send.TripID = m.TripID
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
			again(msgSendFailed, http.StatusUnprocessableEntity)
			return
		}
		web.SetFlash(w, flashSent, a.d.SecureCookies)
		web.SeeOther(w, r, threadLink(str(rep.ConversationID), emptyInboxQuery))
	}
}

// ── The two JSON endpoints ───────────────────────────────────────────────────────────────

// postThreadRead is "Mark read" from a web notification (§3.10.7), the one caller with no
// page behind it: the service worker posts here with the advisor's cookies and this runs the
// same agent-message read an open thread does, up to the message the notification was about
// and no further, so anything newer stays unread.
//
// SAME-ORIGIN ONLY. The session rides on cookies, so a cross-site form could aim a POST here.
// Marking a thread read is low stakes, but it is still the advisor's state.
func (a *app) postThreadRead(w http.ResponseWriter, r *http.Request) {
	// Its own gate, not the page one: Next's route is outside PROTECTED_PREFIXES too, and a
	// service worker wants a status, never a redirect to a sign-in page.
	token, ok := apiToken(r)
	if !ok {
		web.Error(w, http.StatusUnauthorized)
		return
	}
	if !sameOrigin(r) {
		web.Error(w, http.StatusForbidden)
		return
	}
	conversationID := r.PathValue("conversationId")
	var in struct {
		SeenUpTo string `json:"seenUpTo"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in) != nil ||
		!uuidPattern.MatchString(conversationID) || !pgTimestamp.MatchString(in.SeenUpTo) {
		web.Error(w, http.StatusBadRequest)
		return
	}
	res := a.d.API.Call(r.Context(), "agent-message", token, api.Input{Method: http.MethodPost, Body: readBody{
		Op: "read", ConversationID: conversationID, SeenUpTo: in.SeenUpTo,
	}})
	changed := false
	if res.OK {
		var rep messageReply
		_ = json.Unmarshal(res.Data, &rep)
		changed = rep.Changed != nil && *rep.Changed
	}
	writeJSON(w, map[string]bool{"changed": changed})
}

// serveMessageCount is what the inbox's module polls every 30 seconds: the counts only, so a
// page that has been open a while can say that something new arrived. It answers the same
// numbers the headline was drawn from, and nothing about any one thread.
func (a *app) serveMessageCount(w http.ResponseWriter, r *http.Request) {
	st, ok := session.From(r.Context())
	if !ok || !st.SignedIn || st.AccessToken == "" {
		web.Error(w, http.StatusUnauthorized)
		return
	}
	var summary []msgSummaryRow
	rs := a.reads(r.Context(), visit{st: st})
	read(rs, "agent_message_summary", nil, &summary)
	if err := rs.wait(); err != nil || len(summary) == 0 {
		web.Error(w, http.StatusServiceUnavailable)
		return
	}
	writeJSON(w, map[string]int64{
		"unreadThreads":  summary[0].UnreadThreads,
		"unreadMessages": summary[0].UnreadMessages,
		"overdueThreads": summary[0].OverdueThreads,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", web.NoStore)
	_ = json.NewEncoder(w).Encode(v)
}

// apiToken is the visitor's own access token on a route that gates itself.
func apiToken(r *http.Request) (string, bool) {
	st, ok := session.From(r.Context())
	if !ok || !st.SignedIn || st.AccessToken == "" {
		return "", false
	}
	return st.AccessToken, true
}

// sameOrigin reports whether the request carries this site's own Origin. A service worker's
// fetch always sends one; a cross-site form sends another site's.
func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return u.Host == r.Host
}

// unreadBadge is the count the inbox page rendered, for the poller to compare against.
func unreadBadge(in inbox) string {
	return strconv.FormatInt(in.UnreadThreads, 10) + ":" + strconv.FormatInt(in.OverdueThreads, 10)
}
