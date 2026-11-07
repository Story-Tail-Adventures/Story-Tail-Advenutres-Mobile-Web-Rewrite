package trips_test

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

const (
	msDeposit = "0195a2c0-1a00-7000-8000-0000000000b1"
	msFinal   = "0195a2c0-1a00-7000-8000-0000000000b2"
)

// The deposit is paid in full (with a private note); the final balance is open, with a link.
const schedJSON = `[
 {"milestone_id":"` + msDeposit + `","kind":"deposit","label":"Deposit","amount_cents":"100000","paid_cents":"100000","currency":"USD","due_date":"2026-08-01","paid_at":"2026-08-01T10:00:00Z","status":"paid","order_index":0,"pay_url":null,"paid_reference":"SRB-1","paid_note":"left a voicemail"},
 {"milestone_id":"` + msFinal + `","kind":"final","label":"Final balance","amount_cents":"1184500","paid_cents":"0","currency":"USD","due_date":"2026-09-14","paid_at":null,"status":"scheduled","order_index":1,"pay_url":"https://www.sandals.com/pay/x","paid_reference":null,"paid_note":"call them <first>"}]`

func paymentsApp(t *testing.T) *app {
	a := detailApp(t)
	a.fake.read("agent_trip_payments", schedJSON)
	return a
}

func payURL(q string) string { return "/agent/trips/" + tripID + "/payments" + q }

func chicagoToday() string {
	loc, _ := time.LoadLocation("America/Chicago")
	return time.Now().In(loc).Format("2006-01-02")
}

func TestPaymentSchedule(t *testing.T) {
	a := paymentsApp(t)
	rec := a.get(payURL(""))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Payments · Story-Tail Adventures</title>", "Back to the trip", "Jordan Hayes", "Anniversary &lt;Week&gt;",
		"What the supplier expects, and when.", ">$12,845<", ">$1,000<", "Payment schedule",
		`href="/agent/trips/`+tripID+`/payments/history"`,
		// Remind is about the next unpaid row, client then trip then remind.
		`href="/agent/messages/new?client=c-1&amp;trip=`+tripID+`&amp;remind=`+msFinal+`"`,
		"Deposit", "Final balance", "$11,845", "Paid ", "Due ",
		`title="https://www.sandals.com/pay/x"`, ">sandals.com<", `aria-label="Change the Final balance pay link"`,
		"No pay link yet", " — Deposit", `href="/agent/trips/`+tripID+`/payments?paid=`+msFinal+`"`,
		`href="/agent/trips/`+tripID+`/payments?edit=`+msDeposit+`"`, "Remove Deposit — Removing a payment takes it off the schedule for good.",
		`aria-label="Mark this — Deposit"`, `aria-label="Amount that arrived — Final balance"`,
		"Clients pay suppliers directly.", "Add a payment")
	body := rec.Body.String()
	// Only the open row offers Mark paid and Send link; the paid one has its status selected.
	if n := strings.Count(body, ">Mark paid<"); n != 1 {
		t.Errorf("%d Mark paid links", n)
	}
	if !strings.Contains(body, `value="paid" title="The money has moved." data-slot="st-paid" selected=""`) {
		t.Error("the paid row's status is not selected")
	}
	// paid_note is the advisor's alone, and only inside Mark Paid: never on the schedule.
	lacks(t, rec, "left a voicemail", "call them", `data-slot="link-dialog"`, `data-slot="paid-dialog"`, "Edit this payment", `aria-current="true"`, ">Travefy invoice<")
	lacks(t, rec, `data-slot="remind-off"`)

	// Edit opens the form on the row, unformatted.
	rec = a.get(payURL("?edit=" + msFinal))
	has(t, rec, "Edit this payment", `name="milestoneId" value="`+msFinal+`" data-slot="form-id"`, `value="11845.00"`,
		`value="Final balance"`, `value="2026-09-14"`, `value="final" data-slot="kind-final" selected=""`, `data-slot="form-cancel"`,
		`aria-current="true"`, "trp-pay-editing")

	// Nothing owed: Remind is off and says why. Nothing scheduled: the empty card.
	b := detailApp(t)
	b.fake.read("agent_trip_payments", strings.Replace(schedJSON, `"status":"scheduled"`, `"status":"waived"`, 1))
	has(t, b.get(payURL("")), `data-slot="remind-off"`, ". Nothing is still owed on this trip")
	b.fake.read("agent_trip_payments", `[]`)
	has(t, b.get(payURL("")), "No schedule yet", "Add the deposit when the supplier confirms it.")

	// Not there, a bad id, a failed read.
	b.fake.read("agent_trip_overview", `[]`)
	if rec := b.get(payURL("")); rec.Code != 404 {
		t.Errorf("not found = %d", rec.Code)
	}
	c := paymentsApp(t)
	c.fake.reads["agent_trip_payments"] = reply{500, `{}`}
	has(t, c.get(payURL("")), "That didn’t load")
}

func TestPayLinkAndMarkPaidDialogs(t *testing.T) {
	a := paymentsApp(t)
	rec := a.get(payURL("?link=" + msFinal))
	has(t, rec, `data-slot="link-dialog"`, "Edit pay link", `value="https://www.sandals.com/pay/x"`, ">sandals.com<",
		"Pay final balance ", ">Remove link<", "Final balance", "Anniversary &lt;Week&gt; · Jordan Hayes", "due Sep 14",
		`data-trp-close-href="/agent/trips/`+tripID+`/payments"`, "This change is recorded in the trip&#39;s payment history")
	rec = a.get(payURL("?link=" + msDeposit))
	has(t, rec, "Add a pay link</h2>", `data-trp-label="Deposit" hidden=""`)
	lacks(t, rec, ">Remove link<")

	rec = a.get(payURL("?paid=" + msFinal))
	has(t, rec, `data-slot="paid-dialog"`, "Mark final balance paid", `value="11845.00"`, `value="`+chicagoToday()+`"`,
		`max="`+chicagoToday()+`"`, "call them &lt;first&gt;</textarea>", "Only you see this.")
	// A settled row opens nothing; neither does a row that is not there.
	lacks(t, a.get(payURL("?paid="+msDeposit)), `data-slot="paid-dialog"`, "left a voicemail")
	lacks(t, a.get(payURL("?link=nope")), `data-slot="link-dialog"`)
}

func TestSaveMilestone(t *testing.T) {
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{200, `{}`})
	rec := a.post(payURL("/milestone"), url.Values{"kind": {"interim"}, "label": {" Interim "}, "amount": {"$1,500.50"}, "dueDate": {"2026-10-01"}, "status": {"paid"}})
	if rec.Code != 303 || rec.Header().Get("Location") != payURL("") {
		t.Fatalf("save = %d %q", rec.Code, rec.Header().Get("Location"))
	}
	c := a.fake.calls("agent-trip")[0].body
	jsonEq(t, c, "op", `"payment_upsert"`)
	jsonEq(t, c, "kind", `"interim"`)
	jsonEq(t, c, "label", `"Interim"`)
	jsonEq(t, c, "amountCents", `150050`)
	jsonEq(t, c, "dueDate", `"2026-10-01"`)
	for _, k := range []string{"milestoneId", "status", "paidCents"} {
		if _, sent := c[k]; sent {
			t.Errorf("%s was sent", k)
		}
	}

	// Field errors: 422, nothing sent, each against its field.
	rec = a.post(payURL("/milestone"), url.Values{"kind": {"final"}, "milestoneId": {msFinal}, "label": {""}, "amount": {"0"}})
	if rec.Code != 422 || len(a.fake.calls("agent-trip")) != 1 {
		t.Errorf("invalid = %d", rec.Code)
	}
	has(t, rec, "Give it a name — it&#39;s the line the client reads.", "A payment needs an amount.",
		`aria-describedby="milestone-amount-error"`, `aria-describedby="milestone-label-error"`, "Edit this payment", `aria-current="true"`)
	lacks(t, rec, "What the supplier expects on this date.")

	// The function's sentence, and an outage's.
	a.fake.fn("agent-trip", reply{422, `{"detail":"That payment is not on this trip."}`}, reply{503, `{}`})
	has(t, a.post(payURL("/milestone"), url.Values{"label": {"A"}, "amount": {"1"}}), "That payment is not on this trip.")
	has(t, a.post(payURL("/milestone"), url.Values{"label": {"A"}, "amount": {"1"}}), "That didn&#39;t save. Try again in a moment.")
}

func TestStatusAndDelete(t *testing.T) {
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{200, `{}`})
	if rec := a.post(payURL("/status"), url.Values{"milestoneId": {msFinal}, "status": {"paid"}, "paidAmount": {"500"}}); rec.Code != 303 {
		t.Errorf("status = %d", rec.Code)
	}
	c := a.fake.calls("agent-trip")[0].body
	jsonEq(t, c, "op", `"payment_paid"`)
	jsonEq(t, c, "status", `"paid"`)
	jsonEq(t, c, "paidCents", `50000`)
	// Not a number, or blank: the whole amount (no paidCents).
	a.post(payURL("/status"), url.Values{"milestoneId": {msFinal}, "status": {"waived"}, "paidAmount": {"lots"}})
	if _, sent := a.fake.calls("agent-trip")[1].body["paidCents"]; sent {
		t.Error("a non-number was sent")
	}
	// A status outside the four, or a forged id: nothing.
	a.post(payURL("/status"), url.Values{"milestoneId": {msFinal}, "status": {"cancelled"}})
	a.post(payURL("/status"), url.Values{"milestoneId": {"m-1"}, "status": {"paid"}})
	if n := len(a.fake.calls("agent-trip")); n != 2 {
		t.Errorf("%d calls", n)
	}
	if rec := a.post(payURL("/delete"), url.Values{"milestoneId": {msDeposit}}); rec.Code != 303 || rec.Header().Get("Location") != payURL("") {
		t.Errorf("delete = %d", rec.Code)
	}
	jsonEq(t, a.fake.calls("agent-trip")[2].body, "op", `"payment_delete"`)
	jsonEq(t, a.fake.calls("agent-trip")[2].body, "milestoneId", `"`+msDeposit+`"`)
}

func TestSetPayLink(t *testing.T) {
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{200, `{"outcome":"set"}`})
	rec := a.post(payURL("/link"), url.Values{"milestoneId": {msDeposit}, "payUrl": {"  https://Www.Sandals.com/pay/1 "}, "intent": {"save"}})
	if rec.Code != 303 || rec.Header().Get("Location") != payURL("") {
		t.Fatalf("set = %d", rec.Code)
	}
	c := a.fake.calls("agent-trip")[0].body
	jsonEq(t, c, "op", `"payment_link"`)
	jsonEq(t, c, "milestoneId", `"`+msDeposit+`"`)
	// Sent as typed (trimmed): the function normalises with new URL() and stores its href.
	jsonEq(t, c, "payUrl", `"https://Www.Sandals.com/pay/1"`)

	// Remove sends null, whatever the field held.
	a.post(payURL("/link"), url.Values{"milestoneId": {msFinal}, "payUrl": {"https://x.com"}, "intent": {"remove"}})
	jsonEq(t, a.fake.calls("agent-trip")[1].body, "payUrl", `null`)

	// Refused here: 422, the dialog back with what was typed, nothing sent.
	for in, want := range map[string]string{
		"http://sandals.com/pay":                     "Use a full link that starts with https://",
		"https://a.com/" + strings.Repeat("x", 2100): "That link is too long.",
		"https://localhost/pay":                      "Use a full link that starts with https://",
		"https://a.com/pay?card=" + luhnForTests():   "That looks like a card number.",
	} {
		rec := a.post(payURL("/link"), url.Values{"milestoneId": {msFinal}, "payUrl": {in}})
		if rec.Code != 422 {
			t.Errorf("%.30q = %d", in, rec.Code)
		}
		has(t, rec, want, `aria-describedby="pay-url-error"`, `data-slot="link-dialog"`)
		if strings.Contains(rec.Body.String(), luhnForTests()) {
			t.Error("a card-shaped link was rendered")
		}
	}
	if n := len(a.fake.calls("agent-trip")); n != 2 {
		t.Errorf("%d calls", n)
	}
	// The function's own refusal.
	a.fake.fn("agent-trip", reply{400, `{"detail":"Use the supplier's web address, not a number or a local address."}`})
	has(t, a.post(payURL("/link"), url.Values{"milestoneId": {msFinal}, "payUrl": {"https://pay.example.test/x"}}),
		"Use the supplier&#39;s web address, not a number or a local address.", `value="https://pay.example.test/x"`)
}

// luhnForTests builds a card-shaped number at runtime (the repo's PAN guard refuses literals).
func luhnForTests() string {
	for c := '0'; c <= '9'; c++ {
		n := "4" + strings.Repeat("1", 14) + string(c)
		sum := 0
		for i := len(n) - 1; i >= 0; i-- {
			d := int(n[i] - '0')
			if (len(n)-1-i)%2 == 1 {
				d *= 2
				if d > 9 {
					d -= 9
				}
			}
			sum += d
		}
		if sum%10 == 0 {
			return n
		}
	}
	return ""
}

func TestMarkPaid(t *testing.T) {
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{200, `{}`})
	today := chicagoToday()
	rec := a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "amount": {"11845.00"}, "paidOn": {today}, "reference": {" SRB-2 "}, "note": {"Line\r\ntwo"}})
	if rec.Code != 303 {
		t.Fatalf("paid = %d", rec.Code)
	}
	c := a.fake.calls("agent-trip")[0].body
	jsonEq(t, c, "op", `"payment_paid"`)
	jsonEq(t, c, "status", `"paid"`)
	jsonEq(t, c, "paidCents", `1184500`)
	jsonEq(t, c, "paidOn", `"`+today+`"`)
	jsonEq(t, c, "paidReference", `"SRB-2"`)
	jsonEq(t, c, "paidNote", `"Line\ntwo"`)

	// Blank amount: the whole amount; blank reference and note still go (they clear).
	a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {today}})
	c = a.fake.calls("agent-trip")[1].body
	if _, sent := c["paidCents"]; sent {
		t.Error("blank amount sent")
	}
	jsonEq(t, c, "paidReference", `""`)
	jsonEq(t, c, "paidNote", `""`)

	// Refused here: a future date, a card-shaped reference. Nothing sent.
	rec = a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {"2999-01-01"}, "reference": {luhnForTests()}, "amount": {"0"}})
	if rec.Code != 422 || len(a.fake.calls("agent-trip")) != 2 {
		t.Errorf("refused = %d", rec.Code)
	}
	has(t, rec, "Pick the date the money landed. It can&#39;t be in the future.", "That looks like a card number.",
		"That doesn&#39;t look like an amount.", `aria-describedby="paid-on-error"`, `aria-describedby="paid-reference-error"`, "Mark final balance paid")
	// The card-shaped number is never echoed back into the page (Next kept it in the field;
	// a server-rendered page would be writing it into HTML). The pay link likewise.
	if strings.Contains(rec.Body.String(), luhnForTests()) {
		t.Error("a card-shaped number was rendered")
	}
	rec = a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {today}, "note": {"card " + luhnForTests()}, "reference": {"ok-1"}})
	has(t, rec, "That looks like a card number.", `value="ok-1"`)
	if strings.Contains(rec.Body.String(), luhnForTests()) {
		t.Error("a card-shaped note was rendered")
	}
	// A refusal from the function itself: its sentence, and the (harmless) typed text kept.
	a.fake.fn("agent-trip", reply{400, `{"detail":"That date is before the trip was booked."}`})
	rec = a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {today}, "reference": {"SRB-9"}})
	if len(a.fake.calls("agent-trip")) != 3 {
		t.Error("the function was not asked")
	}
	has(t, rec, "That date is before the trip was booked.", `value="SRB-9"`)
	a.fake.fn("agent-trip", reply{200, `{}`})

	a.fake.fn("agent-trip", reply{422, `{"detail":"That payment is already settled."}`})
	has(t, a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {today}}), "That payment is already settled.", `data-slot="paid-dialog"`)
}

func TestPaymentsAccess(t *testing.T) {
	a := paymentsApp(t)
	a.fake.role = "admin"
	for _, p := range []string{"/milestone", "/status", "/delete", "/link", "/paid"} {
		if rec := a.post(payURL(p), url.Values{"milestoneId": {msFinal}, "label": {"x"}, "amount": {"1"}, "status": {"paid"}, "paidOn": {"2026-01-01"}}); rec.Code != 403 {
			t.Errorf("admin %s = %d", p, rec.Code)
		}
	}
	if len(a.fake.calls("agent-trip")) != 0 {
		t.Error("an admin's post reached the function")
	}
	b := paymentsApp(t)
	for _, p := range []string{"/milestone", "/status", "/delete", "/link", "/paid"} {
		if rec := b.get(payURL(p)); rec.Code != 303 || rec.Header().Get("Location") != payURL("") {
			t.Errorf("GET %s = %d %q", p, rec.Code, rec.Header().Get("Location"))
		}
	}
}

var historyJSON = `[
 {"event_id":"e2","occurred_at":"2026-05-02T21:05:00Z","event_type":"payment_milestone.marked_paid","milestone_id":"` + msDeposit + `","milestone_label":"Deposit","actor_name":"Gyasi Story","metadata":{"new_paid_cents":"100000","paid_reference":"SRB-1","status":"paid"}},
 {"event_id":"e1","occurred_at":"2026-05-01T15:00:00Z","event_type":"payment_milestone.link_set","milestone_id":"` + strings.ToUpper(msFinal) + `","milestone_label":"Final balance","actor_name":null,"metadata":{"pay_url":"https://www.sandals.com/pay/x","host":"sandals.com"}},
 {"event_id":"e0","occurred_at":"2026-04-30T15:00:00Z","event_type":"payment_milestone.link_removed","milestone_id":null,"milestone_label":null,"actor_name":"Gyasi Story","metadata":{"old_host":"viator.com"}}]`

func TestPaymentHistory(t *testing.T) {
	a := paymentsApp(t)
	a.fake.read("agent_trip_payment_history", historyJSON)
	rec := a.get(payURL("/history"))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec, "<title>Payment history · Story-Tail Adventures</title>", "Payment history · Anniversary &lt;Week&gt;",
		"May 2 · 4:05 PM", "Marked paid", "status-booked", "$1,000 · conf. SRB-1", "Link added", "status-traveling",
		"sandals.com/pay/x", "System", "A removed payment", "viator.com", "All payments",
		`href="/agent/trips/`+tripID+`/payments/history?m=`+msFinal+`"`, `href="/agent/trips/`+tripID+`/payments"`)
	if !strings.Contains(rec.Body.String(), `aria-current="page"`) {
		t.Error("All payments is not the current chip")
	}
	// Narrowed to one payment, case-insensitively; a non-id shows everything.
	rec = a.get(payURL("/history?m=" + msFinal))
	has(t, rec, "Link added")
	lacks(t, rec, "Marked paid", "viator.com")
	has(t, a.get(payURL("/history?m=nope")), "Marked paid", "Link added")
	// Nothing recorded; the payments read failing only hides the chips.
	a.fake.read("agent_trip_payment_history", `[]`)
	has(t, a.get(payURL("/history")), "Nothing recorded yet.")
	a.fake.reads["agent_trip_payments"] = reply{500, `{}`}
	rec = a.get(payURL("/history"))
	has(t, rec, "Nothing recorded yet.")
	lacks(t, rec, "All payments")
	// The history read failing is the retry state; a gone trip 404s.
	a.fake.reads["agent_trip_payment_history"] = reply{500, `{}`}
	has(t, a.get(payURL("/history")), "That didn’t load")
	a.fake.read("agent_trip_overview", `[]`)
	if rec := a.get(payURL("/history")); rec.Code != 404 {
		t.Errorf("gone = %d", rec.Code)
	}
}

// fullwidth writes digits as U+FF10..U+FF19; IDNA maps them back to ASCII.
func fullwidth(s string) string {
	var b strings.Builder
	for _, r := range s {
		b.WriteRune(r - '0' + 0xFF10)
	}
	return b.String()
}

// A refused form never writes a card-shaped number back into the page, in any field and in
// any spelling checkPayURL normalises, and nothing is sent for it.
func TestPaymentsNeverEchoACard(t *testing.T) {
	pan := luhnForTests()
	dashed := pan[:4] + "-" + pan[4:8] + "-" + pan[8:12] + "-" + pan[12:]
	softHyphens := pan[:4] + "\u00ad" + pan[4:8] + "\u00ad" + pan[8:12] + "\u00ad" + pan[12:]
	clean := func(t *testing.T, body string, forms ...string) {
		t.Helper()
		for _, f := range append(forms, pan, dashed) {
			if strings.Contains(body, f) {
				t.Errorf("%q rendered", f)
			}
		}
	}
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{400, `{"detail":"That date does not look right."}`})

	for _, host := range []string{fullwidth(pan), softHyphens} {
		rec := a.post(payURL("/link"), url.Values{"milestoneId": {msFinal}, "payUrl": {"https://" + host + ".example.com/pay"}})
		if rec.Code != 422 {
			t.Errorf("card host = %d", rec.Code)
		}
		has(t, rec, "That looks like a card number.")
		clean(t, rec.Body.String(), host)
		if strings.Contains(rec.Body.String(), `data-slot="link-site">`) && !strings.Contains(rec.Body.String(), `data-slot="link-site"></p>`) {
			t.Error("the preview names a site for a refused card link")
		}
	}

	// The milestone form: an amount, a label, a due date the function refuses.
	rec := a.post(payURL("/milestone"), url.Values{"label": {"Deposit"}, "amount": {dashed}})
	has(t, rec, "That doesn&#39;t look like an amount.")
	clean(t, rec.Body.String())
	rec = a.post(payURL("/milestone"), url.Values{"label": {"Deposit " + pan}, "amount": {"10"}})
	if rec.Code != 422 {
		t.Errorf("card label = %d", rec.Code)
	}
	has(t, rec, "That looks like a card number. Card numbers never go in the app.")
	clean(t, rec.Body.String())
	rec = a.post(payURL("/milestone"), url.Values{"label": {"Deposit"}, "amount": {"10"}, "dueDate": {pan}})
	has(t, rec, "That date does not look right.")
	clean(t, rec.Body.String())
	// A milestone id that is no row is not sent at all.
	n := len(a.fake.calls("agent-trip"))
	if rec := a.post(payURL("/milestone"), url.Values{"milestoneId": {pan}, "label": {"D"}, "amount": {"10"}}); rec.Code != 303 || len(a.fake.calls("agent-trip")) != n {
		t.Errorf("forged milestone id = %d", rec.Code)
	}

	// Mark Paid's date.
	rec = a.post(payURL("/paid"), url.Values{"milestoneId": {msFinal}, "paidOn": {pan}})
	has(t, rec, "Pick the date the money landed.")
	clean(t, rec.Body.String())
}

// "Amount that arrived" too large for cents: Next sends it and the function refuses, so
// nothing moves. Here nothing is sent; leaving paidCents out would mark it paid in full.
func TestStatusAmountTooLargeSendsNothing(t *testing.T) {
	a := paymentsApp(t)
	a.fake.fn("agent-trip", reply{200, `{}`})
	for _, amt := range []string{"50000000000000000", "$99,999,999,999,999,999.99", luhnForTests() + "123"} {
		if rec := a.post(payURL("/status"), url.Values{"milestoneId": {msFinal}, "status": {"paid"}, "paidAmount": {amt}}); rec.Code != 303 {
			t.Errorf("%s = %d", amt, rec.Code)
		}
	}
	if n := len(a.fake.calls("agent-trip")); n != 0 {
		t.Errorf("%d calls", n)
	}
	// Not a number at all still means "the whole amount", as in Next.
	a.post(payURL("/status"), url.Values{"milestoneId": {msFinal}, "status": {"paid"}, "paidAmount": {"lots"}})
	if c := a.fake.calls("agent-trip"); len(c) != 1 {
		t.Errorf("%d calls", len(c))
	} else if _, sent := c[0].body["paidCents"]; sent {
		t.Error("a non-number was sent")
	}
}
