package client

import (
	"strconv"
	"strings"
	"time"
)

// The traveler side's pure presentation: what a trip's status is called, how its dates and
// money read, and which photograph stands in for it. Ports web/lib/trips/{status,format,
// money,imagery}.ts; the agent area ports its own copy into its own package for the same
// reason (each area is self-contained, and the two surfaces word things differently).
//
// EVERY DATE HERE IS en-US, unlike the onboarding wizard's en-GB: "Sep", not "Sept". The two
// live in the same binary and format the same column differently because the two screens
// did in Next, so each spells its own months out.

const isoDate = "2006-01-02"

// usShortMonths and usLongMonths are Intl's en-US names.
var usShortMonths = [...]string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

// TripStatus is trip.status.
type TripStatus string

// The six statuses (TRIP_STATUSES).
const (
	StatusInquiry    TripStatus = "inquiry"
	StatusProposal   TripStatus = "proposal"
	StatusBooked     TripStatus = "booked"
	StatusInProgress TripStatus = "in_progress"
	StatusCompleted  TripStatus = "completed"
	StatusCancelled  TripStatus = "cancelled"
)

// TripStatusMessages is TRIP_STATUS_MESSAGES, word for word.
var TripStatusMessages = struct {
	Inquiry, ProposalReady, Booked, FinalPaymentDue, TravelingNow, PastTrip, Cancelled string
}{
	Inquiry:         "Inquiry",
	ProposalReady:   "Proposal ready",
	Booked:          "Booked",
	FinalPaymentDue: "Final payment due",
	TravelingNow:    "Traveling now",
	PastTrip:        "Past trip",
	Cancelled:       "Cancelled",
}

// dueSoonDays is how close an unpaid milestone has to be for a booked trip to read as due
// rather than as booked (DUE_SOON_DAYS).
const dueSoonDays = 14

// Presentation is the chip kind (a status-chip class) and the words beside it.
type Presentation struct {
	Chip  string
	Label string
}

// DaysBetween is the whole days from one date-only value to another, or ok false when
// either is not a date. Dates are compared as dates: no zone, no clock.
func DaysBetween(from, to string) (int, bool) {
	a, errA := time.Parse(isoDate, from)
	b, errB := time.Parse(isoDate, to)
	if errA != nil || errB != nil {
		return 0, false
	}
	return int(b.Sub(a).Hours() / 24), true
}

// StatusPresentation ports tripStatusPresentation. A booked trip whose next unpaid
// milestone falls within a fortnight reads as "Final payment due" instead, which is the one
// place this screen asks for anything.
func StatusPresentation(status TripStatus, today, nextUnpaidDueDate string) Presentation {
	m := TripStatusMessages
	switch status {
	case StatusCancelled:
		return Presentation{"cancelled", m.Cancelled}
	case StatusCompleted:
		return Presentation{"past", m.PastTrip}
	case StatusInProgress:
		return Presentation{"traveling", m.TravelingNow}
	case StatusInquiry:
		return Presentation{"inquiry", m.Inquiry}
	case StatusProposal:
		return Presentation{"proposal", m.ProposalReady}
	case StatusBooked:
		if nextUnpaidDueDate != "" {
			if days, ok := DaysBetween(today, nextUnpaidDueDate); ok && days <= dueSoonDays {
				return Presentation{"due", m.FinalPaymentDue}
			}
		}
		return Presentation{"booked", m.Booked}
	}
	// An unknown status is not a crash: the row still has to render, and "Inquiry" is the
	// least committal thing it can say.
	return Presentation{"inquiry", m.Inquiry}
}

// DaysUntilDeparture is how many days until a trip starts, or ok false when it has no start
// date or has already begun (daysUntilDeparture never returns a negative).
func DaysUntilDeparture(startDate, today string) (int, bool) {
	if startDate == "" {
		return 0, false
	}
	days, ok := DaysBetween(today, startDate)
	if !ok || days < 0 {
		return 0, false
	}
	return days, true
}

// FormatTripDates ports formatTripDates: "Apr 3 – 7, 2027" inside one month, "Apr 3 – May 2,
// 2027" across two, "Apr 3, 2027" for a start with no end, and a sentence when there are no
// dates at all.
func FormatTripDates(startISO, endISO string) string {
	start, err := time.Parse(isoDate, startISO)
	if err != nil {
		return "Dates to come"
	}
	end, errEnd := time.Parse(isoDate, endISO)
	if errEnd != nil {
		return shortDate(start, true)
	}
	if start.Year() == end.Year() && start.Month() == end.Month() {
		return shortDate(start, false) + " – " + strconv.Itoa(end.Day()) + ", " + strconv.Itoa(end.Year())
	}
	return shortDate(start, false) + " – " + shortDate(end, true)
}

// FormatDay is "Apr 3".
func FormatDay(iso string) string {
	d, err := time.Parse(isoDate, iso)
	if err != nil {
		return iso
	}
	return shortDate(d, false)
}

// FormatLongDay is "Friday 3 April".
func FormatLongDay(iso string) string {
	d, err := time.Parse(isoDate, iso)
	if err != nil {
		return iso
	}
	return d.Weekday().String() + " " + strconv.Itoa(d.Day()) + " " + d.Month().String()
}

func shortDate(d time.Time, withYear bool) string {
	s := usShortMonths[int(d.Month())-1] + " " + strconv.Itoa(d.Day())
	if withYear {
		s += ", " + strconv.Itoa(d.Year())
	}
	return s
}

// FormatMoney is Intl.NumberFormat("en-US", {style: "currency"}) over int64 CENTS: whole
// dollars when the amount is whole, two places when it is not. Money never becomes a float
// on the way here (CLAUDE.md rule 5) and does not become one here either — the decimal part
// is printed from the remainder.
//
// The app is USD only (Gyasi's stated constraint), and an unknown currency is formatted as
// dollars rather than refused, exactly as formatTripMoney does.
func FormatMoney(cents int64, currency string) string {
	return formatMoney(cents, currency, false)
}

// FormatWholeMoney drops the cents even when there are some ({whole: true}).
func FormatWholeMoney(cents int64, currency string) string {
	return formatMoney(cents, currency, true)
}

func formatMoney(cents int64, _ string, whole bool) string {
	sign := ""
	if cents < 0 {
		sign, cents = "-", -cents
	}
	dollars, rest := cents/100, cents%100
	out := sign + dollarSign + withThousands(dollars)
	if !whole && rest != 0 {
		out += "." + twoDigits(rest)
	}
	return out
}

// dollarSign is the only symbol these pages print. The business is USD only (North America
// only, Gyasi's constraint) and formatTripMoney already decided what to do with anything
// else: format it as dollars rather than refuse it. The alternative is a page that says
// "XYZ 4,820" to a traveler who was never going to be billed in it. The currency argument
// stays on the exported calls so the column is still read and passed, and so the day a
// second currency appears there is one place to change.
const dollarSign = "$"

func withThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	var b strings.Builder
	lead := len(s) % 3
	if lead > 0 {
		b.WriteString(s[:lead])
	}
	for i := lead; i < len(s); i += 3 {
		if b.Len() > 0 {
			b.WriteByte(',')
		}
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func twoDigits(n int64) string {
	if n < 10 {
		return "0" + strconv.FormatInt(n, 10)
	}
	return strconv.FormatInt(n, 10)
}

// Photo is one picture from the registry (web/lib/images.ts): the Unsplash id and the alt
// text that belongs to it.
type Photo struct {
	Src string
	Alt string
}

// photos are the keys imageKeyForTrip can return, with their alt text. Trip photography is
// decorative on these screens (the trip's name is beside it), so the alt is empty where the
// Next component passes alt="" — but the registry's own words are kept for the places that
// do announce it.
var photos = map[string]Photo{
	"jamaica":    {"photo-1716758939770-a5295ccc6be7", "Cliffs above clear turquoise water"},
	"turks":      {"photo-1507525428034-b723cf961d3e", "Turquoise water and white sand on a Turks and Caicos beach"},
	"bahamas":    {"photo-1707616824227-0f31ee435e73", "Palm trees along a boardwalk to the beach at Nassau, The Bahamas"},
	"aruba":      {"photo-1683782440921-823862401342", "Thatched palapas on the palm-lined sand at Arashi Beach, Aruba"},
	"stlucia":    {"photo-1706645616928-1902d9a6b929", "The Pitons rising from the sea in St. Lucia"},
	"bvi":        {"photo-1769610352818-cf8fa29ccf9a", "A catamaran under sail on turquoise water"},
	"cruiseShip": {"photo-1548574505-5e239809ee19", "Cruise ship at sea"},
	"resortPool": {"photo-1582719508461-905c673771fd", "Infinity pool at a beachfront resort"},
	"overwater":  {"photo-1738762932370-468a90e0ff68", "Overwater bungalows above a calm lagoon"},
	"palmTree":   {"photo-1507525428034-b723cf961d3e", "Palm tree over a tropical beach"},
	"sunset":     {"photo-1523595857-fe9ee689f76f", "Palm silhouettes against a tropical sunset"},
	"snorkel":    {"photo-1582967788606-a171c1080cb0", "Snorkeler over a coral reef"},
	"family":     {"photo-1774874016650-976638792231", "Water slides above a resort pool"},
}

// byDestination matches the place names a trip carries. Lower-cased contains rather than a
// regular expression: the patterns in imagery.ts are plain alternations over words, and a
// regexp compiled per row would be the only regexp on the page.
var byDestination = []struct {
	words []string
	key   string
}{
	{[]string{"jamaica", "negril", "montego"}, "jamaica"},
	{[]string{"turks", "caicos", "providenciales", "provinciales"}, "turks"},
	{[]string{"bahama", "nassau", "paradise island"}, "bahamas"},
	{[]string{"aruba", "palm beach", "oranjestad"}, "aruba"},
	{[]string{"lucia", "piton", "soufri"}, "stlucia"},
	{[]string{"virgin islands", "tortola", "bvi"}, "bvi"},
}

var byTripType = map[string]string{
	"cruise":            "cruiseShip",
	"all_inclusive":     "resortPool",
	"multi_destination": "palmTree",
	"group":             "family",
	"custom":            "sunset",
}

var photoFallback = []string{"overwater", "resortPool", "palmTree", "sunset", "snorkel"}

// PhotoForTrip ports imageKeyForTrip: the destination decides, then the trip type, then a
// stable choice from the id — stable so the same trip keeps the same picture between loads.
func PhotoForTrip(id, tripType string, destinations []string) Photo {
	where := strings.ToLower(strings.Join(destinations, " "))
	for _, m := range byDestination {
		for _, w := range m.words {
			if strings.Contains(where, w) {
				return photos[m.key]
			}
		}
	}
	if key, ok := byTripType[tripType]; ok {
		return photos[key]
	}
	// The same hash the TypeScript uses, so a trip keeps its photograph across the two apps
	// while both are running: (hash * 31 + charCode) % 100000 over the id's UTF-16 units,
	// which for a UUID is its bytes.
	hash := 0
	for i := 0; i < len(id); i++ {
		hash = (hash*31 + int(id[i])) % 100000
	}
	return photos[photoFallback[hash%len(photoFallback)]]
}

// PhotoURL is the Unsplash CDN URL the loader builds (unsplashLoader): the same host, the
// same parameters, so the images a traveler sees are the ones they saw in Next.
func PhotoURL(p Photo, width int) string {
	return "https://images.unsplash.com/" + p.Src +
		"?w=" + strconv.Itoa(width) + "&q=80&auto=format&fit=crop"
}

// statusChipClass is the ui.css class for each chip kind. Written out rather than built as
// "status-"+kind: internal/static/classes_test.go reads the class names a page and its Go
// use, and a name assembled at runtime is one it cannot check — which is exactly how a
// stylesheet and a page drift apart.
var statusChipClass = map[string]string{
	"inquiry":   "status-inquiry",
	"proposal":  "status-proposal",
	"booked":    "status-booked",
	"due":       "status-due",
	"traveling": "status-traveling",
	"past":      "status-past",
	"cancelled": "status-cancelled",
}

// ChipClass is the class for a chip kind, falling back to the least committal one.
func ChipClass(kind string) string {
	if c, ok := statusChipClass[kind]; ok {
		return c
	}
	return "status-inquiry"
}
