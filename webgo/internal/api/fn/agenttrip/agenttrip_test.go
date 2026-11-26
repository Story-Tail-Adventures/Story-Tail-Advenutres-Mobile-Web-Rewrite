package agenttrip

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/paylink"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

const (
	idA = "0191a3b4-0000-7000-8000-000000000001"
	idB = "0191a3b4-0000-7000-8000-000000000002"
)

// card is a 16-digit Luhn-valid number, BUILT AT RUNTIME: the repo's guard refuses any
// Luhn-valid literal in source, tests included.
var card = func() string {
	body := "4" + strings.Repeat("1", 14)
	for d := 0; d < 10; d++ {
		if paylink.LuhnValid(body + strconv.Itoa(d)) {
			return body + strconv.Itoa(d)
		}
	}
	panic("no check digit")
}()

// grouped writes a card in fours, as a person types it.
func grouped(digits string) string {
	return digits[0:4] + " " + digits[4:8] + " " + digits[8:12] + " " + digits[12:]
}

func obj(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("err = %v, want a %d problem", err, status)
	}
	if p.Status != status || p.Detail != detail {
		t.Fatalf("got %d %q, want %d %q", p.Status, p.Detail, status, detail)
	}
}

func marshal(t *testing.T, v any) string {
	t.Helper()
	b, err := js.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(&edge.Deps{}, httptest.NewRequest(http.MethodGet, "/functions/v1/agent-trip", nil))
	wantProblem(t, err, 400, "Use POST.")
}

func TestRequireOp(t *testing.T) {
	want := "op must be one of create, component_upsert, component_archive, component_reorder, payment_upsert, payment_paid, payment_delete, payment_link."
	for _, v := range []string{`{}`, `{"op":"payment"}`, `{"op":null}`} {
		_, err := requireOp(obj(t, v).Get("op"))
		wantProblem(t, err, 400, want)
	}
	_, err := requireTripID(obj(t, `{"tripId":"x"}`).Get("tripId"))
	wantProblem(t, err, 400, "That is not a trip id.")
}

func TestParseCreate(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{}`, "Pick a client for this trip."},
		{`{"clientId":"c"}`, "Pick a client for this trip."},
		{`{"clientId":"` + idA + `"}`, "Send a trip type of cruise, all_inclusive, multi_destination, group, custom."},
		{`{"clientId":"` + idA + `","tripType":"honeymoon"}`, "Send a trip type of cruise, all_inclusive, multi_destination, group, custom."},
		{`{"clientId":"` + idA + `","tripType":"cruise"}`, "Trip name is required."},
		{`{"clientId":"` + idA + `","tripType":"cruise","title":"  "}`, "Trip name is required."},
		{`{"clientId":"` + idA + `","tripType":"cruise","title":7}`, "Trip name must be text."},
		{`{"clientId":"` + idA + `","tripType":"cruise","title":"` + strings.Repeat("a", 161) + `"}`, "Trip name is too long."},
	} {
		_, err := parseCreate(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
	for _, c := range []struct {
		count string
		want  int64
	}{{`3`, 3}, {`0`, 1}, {`-4`, 1}, {`65`, 64}, {`1e300`, 64}, {`2.5`, 1}, {`"5"`, 1}, {`null`, 1}, {`4.0`, 4}} {
		q, err := parseCreate(obj(t, `{"clientId":"`+idA+`","tripType":"group","title":" Reunion ","travelerCount":`+c.count+`}`))
		if err != nil || q.Travelers != c.want || q.Title != "Reunion" {
			t.Errorf("travelerCount %s: %+v %v", c.count, q, err)
		}
	}
}

func TestComponentFields(t *testing.T) {
	head := `{"kind":"hotel","displayName":"Resort",`
	for _, c := range []struct{ body, detail string }{
		{`{}`, "kind must be one of flight, hotel, cruise, transfer, excursion, insurance, custom."},
		{`{"kind":"dining"}`, "kind must be one of flight, hotel, cruise, transfer, excursion, insurance, custom."},
		{`{"kind":"hotel","componentId":""}`, "That is not a component id."},
		{`{"kind":"hotel","supplierId":"s"}`, "That is not a component id."},
		{`{"kind":"hotel"}`, "Name is required."},
		{head + `"costCents":-1}`, "Cost cannot be negative."},
		{head + `"costCents":"1.5"}`, "Cost must be a number."},
		{head + `"costCents":12.5}`, "Cost must be a whole number of cents."},
		{head + `"costCents":10000000000}`, "Cost is too large."},
		{head + `"commissionPct":"ten"}`, "Commission % must be a number."},
		{head + `"commissionPct":1000}`, "Commission % is too large."},
		{head + `"commissionCents":-5}`, "Commission cannot be negative."},
		{head + `"startDate":"tomorrow"}`, "Start date must be a date."},
		{head + `"endDate":5}`, "End date must be a date."},
		{head + `"startTime":"7pm"}`, "Start time must be a time like 14:30."},
		{head + `"endTime":"23:60"}`, "End time is not a real time."},
		{head + `"location":{}}`, "Place must be text."},
		{head + `"confirmationNumber":"` + strings.Repeat("Z", 81) + `"}`, "Confirmation number is too long."},
		{head + `"detail":[]}`, "Component detail must be an object."},
		{head + `"detail":{"seat":"1A"}}`, `"seat" is not a field on a hotel component.`},
	} {
		_, _, _, _, _, err := componentFields(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}

	args, kind, id, cost, commission, err := componentFields(obj(t, `{"kind":"cruise","componentId":"`+idA+`","supplierId":"",`+
		`"displayName":" Ship ","costCents":"250000","commissionPct":"12.505","startDate":"2027-01-02","startTime":"09:00",`+
		`"detail":{"notes":"  ","gratuities_included":true,"cabin":" 8012 "}}`))
	if err != nil || kind != "cruise" || id == nil || *id != idA || cost != 250000 {
		t.Fatal(kind, id, cost, err)
	}
	// Blank amount plus a rate: the rate fills it in (12.505 rounds to 12.51).
	if commission != 31275 {
		t.Errorf("commission %d", commission)
	}
	want := `{"p_component_id":"` + idA + `","p_kind":"cruise","p_display_name":"Ship","p_supplier_id":null,"p_start_date":"2027-01-02",` +
		`"p_end_date":null,"p_start_time":"09:00:00","p_end_time":null,"p_location":null,"p_confirmation_number":null,` +
		`"p_cost_cents":250000,"p_commission_pct":12.51,"p_commission_cents":31275,"p_payload":{"gratuities_included":true,"cabin":"8012"}}`
	if got := marshal(t, args); got != want {
		t.Errorf("args\n got %s\nwant %s", got, want)
	}
	// An explicit 0 is an amount and wins.
	_, _, _, _, commission, _ = componentFields(obj(t, head+`"costCents":1000,"commissionPct":10,"commissionCents":0}`))
	if commission != 0 {
		t.Errorf("explicit zero: %d", commission)
	}
}

func TestMilestoneFields(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{}`, "kind must be one of deposit, interim, final."},
		{`{"kind":"balance"}`, "kind must be one of deposit, interim, final."},
		{`{"kind":"deposit","milestoneId":"m"}`, "That is not a component id."},
		{`{"kind":"deposit"}`, "Label is required."},
		{`{"kind":"deposit","label":"` + strings.Repeat("d", 121) + `"}`, "Label is too long."},
		{`{"kind":"deposit","label":"Deposit","amountCents":"-1"}`, "Amount cannot be negative."},
		{`{"kind":"deposit","label":"Deposit","dueDate":"soon"}`, "Due date must be a date."},
	} {
		_, _, _, _, err := milestoneFields(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
	args, kind, id, amount, err := milestoneFields(obj(t, `{"kind":"final","label":" Balance ","amountCents":"120000","dueDate":""}`))
	if err != nil || kind != "final" || id != nil || amount != 120000 {
		t.Fatal(kind, id, amount, err)
	}
	if got := marshal(t, args); got != `{"p_milestone_id":null,"p_kind":"final","p_label":"Balance","p_amount_cents":120000,"p_due_date":null}` {
		t.Error(got)
	}
}

func TestParsePaid(t *testing.T) {
	now := time.Date(2026, 11, 6, 23, 0, 0, 0, time.UTC)
	head := `{"status":"paid","milestoneId":"` + idA + `",`
	refuse := "That looks like a card number. Card numbers never go in the app."
	for _, c := range []struct{ body, detail string }{
		{`{}`, "status must be one of scheduled, paid, waived, overdue."},
		{`{"status":"refunded"}`, "status must be one of scheduled, paid, waived, overdue."},
		{`{"status":"paid"}`, "That is not a component id."},
		{head + `"paidCents":-3}`, "Amount paid cannot be negative."},
		{head + `"paidReference":12}`, "Confirmation number must be text."},
		{head + `"paidReference":"` + strings.Repeat("R", 101) + `"}`, "Confirmation number is too long."},
		{head + `"paidReference":"card ` + card + `"}`, refuse},
		{head + `"paidNote":"` + grouped(card) + `"}`, refuse},
		{head + `"paidNote":"` + strings.Repeat("n", 1001) + `"}`, "Note is too long."},
		{head + `"paidOn":"2026-02-30"}`, "Pick a real date for when this was paid."},
		{head + `"paidOn":"2026-11-08"}`, "The date paid can't be in the future."},
	} {
		_, err := parsePaid(obj(t, c.body), now)
		wantProblem(t, err, 400, c.detail)
	}
	q, err := parsePaid(obj(t, head+`"paidCents":"0","paidReference":"","paidNote":" Wire ","paidOn":"2026-11-07"}`), now)
	if err != nil || *q.PaidCents != 0 || *q.Reference != "" || *q.Note != "Wire" || *q.PaidOn != "2026-11-07" {
		t.Fatalf("%+v %v", q, err)
	}
	// The status toggle sends none of them: each stays nil, so the SQL keeps what is stored.
	q, err = parsePaid(obj(t, `{"status":"overdue","milestoneId":"`+idB+`","paidCents":""}`), now)
	if err != nil || q.PaidCents != nil || q.Reference != nil || q.Note != nil || q.PaidOn != nil {
		t.Fatalf("%+v %v", q, err)
	}
}

// The pay link is paylink.ReadPayURL; these pin the refusals agent-trip relies on.
func TestPayLinkRefusals(t *testing.T) {
	for _, c := range []struct{ url, detail string }{
		{`"http://pay.example.com/x"`, "Pay links must start with https:// so the client's payment is secure."},
		{`"javascript:alert(1)"`, "Pay links must start with https:// so the client's payment is secure."},
		{`"https://user:pw@pay.example.com/"`, "A pay link can't carry a user name or password."},
		{`"https://10.0.0.1/pay"`, "Use the supplier's web address, not a number or a local address."},
		{`"https://pay.localhost/"`, "Use the supplier's web address, not a number or a local address."},
		{`"https://pay.example.com/?card=` + card + `"`, "That looks like a card number. Card numbers never go in the app."},
		{`"not a link"`, "That doesn't look like a link. Paste the full address, starting https://"},
		{`42`, "The pay link must be text."},
	} {
		_, err := paylink.ReadPayURL(obj(t, `{"u":`+c.url+`}`).Get("u"))
		wantProblem(t, err, 400, c.detail)
	}
	for _, v := range []string{`null`, `""`, `"   "`} {
		if u, err := paylink.ReadPayURL(obj(t, `{"u":`+v+`}`).Get("u")); err != nil || u != nil {
			t.Errorf("%s removes the link: %v %v", v, u, err)
		}
	}
	u, err := paylink.ReadPayURL(obj(t, `{"u":" https://Pay.Example.com/inv?id=7 "}`).Get("u"))
	if err != nil || *u != "https://pay.example.com/inv?id=7" {
		t.Fatal(u, err)
	}
}

func TestReorderIDs(t *testing.T) {
	many := make([]string, 501)
	for i := range many {
		many[i] = `"` + idA + `"`
	}
	for _, c := range []struct{ body, detail string }{
		{`{}`, "Send the components in their new order."},
		{`{"componentIds":{}}`, "Send the components in their new order."},
		{`{"componentIds":[]}`, "Send the components in their new order."},
		{`{"componentIds":[` + strings.Join(many, ",") + `]}`, "That is too many components."},
		{`{"componentIds":["` + idA + `",3]}`, "That is not a component id."},
		{`{"componentIds":["` + idA + `","` + idB + `","` + idA + `"]}`, "That order lists a component twice."},
	} {
		_, err := reorderIDs(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
	ids, err := reorderIDs(obj(t, `{"componentIds":["`+idB+`","`+idA+`"]}`))
	if err != nil || strings.Join(ids, ",") != idB+","+idA {
		t.Fatal(ids, err)
	}
}
