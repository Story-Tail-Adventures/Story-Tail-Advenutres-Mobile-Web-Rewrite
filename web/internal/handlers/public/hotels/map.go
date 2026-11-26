package hotels

// Provider reply to the hotels we publish: the port of web/lib/hotels/map.ts.
//
// THE MAPPING IS AN ALLOW-LIST, AND THAT IS THE COMPLIANCE CONTROL. Every field is copied by
// name. A field the provider adds tomorrow does not exist downstream, because nothing here
// names it (and provider.go never decoded it). A booking site's name, logo or link on the
// page is a contract problem (§1.3.5), not a layout bug.
//
// Not read, on purpose: ads (paid placement), serpapi_pagination (our vendor's URLs, and
// page two is another bill), deal and deal_description (they can name a booking site),
// total_rate (it reads like a quote), nearby_places, essential_info. Every field carried is
// a field a compliance reviewer has to read.

import (
	"math"
	"net/url"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

const (
	// maxResults, maxImages and maxAmenities cap page one: 20 hotels, 6 photos and 12
	// amenities each.
	maxResults   = 20
	maxImages    = 6
	maxAmenities = 12
	// maxSafeInteger is the largest integer a JavaScript number holds exactly. A rate or
	// count past it was already imprecise on the Next site, and here it is refused.
	maxSafeInteger = 1<<53 - 1
)

// imageHosts are the hosts whose images we point a visitor's browser at. Any URL that
// reaches an img src is fetched by the visitor's browser from whatever origin it names, so
// this list is checked in the mapper and again in toPublicHotel. This is the one field that
// reaches a third party from a page with a published privacy policy.
var imageHosts = map[string]bool{
	"lh3.googleusercontent.com":          true,
	"lh4.googleusercontent.com":          true,
	"lh5.googleusercontent.com":          true,
	"lh6.googleusercontent.com":          true,
	"encrypted-tbn0.gstatic.com":         true,
	"encrypted-tbn1.gstatic.com":         true,
	"encrypted-tbn2.gstatic.com":         true,
	"encrypted-tbn3.gstatic.com":         true,
	"streetviewpixels-pa.googleapis.com": true,
}

// hotelPayload is the mapped reply (HotelSearchPayload in types.ts), before the second check.
type hotelPayload struct {
	currency       string
	totalAvailable *int64
	results        []hotelResult
}

// hotelResult is one mapped property (HotelResult in types.ts). Strings are "" when the
// provider gave nothing usable; numbers are nil.
type hotelResult struct {
	id            string
	propertyToken string
	name          string
	description   string
	propertyType  string
	hotelClass    *int
	overallRating *float64
	reviewCount   *int64
	amenities     []string
	images        []string
	ecoCertified  bool
	rate          *hotelRate
}

// hotelRate is one indicative nightly rate, DELIBERATELY NOT A LIST. The provider sends one
// price per booking site, each naming the site; a list with those fields merely omitted
// would invite the next developer to "add the source back". A single number cannot. It is
// the lowest nightly rate reported across all sources, with no claim about who offers it.
type hotelRate struct {
	amountCents int64
	currency    string
}

// mapSearchResponse maps a whole reply, page one only.
func mapSearchResponse(raw *providerResponse, currency string) hotelPayload {
	out := hotelPayload{currency: currency}
	for index, p := range raw.Properties {
		if len(out.results) >= maxResults {
			break
		}
		if h, ok := mapProperty(p, currency, index); ok {
			out.results = append(out.results, h)
		}
	}
	// Checked before rounding, as the TypeScript did: -0.4 is no total, not a total of 0.
	if si := raw.SearchInformation; si != nil && si.TotalResults.set {
		if t := si.TotalResults.value; finite(t) && t >= 0 {
			if r := jsRound(t); r <= maxSafeInteger {
				n := int64(r)
				out.totalAvailable = &n
			}
		}
	}
	return out
}

// mapProperty maps one property, or reports false when it must not be shown: it has no
// name (nothing to put on the card), or it is sponsored (paid placement on a page
// InteleTravel compliance has to approve, which we cannot label because we do not control
// it, §1.3.1).
func mapProperty(p providerProperty, currency string, index int) (hotelResult, bool) {
	if p.Sponsored {
		return hotelResult{}, false
	}
	name := text(p.Name.ptr(), 160)
	if name == "" {
		return hotelResult{}, false
	}
	token := text(p.PropertyToken.ptr(), 200)
	id := token
	if id == "" {
		id = "p" + strconv.Itoa(index)
	}
	propertyType := p.PropertyType
	if !propertyType.given {
		propertyType = p.Type
	}
	var hotelClass *int
	if n := wholeNumber(p.ExtractedHotelClass.ptr(), 1, 5); n != nil {
		c := int(*n)
		hotelClass = &c
	}
	return hotelResult{
		id:            id,
		propertyToken: token,
		name:          name,
		description:   text(p.Description.ptr(), 600),
		propertyType:  text(propertyType.ptr(), 60),
		hotelClass:    hotelClass,
		overallRating: mapRating(p.OverallRating.ptr()),
		reviewCount:   wholeNumber(p.Reviews.ptr(), 0, 10_000_000),
		amenities:     mapAmenities(p.Amenities),
		images:        mapImages(p.Images),
		ecoCertified:  bool(p.EcoCertified),
		rate:          mapRate(p, currency),
	}, true
}

// mapRate is the nightly rate in integer cents. extracted_lowest is the only figure
// trusted; no extracted value means no rate, and the card says so.
func mapRate(p providerProperty, currency string) *hotelRate {
	if p.RatePerNight == nil || !p.RatePerNight.ExtractedLowest.set {
		return nil
	}
	dollars := p.RatePerNight.ExtractedLowest.value
	if !finite(dollars) || dollars < 0 {
		return nil
	}
	cents, ok := centsFromDollars(dollars)
	if !ok {
		return nil
	}
	return &hotelRate{amountCents: cents, currency: currency}
}

// centsFromDollars is the one conversion from the provider's float, so a float price never
// travels past this line. It is Math.round(dollars * 100) exactly, so a provider number shows
// the same cent it did on the Next site. It reports false for a rate that rounds to no cents,
// or past maxSafeInteger.
func centsFromDollars(dollars float64) (int64, bool) {
	// The explicit conversion rounds the product to a float64 before jsRound reads it. The
	// Go spec lets a compiler fuse a multiply into a later add (an FMA on arm64), which would
	// round from the exact product instead: 2.675 would come out 267 where JavaScript says 268.
	scaled := float64(dollars * 100)
	cents := jsRound(scaled)
	if cents <= 0 || cents > maxSafeInteger {
		return 0, false
	}
	return int64(cents), true
}

// mapRating keeps a rating only when it is 0 to 5, rounded to one decimal place. A string,
// or a 9.2 out of 10, would render as a star rating that is simply wrong.
func mapRating(v *float64) *float64 {
	if v == nil || !finite(*v) || *v < 0 || *v > 5 {
		return nil
	}
	r := jsRound(float64(*v*10)) / 10
	return &r
}

// mapImages keeps up to maxImages thumbnails on an allow-listed host.
func mapImages(images []providerImage) []string {
	var out []string
	for _, img := range images {
		if len(out) >= maxImages {
			break
		}
		if !img.Thumbnail.set || !isAllowedImage(img.Thumbnail.value) {
			continue
		}
		out = append(out, img.Thumbnail.value)
	}
	return out
}

// mapAmenities keeps up to maxAmenities labels, de-duplicated without regard to case.
func mapAmenities(amenities []string) []string {
	var out []string
	seen := map[string]bool{}
	for i := range amenities {
		if len(out) >= maxAmenities {
			break
		}
		value := text(&amenities[i], 60)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	return out
}

// isAllowedImage reports whether raw is an https URL on an allow-listed host. Go and a browser
// parse a few odd URLs differently (a backslash, a space, a user before an @), and the
// browser is the one that fetches, so any of those is refused outright: the host checked
// here is then the host the browser asks.
func isAllowedImage(raw string) bool {
	if strings.ContainsRune(raw, '\\') {
		return false
	}
	for _, r := range raw {
		if r <= ' ' || r == 0x7f {
			return false
		}
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Opaque != "" {
		return false
	}
	return imageHosts[strings.ToLower(u.Hostname())]
}

// text is map.ts's text(): control characters become spaces, runs of whitespace collapse
// to one space, the ends are trimmed, and the result is cut to limit UTF-16 code units (what
// JavaScript's length counts). "" means the provider gave nothing usable.
func text(value *string, limit int) string {
	if value == nil {
		return ""
	}
	return truncateUTF16(collapse(*value), limit)
}

// collapse replaces control characters with spaces, collapses whitespace and trims, as
// JavaScript's .replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim() does.
func collapse(s string) string {
	var b strings.Builder
	space := false
	for _, r := range s {
		if unicode.Is(unicode.Cc, r) || isJSSpace(r) {
			space = b.Len() > 0
			continue
		}
		if space {
			b.WriteByte(' ')
			space = false
		}
		b.WriteRune(r)
	}
	return b.String()
}

// isJSSpace is JavaScript's \s: Go's unicode.IsSpace plus U+FEFF, the byte-order mark.
func isJSSpace(r rune) bool {
	return unicode.IsSpace(r) || r == '\ufeff'
}

// truncateUTF16 cuts s to at most limit UTF-16 code units. Where JavaScript's slice would
// cut a surrogate pair in half, this drops the whole character, since Go cannot hold half
// of one.
func truncateUTF16(s string, limit int) string {
	n := 0
	for i, r := range s {
		w := max(utf16.RuneLen(r), 1)
		if n+w > limit {
			return s[:i]
		}
		n += w
	}
	return s
}

// utf16Len is JavaScript's string length.
func utf16Len(s string) int {
	n := 0
	for _, r := range s {
		n += max(utf16.RuneLen(r), 1)
	}
	return n
}

// wholeNumber rounds v and keeps it when it falls within [lo, hi].
func wholeNumber(v *float64, lo, hi float64) *int64 {
	if v == nil || !finite(*v) {
		return nil
	}
	r := jsRound(*v)
	if r < lo || r > hi {
		return nil
	}
	n := int64(r)
	return &n
}

// jsRound is JavaScript's Math.round: the nearest integer, with a half going up toward +Inf
// (Math.round(-2.5) is -2). math.Round sends a half away from zero, and math.Floor(x+0.5)
// gets 0.49999999999999994 wrong.
func jsRound(x float64) float64 {
	if !finite(x) {
		return x
	}
	r := math.Floor(x)
	if x-r >= 0.5 {
		r++
	}
	return r
}

func finite(x float64) bool { return !math.IsNaN(x) && !math.IsInf(x, 0) }
