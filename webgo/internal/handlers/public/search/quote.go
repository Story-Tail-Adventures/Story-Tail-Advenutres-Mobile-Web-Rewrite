package search

import (
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// The topic-page quote hand-off (/quote). Ports web/app/quote/href.ts, content.ts and the
// logic of route.ts. P2.

// QuotePath is where a topic page's inquiry bar submits when its button asks for a quote.
const QuotePath = "/quote"

// TopicQuoteNames name each topic's quote request. None is shown on /quote, which only
// redirects: each travels on to the quote form (Screen 2.3.8), where it is the h2 on the
// summary card and the trip's working title on Gyasi's worklist ("Caribbean week · Aruba"
// once a destination is added).
var TopicQuoteNames = map[content.Topic]string{
	content.Caribbean:  "Caribbean week",
	content.Cruises:    "Cruise",
	content.Honeymoons: "Honeymoon",
}

// topicTarget is what a topic page's quote request is about. A cruise is a cruise (the
// mapping a cruise trip tile uses); Caribbean and honeymoon requests are custom trips Gyasi
// shapes.
func topicTarget(topic content.Topic) QuoteTarget {
	t := QuoteTarget{Kind: KindCustom, TripType: TripTypeCustom}
	if topic == content.Cruises {
		t = QuoteKindFor(TypeCruise)
	}
	t.Name = TopicQuoteNames[topic]
	return t
}

// TopicQuoteLink is the link every other "Request a quote" button on a topic page uses
// (closing band, sticky bar, the honeymoon card): the topic and nothing else, straight
// through the gate to the quote form.
func TopicQuoteLink(topic content.Topic) string {
	return RequestQuoteHref(topicTarget(topic))
}

// TopicQuoteHref turns a topic bar's submission into the quote request link, or false when
// it names no topic. today is as ParseSearchParams takes it; empty means today in
// SearchTimeZone.
//
// The bar is a plain GET form, so everything here is a URL a visitor could have typed. It
// goes through the same ParseSearchParams the results page uses: topic is allow-listed,
// dest is trimmed and capped, the dates go through ParseStay, and travelers are clamped to
// 1 to 20. A field that fails is dropped rather than refused, so a bad date still reaches
// Gyasi as "flexible" instead of losing the whole request.
//
// The vibe travels as the bare value (CleanText, at most 60 code units); the quote form
// writes the note's wording around it. The result always goes through the gate.
func TopicQuoteHref(submitted url.Values, today string) (string, bool) {
	q := ParseSearchParams(submitted, today)
	if q.Topic == "" {
		return "", false
	}
	t := topicTarget(q.Topic)
	t.Place = q.Dest
	t.CheckIn = q.CheckIn
	t.CheckOut = q.CheckOut
	t.Travelers = q.Travelers
	t.Vibe = CleanText(submitted.Get("vibe"))
	return RequestQuoteHref(t), true
}

// QuoteRedirect is the Location GET /quote answers with (303 See Other): the quote request
// link built from the topic bar's submission, or /explore for a submission that names no
// topic. It is always a relative path: an absolute URL built from the request would carry
// whatever host the request arrived with, behind a proxy an internal one. Nothing is
// stored and nothing is called.
func QuoteRedirect(query url.Values, today string) string {
	if href, ok := TopicQuoteHref(query, today); ok {
		return href
	}
	return "/explore"
}
