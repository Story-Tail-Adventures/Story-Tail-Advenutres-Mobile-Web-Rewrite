package people

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// Screen 3.3.1, the client roster: a port of web/lib/agent/clients.ts. The page is
// app/(agent)/agent/clients/page.tsx; filters live in the URL (a GET form), and bulk tag is
// a checkbox form that posts the ticked ids and comes back to the same filtered list.

// rosterPageSize is ROSTER_PAGE_SIZE.
const rosterPageSize = 25

// rosterQuery is RosterQuery: what the URL asks for.
type rosterQuery struct {
	Status string // "active" or "archived"; anything else is active, never a third state
	Tags   []string
	Search string
	Page   int
}

// rosterQueryFrom ports rosterQueryFromParams.
func rosterQueryFrom(q url.Values) rosterQuery {
	out := rosterQuery{Status: "active", Page: 1}
	if q.Get("status") == "archived" {
		out.Status = "archived"
	}
	for _, t := range q["tag"] {
		if t = strings.TrimSpace(t); t != "" {
			out.Tags = append(out.Tags, t)
		}
	}
	out.Search = strings.TrimSpace(q.Get("q"))
	// parseInt semantics: leading digits count ("3abc" is 3), junk or <= 0 is page 1.
	if n := leadingInt(q.Get("page")); n > 0 {
		out.Page = n
	}
	return out
}

// leadingInt is Number.parseInt(s, 10) for the cases a page number needs: optional sign,
// leading digits; 0 when there are none. Capped so the offset cannot overflow.
func leadingInt(s string) int {
	s = strings.TrimSpace(s)
	neg := false
	if s != "" && (s[0] == '-' || s[0] == '+') {
		neg, s = s[0] == '-', s[1:]
	}
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	n, err := strconv.Atoi(s[:min(end, 9)])
	if err != nil {
		return 0
	}
	if neg {
		return -n
	}
	return n
}

// href is the roster URL for this query on page p, written as the Next page writes it.
func (q rosterQuery) href(p int) string {
	var parts []string
	if q.Status != "active" {
		parts = append(parts, "status="+url.QueryEscape(q.Status))
	}
	if q.Search != "" {
		parts = append(parts, "q="+url.QueryEscape(q.Search))
	}
	for _, t := range q.Tags {
		parts = append(parts, "tag="+url.QueryEscape(t))
	}
	if p > 1 {
		parts = append(parts, "page="+strconv.Itoa(p))
	}
	if len(parts) == 0 {
		return "/agent/clients"
	}
	return "/agent/clients?" + strings.Join(parts, "&")
}

// rosterArgs are agent_client_roster's arguments: null, not an empty array, when unfiltered.
type rosterArgs struct {
	Status []string `json:"p_status"`
	Tags   []string `json:"p_tags"`
	Search *string  `json:"p_search"`
	Limit  int      `json:"p_limit"`
	Offset int      `json:"p_offset"`
}

func (q rosterQuery) args() rosterArgs {
	a := rosterArgs{Status: []string{q.Status}, Limit: rosterPageSize, Offset: (q.Page - 1) * rosterPageSize}
	if len(q.Tags) > 0 {
		a.Tags = q.Tags
	}
	if q.Search != "" {
		s := q.Search
		a.Search = &s
	}
	return a
}

// rosterRow is one agent_client_roster() row.
type rosterRow struct {
	ClientID             string   `json:"client_id"`
	DisplayName          string   `json:"display_name"`
	FirstName            string   `json:"first_name"`
	LastName             string   `json:"last_name"`
	Email                *string  `json:"email"`
	Phone                *string  `json:"phone"`
	Status               string   `json:"status"`
	Tags                 []string `json:"tags"`
	LifetimeValueCents   Cents    `json:"lifetime_value_cents"`
	LifetimeCurrency     *string  `json:"lifetime_currency"`
	TripCount            int64    `json:"trip_count"`
	LastTripTitle        *string  `json:"last_trip_title"`
	LastTripEndDate      *string  `json:"last_trip_end_date"`
	NextTripTitle        *string  `json:"next_trip_title"`
	NextTripStartDate    *string  `json:"next_trip_start_date"`
	NextTripStatus       *string  `json:"next_trip_status"`
	NextTripDestinations []string `json:"next_trip_destinations"`
	LastContactAt        *string  `json:"last_contact_at"`
	ArchivedAt           *string  `json:"archived_at"`
	AsOfDate             string   `json:"as_of_date"`
	TotalCount           int64    `json:"total_count"`
}

type tagFacetRow struct {
	Tag   string `json:"tag"`
	Count int64  `json:"count"`
}

// rosterSummaryRow is agent_client_roster_summary()'s one row.
type rosterSummaryRow struct {
	ActiveCount   int64         `json:"active_count"`
	InMotionCount int64         `json:"in_motion_count"`
	InquiryCount  int64         `json:"inquiry_count"`
	ArchivedCount int64         `json:"archived_count"`
	TagFacets     []tagFacetRow `json:"tag_facets"`
}

// clientRow is ClientRosterRow: one formatted line of the roster. "" labels are absent.
type clientRow struct {
	ClientID      string
	DisplayName   string
	Initials      string
	Email         string
	HasEmail      bool
	Tags          []string
	Archived      bool
	LifetimeLabel string
	TripCount     int64
	LastTripLabel string
	NextTripLabel string
	NextTripIsNow bool
}

type tagFacet struct {
	Tag      string
	Count    int64
	Selected bool
}

// roster is ClientRoster. nil from the loader means a read failed.
type roster struct {
	Rows      []clientRow
	Total     int64
	Page      int
	PageCount int
	Active    int64
	InMotion  int64
	Inquiry   int64
	Archived  int64
	Facets    []tagFacet
	Query     rosterQuery
}

// monthYear is "Aug 26" for 2026-08-12.
func monthYear(iso string) string {
	y, rest, ok := strings.Cut(iso, "-")
	if !ok || len(y) < 4 {
		return ""
	}
	m, _, _ := strings.Cut(rest, "-")
	n, err := strconv.Atoi(m)
	if err != nil || n < 1 || n > 12 {
		return ""
	}
	return shortMonths[n-1] + " " + y[2:]
}

func tripLabel(title, iso string) string {
	if title == "" {
		return ""
	}
	if when := monthYear(iso); when != "" {
		return title + " · " + when
	}
	return title
}

// initialsOf builds initials from the name parts, never the display name: "AF", or "?".
func initialsOf(first, last string) string {
	var b strings.Builder
	for _, part := range []string{first, last} {
		for _, r := range strings.TrimSpace(part) {
			b.WriteRune(r)
			break
		}
	}
	if b.Len() == 0 {
		return "?"
	}
	return strings.ToUpper(b.String())
}

// buildRoster is loadClientRoster after its two reads.
func buildRoster(raw []rosterRow, summary *rosterSummaryRow, q rosterQuery) *roster {
	r := &roster{Page: q.Page, Query: q}
	if len(raw) > 0 {
		r.Total = raw[0].TotalCount
	}
	for _, x := range raw {
		row := clientRow{
			ClientID:      x.ClientID,
			DisplayName:   x.DisplayName,
			Initials:      initialsOf(x.FirstName, x.LastName),
			Tags:          x.Tags,
			Archived:      x.ArchivedAt != nil,
			TripCount:     x.TripCount,
			LastTripLabel: tripLabel(str(x.LastTripTitle), str(x.LastTripEndDate)),
		}
		if x.Email != nil {
			row.Email, row.HasEmail = *x.Email, true
		}
		// A client with nothing committed gets a dash, never $0.
		if x.LifetimeCurrency != nil && x.LifetimeValueCents != 0 {
			row.LifetimeLabel = money(x.LifetimeValueCents)
		}
		if str(x.NextTripStatus) == "in_progress" {
			where := str(x.NextTripTitle)
			if len(x.NextTripDestinations) > 0 {
				where = x.NextTripDestinations[0]
			}
			row.NextTripLabel = strings.TrimSpace("Now · " + where)
			row.NextTripIsNow = true
		} else {
			row.NextTripLabel = tripLabel(str(x.NextTripTitle), str(x.NextTripStartDate))
		}
		r.Rows = append(r.Rows, row)
	}
	r.PageCount = max(1, int((r.Total+rosterPageSize-1)/rosterPageSize))
	selected := map[string]bool{}
	for _, t := range q.Tags {
		selected[t] = true
	}
	if summary != nil {
		r.Active, r.InMotion, r.Inquiry, r.Archived = summary.ActiveCount, summary.InMotionCount, summary.InquiryCount, summary.ArchivedCount
		for _, f := range summary.TagFacets {
			r.Facets = append(r.Facets, tagFacet{Tag: f.Tag, Count: f.Count, Selected: selected[f.Tag]})
		}
	}
	return r
}

// rosterSubtitle ports rosterSubtitle: "27 active · 5 in motion · 1 lead to qualify."
func rosterSubtitle(active, inMotion, toQualify int64) string {
	parts := []string{fmt.Sprintf("%d active", active), fmt.Sprintf("%d in motion", inMotion)}
	if toQualify > 0 {
		if toQualify == 1 {
			parts = append(parts, "1 lead to qualify")
		} else {
			parts = append(parts, fmt.Sprintf("%d leads to qualify", toQualify))
		}
	}
	return strings.Join(parts, " · ") + "."
}

// bulkTagResult ports bulkTagResult: the receipt under the roster after a bulk tag.
func bulkTagResult(tag string, changed, requested int64, added bool) string {
	if changed == 0 {
		if added {
			return `Every client you picked already had "` + tag + `".`
		}
		return `None of the clients you picked had "` + tag + `".`
	}
	who := fmt.Sprintf("%d clients", changed)
	if changed == 1 {
		who = "1 client"
	}
	head := `Removed "` + tag + `" from ` + who + "."
	if added {
		head = `Added "` + tag + `" to ` + who + "."
	}
	rest := requested - changed
	if rest == 0 {
		return head
	}
	var tail string
	switch {
	case added && rest == 1:
		tail = "The other 1 was already tagged."
	case added:
		tail = fmt.Sprintf("The other %d were already tagged.", rest)
	case rest == 1:
		tail = "The other 1 wasn't tagged."
	default:
		tail = fmt.Sprintf("The other %d weren't tagged.", rest)
	}
	return head + " " + tail
}

// rangeLabel is RosterPagination's "26–50 of 27" line.
func rangeLabel(page, shown int, total int64) string {
	first := (page-1)*rosterPageSize + 1
	return fmt.Sprintf("%d–%d of %d", first, first+shown-1, total)
}
