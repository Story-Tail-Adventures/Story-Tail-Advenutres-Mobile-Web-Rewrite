package public

import (
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// What the three topic pages (2.0.8 Caribbean, 2.0.9 Cruises, 2.0.10 Honeymoons) share. Each
// page's own copy stays in its HTML file; what is filled here is the photography, the counts
// derived from the catalog, and every link, because a link is built from the search and quote
// rules rather than typed.

// tripTileRepeats declares the two repeats a trip grid uses: one of cards, shown from md, and
// one of rows, shown below it. Next renders both from one component and hides one by width.
func tripTileRepeats() map[string][]string {
	return map[string][]string{
		"trips-card": {"card-photo", "card-badge", "card-badge-label", "card-price", "card-overline", "card-name", "card-tagline", "card-quote", "card-save"},
		"trips-row":  {"row-photo", "row-badge", "row-badge-label", "row-price", "row-overline", "row-name", "row-tagline", "row-quote", "row-save"},
	}
}

// bandClass is the modifier that dims the unfilled dollar signs of a price range.
func bandClass(band content.PriceBand) string {
	return "price-band-" + strconv.Itoa(len(band))
}

// bandLabel is PriceRange's accessible name (components/public/PriceRange.tsx LABEL).
func bandLabel(band content.PriceBand) string {
	switch len(band) {
	case 1:
		return "budget-friendly"
	case 2:
		return "mid-range"
	default:
		return "premium"
	}
}

// fillTripTiles fills both repeats of a trip grid. topic applies that page's placement
// overrides (a resort reads differently on Caribbean than on Honeymoons), and next is the
// page to come back to after the sign-up gate.
func fillTripTiles(d *page.Doc, trips []content.Trip, topic content.Topic, next string) {
	for _, r := range []struct{ name, prefix string }{{"trips-card", "card"}, {"trips-row", "row"}} {
		d.Repeat(r.name, len(trips), func(i int, row *page.Row) {
			t := trips[i]
			overline, tagline, badge := t.Overline, t.Tagline, t.Badge
			if p, ok := t.Topics.Placement(topic); ok {
				if p.Overline != nil {
					overline = *p.Overline
				}
				if p.Tagline != nil {
					tagline = *p.Tagline
				}
				if p.Badge != nil {
					badge = p.Badge
				}
			}
			fillPhoto(row, r.prefix+"-photo", t.ImageKey, photoOpts{
				Sizes: photoSizes(r.prefix), Alt: decorative,
			})
			if badge != nil {
				row.Keep(r.prefix + "-badge")
				row.Text(r.prefix+"-badge-label", *badge)
			} else {
				row.Remove(r.prefix + "-badge")
			}
			row.Class(r.prefix+"-price", bandClass(t.Band), true)
			row.Attr(r.prefix+"-price", "aria-label", "Price range: "+bandLabel(t.Band))
			row.Keep(r.prefix + "-price")
			row.Text(r.prefix+"-overline", overline)
			row.Text(r.prefix+"-name", t.Name)
			row.URL(r.prefix+"-name", "href", search.TripHref(t.Slug))
			row.Text(r.prefix+"-tagline", tagline)
			row.URL(r.prefix+"-quote", "href", search.JoinHref(search.JoinLink{
				Intent: "quote", Trip: t.Slug, Next: next,
			}))
			row.URL(r.prefix+"-save", "href", search.JoinHref(search.JoinLink{
				Intent: "save", Trip: t.Slug, Next: next,
			}))
			row.Attr(r.prefix+"-save", "aria-label", "Save "+t.Name+" for later")
		})
	}
}

// photoSizes is the sizes attribute each tile shape asks for, as the Next components did.
func photoSizes(prefix string) string {
	if prefix == "row" {
		return "120px"
	}
	return "(min-width: 1200px) 400px, 50vw"
}

// fillClosingCta fills the full-bleed panel that ends every topic page: its photo, the quote
// link through the gate, and the guest message form.
func fillClosingCta(d *page.Doc, image content.ImageKey, quoteHref, messageHref string) {
	fillPhoto(d, "closing-photo", image, photoOpts{Sizes: "(min-width: 1200px) 1280px, 100vw", Alt: decorative})
	d.URL("closing-primary", "href", quoteHref)
	d.URL("closing-secondary", "href", messageHref)
}

// closingCtaSlots are the slots fillClosingCta fills.
func closingCtaSlots() []string {
	return []string{"closing-photo", "closing-primary", "closing-secondary"}
}

// fillStickyCta fills the mobile bar that stands in for the inquiry bar below md (§4.4).
func fillStickyCta(d *page.Doc, primaryHref, secondaryHref string) {
	d.URL("sticky-primary", "href", primaryHref)
	d.URL("sticky-secondary", "href", secondaryHref)
}

// stickyCtaSlots are the slots fillStickyCta fills.
func stickyCtaSlots() []string {
	return []string{"sticky-primary", "sticky-secondary"}
}

// fillInquiryDates bounds the inquiry bar's two date inputs: no earlier than today, and no
// later than the booking window search.ParseStay accepts, so the picker cannot offer a date
// the search would then drop. Next resolved today on the server too and revalidated hourly to
// keep it current; here every render is current.
func fillInquiryDates(d *page.Doc, today string) {
	latest, ok := search.AddDays(today, search.MaxBookingDaysAhead)
	for _, slot := range inquiryDateSlots() {
		d.Attr(slot, "min", today)
		if ok {
			d.Attr(slot, "max", latest)
		}
	}
}

// inquiryDateSlots are the slots fillInquiryDates fills.
func inquiryDateSlots() []string { return []string{"inquiry-in", "inquiry-out"} }

// topicSlots are the slots every topic page carries. The "see all" button is not one of
// them: Honeymoons ends on the Christian-couples panel and has none.
func topicSlots(extra ...string) []string {
	out := []string{"hero-photo", "trips-overline"}
	out = append(out, closingCtaSlots()...)
	out = append(out, stickyCtaSlots()...)
	out = append(out, inquiryDateSlots()...)
	return append(out, extra...)
}

// plural returns one or other depending on n, for the counted overlines ("9 TRIPS").
func plural(n int, one, other string) string {
	if n == 1 {
		return one
	}
	return other
}
