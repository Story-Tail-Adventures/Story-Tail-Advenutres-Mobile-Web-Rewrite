// Package content is the public surface's editorial content (Screen Inventory §2.0): the
// curated trip catalog, islands, cruise lines, inspiration tiles, the two FAQs, the four
// legal documents, the marketing claims registry, testimonials and the photography
// registry. docs/GO-MIGRATION.md §4.11.
//
// It is JSON under data/, embedded at build time and decoded once into the typed structs
// below. It replaces web/content/public/*.ts and web/lib/images.ts as the one source of
// truth: the public pages read it, and cmd/gen-kotlin writes the mobile app's
// GeneratedPublicContent.kt from it, byte for byte what the TypeScript exporter wrote.
//
// Money is integer cents plus a currency code (CLAUDE.md rule 5). Optional fields are
// pointers, so "absent" (Kotlin null) and "empty string" stay different things.
package content

// Topic is a topic landing page (2.0.8 to 2.0.10).
type Topic string

// The topics, in nav order.
const (
	Caribbean  Topic = "caribbean"
	Cruises    Topic = "cruises"
	Honeymoons Topic = "honeymoons"
)

// TripType is the filter rail's "Trip type" (2.0.4).
type TripType string

// Vibe is the filter rail's "Vibe" (2.0.4).
type Vibe string

// PriceBand is Gyasi's rough "$" / "$$" / "$$$" chip on tiles: categorical, not a price.
type PriceBand string

// ImageKey names a photo in the registry (Images).
type ImageKey string

// IslandSlug names one of the six Caribbean island tiles.
type IslandSlug string

// LegalSlug names one of the four footer legal pages (2.0.7).
type LegalSlug string

// Money is integer cents plus an ISO currency code.
type Money struct {
	AmountCents int64  `json:"amountCents"`
	Currency    string `json:"currency"`
}

// Island is one tile on 2.0.8 Caribbean.
type Island struct {
	Slug     IslandSlug `json:"slug"`
	Name     string     `json:"name"`
	ImageKey ImageKey   `json:"imageKey"`
}

// CruiseLine is one name in "LINES WE BOOK" on 2.0.9 Cruises.
type CruiseLine struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// TripHighlight is one of a trip's four highlight rows on 2.0.5. Icon names the sprite symbol.
type TripHighlight struct {
	Icon string `json:"icon"`
	Text string `json:"text"`
}

// TopicPlacement is how a trip appears on one topic page. The prototype gives the same
// resort a different tagline or overline per topic, so a placement may override them.
type TopicPlacement struct {
	// Order is the 1-based position in that page's tile grid.
	Order    int     `json:"order"`
	Overline *string `json:"overline,omitempty"`
	Tagline  *string `json:"tagline,omitempty"`
	Badge    *string `json:"badge,omitempty"`
}

// TopicEntry is one topic a trip is placed on, with its placement.
type TopicEntry struct {
	Topic     Topic
	Placement TopicPlacement
}

// Topics is a trip's placements in the order the source lists them. It is a JSON object
// keyed by topic; the order survives decoding (see topics.go), because the Kotlin output
// lists them in that order.
type Topics []TopicEntry

// Destination is where a trip goes.
type Destination struct {
	// Place is the human place name ("Nassau, Bahamas").
	Place string `json:"place"`
	// Region is the broad region search matches on ("Caribbean", "Bahamas", "Mexico").
	Region string      `json:"region"`
	Island *IslandSlug `json:"island,omitempty"`
}

// Trip is one curated catalog entry: a tile, a search result and a detail page (2.0.5).
type Trip struct {
	// Slug is the /explore/{slug} segment: lowercase, hyphenated, unique.
	Slug string `json:"slug"`
	Name string `json:"name"`
	// Tagline is the one-line subtitle under the name.
	Tagline string `json:"tagline"`
	// Overline is the uppercase line on tiles ("ALL-INCLUSIVE · FAMILY").
	Overline    string      `json:"overline"`
	Type        TripType    `json:"type"`
	Vibes       []Vibe      `json:"vibes"`
	Topics      Topics      `json:"topics"`
	Destination Destination `json:"destination"`
	Nights      *int        `json:"nights,omitempty"`
	Band        PriceBand   `json:"band"`
	// From is the illustrative "from" price per person.
	From Money `json:"from"`
	// PriceAsOf is when the illustrative price was last checked (ISO date).
	PriceAsOf string `json:"priceAsOf"`
	// PricePlaceholder is true until a supplier quote backs the number.
	PricePlaceholder bool      `json:"pricePlaceholder"`
	PriceSource      string    `json:"priceSource"` // "design" or "illustrative"
	PriceNote        string    `json:"priceNote"`
	Badge            *string   `json:"badge,omitempty"`
	ImageKey         ImageKey  `json:"imageKey"`
	HeroImageKey     *ImageKey `json:"heroImageKey,omitempty"`
	// Description, Highlights and SampleItinerary are the detail page's copy.
	Description     string          `json:"description"`
	Highlights      []TripHighlight `json:"highlights"`
	SampleItinerary []string        `json:"sampleItinerary"`
	// Line is the cruise line, for sailings.
	Line *string `json:"line,omitempty"`
}

// InspirationQuery is the search a 2.0.3 inspiration tile pre-fills on /explore/results.
type InspirationQuery struct {
	Topic *Topic    `json:"topic,omitempty"`
	Type  *TripType `json:"type,omitempty"`
	Vibe  *Vibe     `json:"vibe,omitempty"`
	Dest  *string   `json:"dest,omitempty"`
}

// InspirationTile is one "Inspiration · curated" tile on 2.0.3.
type InspirationTile struct {
	Slug     string           `json:"slug"`
	Title    string           `json:"title"`
	ImageKey ImageKey         `json:"imageKey"`
	Query    InspirationQuery `json:"query"`
}

// FaqItem is one question and answer.
type FaqItem struct {
	Q string `json:"q"`
	A string `json:"a"`
}

// LegalSection is one headed section of a legal page.
type LegalSection struct {
	Heading    string   `json:"heading"`
	Paragraphs []string `json:"paragraphs"`
	Bullets    []string `json:"bullets,omitempty"`
}

// LegalDoc is one footer legal page (2.0.7).
type LegalDoc struct {
	Slug  LegalSlug `json:"slug"`
	Title string    `json:"title"`
	// NavLabel is the short label for the sidebar and the chip strip.
	NavLabel    string `json:"navLabel"`
	Description string `json:"description"`
	// LastUpdated is the ISO date of the last edit to the text.
	LastUpdated string         `json:"lastUpdated"`
	Status      string         `json:"status"` // "draft" or "reviewed"
	ReviewedBy  *string        `json:"reviewedBy,omitempty"`
	Sections    []LegalSection `json:"sections"`
}

// Claim is a marketing statement about Gyasi's business that must be verified before
// production. ID is its registry key ("travelersServed").
type Claim struct {
	ID      string  `json:"id"`
	Display string  `json:"display"`
	Detail  *string `json:"detail,omitempty"`
	// Verified, Source and VerifiedOn record who checked the figure, and where it came from.
	Verified   bool    `json:"verified"`
	Source     *string `json:"source,omitempty"`
	VerifiedOn *string `json:"verifiedOn,omitempty"`
}

// TripReview is a third-party rating the prototype shows on result cards and the detail
// hero. Rating is a star figure (4.9), not money. Slug is the trip it belongs to. It is a
// claim with a rating, so it carries the same optional detail and verification fields.
type TripReview struct {
	Slug       string  `json:"slug"`
	Display    string  `json:"display"`
	Detail     *string `json:"detail,omitempty"`
	Rating     float64 `json:"rating"`
	Count      int     `json:"count"`
	Verified   bool    `json:"verified"`
	Source     *string `json:"source,omitempty"`
	VerifiedOn *string `json:"verifiedOn,omitempty"`
}

// Testimonial is a traveler's quote. Consented is written consent to publish it under
// this name; nothing ships without it (16 CFR Part 465).
type Testimonial struct {
	Quote string `json:"quote"`
	Who   string `json:"who"`
	// Trip is "Symphony · Dec 2024".
	Trip string `json:"trip"`
	// Initials are rendered in the avatar circle.
	Initials  string `json:"initials"`
	Consented bool   `json:"consented"`
}

// Advisor is the person behind the business, for About Gyasi (2.0.11) and the advisor cards.
// HeroLine is built from a claim (Catalog.AdvisorHeroLine), never stored.
type Advisor struct {
	Name      string `json:"name"`
	FirstName string `json:"firstName"`
	Pronouns  string `json:"pronouns"`
	Initials  string `json:"initials"`
	Title     string `json:"title"`
	ShortBio  string `json:"shortBio"`
}

// Image is one photo in the registry. Src is an Unsplash photo id today. Alt never claims
// more than is known about the photo (see the note in data/images.json's source,
// web/lib/images.ts). Licensed is false for every placeholder photo.
type Image struct {
	Key      ImageKey `json:"key"`
	Src      string   `json:"src"`
	Alt      string   `json:"alt"`
	Licensed bool     `json:"licensed"`
}

// Link is an outward or footer link.
type Link struct {
	Href  string `json:"href"`
	Label string `json:"label"`
}

// Contact is content/public/contact.ts: where the public surface links out to.
type Contact struct {
	MarketingSiteURL   string `json:"marketingSiteUrl"`
	MarketingSiteLabel string `json:"marketingSiteLabel"`
	FooterLegalLinks   []Link `json:"footerLegalLinks"`
	PublicNavLinks     []Link `json:"publicNavLinks"`
}

// AnalyticsConsent is the Google Analytics consent banner's copy, and the matching switch
// on 2.5.9. Every sentence is a privacy claim bound to the analytics module's behaviour.
type AnalyticsConsent struct {
	BannerLabel string `json:"bannerLabel"`
	BannerBody  string `json:"bannerBody"`
	Allow       string `json:"allow"`
	Decline     string `json:"decline"`
	CookiesLink string `json:"cookiesLink"`
	SwitchLabel string `json:"switchLabel"`
	SwitchSub   string `json:"switchSub"`
}
