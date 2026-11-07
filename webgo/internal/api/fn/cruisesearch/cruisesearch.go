// Package cruisesearch ports supabase/functions/cruise-search and the public catalog read in
// _shared/cruise/public.ts: Screen Inventory 2.3.4 / 2.0.4 in Cruises mode.
//
// WEB-ONLY, IN PROCESS. The Deno function took a shared caller token from the web server
// because the anon key authenticates nobody. In Go the web pages call it through
// registry.Call and the HTTP door answers 404 (GateInProcess), so there is no token left to
// steal and none is checked. The catalog tables keep zero anon exposure: the read runs on the
// service role, as it did.
//
// THE LEAD PRICE NEVER LEAVES THIS FILE. cruise_sailing.lead_price_cents is Internal
// (Data-Model §24.4); it is not selected and publicSailing has no field for it.
package cruisesearch

import (
	"context"
	"net/http"
	"regexp"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

const maxResults = 24

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		// POST: one serialisation of the query, and nothing a link preview can trigger.
		return nil, problem.Forbidden("Use POST to search.")
	}
	b, _ := edge.Body(r)
	body, err := js.Parse(b)
	if err != nil {
		body = js.NullValue() // req.json().catch(() => null)
	}
	q, err := parseBody(body)
	if err != nil {
		return nil, err
	}
	sailings, err := searchSailings(r.Context(), dbReads{d.DB}, q)
	if err != nil {
		return nil, err
	}
	return edge.OK(js.O("results", sailings))
}

// query is SailingQuery.
type query struct {
	Destination          *string
	From, To             string // "" is undefined
	MinNights, MaxNights *int64
	Limit                int64
}

var (
	isoDay   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	controls = regexp.MustCompile(`\p{Cc}`)
	spaces   = js.Regexp(`\s+`, "")
)

// parseBody reads the query. A body that is not an object reads as no filters at all.
func parseBody(body js.Value) (query, error) {
	from := isoDate(body.Get("from"))
	to := isoDate(body.Get("to"))
	if from != "" && to != "" && to < from {
		return query{}, problem.BadRequest("`to` must not be before `from`.")
	}
	q := query{
		Destination: text(body.Get("destination"), 60),
		From:        from,
		To:          to,
		MinNights:   count(body.Get("minNights"), 1, 60),
		MaxNights:   count(body.Get("maxNights"), 1, 60),
		Limit:       maxResults,
	}
	if n := count(body.Get("limit"), 1, maxResults); n != nil {
		q.Limit = *n
	}
	return q, nil
}

func text(v js.Value, max int) *string {
	s, ok := v.Str()
	if !ok {
		return nil
	}
	cleaned := js.Slice(js.Trim(spaces.ReplaceAllString(controls.ReplaceAllString(s, " "), " ")), 0, max)
	if cleaned == "" {
		return nil
	}
	return &cleaned
}

// isoDate keeps a real YYYY-MM-DD day. Date.UTC reads years 0 to 99 as 1900 to 1999, so the
// Deno check refused them, and so does this.
func isoDate(v js.Value) string {
	s, ok := v.Str()
	if !ok || !isoDay.MatchString(s) {
		return ""
	}
	t, ok := js.ParseDate(s + "T12:00:00Z")
	if !ok || s[:4] < "0100" || t.Format("2006-01-02") != s {
		return ""
	}
	return s
}

func count(v js.Value, min, max float64) *int64 {
	f, ok := v.Num()
	if !ok {
		return nil
	}
	n := js.Round(f)
	if !js.IsFinite(n) || n < min || n > max {
		return nil
	}
	i := int64(n)
	return &i
}

// ---- the read ----

type lineRow struct {
	Name *string `json:"name"`
}

type shipRow struct {
	Name           *string `json:"name"`
	ImageURL       *string `json:"image_url"`
	ImageCredit    *string `json:"image_credit"`
	ImageLicense   *string `json:"image_license"`
	ImageSourceURL *string `json:"image_source_url"`
}

type sailingRow struct {
	ID             string    `json:"id"`
	Title          *string   `json:"title"`
	DepartureDate  string    `json:"departure_date"`
	DurationNights *int64    `json:"duration_nights"`
	Destinations   []*string `json:"destinations"`
	CruiseLine     *lineRow  `json:"cruise_line"`
	CruiseShip     *shipRow  `json:"cruise_ship"`
}

type portCall struct {
	SailingID string  `json:"sailing_id"`
	PortName  *string `json:"port_name"`
	Sequence  int64   `json:"sequence"`
}

// searchArgs are cruise_sailing_search's arguments; nil ones are left out of the call.
type searchArgs struct {
	Needle               *string
	From, To             string
	MinNights, MaxNights *int64
	MaxRows              int64
}

func (a searchArgs) object() js.Ordered {
	opt := func(p any, set bool) any {
		if !set {
			return js.Undef
		}
		return p
	}
	return js.O(
		"needle", opt(a.Needle, a.Needle != nil),
		"depart_from", opt(a.From, a.From != ""),
		"depart_to", opt(a.To, a.To != ""),
		"min_nights", opt(a.MinNights, a.MinNights != nil),
		"max_nights", opt(a.MaxNights, a.MaxNights != nil),
		"max_rows", a.MaxRows,
	)
}

// reads is what searchSailings needs from the database, so its tests can fake it.
type reads interface {
	sailings(ctx context.Context, a searchArgs) ([]sailingRow, error)
	portCalls(ctx context.Context, sailingIDs []string) ([]portCall, error)
}

type dbReads struct{ db *service.Client }

// columns are only what a card needs: a column a later migration adds (a fare, a margin,
// provider_payload) must not reach a public page without someone deciding it should.
const columns = "id, title, departure_date, duration_nights, destinations, cruise_line:cruise_line_id (name), " +
	"cruise_ship:ship_id (name, image_url, image_credit, image_license, image_source_url)"

func (r dbReads) sailings(ctx context.Context, a searchArgs) ([]sailingRow, error) {
	var rows []sailingRow
	err := r.db.RPCQuery("cruise_sailing_search", a.object()).Select(columns).
		Order("departure_date", true).Order("id", true).Limit(int(a.MaxRows)).Rows(ctx, &rows)
	return rows, err
}

func (r dbReads) portCalls(ctx context.Context, ids []string) ([]portCall, error) {
	var calls []portCall
	err := r.db.From("cruise_port_call").Select("sailing_id, port_name, sequence").
		In("sailing_id", ids).Order("sequence", true).Rows(ctx, &calls)
	return calls, err
}

func searchSailings(ctx context.Context, db reads, q query) ([]publicSailing, error) {
	rows, err := db.sailings(ctx, searchArgs{Needle: q.Destination, From: q.From, To: q.To,
		MinNights: q.MinNights, MaxNights: q.MaxNights, MaxRows: q.Limit})
	if err != nil {
		return nil, wrap("sailing search failed", err)
	}
	if len(rows) == 0 {
		return []publicSailing{}, nil
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	ports := portsFor(ctx, db, ids)
	out := make([]publicSailing, len(rows))
	for i, r := range rows {
		out[i] = mapSailing(r, ports[r.ID])
	}
	return out, nil
}

func wrap(label string, err error) error { return &labelled{label, err} }

type labelled struct {
	label string
	err   error
}

func (l *labelled) Error() string { return l.label + ": " + l.err.Error() }
func (l *labelled) Unwrap() error { return l.err }

// seaDays are itinerary entries the provider lists that are not ports. EXACT NAMES, not a
// pattern: "Perfect Day at CocoCay" is a port with "Day" in it and "Seattle" starts with
// "Sea"; anything looser drops a real port.
var seaDays = map[string]bool{"at sea": true, "fun day at sea": true, "day at sea": true, "sea day": true, "cruising": true}

func isSeaDay(name string) bool {
	return seaDays[spaces.ReplaceAllString(js.ToLower(js.Trim(name)), " ")]
}

// portsFor is the port calls for a page of sailings in one query. A failed read leaves the
// itinerary lines empty rather than failing the search, as the Deno version did.
func portsFor(ctx context.Context, db reads, ids []string) map[string][]string {
	out := map[string][]string{}
	calls, err := db.portCalls(ctx, ids)
	if err != nil {
		return out
	}
	for _, c := range calls {
		name := ""
		if c.PortName != nil {
			name = js.Trim(*c.PortName)
		}
		if name == "" || isSeaDay(name) {
			continue
		}
		list := out[c.SailingID]
		if len(list) == 0 || list[len(list)-1] != name {
			list = append(list, name)
		}
		out[c.SailingID] = list
	}
	return out
}

// shipImage is a photo and the attribution that may not be separated from it (CC BY /
// CC BY-SA: the credit is a licence condition).
type shipImage struct {
	URL       string  `json:"url"`
	Credit    string  `json:"credit"`
	License   *string `json:"license"`
	SourceURL *string `json:"sourceUrl"`
}

// publicSailing is what a public cruise card may show. No fare, by construction.
type publicSailing struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Line          *string    `json:"line"`
	Ship          *string    `json:"ship"`
	DepartureDate string     `json:"departureDate"`
	Nights        *int64     `json:"nights"`
	Destinations  []string   `json:"destinations"`
	Ports         []string   `json:"ports"`
	ShipImage     *shipImage `json:"shipImage"`
}

func trimmedOrNil(s *string) *string {
	if s == nil {
		return nil
	}
	t := js.Trim(*s)
	if t == "" {
		return nil
	}
	return &t
}

func mapSailing(row sailingRow, ports []string) publicSailing {
	title := "Cruise"
	if row.Title != nil && js.Trim(*row.Title) != "" {
		title = js.Trim(*row.Title)
	}
	var line, ship *string
	if row.CruiseLine != nil {
		line = trimmedOrNil(row.CruiseLine.Name)
	}
	if row.CruiseShip != nil {
		ship = trimmedOrNil(row.CruiseShip.Name)
	}
	dest := []string{}
	for _, d := range row.Destinations {
		if d != nil && len(dest) < 6 {
			dest = append(dest, *d)
		}
	}
	if len(ports) > 12 {
		ports = ports[:12]
	}
	if ports == nil {
		ports = []string{}
	}
	return publicSailing{
		ID: row.ID, Title: title, Line: line, Ship: ship, DepartureDate: row.DepartureDate,
		Nights: row.DurationNights, Destinations: dest, Ports: ports, ShipImage: mapShipImage(row.CruiseShip),
	}
}

// mapShipImage drops the photo when its credit is missing rather than serving it uncredited.
func mapShipImage(ship *shipRow) *shipImage {
	if ship == nil {
		return nil
	}
	url, credit := trimmedOrNil(ship.ImageURL), trimmedOrNil(ship.ImageCredit)
	if url == nil || credit == nil {
		return nil
	}
	return &shipImage{URL: *url, Credit: *credit, License: trimmedOrNil(ship.ImageLicense), SourceURL: trimmedOrNil(ship.ImageSourceURL)}
}
