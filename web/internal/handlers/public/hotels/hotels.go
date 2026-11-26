// Package hotels runs live hotel search for the public explore page (Screen 2.0.4, Hotels
// mode, P2): one call to SerpApi's Google Hotels engine, mapped to the few fields a card may
// show. It is the Go port of web/lib/public/hotels.ts and web/lib/hotels/.
//
// There is no cache, no budget ledger and no Edge Function in the path, by decision (the
// header of web/lib/public/hotels.ts says why). Every distinct search is a billed search,
// and the only cache left is SerpApi's own free one-hour reuse of an identical parameter
// set, which is why query.go treats the outbound parameters as an interface.
//
// The rules it holds:
//
//   - SERPAPI_API_KEY travels in the request's query string, because SerpApi offers no
//     header. It never reaches a page, a log line, an error string or a Result. client.go
//     lists the leak paths and what closes each.
//   - Redirects are not followed, and every attempt has a 12 second deadline.
//   - Nothing about the visitor's search (destination, dates) is logged.
//   - The provider's reply is decoded into an allow-list (provider.go), so booking sites,
//     their logos and links, ads and sponsored placements never exist in memory
//     (Free-Travel-APIs §1.3.5, §10.2). PublicHotel has nowhere to put one.
//   - Every rate is int64 cents (CLAUDE.md rule 5), rounded from the provider's float
//     exactly as the TypeScript did, so no price moves in the port.
//   - Search never fails loudly. A provider problem on a public marketing page is a quiet
//     fallback to the curated catalog, so every failure becomes a Status.
package hotels

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Config is what New needs. The page handler fills it from the environment.
type Config struct {
	// Enabled is HOTEL_SEARCH_ENABLED, the kill switch. False makes every search unavailable
	// without sending anything.
	Enabled bool
	// APIKey is SERPAPI_API_KEY. Empty makes every search unavailable.
	APIKey string
	// HTTP sends the request. Nil gets a client with a 12 second timeout. A client passed in
	// is copied, never changed, and the copy never follows a redirect.
	HTTP *http.Client
	// Log receives the warnings. Nil means slog.Default().
	Log *slog.Logger
	// BaseURL is SerpApi's origin. Empty means https://serpapi.com; tests point it at an
	// httptest server. New panics on anything but https, or plain http to a loopback address.
	BaseURL string
}

// Searcher runs hotel searches. It is safe for concurrent use.
type Searcher struct {
	enabled   bool
	apiKey    string
	http      *http.Client
	log       *slog.Logger
	searchURL string
	timeout   time.Duration
	now       func() time.Time
	sleep     func(context.Context, time.Duration) error
}

// New returns a Searcher. It panics only on a BaseURL that would send the key in the clear
// or somewhere odd, which is a programming mistake rather than a condition to handle.
func New(c Config) *Searcher {
	base := defaultBaseURL
	if c.BaseURL != "" {
		base = strings.TrimRight(c.BaseURL, "/")
		if !safeBaseURL(base) {
			panic("hotels: BaseURL must be https (or http to a loopback address) with no user, query or fragment")
		}
	}
	hc := &http.Client{Timeout: attemptTimeout}
	if c.HTTP != nil {
		copied := *c.HTTP
		hc = &copied
	}
	// Never follow a redirect: it would carry the key in the query string to whatever host
	// the Location names. The 3xx comes back as the response, and fetch fails on it.
	hc.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	log := c.Log
	if log == nil {
		log = slog.Default()
	}
	return &Searcher{
		enabled:   c.Enabled,
		apiKey:    c.APIKey,
		http:      hc,
		log:       log,
		searchURL: base + searchPath,
		timeout:   attemptTimeout,
		now:       time.Now,
		sleep:     sleepCtx,
	}
}

func safeBaseURL(base string) bool {
	u, err := url.Parse(base)
	if err != nil || u.Host == "" || u.User != nil || u.Opaque != "" ||
		u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return false
	}
	switch u.Scheme {
	case "https":
		return true
	case "http":
		host := u.Hostname()
		ip := net.ParseIP(host)
		return host == "localhost" || ip != nil && ip.IsLoopback()
	}
	return false
}

// Args is what the results page knows about a hotel search (HotelSearchArgs). The page
// validates the stay first (real dates, check-out after check-in, not in the past, inside
// the booking horizon) and searches only with a destination and both dates. The rest comes
// from URL query parameters nothing upstream bounds, so Search clamps and allow-lists it
// before it reaches SerpApi.
type Args struct {
	// Destination is the visitor's text. Search folds accents and case and keeps 60 characters.
	Destination string
	// CheckIn is the arrival date, YYYY-MM-DD.
	CheckIn string
	// CheckOut is the departure date, YYYY-MM-DD.
	CheckOut string
	// Adults is clamped to 1 through 8. Pass 2 when the visitor gave no count, as the page does.
	Adults int
	// HotelClass holds star-class ids, "2" to "5". Anything else is dropped.
	HotelClass []string
	// Amenities holds the rail's Google amenity ids. Anything else is dropped.
	Amenities []string
	// MinPriceDollars is the lower bound on the nightly rate in whole US dollars, SerpApi's
	// own unit for min_price. It is a search filter, not money we keep or show. Nil, below
	// 0 or above 100000 means no bound.
	MinPriceDollars *int
	// MaxPriceDollars is the upper bound, on the same terms as MinPriceDollars.
	MaxPriceDollars *int
	// SortBy is a SerpApi sort id: "3" lowest price, "8" highest rating, "13" most reviewed,
	// or "" for Google's own relevance. Anything else becomes "".
	SortBy string
}

// Status is how a search ended. The page shows a different state for each.
type Status string

const (
	// StatusOK means Hotels holds at least one hotel.
	StatusOK Status = "ok"
	// StatusEmpty means the provider answered and has nothing for that destination and stay.
	StatusEmpty Status = "empty"
	// StatusBudgetExhausted means SerpApi says the month's searches are spent. The page asks
	// the visitor to come back rather than implying the site is broken.
	StatusBudgetExhausted Status = "budget_exhausted"
	// StatusUnavailable is everything else: switched off, no key, a provider or network
	// failure, or a reply that failed the checks. The page falls back to the curated catalog.
	StatusUnavailable Status = "unavailable"
)

// Result is one search's outcome (HotelSearchResult). Only StatusOK fills the other fields.
// There is no stale timestamp: without a cache, nothing is ever served stale.
type Result struct {
	// Status says which state the page shows.
	Status Status
	// Hotels is page one, at most 20, in the provider's order.
	Hotels []PublicHotel
	// AsOf is when the provider answered.
	AsOf time.Time
	// Total is the provider's count of matching properties, or nil when it gave none. No
	// page reads it, and Next ignores it too: the provider's total counts what Google has,
	// not what survived our own filtering and compliance checks, so showing it would be a
	// number the list below it contradicts. It is kept because it is the one cheap signal
	// of how much a search is dropping, for whoever next asks why a page looks thin.
	Total *int64
}

// PublicHotel is one hotel as a page may show it. It has no field for a booking site, its
// logo or its link, so no template can render one whatever the provider sends (§1.3.5,
// §10.2). A test pins the field list, so widening it is a visible decision.
type PublicHotel struct {
	// ID is stable within one Result: the property token, or "p" and the property's place
	// in the provider's list when it has none.
	ID string
	// PropertyToken is SerpApi's opaque id for the property, or "". It is carried only so a
	// quote request can say which hotel was picked; it is not a URL and resolves to nothing
	// without our key.
	PropertyToken string
	// Name is never empty and at most 160 characters.
	Name string
	// Description is at most 600 characters, or "".
	Description string
	// PropertyType is the provider's label ("Resort", "hotel"), or "".
	PropertyType string
	// HotelClass is the star class, 1 to 5, or nil.
	HotelClass *int
	// Rating is the overall rating, 0 to 5 to one decimal place, or nil.
	Rating *float64
	// ReviewCount is how many reviews the rating rests on, or nil.
	ReviewCount *int64
	// Amenities is at most 12 labels, de-duplicated.
	Amenities []string
	// Photos is at most 6 https thumbnail URLs, each on an allow-listed Google image host.
	Photos []string
	// EcoCertified is the provider's eco-certified flag.
	EcoCertified bool
	// NightlyCents is the lowest nightly rate the provider reported, in integer cents, or
	// nil when it gave no usable figure. It makes no claim about who offers it.
	NightlyCents *int64
	// Currency is "USD", the only currency the site formats.
	Currency string
}

// Search runs one hotel search: clean the arguments, one SerpApi call, map, check, publish.
// It never fails loudly; every outcome is a Status. ctx bounds the whole search and each
// attempt also has its own 12 second deadline. A refusal that will not change (400, 401,
// 403, 404, 429, a redirect) is not retried; any other failure is, at most twice.
func (s *Searcher) Search(ctx context.Context, args Args) (res Result) {
	if !s.enabled || s.apiKey == "" {
		// Says which one. The visitor sees the same quiet state either way, but a developer
		// with no key would otherwise read it as a provider outage.
		providerKey := "set"
		if s.apiKey == "" {
			providerKey = "MISSING (SERPAPI_API_KEY)"
		}
		s.log.Warn("hotels: search skipped, not configured", "hotelSearchEnabled", s.enabled, "providerKey", providerKey)
		return Result{Status: StatusUnavailable}
	}
	defer func() {
		// The contract is total, as in the TypeScript: a bug in one of the pure steps must
		// not take a public page down. The panic value is not logged; it could quote the search.
		if v := recover(); v != nil {
			// The type only. The value could quote the visitor's search, and a panic from the
			// http stack could quote the URL, which carries the key.
			s.log.Warn("hotels: search failed", "code", "unexpected", "panic", fmt.Sprintf("%T", v), statusAttr(0))
			res = Result{Status: StatusUnavailable}
		}
	}()

	canonical := canonicalize(toSearchInput(args))
	if canonical.destination == "" || canonical.checkIn == "" || canonical.checkOut == "" {
		// The page checks this before calling. This is the backstop: a search without a
		// destination or dates is noise to the provider and would still spend a metered call.
		s.log.Warn("hotels: search skipped, no destination or dates")
		return Result{Status: StatusUnavailable}
	}
	raw, err := s.fetch(ctx, providerParams(canonical))
	if err != nil {
		return s.failed(err)
	}
	return toResult(mapSearchResponse(raw, canonical.currency), s.now().UTC())
}

// failed logs a failed call and picks its Status.
//
// WHAT IS LOGGED IS DELIBERATELY NARROW. Never the arguments and never the reply: a
// destination plus dates is a visitor's travel plan. And never the detail of a network
// error, which is the runtime's own text and can quote the request. For every other code
// the detail is the provider's own sentence, redacted, and it is the difference between
// "bad key" and "no results that week" at 3am.
func (s *Searcher) failed(err *providerError) Result {
	if isQuotaExhausted(err) {
		s.log.Warn("hotels: the provider says the month is spent", statusAttr(err.status))
		return Result{Status: StatusBudgetExhausted}
	}
	attrs := []any{"code", err.code, statusAttr(err.status)}
	if err.code != codeNetwork {
		attrs = append(attrs, "detail", err.detail)
	}
	s.log.Warn("hotels: search failed", attrs...)
	return Result{Status: StatusUnavailable}
}

// statusAttr is the HTTP status, or null when no response arrived, as the TypeScript logged it.
func statusAttr(status int) slog.Attr {
	if status == 0 {
		return slog.Any("status", nil)
	}
	return slog.Int("status", status)
}

// quotaPhrases are SerpApi's ways of saying the month is spent. It answers an exhausted plan
// with the same HTTP status as a bad key, so the only signal is the wording, matched loosely
// because the exact sentence is not part of any contract and has changed before. A miss
// degrades to "unavailable", the old behaviour, not to a wrong page.
var quotaPhrases = []string{
	"run out of searches",
	"ran out of searches",
	"exceeded your searches",
	"searches per month",
	"monthly limit",
	"plan limit",
	"account credit",
}

// isQuotaExhausted matches the provider's refusal. A network error is excluded first: its
// detail is the runtime's text, and a destination containing a phrase would match.
func isQuotaExhausted(err *providerError) bool {
	if err.code == codeNetwork {
		return false
	}
	detail := strings.ToLower(err.detail)
	for _, phrase := range quotaPhrases {
		if strings.Contains(detail, phrase) {
			return true
		}
	}
	return false
}

// toResult is the second belt, the port of parseSearchResponse and its zod schema. On the
// happy path it is redundant, and that is the point: the mapper is the belt someone adding
// a field would edit, and this is the one that would catch them. Any hotel outside the
// schema's bounds fails the whole reply, as safeParse did.
func toResult(p hotelPayload, asOf time.Time) Result {
	// Money is USD only on this site. A reply in anything else is a bug to surface, not a
	// value to render.
	if p.currency != "USD" {
		return Result{Status: StatusUnavailable}
	}
	for _, h := range p.results {
		if !validHotel(h) {
			return Result{Status: StatusUnavailable}
		}
	}
	if len(p.results) == 0 {
		return Result{Status: StatusEmpty}
	}
	hotels := make([]PublicHotel, 0, len(p.results))
	for _, h := range p.results {
		hotels = append(hotels, toPublicHotel(h, p.currency))
	}
	return Result{Status: StatusOK, Hotels: hotels, AsOf: asOf, Total: p.totalAvailable}
}

// validHotel is hotelSchema in hotels.ts. Lengths are JavaScript's (UTF-16 code units).
func validHotel(h hotelResult) bool {
	within := func(s string, lo, hi int) bool { n := utf16Len(s); return n >= lo && n <= hi }
	switch {
	case !within(h.id, 1, 220), !within(h.propertyToken, 0, 220), !within(h.name, 1, 200),
		!within(h.description, 0, 700), !within(h.propertyType, 0, 80):
		return false
	case h.hotelClass != nil && (*h.hotelClass < 1 || *h.hotelClass > 5):
		return false
	case h.overallRating != nil && !(finite(*h.overallRating) && *h.overallRating >= 0 && *h.overallRating <= 5):
		return false
	case h.reviewCount != nil && *h.reviewCount < 0:
		return false
	case len(h.amenities) > maxAmenities, len(h.images) > maxImages:
		return false
	case h.rate != nil && (h.rate.amountCents < 0 || h.rate.currency != "USD"):
		return false
	}
	for _, a := range h.amenities {
		if utf16Len(a) > 80 {
			return false
		}
	}
	for _, img := range h.images {
		if u, err := url.Parse(img); err != nil || u.Scheme == "" {
			return false
		}
	}
	return true
}

// toPublicHotel copies a checked hotel field by name into the public shape, and checks each
// photo's host again: the custom image loader means nothing else stands between a provider
// and a request from the visitor's browser.
func toPublicHotel(h hotelResult, currency string) PublicHotel {
	var photos []string
	for _, u := range h.images {
		if isAllowedImage(u) {
			photos = append(photos, u)
		}
	}
	var nightly *int64
	if h.rate != nil {
		cents := h.rate.amountCents
		nightly = &cents
		currency = h.rate.currency
	}
	return PublicHotel{
		ID:            h.id,
		PropertyToken: h.propertyToken,
		Name:          h.name,
		Description:   h.description,
		PropertyType:  h.propertyType,
		HotelClass:    h.hotelClass,
		Rating:        h.overallRating,
		ReviewCount:   h.reviewCount,
		Amenities:     h.amenities,
		Photos:        photos,
		EcoCertified:  h.ecoCertified,
		NightlyCents:  nightly,
		Currency:      currency,
	}
}
