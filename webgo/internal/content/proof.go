package content

import (
	"errors"
	"fmt"
	"strings"
)

// The claims registry and the production gate, ported from web/content/public/proof.ts.
//
// Every statement about Gyasi's business that a visitor could take as fact is a Claim with a
// verified flag. While any claim, rating, testimonial, photo, legal page or price is still a
// placeholder, every public page shows PlaceholderBanner, and AssertProductionReady refuses
// the strict (production) mode.

// Claim is a claim's display text. An unknown id is a programming error, so it panics; use
// ClaimEntry to look one up that may not exist.
func (c *Catalog) Claim(id string) string {
	cl, ok := c.ClaimEntry(id)
	if !ok {
		panic(fmt.Sprintf("content: unknown claim %q", id))
	}
	return cl.Display
}

// ClaimEntry finds a claim by its registry id.
func (c *Catalog) ClaimEntry(id string) (Claim, bool) {
	i, ok := c.claimIdx[id]
	if !ok {
		return Claim{}, false
	}
	return c.Claims[i], true
}

// TrustLine is the 2.0.3 trust row: "Hosted by Inteletravel · CLIA member · 4.9★ from 138
// travelers", with the figures from the claims registry.
func (c *Catalog) TrustLine() string {
	return "Hosted by Inteletravel · CLIA member · " + c.Claim("ratingValue") + "★ from " +
		c.Claim("reviewCount") + " travelers"
}

// AdvisorHeroLine is the 2.0.11 hero line. The parent detail is an unverified claim; the
// rest is the prototype's copy.
func (c *Catalog) AdvisorHeroLine() string {
	return "Caribbean specialist, " + c.Claim("bioParent") + ", Sandals-certified, hosted by " +
		"Inteletravel. I plan the kind of week that turns into a story your family tells for " +
		"years \u2014 and I don't disappear after the deposit clears."
}

// TripReview finds the third-party rating shown for a trip.
func (c *Catalog) TripReview(slug string) (TripReview, bool) {
	i, ok := c.reviewIdx[slug]
	if !ok {
		return TripReview{}, false
	}
	return c.TripReviews[i], true
}

// TripRating is a trip's star rating, and false when it has none.
func (c *Catalog) TripRating(slug string) (float64, bool) {
	r, ok := c.TripReview(slug)
	return r.Rating, ok
}

// PlaceholderReport lists everything on the public pages that is still a placeholder.
type PlaceholderReport struct {
	// Claims is the ids of unverified claims, in registry order.
	Claims []string
	// Reviews is the trip slugs whose rating is unverified.
	Reviews []string
	// Testimonials counts the testimonials without written consent.
	Testimonials     int
	UnlicensedImages []ImageKey
	DraftLegal       []LegalSlug
	// PlaceholderPrices is the slugs of trips whose price no supplier quote backs yet.
	PlaceholderPrices []string
}

// PlaceholderReport builds the report from the catalog.
func (c *Catalog) PlaceholderReport() PlaceholderReport {
	var r PlaceholderReport
	for _, cl := range c.Claims {
		if !cl.Verified {
			r.Claims = append(r.Claims, cl.ID)
		}
	}
	for _, rv := range c.TripReviews {
		if !rv.Verified {
			r.Reviews = append(r.Reviews, rv.Slug)
		}
	}
	for _, t := range c.Testimonials {
		if !t.Consented {
			r.Testimonials++
		}
	}
	r.UnlicensedImages = c.UnlicensedImages()
	for _, d := range c.DraftLegalDocs() {
		r.DraftLegal = append(r.DraftLegal, d.Slug)
	}
	for _, t := range c.Trips {
		if t.PricePlaceholder {
			r.PlaceholderPrices = append(r.PlaceholderPrices, t.Slug)
		}
	}
	return r
}

// HasPlaceholders reports whether anything in the report is still a placeholder, which is
// when the public pages show PlaceholderBanner.
func HasPlaceholders(r PlaceholderReport) bool {
	return len(r.Claims) > 0 ||
		len(r.Reviews) > 0 ||
		r.Testimonials > 0 ||
		len(r.UnlicensedImages) > 0 ||
		len(r.DraftLegal) > 0 ||
		len(r.PlaceholderPrices) > 0
}

// AssertProductionReady is the production gate. The caller passes PUBLIC_CLAIMS_MODE; in
// "strict" mode, set only for production, any placeholder is an error that lists them all.
// Any other mode passes.
func (c *Catalog) AssertProductionReady(mode string) error {
	return assertReady(mode, c.PlaceholderReport())
}

func assertReady(mode string, r PlaceholderReport) error {
	if mode != "strict" || !HasPlaceholders(r) {
		return nil
	}
	lines := []string{"PUBLIC_CLAIMS_MODE=strict: the public pages still contain placeholder content."}
	add := func(ok bool, line string) {
		if ok {
			lines = append(lines, line)
		}
	}
	add(len(r.Claims) > 0, "  unverified claims: "+strings.Join(r.Claims, ", "))
	add(len(r.Reviews) > 0, "  unverified ratings: "+strings.Join(r.Reviews, ", "))
	add(r.Testimonials > 0, fmt.Sprintf("  testimonials without consent: %d", r.Testimonials))
	add(len(r.UnlicensedImages) > 0, "  unlicensed images: "+joinKeys(r.UnlicensedImages))
	add(len(r.DraftLegal) > 0, "  draft legal pages: "+joinKeys(r.DraftLegal))
	add(len(r.PlaceholderPrices) > 0, fmt.Sprintf("  placeholder prices: %d trips", len(r.PlaceholderPrices)))
	lines = append(lines, "See web/content/public/proof.ts.")
	return errors.New(strings.Join(lines, "\n"))
}

func joinKeys[K ~string](keys []K) string {
	s := make([]string, len(keys))
	for i, k := range keys {
		s[i] = string(k)
	}
	return strings.Join(s, ", ")
}
