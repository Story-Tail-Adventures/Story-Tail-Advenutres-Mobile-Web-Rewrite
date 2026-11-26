package people

import (
	"net/url"
	"strconv"
	"strings"
)

// Screen 3.10.1's filters, as a URL: parsed from the query, turned back into hrefs. Ported
// from web/lib/agent/messageQuery.ts.
//
// Every filter is a GET parameter, so a filtered inbox is a link: the worklist's "overdue"
// row, Client Detail's "Messages", and Back all land on exactly what they named.

type inboxQuery struct {
	Archived bool
	Unread   bool
	Overdue  bool
	ClientID string // a lower-cased UUID, or ""
	TripID   string // a lower-cased UUID, or ""
	Search   string // trimmed, at most 100 UTF-16 units (the SQL cuts there too), or ""
	Page     int
}

var emptyInboxQuery = inboxQuery{Page: 1}

// inboxPageSize is threads per page. The SQL caps a page at 200; the inbox asks for fewer.
const inboxPageSize = 50

const maxInboxPage = 100_000

func uuidOrEmpty(s string) string {
	if uuidPattern.MatchString(s) {
		return strings.ToLower(s)
	}
	return ""
}

func inboxQueryFrom(q url.Values) inboxQuery {
	page := leadingInt(q.Get("page"))
	if q.Get("page") == "" || page < 1 || page > maxInboxPage {
		page = 1
	}
	return inboxQuery{
		Archived: q.Get("view") == "archived",
		Unread:   q.Get("unread") == "1",
		Overdue:  q.Get("overdue") == "1",
		ClientID: uuidOrEmpty(q.Get("client")),
		TripID:   uuidOrEmpty(q.Get("trip")),
		Search:   sliceUTF16(jsTrim(q.Get("q")), 100),
		Page:     page,
	}
}

// search is the query as a URL query, defaults left out so a plain inbox is a plain URL, in
// Next's parameter order.
func (q inboxQuery) search() string {
	var parts []string
	add := func(k, v string) { parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v)) }
	if q.Archived {
		add("view", "archived")
	}
	if q.Unread {
		add("unread", "1")
	}
	if q.Overdue {
		add("overdue", "1")
	}
	if q.ClientID != "" {
		add("client", q.ClientID)
	}
	if q.TripID != "" {
		add("trip", q.TripID)
	}
	if q.Search != "" {
		add("q", q.Search)
	}
	if q.Page > 1 {
		add("page", strconv.Itoa(q.Page))
	}
	if len(parts) == 0 {
		return ""
	}
	return "?" + strings.Join(parts, "&")
}

func (q inboxQuery) href() string { return "/agent/messages" + q.search() }

// threadLink is a thread, keeping the inbox's filters so the list beside it (and Back)
// stays put.
func threadLink(conversationID string, q inboxQuery) string {
	return "/agent/messages/" + url.PathEscape(conversationID) + q.search()
}

// newMessageHref is "Message client" from Client Detail or Trip Detail. With a milestone it
// is Trip Detail's "Remind the client".
func newMessageHref(clientID, tripID, remindMilestoneID string) string {
	h := "/agent/messages/new?client=" + url.QueryEscape(clientID)
	if tripID != "" {
		h += "&trip=" + url.QueryEscape(tripID)
	}
	if remindMilestoneID != "" {
		h += "&remind=" + url.QueryEscape(remindMilestoneID)
	}
	return h
}

// narrowed is whether anything narrows the list, for the "no threads match" vs "inbox is
// empty" copy.
func (q inboxQuery) narrowed() bool {
	return q.Unread || q.Overdue || q.ClientID != "" || q.TripID != "" || q.Search != ""
}
