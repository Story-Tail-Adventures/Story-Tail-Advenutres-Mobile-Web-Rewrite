package people

import (
	"net/url"
	"strings"
	"testing"
)

// Ported from web/lib/agent/leads.test.ts (§3.8, revived 2026-10-21, BRD §6.5). Pinned: the
// Reply link cannot be turned into a mail header by a name, "Open" means New and Contacted,
// the wait label counts calendar days in the advisor's zone and never goes negative, and an
// "Already a client" row says so. (Its leadSourcesReport cases belong to §3.11 Reports, not
// this sub-area; waitingLabel's own cases are in worklist_test.go.)

func leadRowFixture(over func(*leadListRow)) leadListRow {
	last, preview := "Reyes", "June works."
	r := leadListRow{
		ID: "0195a2c0-1a00-7000-8000-0000000000aa", FirstName: "Dana", LastName: &last, Email: "dana@example.com",
		Source: "website", Status: "new", MessageCount: 2, LatestPreview: &preview,
		FirstMessageAt: "2026-10-19T15:00:00Z", LastMessageAt: "2026-10-21T15:00:00Z",
	}
	if over != nil {
		over(&r)
	}
	return r
}

func TestReplyHref(t *testing.T) {
	t.Run("opens the advisor's own email app, addressed to the lead", func(t *testing.T) {
		href := replyHref("dana@example.com", "Dana")
		if !strings.HasPrefix(href, "mailto:dana@example.com?subject=") {
			t.Fatalf("href = %q", href)
		}
		u, err := url.Parse(href)
		if err != nil {
			t.Fatal(err)
		}
		q, _ := url.ParseQuery(u.RawQuery)
		if q.Get("subject") != "Your note to Story-Tail Adventures" || q.Get("body") != "Hi Dana,\n\n" {
			t.Errorf("query = %v", q)
		}
	})

	t.Run("never lets a name or an address start a new mail header", func(t *testing.T) {
		href := replyHref("dana@example.com\r\nBcc: x@y.com", "Dana\r\nBcc: x@y.com")
		if strings.ContainsAny(href, "\r\n") {
			t.Errorf("href has a line break: %q", href)
		}
		if strings.Contains(strings.SplitN(href, "?", 2)[0], "Bcc:") {
			t.Errorf("the address part carries a header: %q", href)
		}
	})

	// Go-only: encodeURIComponent's exact set, which url.QueryEscape does not share.
	t.Run("encodes the way encodeURIComponent does", func(t *testing.T) {
		if got := encodeURIComponent("a b+c!*'()~-_.é@"); got != "a%20b%2Bc!*'()~-_.%C3%A9%40" {
			t.Errorf("encodeURIComponent = %q", got)
		}
		if got := replyHref(" o'neil+x@example.com ", "  Ana María "); got != "mailto:o'neil%2Bx@example.com?subject=Your%20note%20to%20Story-Tail%20Adventures&body=Hi%20Ana%20Mar%C3%ADa%2C%0A%0A" {
			t.Errorf("href = %q", got)
		}
	})
}

func TestLeadFiltersAndLabels(t *testing.T) {
	t.Run("Open is New and Contacted", func(t *testing.T) {
		for _, c := range []struct {
			status, filter string
			want           bool
		}{
			{"new", "open", true}, {"contacted", "open", true}, {"closed", "open", false},
			{"converted", "converted", true}, {"closed", "all", true},
		} {
			if got := matchesLeadFilter(c.status, c.filter); got != c.want {
				t.Errorf("matchesLeadFilter(%s, %s) = %v", c.status, c.filter, got)
			}
		}
	})

	t.Run("names the page a note came from, and nothing for an unknown one", func(t *testing.T) {
		for page, want := range map[string]string{"detail": "trip page", "app": "Android app", "evil": "", "": ""} {
			if got := leadPageLabel(page); got != want {
				t.Errorf("leadPageLabel(%q) = %q, want %q", page, got, want)
			}
		}
	})

	t.Run("an 'Already a client' row says so, and only a New lead says how long it waited", func(t *testing.T) {
		item := toLeadListItem(leadRowFixture(nil), "2026-10-21", "America/Chicago")
		if item.Name != "Dana Reyes" || item.StatusLabel != "New" || item.WaitLabel != "Waiting 2 days" || item.DateLabel != "Oct 21" {
			t.Errorf("item = %+v", item)
		}
		already := toLeadListItem(leadRowFixture(func(r *leadListRow) { r.Status, r.AlreadyClient = "converted", true }), "2026-10-21", "America/Chicago")
		if already.StatusLabel != leadAlreadyClient || already.WaitLabel != "" {
			t.Errorf("already = %+v", already)
		}
	})

	// Go-only: the counts every chip shows, and a filter Next does not know.
	t.Run("counts every filter and shows only the chosen one", func(t *testing.T) {
		rows := []leadListRow{
			leadRowFixture(nil),
			leadRowFixture(func(r *leadListRow) { r.ID, r.Status = "b", "contacted" }),
			leadRowFixture(func(r *leadListRow) { r.ID, r.Status = "c", "converted" }),
			leadRowFixture(func(r *leadListRow) { r.ID, r.Status = "d", "closed" }),
		}
		l := buildLeadList(rows, "open", "2026-10-21", "America/Chicago")
		if l.Counts != [4]int{2, 1, 1, 4} || len(l.Items) != 2 {
			t.Errorf("list = %+v", l)
		}
		if leadFilterFrom(url.Values{"status": {"closed"}}) != "closed" || leadFilterFrom(url.Values{"status": {"spam"}}) != "open" || leadFilterFrom(nil) != "open" {
			t.Error("leadFilterFrom")
		}
		if leadMessages(1) != "1 note" || leadMessages(3) != "3 notes" {
			t.Error("leadMessages")
		}
	})
}

func TestBuildLeadDetail(t *testing.T) {
	phone, utm, med, closedAt, reason, note := "+1-555-0100", "instagram", "social", "2026-10-22T14:00:00Z", "no_reply", "Tried twice"
	lead := leadRow{
		ID: "l1", FirstName: "Dana", Email: "dana@example.com", Phone: &phone, Source: "website", Status: "closed",
		UTMSource: &utm, UTMMedium: &med, ClosedAt: &closedAt, CloseReason: &reason, CloseNote: &note,
		CreatedAt: "2026-10-19T15:00:00Z", LastMessageAt: "2026-10-21T15:00:00Z",
	}
	page, about := "detail", "Seven nights in Lisbon"
	msgs := []leadMessageRow{
		{ID: "m1", Body: "June works.", Page: &page, AboutLabel: &about, CreatedAt: "2026-10-19T15:00:00Z"},
		{ID: "m2", Body: "Called back.", EnteredByAgent: true, CreatedAt: "2026-10-21T03:00:00Z"},
	}
	d := buildLeadDetail(lead, msgs, "America/Chicago")
	if d.Name != "Dana" || d.StatusLabel != "Closed" || d.StatusKind != "past" || d.SourceLabel != "Website form" {
		t.Errorf("detail = %+v", d)
	}
	var got []string
	for _, r := range d.Details {
		got = append(got, r.Label+"="+r.Value)
	}
	// The closed DATE row comes first, so Next's first-of-each-label filter drops the reason.
	want := "Email=dana@example.com|Phone=+1-555-0100|Came from=Website form|Campaign=instagram · social|First note=Oct 19|Closed=Oct 22"
	if strings.Join(got, "|") != want {
		t.Errorf("details = %s", strings.Join(got, "|"))
	}
	if d.Messages[0].Meta != "Oct 19 · Sent from the trip page" || d.Messages[0].About != about ||
		d.Messages[1].Meta != "Oct 20 · Added by you" || d.Messages[1].About != "" {
		t.Errorf("messages = %+v", d.Messages)
	}
	if !strings.HasPrefix(d.ReplyHref, "mailto:dana@example.com?") {
		t.Errorf("reply = %q", d.ReplyHref)
	}

	// A reason with no closed date shows as the Closed row, with its note.
	lead.ClosedAt = nil
	d = buildLeadDetail(lead, nil, "America/Chicago")
	if last := d.Details[len(d.Details)-1]; last.Label != "Closed" || last.Value != "No reply: Tried twice" {
		t.Errorf("closed row = %+v", last)
	}
}
