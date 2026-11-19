package search

import (
	"math"
	"slices"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Link builders for the public surface, so pages never hand-roll query strings and the
// sign-up gate can change its parameter names in one place. Ports web/lib/public/links.ts.

// JoinIntent is why a visitor is being asked to sign up.
type JoinIntent string

// The intents the sign-up gate knows.
const (
	IntentQuote   JoinIntent = "quote"
	IntentSave    JoinIntent = "save"
	IntentMessage JoinIntent = "message"
	IntentTour    JoinIntent = "tour"
)

// JoinIntents is every intent.
var JoinIntents = []JoinIntent{IntentQuote, IntentSave, IntentMessage, IntentTour}

// IsJoinIntent reports whether value is one of JoinIntents.
func IsJoinIntent(value string) bool {
	return slices.Contains(JoinIntents, JoinIntent(value))
}

// JoinLink is what a sign-up gate link carries. Empty fields are left out.
type JoinLink struct {
	Intent JoinIntent
	// Trip is the catalog slug the visitor was looking at; /join resolves it.
	Trip string
	// Next is the same-origin path to return to after sign-up.
	Next string
}

// JoinHref is /join?intent=quote&trip=<slug>&next=/explore/<slug> (Screen Inventory 2.0.6).
// A next that is not a same-origin path is dropped rather than carried as an open redirect.
func JoinHref(l JoinLink) string {
	var p params
	if l.Intent != "" {
		p.set("intent", string(l.Intent))
	}
	if l.Trip != "" {
		p.set("trip", l.Trip)
	}
	if l.Next != "" {
		if safe := safeNext(l.Next, ""); safe != "" {
			p.set("next", safe)
		}
	}
	if qs := p.String(); qs != "" {
		return "/join?" + qs
	}
	return "/join"
}

// LoginHref is /login?next=… with the same open-redirect guard.
func LoginHref(next string) string {
	if next == "" {
		return "/login"
	}
	if safe := safeNext(next, ""); safe != "" {
		return "/login?next=" + encodeURIComponent(safe)
	}
	return "/login"
}

// TripHref is a curated trip's detail page.
func TripHref(slug string) string {
	return "/explore/" + encodeURIComponent(slug)
}

// QuoteKind is a component_kind, not a UI category. The curated catalog's four trip types
// map onto three of these (QuoteKindFor), because "what kind of thing is this" and "what
// kind of trip does it become" are different questions and the schema asks both.
type QuoteKind string

// The kinds a quote can be about.
const (
	KindHotel     QuoteKind = "hotel"
	KindCruise    QuoteKind = "cruise"
	KindExcursion QuoteKind = "excursion"
	KindCustom    QuoteKind = "custom"
)

// QuoteTripType is the trip_type a quote request becomes.
type QuoteTripType string

// The trip types a quote request can become.
const (
	TripTypeCruise           QuoteTripType = "cruise"
	TripTypeAllInclusive     QuoteTripType = "all_inclusive"
	TripTypeMultiDestination QuoteTripType = "multi_destination"
	TripTypeGroup            QuoteTripType = "group"
	TripTypeCustom           QuoteTripType = "custom"
)

// QuoteSource is where the thing being quoted came from. The function allow-lists it;
// anything else is recorded as curated.
type QuoteSource string

// The sources.
const (
	SourceCurated     QuoteSource = "curated"
	SourceGoogleHotel QuoteSource = "serpapi_google_hotels"
	SourceTrackCruise QuoteSource = "track_cruises"
)

// QuoteTarget is what a visitor was looking at when they asked for a quote. Zero fields are
// left out of the link.
//
// A curated trip is a slug, and the catalog resolves it. A hotel is not: hotels are never
// stored, so there is no row to point at and the identifying fields travel instead. Kept
// small (no photo, no description) because the whole thing is encoded a second time when it
// rides through the sign-up gate as next=.
type QuoteTarget struct {
	Kind QuoteKind
	// TripType is the trip this becomes; empty lets the function default it from Kind.
	TripType QuoteTripType
	Source   QuoteSource
	// Slug is the curated catalog slug.
	Slug      string
	Name      string
	Place     string
	CheckIn   string
	CheckOut  string
	Travelers int
	// Ref is the provider's opaque property token, so the inquiry names which hotel.
	Ref string
	// RateCents is an indicative nightly rate in integer cents. Never a quote.
	RateCents    int64
	HotelClass   int
	Rating       float64
	PropertyType string
	// Vibe is what the visitor typed in a topic page's Vibe cell, as the bare value. It is
	// not part of what is quoted: the quote form wraps it in its own wording to seed the
	// note, which the visitor sees and edits. Only the bare value travels, so a link can
	// fill in that one short blank and nothing else.
	Vibe string
}

// QuoteHref is /trips/new?…, Screen 2.3.8, the quote request form. It needs a signed-in
// client; RequestQuoteHref is the link a page should use.
func QuoteHref(t QuoteTarget) string {
	var p params
	p.set("kind", string(t.Kind))
	if t.TripType != "" {
		p.set("tripType", string(t.TripType))
	}
	if t.Source != "" {
		p.set("source", string(t.Source))
	}
	if t.Slug != "" {
		p.set("trip", t.Slug)
	}
	if t.Name != "" {
		p.set("name", t.Name)
	}
	if t.Place != "" {
		p.set("place", t.Place)
	}
	if t.CheckIn != "" && t.CheckOut != "" {
		p.set("in", t.CheckIn)
		p.set("out", t.CheckOut)
	}
	if t.Travelers != 0 {
		p.set("adults", strconv.Itoa(t.Travelers))
	}
	if t.Ref != "" {
		p.set("ref", t.Ref)
	}
	if t.RateCents != 0 {
		p.set("rate", strconv.FormatInt(t.RateCents, 10))
	}
	if t.HotelClass != 0 {
		p.set("class", strconv.Itoa(t.HotelClass))
	}
	if t.Rating != 0 && !math.IsNaN(t.Rating) {
		p.set("rating", numberString(t.Rating))
	}
	if t.PropertyType != "" {
		p.set("type", t.PropertyType)
	}
	if t.Vibe != "" {
		p.set("vibe", t.Vibe)
	}
	return "/trips/new?" + p.String()
}

// QuoteKindFor is the component kind and trip type a curated trip type becomes, as a
// target with only Kind and TripType set, for the caller to fill in.
//
// An all-inclusive week and a boutique hotel are both hotel components; only one is an
// all_inclusive trip. A tour is an excursion. Keeping the mapping here means every card
// agrees, and a new catalog type is one edit. An unknown type sets nothing.
func QuoteKindFor(t content.TripType) QuoteTarget {
	switch t {
	case TypeCruise:
		return QuoteTarget{Kind: KindCruise, TripType: TripTypeCruise}
	case TypeAllInclusive:
		return QuoteTarget{Kind: KindHotel, TripType: TripTypeAllInclusive}
	case TypeHotel:
		return QuoteTarget{Kind: KindHotel, TripType: TripTypeCustom}
	case TypeTour:
		return QuoteTarget{Kind: KindExcursion, TripType: TripTypeCustom}
	}
	return QuoteTarget{}
}

// RequestQuoteHref is the one link every "Request a quote" button uses.
//
// It always points at the GATE, never at the quote form, on purpose: a public page reads no
// session, so it cannot know whether the visitor is signed in. The gate does: a signed-in
// visitor is forwarded from /join straight to next, and an anonymous one registers and
// lands there afterwards. Both end at the same URL, built once, here.
func RequestQuoteHref(t QuoteTarget) string {
	return JoinHref(JoinLink{Intent: IntentQuote, Trip: t.Slug, Next: QuoteHref(t)})
}
