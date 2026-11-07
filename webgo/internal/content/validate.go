package content

import (
	"errors"
	"fmt"
)

// The closed sets the TypeScript types enforced at compile time (web/content/public/types.ts).
// validate checks them when the package loads instead, so a typo fails the boot.
var (
	knownTopics       = set(Caribbean, Cruises, Honeymoons)
	knownTripTypes    = set[TripType]("all-inclusive", "cruise", "hotel", "tour")
	knownVibes        = set[Vibe]("adults-only", "family", "honeymoon", "five-star", "couples", "group", "boutique", "adventure")
	knownBands        = set[PriceBand]("$", "$$", "$$$")
	knownIslands      = set[IslandSlug]("turks-and-caicos", "bahamas", "st-lucia", "jamaica", "aruba", "bvi")
	knownLegalSlugs   = set[LegalSlug]("privacy", "terms", "cookies", "accessibility")
	knownBadges       = set("Gyasi's pick", "Great for groups", "Off-the-beaten")
	knownPriceSources = set("design", "illustrative")
	knownLegalStatus  = set("draft", "reviewed")
)

// claimsInCode are the claims the code builds sentences from (TrustLine, AdvisorHeroLine).
var claimsInCode = []string{"ratingValue", "reviewCount", "bioParent"}

func set[T comparable](values ...T) map[T]bool {
	m := make(map[T]bool, len(values))
	for _, v := range values {
		m[v] = true
	}
	return m
}

// validate checks every closed value and every cross-reference, and returns all the
// problems at once.
func (c *Catalog) validate() error {
	var errs []error
	bad := func(format string, args ...any) {
		errs = append(errs, fmt.Errorf(format, args...))
	}
	image := func(where string, key ImageKey) {
		if _, ok := c.imageIdx[key]; !ok {
			bad("%s: image %q is not in the registry", where, key)
		}
	}

	for _, t := range c.Trips {
		where := "trip " + t.Slug
		if !knownTripTypes[t.Type] {
			bad("%s: unknown type %q", where, t.Type)
		}
		for _, v := range t.Vibes {
			if !knownVibes[v] {
				bad("%s: unknown vibe %q", where, v)
			}
		}
		for _, e := range t.Topics {
			if !knownTopics[e.Topic] {
				bad("%s: unknown topic %q", where, e.Topic)
			}
			if e.Placement.Order < 1 {
				bad("%s: %s order must be 1 or more", where, e.Topic)
			}
			if b := e.Placement.Badge; b != nil && !knownBadges[*b] {
				bad("%s: %s has unknown badge %q", where, e.Topic, *b)
			}
		}
		if i := t.Destination.Island; i != nil && !knownIslands[*i] {
			bad("%s: unknown island %q", where, *i)
		}
		if !knownBands[t.Band] {
			bad("%s: unknown price band %q", where, t.Band)
		}
		if t.From.Currency != "USD" {
			bad("%s: currency %q, want USD", where, t.From.Currency)
		}
		if !knownPriceSources[t.PriceSource] {
			bad("%s: unknown price source %q", where, t.PriceSource)
		}
		if t.Badge != nil && !knownBadges[*t.Badge] {
			bad("%s: unknown badge %q", where, *t.Badge)
		}
		image(where, t.ImageKey)
		if t.HeroImageKey != nil {
			image(where, *t.HeroImageKey)
		}
	}

	for _, i := range c.Islands {
		if !knownIslands[i.Slug] {
			bad("island %q is not one of the six", i.Slug)
		}
		image("island "+string(i.Slug), i.ImageKey)
	}

	for _, tile := range c.Inspiration {
		where := "inspiration " + tile.Slug
		image(where, tile.ImageKey)
		q := tile.Query
		if q.Topic != nil && !knownTopics[*q.Topic] {
			bad("%s: unknown topic %q", where, *q.Topic)
		}
		if q.Type != nil && !knownTripTypes[*q.Type] {
			bad("%s: unknown type %q", where, *q.Type)
		}
		if q.Vibe != nil && !knownVibes[*q.Vibe] {
			bad("%s: unknown vibe %q", where, *q.Vibe)
		}
	}

	for _, d := range c.Legal {
		if !knownLegalSlugs[d.Slug] {
			bad("legal page %q is not one of the four", d.Slug)
		}
		if !knownLegalStatus[d.Status] {
			bad("legal page %s: unknown status %q", d.Slug, d.Status)
		}
	}

	for _, id := range claimsInCode {
		if _, ok := c.claimIdx[id]; !ok {
			bad("claim %q is missing; the code builds a sentence from it", id)
		}
	}

	return errors.Join(errs...)
}
