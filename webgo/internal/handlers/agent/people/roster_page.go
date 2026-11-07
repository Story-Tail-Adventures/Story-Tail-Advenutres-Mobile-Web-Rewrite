package people

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The roster page (clients.html) and its bulk-tag post.

// maxRowTags is how many tag chips a roster row has room for (CLIENT_LIMITS.tags).
const maxRowTags = 20

// CLIENT_COPY strings the roster chooses between (web/lib/agent/content.ts).
const (
	copyEmptyTitle         = "No clients yet"
	copyEmptyBody          = "The first one arrives when you add them, or when a quote request comes in."
	copyEmptyFilteredTitle = "Nothing matches"
	copyEmptyFilteredBody  = "Try a different search, or clear the filters."
	copyEmptyArchivedTitle = "Nothing archived"
	copyEmptyArchivedBody  = "Archived clients keep their trips and their history. None are here yet."
	copyNoEmail            = "No email on file"
	copyNoTrip             = "—"
	copyNoLifetime         = "—"
	copyBulkSelectRow      = "Select this client"
	copyBulkNoSelection    = "Tick at least one client first."
	copyBulkNoTag          = "Type a tag first."
	copyBulkFailed         = "That didn't save. Try again in a moment."
)

func rowTagSlots() []string {
	out := []string{"row-tags"}
	for i := 1; i <= maxRowTags; i++ {
		out = append(out, fmt.Sprintf("tag-%d", i))
	}
	return out
}

var clientsSpec = page.Spec{
	File:   "agent/people/clients.html",
	Layout: shell.Agent,
	Slots: []string{
		"subtitle", "q", "status-active", "status-archived", "facet-rule",
		"bulk-form", "receipt", "receipt-box", "receipt-text", "empty", "empty-title", "empty-body",
		"cards", "table", "bulk-bar",
		"pager", "pager-range", "pager-prev", "pager-prev-off", "pager-next", "pager-next-off",
	},
	Repeats: map[string][]string{
		"facets": {"facet-input", "facet-label"},
		"cards":  {"card-link", "card-initials", "card-name", "card-email", "card-trip", "card-lifetime"},
		"rows": append([]string{
			"row-check", "row-initials", "row-link", "row-name", "row-email", "row-last", "row-next", "row-lifetime",
		}, rowTagSlots()...),
	},
}

// loadRoster reads the page of rows and the header counts at once. nil when either fails: a
// table with no header counts is worse than a retry.
func (a *app) loadRoster(ctx context.Context, v visit, q rosterQuery) *roster {
	var (
		rows    []rosterRow
		summary []rosterSummaryRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_client_roster", q.args(), &rows)
	read(rs, "agent_client_roster_summary", struct{}{}, &summary)
	if rs.wait() != nil {
		return nil
	}
	var s *rosterSummaryRow
	if len(summary) > 0 {
		s = &summary[0]
	}
	return buildRoster(rows, s, q)
}

// notice is what the roster says above its rows: a receipt (success) or why a bulk tag did
// not happen (error). Empty Text means nothing to say.
type notice struct {
	Text  string
	Error bool
}

func (a *app) serveClients(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	var n notice
	if rc, ok := takeReceipt(w, r, a.d.SecureCookies); ok && rc.Kind == "bulk" {
		n.Text = bulkTagResult(rc.Tag, rc.Changed, rc.Requested, rc.Added)
	}
	a.renderClients(w, r, v, rosterQueryFrom(r.URL.Query()), n, http.StatusOK)
}

func (a *app) renderClients(w http.ResponseWriter, r *http.Request, v visit, q rosterQuery, n notice, status int) {
	ro := a.loadRoster(r.Context(), v, q)
	if ro == nil {
		a.renderFailed(w, r, v, true)
		return
	}
	doc := a.clients.New()
	a.chrome(w, r, doc, v)
	fillRoster(doc, ro, n, r.URL.RequestURI())
	web.Render(w, a.d.Log, doc, status, web.Private)
}

// postClients is bulkTagClientsAction: tag (or untag) the ticked clients, then back to the same
// filtered list. The filters ride in this URL's query string; the ids, tag and direction in the
// body.
func (a *app) postClients(w http.ResponseWriter, r *http.Request) {
	v, ok := a.guard(w, r)
	if !ok {
		return
	}
	form, ok := web.Form(w, r)
	if !ok {
		return
	}
	q := rosterQueryFrom(r.URL.Query())
	var ids []string
	for _, id := range form["clientId"] {
		if id = strings.TrimSpace(id); id != "" {
			ids = append(ids, id)
		}
	}
	tag := strings.ToLower(strings.TrimSpace(form.Get("tag")))
	add := form.Get("direction") != "remove"

	switch {
	case len(ids) == 0:
		a.renderClients(w, r, v, q, notice{Text: copyBulkNoSelection, Error: true}, http.StatusUnprocessableEntity)
		return
	case tag == "":
		a.renderClients(w, r, v, q, notice{Text: copyBulkNoTag, Error: true}, http.StatusUnprocessableEntity)
		return
	}

	res := a.d.API.Call(r.Context(), "agent-client", v.st.AccessToken, api.Input{
		Method: http.MethodPost,
		Body: struct {
			Op        string   `json:"op"`
			ClientIDs []string `json:"clientIds"`
			Tag       string   `json:"tag"`
			Add       bool     `json:"add"`
		}{"bulk_tag", ids, tag, add},
	})
	out := web.FromResult(res, copyBulkFailed)
	switch {
	case out.SignIn:
		web.SeeOther(w, r, web.SignInURL(r))
		return
	case !out.OK:
		msg := out.Message
		if out.Status == http.StatusServiceUnavailable {
			msg = copyBulkFailed // the action's own outage sentence, not the generic one
		}
		a.renderClients(w, r, v, q, notice{Text: msg, Error: true}, out.Status)
		return
	}
	var reply struct {
		ChangedCount   *int64 `json:"changedCount"`
		RequestedCount *int64 `json:"requestedCount"`
	}
	_ = json.Unmarshal(res.Data, &reply)
	rc := receipt{Kind: "bulk", Tag: tag, Requested: int64(len(ids)), Added: add}
	if reply.ChangedCount != nil {
		rc.Changed = *reply.ChangedCount
	}
	if reply.RequestedCount != nil {
		rc.Requested = *reply.RequestedCount
	}
	setReceipt(w, rc, a.d.SecureCookies)
	web.SeeOther(w, r, q.href(q.Page))
}

func fillRoster(doc *page.Doc, ro *roster, n notice, self string) {
	q := ro.Query
	doc.Text("subtitle", rosterSubtitle(ro.Active, ro.InMotion, ro.Inquiry))
	doc.Attr("q", "value", q.Search)
	doc.Bool("status-active", "checked", q.Status == "active")
	doc.Bool("status-archived", "checked", q.Status == "archived")
	doc.Attr("status-active", "value", "active")
	doc.Attr("status-archived", "value", "archived")
	if len(ro.Facets) == 0 {
		doc.Remove("facet-rule")
	} else {
		doc.Keep("facet-rule")
	}
	doc.Repeat("facets", len(ro.Facets), func(i int, row *page.Row) {
		f := ro.Facets[i]
		row.Attr("facet-input", "value", f.Tag)
		row.Bool("facet-input", "checked", f.Selected)
		row.Text("facet-label", fmt.Sprintf("%s · %d", f.Tag, f.Count))
	})

	// The bulk form posts back to this same URL, so the redirect lands on the same filters.
	doc.URL("bulk-form", "action", self)
	if n.Text == "" {
		doc.Remove("receipt")
	} else {
		doc.Keep("receipt")
		doc.Keep("receipt-box")
		if n.Error {
			doc.Class("receipt-box", "alert-success", false)
			doc.Class("receipt-box", "alert-error", true)
		}
		doc.Text("receipt-text", n.Text)
	}

	if len(ro.Rows) == 0 {
		filtered := q.Search != "" || len(q.Tags) > 0
		title, body := copyEmptyTitle, copyEmptyBody
		switch {
		case filtered:
			title, body = copyEmptyFilteredTitle, copyEmptyFilteredBody
		case q.Status == "archived":
			title, body = copyEmptyArchivedTitle, copyEmptyArchivedBody
		}
		doc.Keep("empty")
		doc.Text("empty-title", title)
		doc.Text("empty-body", body)
		// No rows: no table, no cards, no bar (nothing can be ticked), no pager.
		doc.Remove("cards")
		doc.Remove("table")
		doc.Remove("bulk-bar")
		doc.Remove("pager")
		return
	}
	doc.Remove("empty")
	doc.Keep("cards")
	doc.Keep("table")
	doc.Keep("bulk-bar")

	doc.Repeat("cards", len(ro.Rows), func(i int, row *page.Row) {
		c := ro.Rows[i]
		row.URL("card-link", "href", "/agent/clients/"+c.ClientID)
		row.Text("card-initials", c.Initials)
		row.Text("card-name", c.DisplayName)
		row.Text("card-email", emailOrNone(c))
		trip := c.NextTripLabel
		if trip == "" {
			trip = c.LastTripLabel
		}
		if trip == "" {
			trip = copyNoTrip
		}
		row.Text("card-trip", trip)
		fillLifetime(row, "card-lifetime", c)
	})

	doc.Repeat("rows", len(ro.Rows), func(i int, row *page.Row) {
		c := ro.Rows[i]
		row.Attr("row-check", "value", c.ClientID)
		row.Attr("row-check", "aria-label", copyBulkSelectRow+" "+c.DisplayName)
		row.Text("row-initials", c.Initials)
		row.URL("row-link", "href", "/agent/clients/"+c.ClientID)
		row.Text("row-name", c.DisplayName)
		row.Text("row-email", emailOrNone(c))
		row.Text("row-last", orDash(c.LastTripLabel))
		if c.NextTripLabel == "" {
			row.Text("row-next", copyNoTrip)
			row.Class("row-next", "text-secondary", true)
		} else {
			row.Text("row-next", c.NextTripLabel)
			if c.NextTripIsNow {
				row.Class("row-next", "ppl-now", true)
			}
		}
		fillLifetime(row, "row-lifetime", c)
		if len(c.Tags) == 0 {
			row.Remove("row-tags")
			return
		}
		row.Keep("row-tags")
		for t := 1; t <= maxRowTags; t++ {
			slot := fmt.Sprintf("tag-%d", t)
			if t <= len(c.Tags) {
				row.Text(slot, c.Tags[t-1])
			} else {
				row.Remove(slot)
			}
		}
	})

	if ro.PageCount <= 1 {
		doc.Remove("pager")
		return
	}
	doc.Keep("pager")
	doc.Text("pager-range", rangeLabel(ro.Page, len(ro.Rows), ro.Total))
	if ro.Page > 1 {
		doc.URL("pager-prev", "href", q.href(ro.Page-1))
		doc.Remove("pager-prev-off")
	} else {
		doc.Remove("pager-prev")
		doc.Keep("pager-prev-off")
	}
	if ro.Page < ro.PageCount {
		doc.URL("pager-next", "href", q.href(ro.Page+1))
		doc.Remove("pager-next-off")
	} else {
		doc.Remove("pager-next")
		doc.Keep("pager-next-off")
	}
}

func emailOrNone(c clientRow) string {
	if c.HasEmail {
		return c.Email
	}
	return copyNoEmail
}

func orDash(s string) string {
	if s == "" {
		return copyNoTrip
	}
	return s
}

// fillLifetime is the Lifetime cell: the amount in mono bold, or a muted dash.
func fillLifetime(row *page.Row, slot string, c clientRow) {
	if c.LifetimeLabel == "" {
		row.Text(slot, copyNoLifetime)
		row.Class(slot, "ppl-money", false)
		row.Class(slot, "text-secondary", true)
		return
	}
	row.Text(slot, c.LifetimeLabel)
}
