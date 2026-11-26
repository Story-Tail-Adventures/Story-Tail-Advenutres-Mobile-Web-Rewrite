package people

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// Ported from web/lib/agent/clients.test.ts and the bulkTagResult / rosterSubtitle cases of
// web/lib/agent/content.test.ts. (The loader's "either read failing is a retry" and the
// arguments it passes are in roster_handler_test.go, through the handler.)

func TestRosterQueryFromParams(t *testing.T) {
	q := rosterQueryFrom(url.Values{})
	if q.Status != "active" || len(q.Tags) != 0 || q.Search != "" || q.Page != 1 {
		t.Errorf("defaults = %+v", q)
	}
	if got := rosterQueryFrom(url.Values{"tag": {"vip"}}).Tags; !slices.Equal(got, []string{"vip"}) {
		t.Errorf("one tag = %v", got)
	}
	if got := rosterQueryFrom(url.Values{"tag": {"vip", "family", "  "}}).Tags; !slices.Equal(got, []string{"vip", "family"}) {
		t.Errorf("many tags = %v", got)
	}
	for raw, want := range map[string]string{"archived": "archived", "merged_into": "active", "": "active"} {
		if got := rosterQueryFrom(url.Values{"status": {raw}}).Status; got != want {
			t.Errorf("status %q = %q", raw, got)
		}
	}
	for raw, want := range map[string]int{"0": 1, "-4": 1, "banana": 1, "3": 3, "3abc": 3, "99999999999999999999": 999999999} {
		if got := rosterQueryFrom(url.Values{"page": {raw}}).Page; got != want {
			t.Errorf("page %q = %d, want %d", raw, got, want)
		}
	}
	if got := rosterQueryFrom(url.Values{"q": {"  hayes  "}}).Search; got != "hayes" {
		t.Errorf("search = %q", got)
	}
	if got := rosterQueryFrom(url.Values{"q": {"   "}}).Search; got != "" {
		t.Errorf("blank search = %q", got)
	}
}

func TestRosterArgs(t *testing.T) {
	b, _ := json.Marshal(rosterQuery{Status: "archived", Tags: []string{"vip"}, Search: "hayes", Page: 2}.args())
	if string(b) != `{"p_status":["archived"],"p_tags":["vip"],"p_search":"hayes","p_limit":25,"p_offset":25}` {
		t.Errorf("filtered args = %s", b)
	}
	b, _ = json.Marshal(rosterQueryFrom(url.Values{}).args())
	if string(b) != `{"p_status":["active"],"p_tags":null,"p_search":null,"p_limit":25,"p_offset":0}` {
		t.Errorf("unfiltered args = %s", b)
	}
}

func rosterFixture(mod func(*rosterRow)) rosterRow {
	r := rosterRow{
		ClientID: "c1", DisplayName: "Jordan Hayes", FirstName: "Jordan", LastName: "Hayes",
		Email: p("jordan.hayes@example.com"), Phone: p("+1-555-0142"), Status: "active", Tags: []string{"anniversary"},
		LifetimeValueCents: 1976500, LifetimeCurrency: p("USD"), TripCount: 5,
		LastTripTitle: p("Beaches Turks & Caicos"), LastTripEndDate: p("2024-01-13"),
		NextTripTitle: p("Anniversary Week in Negril"), NextTripStartDate: p("2026-08-12"), NextTripStatus: p("booked"),
		NextTripDestinations: []string{"Negril, Jamaica"}, LastContactAt: p("2026-09-26T12:00:00Z"),
		AsOfDate: "2026-09-26", TotalCount: 27,
	}
	if mod != nil {
		mod(&r)
	}
	return r
}

var summaryFixture = &rosterSummaryRow{ActiveCount: 27, InMotionCount: 5, InquiryCount: 1, ArchivedCount: 2,
	TagFacets: []tagFacetRow{{Tag: "vip", Count: 4}}}

var activeQuery = rosterQuery{Status: "active", Page: 1}

func TestBuildRoster(t *testing.T) {
	t.Run("an empty book is a populated roster", func(t *testing.T) {
		r := buildRoster(nil, summaryFixture, activeQuery)
		if len(r.Rows) != 0 || r.Total != 0 || r.PageCount != 1 {
			t.Errorf("empty = %+v", r)
		}
	})
	t.Run("money, and a dash rather than $0 for nothing committed", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(nil), rosterFixture(func(x *rosterRow) {
			x.ClientID, x.LifetimeValueCents, x.LifetimeCurrency = "c2", 0, nil
		})}, summaryFixture, activeQuery)
		if !strings.Contains(r.Rows[0].LifetimeLabel, "19,765") || r.Rows[1].LifetimeLabel != "" {
			t.Errorf("lifetime = %q / %q", r.Rows[0].LifetimeLabel, r.Rows[1].LifetimeLabel)
		}
	})
	t.Run("Now for a client who is travelling", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(func(x *rosterRow) { x.NextTripStatus = p("in_progress") })}, summaryFixture, activeQuery)
		if !r.Rows[0].NextTripIsNow || r.Rows[0].NextTripLabel != "Now · Negril, Jamaica" {
			t.Errorf("now = %+v", r.Rows[0])
		}
		r = buildRoster([]rosterRow{rosterFixture(func(x *rosterRow) {
			x.NextTripStatus, x.NextTripDestinations = p("in_progress"), nil
		})}, summaryFixture, activeQuery)
		if r.Rows[0].NextTripLabel != "Now · Anniversary Week in Negril" {
			t.Errorf("now without destinations = %q", r.Rows[0].NextTripLabel)
		}
	})
	t.Run("keeps a trip with no dates", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(func(x *rosterRow) {
			x.NextTripTitle, x.NextTripStartDate, x.NextTripStatus = p("Somewhere warm, February-ish"), nil, p("inquiry")
		})}, summaryFixture, activeQuery)
		if r.Rows[0].NextTripLabel != "Somewhere warm, February-ish" {
			t.Errorf("undated = %q", r.Rows[0].NextTripLabel)
		}
	})
	t.Run("a trip with a month and year", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(nil)}, summaryFixture, activeQuery)
		if r.Rows[0].NextTripLabel != "Anniversary Week in Negril · Aug 26" || r.Rows[0].LastTripLabel != "Beaches Turks & Caicos · Jan 24" {
			t.Errorf("labels = %q / %q", r.Rows[0].NextTripLabel, r.Rows[0].LastTripLabel)
		}
	})
	t.Run("total_count gives the page count", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(nil)}, summaryFixture, activeQuery)
		if r.Total != 27 || r.PageCount != 2 {
			t.Errorf("total %d pages %d", r.Total, r.PageCount)
		}
	})
	t.Run("a facet is selected when the query carries it", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(nil)}, summaryFixture, rosterQuery{Status: "active", Tags: []string{"vip"}, Page: 1})
		if len(r.Facets) != 1 || r.Facets[0] != (tagFacet{Tag: "vip", Count: 4, Selected: true}) {
			t.Errorf("facets = %+v", r.Facets)
		}
	})
	t.Run("a null tag_facets is an empty list", func(t *testing.T) {
		var s rosterSummaryRow
		if err := json.Unmarshal([]byte(`{"active_count":1,"in_motion_count":0,"inquiry_count":0,"archived_count":0,"tag_facets":null}`), &s); err != nil {
			t.Fatal(err)
		}
		if r := buildRoster(nil, &s, activeQuery); len(r.Facets) != 0 {
			t.Errorf("facets = %+v", r.Facets)
		}
	})
	t.Run("no email stays absent for the page to label", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(func(x *rosterRow) { x.Email = nil })}, summaryFixture, activeQuery)
		if r.Rows[0].HasEmail {
			t.Error("a null email became present")
		}
	})
	t.Run("initials from the name parts, not the display name", func(t *testing.T) {
		r := buildRoster([]rosterRow{rosterFixture(func(x *rosterRow) {
			x.DisplayName, x.FirstName, x.LastName = "Belle Fitzwilliam-Castellanos", "Annabelle", "Fitzwilliam-Castellanos"
		})}, summaryFixture, activeQuery)
		if r.Rows[0].Initials != "AF" {
			t.Errorf("initials = %q", r.Rows[0].Initials)
		}
		if initialsOf(" ", "") != "?" {
			t.Error("no name should be ?")
		}
	})
}

func TestRosterHref(t *testing.T) {
	q := rosterQuery{Status: "archived", Search: "a&b", Tags: []string{"vip", "two words"}, Page: 1}
	if got := q.href(3); got != "/agent/clients?status=archived&q=a%26b&tag=vip&tag=two+words&page=3" {
		t.Errorf("href = %q", got)
	}
	if got := activeQuery.href(1); got != "/agent/clients" {
		t.Errorf("plain href = %q", got)
	}
}

func TestBulkTagResult(t *testing.T) {
	for _, c := range []struct {
		changed, requested int64
		added              bool
		want               string
	}{
		{4, 6, true, `Added "vip" to 4 clients. The other 2 were already tagged.`},
		{3, 3, true, `Added "vip" to 3 clients.`},
		{3, 3, false, `Removed "vip" from 3 clients.`},
		{1, 1, true, `Added "vip" to 1 client.`},
		{2, 3, true, `Added "vip" to 2 clients. The other 1 was already tagged.`},
		{2, 3, false, `Removed "vip" from 2 clients. The other 1 wasn't tagged.`},
		{0, 5, true, `Every client you picked already had "vip".`},
		{0, 5, false, `None of the clients you picked had "vip".`},
	} {
		if got := bulkTagResult("vip", c.changed, c.requested, c.added); got != c.want {
			t.Errorf("bulkTagResult(%d, %d, %v) = %q", c.changed, c.requested, c.added, got)
		}
	}
	bad := regexp.MustCompile(`\b1 clients\b|\bother 1 (were|weren't)\b|\bother [2-9]\d* (was|wasn't)\b`)
	for _, cr := range [][2]int64{{1, 1}, {1, 2}, {2, 3}, {5, 9}, {0, 5}, {4, 6}, {6, 6}} {
		for _, added := range []bool{true, false} {
			line := bulkTagResult("vip", cr[0], cr[1], added)
			if bad.MatchString(line) || !strings.HasSuffix(line, ".") || (cr[0] == 0 && strings.Contains(line, "0")) {
				t.Errorf("%v %v: %q", cr, added, line)
			}
		}
	}
	// The tag is the advisor's own words, written as typed, never Go-quoted.
	if got := bulkTagResult(`honey"moon é`, 1, 1, true); got != `Added "honey"moon é" to 1 client.` {
		t.Errorf("raw tag = %q", got)
	}
}

func TestRosterSubtitle(t *testing.T) {
	for _, c := range []struct {
		a, m, q int64
		want    string
	}{
		{27, 5, 1, "27 active · 5 in motion · 1 lead to qualify."},
		{27, 5, 3, "27 active · 5 in motion · 3 leads to qualify."},
		{0, 0, 0, "0 active · 0 in motion."},
	} {
		if got := rosterSubtitle(c.a, c.m, c.q); got != c.want {
			t.Errorf("rosterSubtitle(%d,%d,%d) = %q", c.a, c.m, c.q, got)
		}
	}
	if got := rangeLabel(2, 2, 27); got != fmt.Sprintf("26–27 of %d", 27) {
		t.Errorf("rangeLabel = %q", got)
	}
}
