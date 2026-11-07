//go:build difftest && difftest_reports

package difftest

import (
	"context"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentreport"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-report"] = api.Port{Gate: api.GateUser, Fn: agentreport.Func}
}

func repMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// repInsert inserts one row and deletes it at cleanup (cleanups run last-in first-out, so
// children inserted after their parents go first).
func repInsert(t *testing.T, w *World, table, label string, row js.Ordered) string {
	t.Helper()
	id := uuid.New()
	repMust(t, S.DB.From(table).Insert(context.Background(), js.O("id", id).Spread(row), nil))
	if label != "" {
		w.ID(label, id)
	}
	t.Cleanup(func() { _ = S.DB.From(table).Eq("id", id).Delete(context.Background(), nil) })
	return id
}

// repBook gives world w an advisor's book every report has something to say about: two
// clients (one with a formula-looking name and a mailing address), five trips across the
// stages with their status history, commission lines in four statuses, and three payment
// milestones. Everything is fresh and belongs to w's advisor; seed rows are not touched.
func repBook(t *testing.T, w *World) {
	t.Helper()
	agentID, pu := w.Agent.AgentID, w.Agent.PlatformUserID
	supplier := repInsert(t, w, "supplier", "supplier", js.O("name", "Diff Supplier "+w.Tag, "kind", "resort",
		"default_commission_pct", 12))
	addr := repInsert(t, w, "address", "address", js.O("line1", `12 "Quoted" Lane`, "line2", nil, "city", "Montreal",
		"region", "QC", "postal_code", "H2X 1Y4", "country", "CA"))
	eve := repInsert(t, w, "client", "eve", js.O("agent_id", agentID, "first_name", "=Eve", "last_name", "O'Hara, Jr",
		"email", "difftest-eve-"+w.Tag+"@example.com", "phone", "+1-555-0199", "mailing_address_id", addr))
	traveler := w.Traveler.ClientID

	trip := func(label, client, title, status string, start, end any, dest []string, value, commission int64) string {
		return repInsert(t, w, "trip", label, js.O("client_id", client, "agent_id", agentID, "title", title,
			"trip_type", "custom", "status", status, "start_date", start, "end_date", end, "destinations", dest,
			"total_value_cents", value, "total_commission_cents", commission, "currency", "USD"))
	}
	t1 := trip("t1", traveler, "Anniversary Week in Negril", "booked", "2027-02-10", "2027-02-17", []string{"Negril, Jamaica"}, 1284500, 154140)
	// Created 54.5 days before it was first booked: the funnel's average has a decimal.
	repMust(t, S.DB.From("trip").Eq("id", t1).Update(context.Background(), js.O("created_at", "2026-01-20T03:00:00Z"), nil))
	t2 := trip("t2", eve, "+Lake Como", "completed", "2026-06-01", "2026-06-08", []string{"Lake Como, Italy", "Milan"}, 500000, 60000)
	trip("t3", eve, "Someday", "inquiry", nil, nil, []string{}, 0, 0)
	t4 := trip("t4", traveler, "Alps at Christmas", "proposal", "2026-12-05", "2026-12-12", []string{"Zermatt"}, 250000, 30000)
	t5 := trip("t5", traveler, "Called off", "cancelled", "2026-04-01", "2026-04-05", []string{"Negril, Jamaica"}, 100000, 0)

	history := func(trip, from, to, at string) {
		var f any = from
		if from == "" {
			f = nil
		}
		repInsert(t, w, "trip_status_history", "", js.O("trip_id", trip, "from_status", f, "to_status", to,
			"changed_at", at, "changed_by_user_id", pu))
	}
	history(t1, "inquiry", "proposal", "2026-02-01T15:00:00Z")
	history(t1, "proposal", "booked", "2026-03-15T15:00:00Z")
	history(t2, "proposal", "booked", "2025-08-20T15:00:00Z")
	history(t2, "booked", "in_progress", "2026-06-01T15:00:00Z")
	history(t2, "in_progress", "completed", "2026-06-08T15:00:00Z")
	history(t4, "inquiry", "proposal", "2026-10-05T15:00:00Z")
	history(t5, "inquiry", "cancelled", "2026-03-01T15:00:00Z")

	line := func(label, trip string, gross int64, pct float64, expected int64, cols js.Ordered) {
		row := js.O("trip_id", trip, "agent_id", agentID, "supplier_id", supplier, "gross_booking_cents", gross,
			"commission_pct", pct, "expected_commission_cents", expected, "processing_fee_cents", 0,
			"received_commission_cents", 0, "currency", "USD", "payment_terms", "after_travel",
			"payment_lag_days", 60, "status", "expected")
		repInsert(t, w, "commission", label, row.Spread(cols))
	}
	line("c1", t2, 500000, 12, 60000, js.O("status", "received", "received_commission_cents", 59000,
		"processing_fee_cents", 1000, "received_at", "2026-07-15", "inteletravel_reference", "ITV-1"))
	line("c2", t1, 1284500, 12, 154140, js.O("status", "invoiced"))
	line("c3", t5, 100000, 10, 10000, js.O("status", "lost"))
	line("c4", t2, 10000, 10, 1000, js.O("status", "disputed", "received_commission_cents", 100, "received_at", "2025-12-10"))

	milestone := func(label, trip, kind, name string, amount int64, due, status string, cols js.Ordered) {
		row := js.O("trip_id", trip, "kind", kind, "label", name, "amount_cents", amount, "currency", "USD",
			"due_date", due, "status", status)
		repInsert(t, w, "payment_milestone", label, row.Spread(cols))
	}
	milestone("m1", t1, "deposit", "Deposit", 50000, "2026-03-20", "paid", js.O("paid_cents", 50000,
		"paid_at", "2026-03-20T16:00:00Z", "paid_reference", "SRB-1", "order_index", 0))
	milestone("m2", t1, "final", "=Final balance", 1234500, "2026-12-01", "scheduled", js.O("order_index", 1,
		"pay_url", "https://www.sandals.com/pay/SRB-2"))
	milestone("m3", t4, "interim", "Hold, then pay", 25000, "2026-10-15", "overdue", nil)
}

func TestAgentReport(t *testing.T) {
	deno, goW := NewWorlds(t)
	repBook(t, deno)
	repBook(t, goW)

	c := func(name, body string, expect int) Case {
		return Case{Name: name, Fn: "agent-report", Body: func(*World) string { return body }, Expect: expect}
	}
	Run(t, deno, goW, []Case{
		// ---- the door ----
		{Name: "GET", Fn: "agent-report", Method: "GET", Expect: 400},
		{Name: "traveler", Fn: "agent-report", Token: func(w *World) string { return w.Traveler.Token },
			Body: func(*World) string { return `{"op":"export","report":"clients"}` }, Expect: 403},
		c("not json", `report=clients`, 400),
		c("an array", `["export"]`, 400),
		c("no op", `{"report":"clients"}`, 400),
		c("unknown op", `{"op":"download","report":"clients"}`, 400),

		// ---- each report's Export: validation ----
		c("export: no report", `{"op":"export"}`, 400),
		c("export: unknown report", `{"op":"export","report":"leads","period":"ytd"}`, 400),
		c("export: no period", `{"op":"export","report":"suppliers"}`, 400),
		c("export: unknown period", `{"op":"export","report":"destinations","period":"all"}`, 400),
		c("export: revenue without a basis", `{"op":"export","report":"revenue","period":"ytd"}`, 400),
		c("export: revenue with an unknown basis", `{"op":"export","report":"revenue","period":"ytd","basis":"paid"}`, 400),
		c("export: basis on suppliers", `{"op":"export","report":"suppliers","period":"ytd","basis":"booked"}`, 400),
		c("export: period on clients", `{"op":"export","report":"clients","period":"ytd"}`, 400),
		c("export: period on the pipeline", `{"op":"export","report":"pipeline","period":"qtd"}`, 400),
		c("export: basis on the funnel", `{"op":"export","report":"funnel","period":"ytd","basis":"received"}`, 400),

		// ---- each report's Export: the files ----
		c("export: revenue booked ytd", `{"op":"export","report":"revenue","period":"ytd","basis":"booked"}`, 200),
		c("export: revenue received 12mo", `{"op":"export","report":"revenue","period":"12mo","basis":"received"}`, 200),
		c("export: revenue booked qtd", `{"op":"export","report":"revenue","period":"qtd","basis":"booked"}`, 200),
		c("export: suppliers ytd", `{"op":"export","report":"suppliers","period":"ytd"}`, 200),
		c("export: suppliers 12mo", `{"op":"export","report":"suppliers","period":"12mo","basis":null}`, 200),
		c("export: destinations 12mo", `{"op":"export","report":"destinations","period":"12mo"}`, 200),
		c("export: destinations qtd", `{"op":"export","report":"destinations","period":"qtd"}`, 200),
		c("export: clients", `{"op":"export","report":"clients","period":null}`, 200),
		c("export: funnel ytd", `{"op":"export","report":"funnel","period":"ytd"}`, 200),
		c("export: funnel qtd", `{"op":"export","report":"funnel","period":"qtd"}`, 200),
		c("export: pipeline", `{"op":"export","report":"pipeline","extra":1}`, 200),

		// ---- Export Center: validation ----
		c("center: no type", `{"op":"center"}`, 400),
		c("center: unknown type", `{"op":"center","type":"leads","from":"2026-01-01","to":"2026-12-31"}`, 400),
		c("center: no From", `{"op":"center","type":"trips","to":"2026-12-31"}`, 400),
		c("center: no To", `{"op":"center","type":"ledger","from":"2026-01-01"}`, 400),
		c("center: an impossible From", `{"op":"center","type":"milestones","from":"2026-02-30","to":"2026-12-31"}`, 400),
		c("center: an impossible To", `{"op":"center","type":"milestones","from":"2026-01-01","to":"2026-13-01"}`, 400),
		c("center: year zero", `{"op":"center","type":"trips","from":"0000-01-01","to":"2026-12-31"}`, 400),
		c("center: From after To", `{"op":"center","type":"trips","from":"2026-12-31","to":"2026-01-01"}`, 400),
		c("center: clients with dates", `{"op":"center","type":"clients","from":"2026-01-01","to":"2026-12-31"}`, 400),
		c("center: contact as text", `{"op":"center","type":"clients","includeContact":"true"}`, 400),
		c("center: contact on trips", `{"op":"center","type":"trips","from":"2026-01-01","to":"2026-12-31","includeContact":true}`, 400),

		// ---- Export Center: the files ----
		c("center: ledger", `{"op":"center","type":"ledger","from":"2025-01-01","to":"2027-12-31","includeContact":false}`, 200),
		c("center: ledger, a narrow window", `{"op":"center","type":"ledger","from":"2026-06-01","to":"2026-06-01"}`, 200),
		c("center: trips", `{"op":"center","type":"trips","from":"2026-01-01","to":"2027-12-31"}`, 200),
		c("center: milestones", `{"op":"center","type":"milestones","from":"2026-01-01","to":"2026-12-31"}`, 200),
		c("center: milestones, none in range", `{"op":"center","type":"milestones","from":"2020-01-01","to":"2020-12-31"}`, 200),
		c("center: clients", `{"op":"center","type":"clients","from":null,"to":null,"includeContact":null}`, 200),
		c("center: clients with contact details", `{"op":"center","type":"clients","includeContact":true}`, 200),
	})
}
