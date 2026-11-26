package people

import (
	"net/url"
	"strings"
	"testing"
)

// Ported from web/lib/agent/messageQuery.test.ts: Screen 3.10.1's filters as a URL.

const (
	mqC = "0195a2c0-1a00-7000-8000-000000000101"
	mqT = "0195a2c0-1a00-7000-8000-000000000040"
)

func TestInboxQueryFromParams(t *testing.T) {
	t.Run("reads what it knows and drops what it does not", func(t *testing.T) {
		if q := inboxQueryFrom(url.Values{}); q != emptyInboxQuery {
			t.Errorf("empty = %+v", q)
		}
		got := inboxQueryFrom(url.Values{"view": {"archived"}, "unread": {"1"}, "overdue": {"1"}, "client": {strings.ToUpper(mqC)}, "trip": {mqT}, "q": {"  passport  "}, "page": {"3"}})
		want := inboxQuery{Archived: true, Unread: true, Overdue: true, ClientID: mqC, TripID: mqT, Search: "passport", Page: 3}
		if got != want {
			t.Errorf("full = %+v", got)
		}
		// Not a uuid, not a page, not a known view: ignored rather than sent to the database.
		if q := inboxQueryFrom(url.Values{"view": {"trash"}, "client": {"nope"}, "trip": {"1; drop"}, "page": {"-2"}, "unread": {"yes"}}); q != emptyInboxQuery {
			t.Errorf("junk = %+v", q)
		}
		if q := inboxQueryFrom(url.Values{"q": {strings.Repeat("x", 300)}}); len(q.Search) != 100 {
			t.Errorf("search = %d", len(q.Search))
		}
		// Go-only: parseInt's leniency, and the page ceiling.
		for raw, want := range map[string]int{"2abc": 2, "100000": 100000, "100001": 1, "0": 1, "": 1, " 4": 4, "1e3": 1} {
			if got := inboxQueryFrom(url.Values{"page": {raw}}).Page; got != want {
				t.Errorf("page %q = %d, want %d", raw, got, want)
			}
		}
	})

	t.Run("round-trips, with a plain inbox as a plain URL", func(t *testing.T) {
		if h := emptyInboxQuery.href(); h != "/agent/messages" {
			t.Errorf("plain = %q", h)
		}
		q := inboxQueryFrom(url.Values{"unread": {"1"}, "client": {mqC}, "q": {"dive & snorkel"}, "page": {"2"}})
		href := q.href()
		if href != "/agent/messages?unread=1&client="+mqC+"&q=dive+%26+snorkel&page=2" {
			t.Errorf("href = %q", href)
		}
		u, _ := url.Parse(href)
		if back := inboxQueryFrom(u.Query()); back != q {
			t.Errorf("round trip = %+v", back)
		}
	})

	t.Run("keeps the filters on a thread link, so the list beside it stays put", func(t *testing.T) {
		if h := threadLink("abc", inboxQuery{Overdue: true, Page: 1}); h != "/agent/messages/abc?overdue=1" {
			t.Errorf("thread = %q", h)
		}
		if h := threadLink("abc", emptyInboxQuery); h != "/agent/messages/abc" {
			t.Errorf("thread = %q", h)
		}
	})

	t.Run("addresses a new message to a client, and optionally a trip", func(t *testing.T) {
		for _, c := range []struct{ got, want string }{
			{newMessageHref(mqC, "", ""), "/agent/messages/new?client=" + mqC},
			{newMessageHref(mqC, mqT, ""), "/agent/messages/new?client=" + mqC + "&trip=" + mqT},
			{newMessageHref(mqC, mqT, "m1"), "/agent/messages/new?client=" + mqC + "&trip=" + mqT + "&remind=m1"},
		} {
			if c.got != c.want {
				t.Errorf("got %q, want %q", c.got, c.want)
			}
		}
	})

	t.Run("knows a narrowed list from an empty inbox", func(t *testing.T) {
		if emptyInboxQuery.narrowed() || (inboxQuery{Archived: true, Page: 1}).narrowed() || !(inboxQuery{Search: "x", Page: 1}).narrowed() {
			t.Error("narrowed")
		}
	})
}
