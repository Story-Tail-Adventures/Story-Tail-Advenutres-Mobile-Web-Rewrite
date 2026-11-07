package trips

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// §3.4.15's vocabulary and form shapes, with §3.6's pay link and Mark Paid checks and §3.6.6's
// history mapping: web/lib/agent/payments.ts and paymentHistory.ts, SCHEDULE_COPY and
// PAYMENTS_COPY word for word.
//
// The schedule and the money are two writes: payment_upsert says what the supplier expects
// and when; payment_paid says whether the money moved, and only it reaches the trip's "paid
// so far". The pay link is a third (payment_link), audited by the SQL behind it.

// SCHEDULE_COPY and PAYMENTS_COPY, word for word.
const (
	copyScheduleFailed  = "That didn't save. Try again in a moment."
	copyLabelRequired   = "Give it a name — it's the line the client reads."
	copyAmountNotNumber = "That doesn't look like an amount."
	copyAmountRequired  = "A payment needs an amount."
	copyRemoveMilestone = "Removing a payment takes it off the schedule for good."
	copyRemindNothing   = "Nothing is still owed on this trip, so there's nothing to remind the client about."
	copySendNeedsLink   = "Add a pay link first"

	copyLinkNotHTTPS = "Use a full link that starts with https://"
	copyLinkTooLong  = "That link is too long. Links can be up to 2,048 characters."
	copyLinkCard     = "That looks like a card number. Card numbers never go in the app."

	copyPaidAmountInvalid = "That doesn't look like an amount."
	copyPaidDateInvalid   = "Pick the date the money landed. It can't be in the future."
	copyPaidRefTooLong    = "Keep the confirmation number to 100 characters."
	copyPaidNoteTooLong   = "Keep the note to 1,000 characters."
	copyPaidCardLike      = "That looks like a card number. Card numbers never go in the app."
	copyPaymentsFailed    = "That didn't save. Try again in a moment."
)

// milestoneKinds is MILESTONE_KINDS: payment_milestone_kind exactly.
var milestoneKinds = []struct{ value, label string }{
	{"deposit", "Deposit"},
	{"interim", "Interim payment"},
	{"final", "Final balance"},
}

// milestoneStatuses is MILESTONE_STATUSES: all four reachable, waived included.
var milestoneStatuses = []struct{ value, label, hint string }{
	{"scheduled", "Scheduled", "Not paid yet."},
	{"paid", "Paid", "The money has moved."},
	{"overdue", "Overdue", "Past its date and still unpaid. Leave it scheduled if the supplier has given more time."},
	{"waived", "Waived", "The supplier let it go. Not a payment — this doesn't count toward what's been paid."},
}

func isMilestoneKind(v string) bool {
	for _, k := range milestoneKinds {
		if k.value == v {
			return true
		}
	}
	return false
}

func isMilestoneStatus(v string) bool {
	for _, s := range milestoneStatuses {
		if s.value == v {
			return true
		}
	}
	return false
}

// milestoneValues is MilestoneValues: the amount as typed, converted at the write.
type milestoneValues struct{ milestoneID, kind, label, amount, dueDate string }

func emptyMilestone() milestoneValues { return milestoneValues{kind: "deposit"} }

// milestoneFromForm is milestoneFromFormData: trimmed, an unknown kind is a deposit, and it
// never carries a status or a paid amount.
func milestoneFromForm(f url.Values) milestoneValues {
	t := func(n string) string { return trimJS(f.Get(n)) }
	kind := t("kind")
	if !isMilestoneKind(kind) {
		kind = "deposit"
	}
	return milestoneValues{milestoneID: t("milestoneId"), kind: kind, label: t("label"), amount: t("amount"), dueDate: t("dueDate")}
}

// validateMilestone: a label, and an amount that is one and is not zero.
func validateMilestone(v milestoneValues) map[string]string {
	errs := map[string]string{}
	switch {
	case v.label == "":
		errs["label"] = copyLabelRequired
	case looksLikeCardNumber(v.label):
		// Stricter than Next, which takes it: the label is what the client reads, and rule 1
		// keeps card numbers out of every field. PAYMENTS_COPY's own card sentence.
		errs["label"] = copyPaidCardLike
	}
	switch cents, ok := dollarsToCents(v.amount); {
	case !ok:
		errs["amount"] = copyAmountNotNumber
	case cents == 0:
		errs["amount"] = copyAmountRequired
	}
	return errs
}

// nextUnpaid is nextUnpaidMilestone: the first row still owed, in the schedule's order.
func nextUnpaid(rows []payment) (payment, bool) {
	for _, p := range rows {
		if isOpenMilestone(p.status) {
			return p, true
		}
	}
	return payment{}, false
}

// validatePayLink is validatePayLink over checkPayURL. The link sent is the trimmed text as
// typed: agent-trip's readPayUrl parses it with new URL() and stores url.href, the same href
// Next sent, so what is saved matches; the checks here only decide the sentence under the
// field. "" means remove.
func validatePayLink(raw string) (link string, errText string) {
	c := checkPayURL(raw)
	if !c.ok {
		switch c.reason {
		case "card":
			return "", copyLinkCard
		case "length":
			return "", copyLinkTooLong
		default:
			return "", copyLinkNotHTTPS
		}
	}
	if c.url == "" {
		return "", ""
	}
	return trimJS(raw), ""
}

// markPaidValues is MarkPaidValues.
type markPaidValues struct{ amount, paidOn, reference, note string }

func markPaidFromForm(f url.Values) markPaidValues {
	t := func(n string) string { return trimJS(lf(f.Get(n))) }
	return markPaidValues{amount: t("amount"), paidOn: t("paidOn"), reference: t("reference"), note: t("note")}
}

var isoDay = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// jsLength is String.prototype.length: UTF-16 code units, as the TS limits count.
func jsLength(s string) int { return len(utf16.Encode([]rune(s))) }

// validateMarkPaid: an amount that is more than nothing (blank is the whole amount), a real
// date no later than the advisor's today, and a reference and note within their limits and
// never card-shaped (refused, not masked).
func validateMarkPaid(v markPaidValues, today string) map[string]string {
	errs := map[string]string{}
	if v.amount != "" {
		if cents, ok := dollarsToCents(v.amount); !ok || cents <= 0 {
			errs["amount"] = copyPaidAmountInvalid
		}
	}
	day, err := time.Parse("2006-01-02", v.paidOn)
	if !isoDay.MatchString(v.paidOn) || err != nil || day.Format("2006-01-02") != v.paidOn || v.paidOn > today {
		errs["paidOn"] = copyPaidDateInvalid
	}
	switch {
	case jsLength(v.reference) > paidReferenceMax:
		errs["reference"] = copyPaidRefTooLong
	case looksLikeCardNumber(v.reference):
		errs["reference"] = copyPaidCardLike
	}
	switch {
	case jsLength(v.note) > paidNoteMax:
		errs["note"] = copyPaidNoteTooLong
	case looksLikeCardNumber(v.note):
		errs["note"] = copyPaidCardLike
	}
	return errs
}

// paidTitle is PAYMENTS_COPY.paidTitle: "Mark final balance paid".
func paidTitle(label string) string { return "Mark " + lowerFirst(label) + " paid" }

// payButtonLabel is payLink.ts payButtonLabel: "Pay final balance".
func payButtonLabel(label string) string { return "Pay " + lowerFirst(trimJS(label)) }

// lowerFirst is `s.charAt(0).toLowerCase() + s.slice(1)`: one UTF-16 unit, as JS does.
func lowerFirst(s string) string {
	u := utf16.Encode([]rune(s))
	if len(u) == 0 {
		return ""
	}
	first := string(utf16.Decode(u[:1]))
	return strings.ToLower(first) + string(utf16.Decode(u[1:]))
}

// ── §3.6.6 Payment History ─────────────────────────────────────────────────────────────

// historyRow is AgentTripPaymentHistoryRow. metadata is read field by field, never as a
// map of anything: only the keys the mapping names, each a string or a finite number.
type historyRow struct {
	EventID        string        `json:"event_id"`
	OccurredAt     string        `json:"occurred_at"`
	EventType      string        `json:"event_type"`
	MilestoneID    *string       `json:"milestone_id"`
	MilestoneLabel *string       `json:"milestone_label"`
	ActorName      *string       `json:"actor_name"`
	Metadata       historyFields `json:"metadata"`
}

type historyFields struct {
	PayURL        json.RawMessage `json:"pay_url"`
	Host          json.RawMessage `json:"host"`
	OldPayURL     json.RawMessage `json:"old_pay_url"`
	OldHost       json.RawMessage `json:"old_host"`
	NewPayURL     json.RawMessage `json:"new_pay_url"`
	NewHost       json.RawMessage `json:"new_host"`
	NewPaidCents  json.RawMessage `json:"new_paid_cents"`
	PaidCents     json.RawMessage `json:"paid_cents"`
	PaidReference json.RawMessage `json:"paid_reference"`
	Status        json.RawMessage `json:"status"`
	PriorStatus   json.RawMessage `json:"prior_status"`
}

// metaText is paymentHistory.ts text(): a non-blank string as it is, a finite number as JS
// prints it, anything else nothing.
func metaText(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if trimJS(s) == "" {
			return "", false
		}
		return s, true
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err == nil {
		if _, err := n.Float64(); err == nil { // out of range is Infinity in JS: not finite
			return jsNumberString(n), true
		}
	}
	return "", false
}

type historyEntry struct {
	eventID, whenLabel, kind, kindLabel, chip, milestoneID, milestoneLabel, detail, who string
}

var historyKinds = map[string]struct{ label, chip string }{
	"paid":    {"Marked paid", "booked"},
	"waived":  {"Waived", "past"},
	"cleared": {"Marked unpaid", "due"},
	"status":  {"Status changed", "past"},
	"added":   {"Link added", "traveling"},
	"changed": {"Link changed", "proposal"},
	"removed": {"Link removed", "past"},
}

var statusWord = map[string]string{"scheduled": "Scheduled", "paid": "Paid", "overdue": "Overdue", "waived": "Waived"}

// shortLink is "sandals.com/pay/SRB-220119": the site name plus the path, trailing slashes
// dropped, so two links on one site differ.
func shortLink(link string) string {
	site := paySiteName(link)
	if site == "" {
		return ""
	}
	u, err := url.Parse(trimJS(link))
	if err != nil {
		return site
	}
	return site + strings.TrimRight(u.EscapedPath(), "/")
}

func isTravefyLink(link string) bool {
	site := paySiteName(link)
	return site != "" && (site == "travefy.com" || strings.HasSuffix(site, ".travefy.com"))
}

// historyMoney is moneyText: a digit string as money (cents kept), anything else nothing.
func historyMoney(cents string) string {
	if cents == "" || strings.Trim(cents, "0123456789") != "" {
		return ""
	}
	n, err := strconv.ParseInt(cents, 10, 64)
	if err != nil {
		return ""
	}
	return formatMoney(n, false)
}

// historyWhen is "May 2 · 4:05 PM" in the advisor's zone; an unparseable time as it came.
func historyWhen(timestamp string, loc *time.Location) string {
	at, err := time.Parse(time.RFC3339Nano, timestamp)
	if err != nil {
		if at, err = time.Parse("2006-01-02T15:04:05.999999999Z07", timestamp); err != nil {
			return timestamp
		}
	}
	at = at.In(loc)
	return at.Format("Jan 2") + " · " + at.Format("3:04 PM")
}

func classifyHistory(r historyRow) string {
	status, _ := metaText(r.Metadata.Status)
	switch r.EventType {
	case "payment_milestone.link_set":
		return "added"
	case "payment_milestone.link_changed":
		return "changed"
	case "payment_milestone.link_removed":
		return "removed"
	case "payment_milestone.marked_paid":
		return "paid"
	case "payment_milestone.marked_waived":
		return "waived"
	case "payment_milestone.payment_cleared":
		return "cleared"
	}
	switch status {
	case "paid":
		return "paid"
	case "waived":
		return "waived"
	}
	return "status"
}

func historyDetail(kind string, m historyFields) string {
	text := func(raw json.RawMessage) string { s, _ := metaText(raw); return s }
	linkOr := func(link, host json.RawMessage) string {
		if s := shortLink(text(link)); s != "" {
			return s
		}
		return text(host)
	}
	word := func(s string) string {
		if w, ok := statusWord[s]; ok {
			return w
		}
		return s
	}
	switch kind {
	case "added":
		l := linkOr(m.PayURL, m.Host)
		if isTravefyLink(text(m.PayURL)) {
			return l + " (Travefy invoice)"
		}
		return l
	case "changed":
		return linkOr(m.OldPayURL, m.OldHost) + " → " + linkOr(m.NewPayURL, m.NewHost)
	case "removed":
		return linkOr(m.OldPayURL, m.OldHost)
	case "paid":
		cents := text(m.NewPaidCents)
		if cents == "" {
			cents = text(m.PaidCents)
		}
		var parts []string
		if a := historyMoney(cents); a != "" {
			parts = append(parts, a)
		}
		if ref := text(m.PaidReference); ref != "" {
			parts = append(parts, "conf. "+ref)
		}
		return strings.Join(parts, " · ")
	case "waived":
		return statusWord["waived"]
	}
	// cleared, status
	to := ""
	if s := text(m.Status); s != "" {
		to = word(s)
	}
	if prior := text(m.PriorStatus); prior != "" {
		return word(prior) + " → " + to
	}
	return to
}

// toPaymentHistory is toPaymentHistory.
func toPaymentHistory(rows []historyRow, loc *time.Location) []historyEntry {
	out := make([]historyEntry, 0, len(rows))
	for _, r := range rows {
		kind := classifyHistory(r)
		label := "A removed payment"
		if r.MilestoneLabel != nil {
			label = *r.MilestoneLabel
		}
		who := "System"
		if r.ActorName != nil {
			who = *r.ActorName
		}
		out = append(out, historyEntry{eventID: r.EventID, whenLabel: historyWhen(r.OccurredAt, loc), kind: kind,
			kindLabel: historyKinds[kind].label, chip: historyKinds[kind].chip, milestoneID: deref(r.MilestoneID),
			milestoneLabel: label, detail: historyDetail(kind, r.Metadata), who: who})
	}
	return out
}
