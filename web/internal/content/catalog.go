package content

import (
	"bytes"
	"cmp"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"slices"
)

// data holds the content files. They were generated once from web/content/public/*.ts and
// web/lib/images.ts; from here on they are edited by hand and are the source of truth.
//
//go:embed data/*.json
var data embed.FS

// catalog is decoded once, when the package loads. A file that does not decode or does not
// validate panics there, so a broken content file stops the server from starting and fails
// every test that touches this package.
var catalog = mustLoad(data)

// Get returns the one decoded catalog. It is shared by every request: read it, never write
// to it or to anything it hands back.
func Get() *Catalog { return catalog }

// Catalog is all the public content, in the order the source files list it.
type Catalog struct {
	Trips         []Trip
	Islands       []Island
	CruiseLines   []CruiseLine
	Inspiration   []InspirationTile
	HowItWorksFAQ []FaqItem
	GyasiFAQ      []FaqItem
	// Legal is the four footer pages in footer order (privacy, terms, cookies, accessibility).
	Legal []LegalDoc
	// Claims is the marketing claims registry, in registry order.
	Claims       []Claim
	TripReviews  []TripReview
	Testimonials []Testimonial
	Advisor      Advisor
	// Images is the photography registry, in registry order.
	Images           []Image
	Contact          Contact
	AnalyticsConsent AnalyticsConsent
	// PlaceholderBanner is the line every public page shows while anything is a placeholder.
	PlaceholderBanner string

	tripIdx   map[string]int
	imageIdx  map[ImageKey]int
	claimIdx  map[string]int
	reviewIdx map[string]int
	legalIdx  map[LegalSlug]int
}

// proofFile is data/proof.json: everything web/content/public/proof.ts held as data.
type proofFile struct {
	Claims            []Claim       `json:"claims"`
	TripReviews       []TripReview  `json:"tripReviews"`
	Testimonials      []Testimonial `json:"testimonials"`
	Advisor           Advisor       `json:"advisor"`
	PlaceholderBanner string        `json:"placeholderBanner"`
}

func mustLoad(fsys fs.FS) *Catalog {
	c, err := load(fsys)
	if err != nil {
		panic("content: " + err.Error())
	}
	return c
}

// load decodes every file under data/ and validates the result.
func load(fsys fs.FS) (*Catalog, error) {
	var (
		c     Catalog
		proof proofFile
	)
	// Every file is decoded even after one fails, so the error names all the broken ones.
	err := errors.Join(
		decodeFile(fsys, "trips.json", &c.Trips),
		decodeFile(fsys, "islands.json", &c.Islands),
		decodeFile(fsys, "cruise-lines.json", &c.CruiseLines),
		decodeFile(fsys, "inspiration.json", &c.Inspiration),
		decodeFile(fsys, "faq-how-it-works.json", &c.HowItWorksFAQ),
		decodeFile(fsys, "faq-gyasi.json", &c.GyasiFAQ),
		decodeFile(fsys, "legal.json", &c.Legal),
		decodeFile(fsys, "proof.json", &proof),
		decodeFile(fsys, "images.json", &c.Images),
		decodeFile(fsys, "contact.json", &c.Contact),
		decodeFile(fsys, "analytics-consent.json", &c.AnalyticsConsent),
	)
	if err != nil {
		return nil, err
	}
	c.Claims = proof.Claims
	c.TripReviews = proof.TripReviews
	c.Testimonials = proof.Testimonials
	c.Advisor = proof.Advisor
	c.PlaceholderBanner = proof.PlaceholderBanner

	if err := c.index(); err != nil {
		return nil, err
	}
	if err := c.validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

// decodeFile decodes data/<name> into dst, a pointer to a typed value. A field the struct
// does not declare, or anything after the value, is an error: a typo in a key must not
// quietly drop a field.
func decodeFile[T any](fsys fs.FS, name string, dst *T) error {
	b, err := fs.ReadFile(fsys, "data/"+name)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return fmt.Errorf("%s: unexpected data after the value", name)
	}
	return nil
}

// index builds the lookups. A key listed twice is an error, since a lookup would silently
// pick one of them.
func (c *Catalog) index() error {
	var err error
	if c.tripIdx, err = indexBy(c.Trips, "trip", func(t Trip) string { return t.Slug }); err != nil {
		return err
	}
	if c.imageIdx, err = indexBy(c.Images, "image", func(i Image) ImageKey { return i.Key }); err != nil {
		return err
	}
	if c.claimIdx, err = indexBy(c.Claims, "claim", func(cl Claim) string { return cl.ID }); err != nil {
		return err
	}
	if c.reviewIdx, err = indexBy(c.TripReviews, "trip review", func(r TripReview) string { return r.Slug }); err != nil {
		return err
	}
	if c.legalIdx, err = indexBy(c.Legal, "legal page", func(d LegalDoc) LegalSlug { return d.Slug }); err != nil {
		return err
	}
	return nil
}

func indexBy[T any, K ~string](items []T, what string, key func(T) K) (map[K]int, error) {
	idx := make(map[K]int, len(items))
	for i, it := range items {
		k := key(it)
		if k == "" {
			return nil, fmt.Errorf("%s %d has no key", what, i)
		}
		if _, dup := idx[k]; dup {
			return nil, fmt.Errorf("%s %q is listed twice", what, k)
		}
		idx[k] = i
	}
	return idx, nil
}

// Trip finds a trip by its slug.
func (c *Catalog) Trip(slug string) (Trip, bool) {
	i, ok := c.tripIdx[slug]
	if !ok {
		return Trip{}, false
	}
	return c.Trips[i], true
}

// TripsFor is the trips featured on a topic page, in the designer's tile order.
func (c *Catalog) TripsFor(topic Topic) []Trip {
	var out []Trip
	for _, t := range c.Trips {
		if _, ok := t.Topics.Placement(topic); ok {
			out = append(out, t)
		}
	}
	slices.SortStableFunc(out, func(a, b Trip) int {
		pa, _ := a.Topics.Placement(topic)
		pb, _ := b.Topics.Placement(topic)
		return cmp.Compare(pa.Order, pb.Order)
	})
	return out
}

// Image finds a photo by its registry key.
func (c *Catalog) Image(key ImageKey) (Image, bool) {
	i, ok := c.imageIdx[key]
	if !ok {
		return Image{}, false
	}
	return c.Images[i], true
}

// IsImageKey reports whether value names a photo in the registry.
func (c *Catalog) IsImageKey(value string) bool {
	_, ok := c.imageIdx[ImageKey(value)]
	return ok
}

// UnlicensedImages is the registry keys whose photo is not yet licensed for production.
func (c *Catalog) UnlicensedImages() []ImageKey {
	var out []ImageKey
	for _, img := range c.Images {
		if !img.Licensed {
			out = append(out, img.Key)
		}
	}
	return out
}

// LegalDoc finds a footer legal page by its slug.
func (c *Catalog) LegalDoc(slug LegalSlug) (LegalDoc, bool) {
	i, ok := c.legalIdx[slug]
	if !ok {
		return LegalDoc{}, false
	}
	return c.Legal[i], true
}

// LegalSlugs is the four legal page slugs in footer order.
func (c *Catalog) LegalSlugs() []LegalSlug {
	out := make([]LegalSlug, len(c.Legal))
	for i, d := range c.Legal {
		out[i] = d.Slug
	}
	return out
}

// DraftLegalDocs is the legal pages counsel has not reviewed yet, in footer order.
func (c *Catalog) DraftLegalDocs() []LegalDoc {
	var out []LegalDoc
	for _, d := range c.Legal {
		if d.Status != "reviewed" {
			out = append(out, d)
		}
	}
	return out
}
