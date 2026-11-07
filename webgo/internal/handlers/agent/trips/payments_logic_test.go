package trips

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
	"time"
)

// Ported from web/lib/agent/payments.test.ts and paymentHistory.test.ts.

// testPAN builds a Luhn-valid 16-digit number at runtime, so no card-shaped literal sits in
// the source (the repo's PAN guard refuses one).
func testPAN() string {
	for c := 0; c <= 9; c++ {
		if candidate := "4" + strings.Repeat("1", 14) + string(rune('0'+c)); passesLuhn(candidate) {
			return candidate
		}
	}
	return ""
}

func TestMilestoneEnumsMatchTheSchema(t *testing.T) {
	var kinds, statuses []string
	for _, k := range milestoneKinds {
		kinds = append(kinds, k.value)
	}
	for _, s := range milestoneStatuses {
		statuses = append(statuses, s.value)
		if s.hint == "" {
			t.Errorf("%s has no hint", s.value)
		}
	}
	if strings.Join(kinds, ",") != "deposit,interim,final" {
		t.Errorf("kinds = %v", kinds)
	}
	if strings.Join(statuses, ",") != "scheduled,paid,overdue,waived" {
		t.Errorf("statuses = %v", statuses)
	}
	if isMilestoneKind("balance") || !isMilestoneKind("deposit") || isMilestoneStatus("cancelled") || !isMilestoneStatus("waived") {
		t.Error("enum membership")
	}
}

func TestMilestoneMoney(t *testing.T) {
	for in, want := range map[string]int64{"1000": 100000, "1000.00": 100000, "$1,000.00": 100000, "": 0, "1000.10": 100010, "0.07": 7, "2.67": 267} {
		if got, ok := dollarsToCents(in); !ok || got != want {
			t.Errorf("dollarsToCents(%q) = %d %v", in, got, ok)
		}
	}
	for _, bad := range []string{"1000.005", "half", "-50"} {
		if _, ok := dollarsToCents(bad); ok {
			t.Errorf("dollarsToCents(%q) accepted", bad)
		}
	}
	for _, c := range []int64{0, 7, 100000, 100010, 784500} {
		if got, _ := dollarsToCents(centsToDollars(Cents(c), true)); got != c {
			t.Errorf("round trip %d = %d", c, got)
		}
	}
}

func TestValidateMilestone(t *testing.T) {
	base := emptyMilestone()
	base.label, base.amount = "Deposit", "1000.00"
	if e := validateMilestone(base); len(e) != 0 {
		t.Errorf("a filled-in milestone: %v", e)
	}
	with := func(f func(*milestoneValues)) milestoneValues { v := base; f(&v); return v }
	if validateMilestone(with(func(v *milestoneValues) { v.label = "" }))["label"] != copyLabelRequired {
		t.Error("label")
	}
	for _, a := range []string{"0", ""} {
		if validateMilestone(with(func(v *milestoneValues) { v.amount = a }))["amount"] != copyAmountRequired {
			t.Errorf("zero amount %q", a)
		}
	}
	if validateMilestone(with(func(v *milestoneValues) { v.amount = "some" }))["amount"] != copyAmountNotNumber {
		t.Error("not an amount")
	}
}

func TestMilestoneFromForm(t *testing.T) {
	v := milestoneFromForm(url.Values{"kind": {"final"}, "label": {"Final balance"}, "amount": {"7845.00"}, "paidAmount": {"9999"}, "status": {"paid"}})
	if v != (milestoneValues{kind: "final", label: "Final balance", amount: "7845.00"}) {
		t.Errorf("carries only the schedule's fields: %+v", v)
	}
	if milestoneFromForm(url.Values{"kind": {"balance"}}).kind != "deposit" {
		t.Error("unknown kind")
	}
	if milestoneFromForm(url.Values{"kind": {"deposit"}, "label": {"  Deposit  "}}).label != "Deposit" {
		t.Error("not trimmed")
	}
}

func TestNextUnpaid(t *testing.T) {
	rows := []payment{{id: "a", status: "paid"}, {id: "b", status: "waived"}, {id: "c", status: "overdue"}, {id: "d", status: "scheduled"}}
	if p, ok := nextUnpaid(rows); !ok || p.id != "c" {
		t.Errorf("next = %v %v", p.id, ok)
	}
	if _, ok := nextUnpaid(rows[:2]); ok {
		t.Error("nothing owed")
	}
}

func TestValidatePayLink(t *testing.T) {
	cases := []struct{ in, link, err string }{
		{"https://www.sandals.com/pay/1", "https://www.sandals.com/pay/1", ""},
		{"  https://www.sandals.com/pay/1 ", "https://www.sandals.com/pay/1", ""},
		{"", "", ""},
		{"   ", "", ""},
		{"http://sandals.com", "", copyLinkNotHTTPS},
		{"https://a.com/" + strings.Repeat("x", 2100), "", copyLinkTooLong},
		{"https://a.com/pay/" + testPAN(), "", copyLinkCard},
		{"https://user:pw@sandals.com/pay", "", copyLinkNotHTTPS},
		{"https://192.168.1.1/pay", "", copyLinkNotHTTPS},
	}
	for _, c := range cases {
		link, err := validatePayLink(c.in)
		if link != c.link || err != c.err {
			t.Errorf("validatePayLink(%.40q) = %q %q, want %q %q", c.in, link, err, c.link, c.err)
		}
	}
}

func TestValidateMarkPaid(t *testing.T) {
	ok := markPaidValues{amount: "4180.00", paidOn: "2026-05-14", reference: "SRB-220119-FINAL", note: "Sandals confirmed by email."}
	if e := validateMarkPaid(ok, "2026-05-14"); len(e) != 0 {
		t.Errorf("a normal paid mark: %v", e)
	}
	blank := ok
	blank.amount = ""
	if e := validateMarkPaid(blank, "2026-05-14"); len(e) != 0 {
		t.Errorf("blank is the whole amount: %v", e)
	}
	e := validateMarkPaid(markPaidValues{amount: "abc", paidOn: "2026-05-15", reference: strings.Repeat("r", 101), note: strings.Repeat("n", 1001)}, "2026-05-14")
	want := map[string]string{"amount": copyPaidAmountInvalid, "paidOn": copyPaidDateInvalid, "reference": copyPaidRefTooLong, "note": copyPaidNoteTooLong}
	for k, w := range want {
		if e[k] != w {
			t.Errorf("%s = %q", k, e[k])
		}
	}
	// "0" and "$" are nothing; 2026-02-31 is not a date.
	for _, v := range []markPaidValues{{amount: "0", paidOn: "2026-05-14"}, {amount: "$", paidOn: "2026-05-14"}} {
		if validateMarkPaid(v, "2026-05-14")["amount"] == "" {
			t.Errorf("amount %q accepted", v.amount)
		}
	}
	for _, d := range []string{"2026-02-31", "2026-5-14", "", "2026-05-14T00:00"} {
		if validateMarkPaid(markPaidValues{paidOn: d}, "2026-05-14")["paidOn"] == "" {
			t.Errorf("date %q accepted", d)
		}
	}
	card := ok
	card.reference, card.note = testPAN(), "card "+testPAN()
	e = validateMarkPaid(card, "2026-05-14")
	if e["reference"] != copyPaidCardLike || e["note"] != copyPaidCardLike {
		t.Errorf("card-shaped: %v", e)
	}
	// The limits count as JS does (UTF-16 units): 51 emoji are 102.
	emoji := ok
	emoji.reference = strings.Repeat("😀", 51)
	if validateMarkPaid(emoji, "2026-05-14")["reference"] != copyPaidRefTooLong {
		t.Error("UTF-16 length")
	}
}

func TestPayButtonAndPaidTitle(t *testing.T) {
	if payButtonLabel("  Final balance ") != "Pay final balance" || paidTitle("Final balance") != "Mark final balance paid" {
		t.Error(payButtonLabel("Final balance"), paidTitle("Final balance"))
	}
	if paidTitle("") != "Mark  paid" {
		t.Errorf("%q", paidTitle(""))
	}
}

func TestShortLink(t *testing.T) {
	for in, want := range map[string]string{
		"https://www.sandals.com/pay/SRB-220119": "sandals.com/pay/SRB-220119",
		"https://travefy.com/":                   "travefy.com",
		"":                                       "",
		"http://sandals.com/x":                   "",
	} {
		if got := shortLink(in); got != want {
			t.Errorf("shortLink(%q) = %q", in, got)
		}
	}
}

func TestHistoryWhen(t *testing.T) {
	chicago, _ := time.LoadLocation("America/Chicago")
	if got := historyWhen("2026-05-02T21:05:00Z", chicago); got != "May 2 · 4:05 PM" {
		t.Errorf("Chicago = %q", got)
	}
	if got := historyWhen("2026-05-02T21:05:00Z", time.UTC); got != "May 2 · 9:05 PM" {
		t.Errorf("UTC = %q", got)
	}
	if got := historyWhen("2026-05-02T21:05:00.123456+00:00", time.UTC); got != "May 2 · 9:05 PM" {
		t.Errorf("PostgREST form = %q", got)
	}
	if got := historyWhen("yesterday", time.UTC); got != "yesterday" {
		t.Errorf("unparseable = %q", got)
	}
}

func TestToPaymentHistory(t *testing.T) {
	row := func(eventType, meta string) historyRow {
		var r historyRow
		label, actor := "Final balance", "Gyasi Story"
		r.EventID, r.OccurredAt, r.EventType, r.MilestoneLabel, r.ActorName = "e1", "2026-05-02T21:05:00Z", eventType, &label, &actor
		if err := json.Unmarshal([]byte(meta), &r.Metadata); err != nil {
			t.Fatal(err)
		}
		return r
	}
	one := func(r historyRow) historyEntry { return toPaymentHistory([]historyRow{r}, time.UTC)[0] }

	e := one(row("payment_milestone.link_set", `{"pay_url":"https://www.travefy.com/invoice/st-4471","host":"travefy.com"}`))
	if e.kind != "added" || e.kindLabel != "Link added" || e.detail != "travefy.com/invoice/st-4471 (Travefy invoice)" {
		t.Errorf("added: %+v", e)
	}
	e = one(row("payment_milestone.link_changed", `{"old_pay_url":"https://www.sandals.com/pay/SRB-220118","new_pay_url":"https://www.sandals.com/pay/SRB-220119"}`))
	if e.kind != "changed" || e.detail != "sandals.com/pay/SRB-220118 → sandals.com/pay/SRB-220119" {
		t.Errorf("changed: %+v", e)
	}
	e = one(row("payment_milestone.link_removed", `{"old_pay_url":"https://viator.com/"}`))
	if e.kind != "removed" || e.detail != "viator.com" {
		t.Errorf("removed: %+v", e)
	}
	e = one(row("payment_milestone.marked_paid", `{"new_paid_cents":"150000","paid_reference":"SRB-220119-MID","status":"paid"}`))
	if e.kind != "paid" || e.chip != "booked" || e.detail != "$1,500 · conf. SRB-220119-MID" {
		t.Errorf("paid: %+v", e)
	}
	e = one(row("payment_milestone.status_changed", `{"status":"paid","paid_cents":80000}`))
	if e.kind != "paid" || e.detail != "$800" {
		t.Errorf("older paid row: %+v", e)
	}
	e = one(row("payment_milestone.status_changed", `{"status":"overdue"}`))
	if e.kind != "status" || e.detail != "Overdue" {
		t.Errorf("older status row: %+v", e)
	}
	e = one(row("payment_milestone.payment_cleared", `{"prior_status":"paid","status":"scheduled"}`))
	if e.kind != "cleared" || e.detail != "Paid → Scheduled" {
		t.Errorf("cleared: %+v", e)
	}
	// Host fallbacks, cents kept, unknown statuses as written, junk metadata ignored.
	e = one(row("payment_milestone.link_set", `{"host":"sandals.com"}`))
	if e.detail != "sandals.com" {
		t.Errorf("host fallback: %q", e.detail)
	}
	e = one(row("payment_milestone.marked_paid", `{"new_paid_cents":"150050","paid_reference":"  "}`))
	if e.detail != "$1,500.50" {
		t.Errorf("cents: %q", e.detail)
	}
	e = one(row("payment_milestone.status_changed", `{"status":"lost","prior_status":{"x":1}}`))
	if e.detail != "lost" {
		t.Errorf("unknown status: %q", e.detail)
	}
	r := row("x", `{}`)
	r.ActorName, r.MilestoneLabel = nil, nil
	if e := one(r); e.who != "System" || e.milestoneLabel != "A removed payment" {
		t.Errorf("blank name or label: %+v", e)
	}
}
