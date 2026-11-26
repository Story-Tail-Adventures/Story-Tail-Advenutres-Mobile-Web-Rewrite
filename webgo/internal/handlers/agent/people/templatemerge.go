package people

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// §3.10 Stage 2's merge fields (Data-Model §12.4), and the one place a template's {{tokens}}
// turn into words. Ported from web/lib/agent/templateMerge.ts.
//
// THE SAME LIST LIVES IN TWO OTHER PLACES: the migration's message_template_fields() and the
// Edge Functions' _shared/messageTemplate.ts. templatemerge_test.go reads the migration and
// fails if the two drift; the Edge Function's copy is checked by the web's own test.
//
// A FIELD WITH NO VALUE IS NEVER FILLED WITH BLANK SPACE (Gyasi, 2026-10-14). renderTemplate
// leaves its raw token in place and reports it as missing, so the picker can turn "Insert
// as-is" off and the reply box can refuse to send. A client never reads "your trip on .".

var mergeFields = []string{
	"client.firstName",
	"trip.name",
	"trip.destination",
	"trip.dates",
	"agent.firstName",
	"payment.label",
	"payment.amount",
	"payment.dueDate",
	// Added 2026-10-16 (§3.6.2, Data-Model §12.4): the milestone's pay link, as stored. A
	// milestone with no link leaves it missing, so Send refuses until the advisor adds one.
	"payment.link",
}

var templateCategories = []string{
	"lead_response",
	"proposal",
	"booking_confirmation",
	"pre_trip",
	"post_trip",
	"payment_reminder",
	"other",
}

const (
	maxTemplateName = 80
	maxTemplateBody = 8000
	maxTemplateTags = 10
	maxTemplateTag  = 30
)

// `{{`, anything but braces, `}}`: the shape the SQL and the Edge Function match.
var templateToken = regexp.MustCompile(`\{\{([^{}]*)\}\}`)

func isMergeField(name string) bool { return slices.Contains(mergeFields, name) }

// scanTokens walks every {{ … }} in order and hands its trimmed inside to see.
func scanTokens(body string, see func(inner string)) {
	for _, m := range templateToken.FindAllStringSubmatch(body, -1) {
		see(strings.TrimSpace(m[1]))
	}
}

// once collects in first-appearance order, one of each, as a JS Set does.
type once struct {
	seen map[string]bool
	list []string
}

func (o *once) add(name string) {
	if o.seen == nil {
		o.seen = map[string]bool{}
	}
	if !o.seen[name] {
		o.seen[name] = true
		o.list = append(o.list, name)
	}
}

// unknownTokens is every {{ … }} whose inside is not a merge field, in order, once each.
func unknownTokens(body string) []string {
	var out once
	scanTokens(body, func(inner string) {
		if !isMergeField(inner) {
			out.add(inner)
		}
	})
	return out.list
}

// unfilledFields is every merge field still in a body as a raw token, in order, once each.
func unfilledFields(body string) []string {
	var out once
	scanTokens(body, func(inner string) {
		if isMergeField(inner) {
			out.add(inner)
		}
	})
	return out.list
}

type rendered struct {
	// Text is the body with every field that has a value filled in; the rest left as raw.
	Text string
	// Missing is the fields that had no value, in the order they first appear.
	Missing []string
}

// renderTemplate fills a template. Unknown tokens are left exactly as written; the editor
// refuses them.
func renderTemplate(body string, values map[string]string) rendered {
	var missing once
	text := templateToken.ReplaceAllStringFunc(body, func(whole string) string {
		inner := strings.TrimSpace(templateToken.FindStringSubmatch(whole)[1])
		if !isMergeField(inner) {
			return whole
		}
		value, ok := values[inner]
		if !ok || strings.TrimSpace(value) == "" {
			missing.add(inner)
			return whole
		}
		return value
	})
	return rendered{Text: text, Missing: missing.list}
}

// joinDestinations is "Bahamas", "Bahamas and St. Maarten", "Aruba, Curaçao and Bonaire".
func joinDestinations(destinations []string) string {
	var list []string
	for _, d := range destinations {
		if d = strings.TrimSpace(d); d != "" {
			list = append(list, d)
		}
	}
	return andList(list)
}

// andList is the Oxford-less "a and b" / "a, b and c" both this file and the picker's
// "what is missing" sentence write.
func andList(list []string) string {
	if len(list) <= 2 {
		return strings.Join(list, " and ")
	}
	return strings.Join(list[:len(list)-1], ", ") + " and " + list[len(list)-1]
}

// mergeContext is the raw merge data agent_message_merge_context answers. Every field is a
// string because every one of them is nullable: empty is SQL's NULL.
type mergeContext struct {
	ClientFirstName  string
	AgentFirstName   string
	TripTitle        string
	TripDestinations []string
	TripStartDate    string
	TripEndDate      string
	PaymentLabel     string
	// PaymentOwedCents is what is still owed, as a digit string (bigint over JSON).
	PaymentOwedCents string
	PaymentCurrency  string
	PaymentDueDate   string
	// PaymentLink is the milestone's pay_url, the full https link. Empty when it has none.
	PaymentLink string
}

var digitsOnly = regexp.MustCompile(`^\d+$`)

// mergeValuesOf is the words each field becomes. A field is left out whenever its source is
// missing, so it reads as missing rather than as an empty string: a trip with no start date
// has no trip.dates (never "Dates to come" inside a client's message).
func mergeValuesOf(ctx mergeContext) map[string]string {
	values := map[string]string{}
	set := func(field, value string) {
		if v := strings.TrimSpace(value); v != "" {
			values[field] = v
		}
	}
	set("client.firstName", ctx.ClientFirstName)
	set("agent.firstName", ctx.AgentFirstName)
	set("trip.name", ctx.TripTitle)
	set("trip.destination", joinDestinations(ctx.TripDestinations))
	if ctx.TripStartDate != "" {
		set("trip.dates", tripDatesLabel(ctx.TripStartDate, ctx.TripEndDate))
	}
	set("payment.label", ctx.PaymentLabel)
	// A bigint arrives as text. Anything that is not a run of digits is not an amount: a
	// float or a minus would be a different number after Go parsed it than after JS did.
	if digitsOnly.MatchString(ctx.PaymentOwedCents) {
		if cents, err := strconv.ParseInt(ctx.PaymentOwedCents, 10, 64); err == nil {
			set("payment.amount", formatMoney(Cents(cents), false))
		}
	}
	if ctx.PaymentDueDate != "" {
		set("payment.dueDate", tripDatesLabel(ctx.PaymentDueDate, ""))
	}
	set("payment.link", ctx.PaymentLink)
	return values
}

// tripDatesLabel ports lib/trips/format.ts formatTripDates: "Nov 13 – 20, 2026", collapsing
// the month when the trip does not cross one.
//
// It is NOT clientDetail's dateRange, which this package already has. Across a year this one
// writes the start with no year at all ("Dec 28 – Jan 3, 2027"); dateRange writes both.
func tripDatesLabel(startISO, endISO string) string {
	if startISO == "" {
		return "Dates to come"
	}
	sy, sm, sd, ok := splitDay(startISO)
	if !ok {
		return ""
	}
	if endISO == "" {
		return monthDayYear(startISO)
	}
	ey, em, ed, ok := splitDay(endISO)
	if !ok {
		return ""
	}
	if sy == ey && sm == em {
		return shortMonthNames[sm-1] + " " + strconv.Itoa(sd) + " – " + strconv.Itoa(ed) + ", " + strconv.Itoa(ey)
	}
	return shortMonthNames[sm-1] + " " + strconv.Itoa(sd) + " – " + monthDayYear(endISO)
}

// splitDay reads a "yyyy-mm-dd" into its three numbers.
func splitDay(iso string) (year, month, day int, ok bool) {
	parts := strings.Split(iso, "-")
	if len(parts) < 3 {
		return 0, 0, 0, false
	}
	y, e1 := strconv.Atoi(parts[0])
	m, e2 := strconv.Atoi(parts[1])
	d, e3 := strconv.Atoi(parts[2])
	if e1 != nil || e2 != nil || e3 != nil || m < 1 || m > 12 {
		return 0, 0, 0, false
	}
	return y, m, d, true
}

// sampleMergeContext is the editor's preview data (Screen Inventory §3.10.5): a fixed sample,
// never a real client, because writing copy is no reason to put a real traveler's name on
// screen. The artboard's.
var sampleMergeContext = mergeContext{
	ClientFirstName:  "Jordan",
	AgentFirstName:   "Gyasi",
	TripTitle:        "Honeymoon in Nassau",
	TripDestinations: []string{"Nassau, Bahamas"},
	TripStartDate:    "2026-08-12",
	TripEndDate:      "2026-08-19",
	PaymentLabel:     "Final balance",
	PaymentOwedCents: "120000",
	PaymentCurrency:  "USD",
	PaymentDueDate:   "2026-06-12",
	PaymentLink:      "https://www.sandals.com/pay/SRB-220119",
}

// insertTemplate puts a template into the reply box without replacing the draft (§3.10.3).
//
// Next inserts at the cursor. A form post carries no cursor, so this is insertAtCursor's own
// no-selection branch: an empty box gets the template, and a draft keeps every word with the
// template after it.
func insertTemplate(draft, text string) string {
	if strings.TrimSpace(draft) == "" {
		return text
	}
	return draft + text
}
