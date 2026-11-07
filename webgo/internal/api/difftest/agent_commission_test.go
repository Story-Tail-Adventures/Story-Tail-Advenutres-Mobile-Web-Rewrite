//go:build difftest && difftest_commission

package difftest

import (
	"context"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentcommission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-commission"] = api.Port{Gate: api.GateUser, Fn: agentcommission.Func}
}

// Seed rows of the seed advisor's: "not yours" targets, read and never written.
const (
	commSeedTrip     = "0195a2c0-1a00-7000-8000-000000000040"
	commSeedLine     = "01a0b1c2-d300-7000-8000-000000000070"
	commSeedSupplier = "0195a2c0-1a00-7000-8000-000000000030"
)

// commCols are every commission column a write may touch.
const commCols = "id,trip_id,agent_id,supplier_id,component_id,gross_booking_cents,commission_pct," +
	"expected_commission_cents,processing_fee_cents,received_commission_cents,currency,payment_terms," +
	"payment_lag_days,status,received_at,inteletravel_reference,notes,import_id,version,archived_at,on_record_at"

func commMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// commOther pairs each world with the other one, for "another advisor's row" cases.
func commOther(deno, goW *World) func(w *World) *World {
	return func(w *World) *World {
		if w == deno {
			return goW
		}
		return deno
	}
}

// commSupplier makes a supplier (archived when asked), labelled in w, removed at cleanup.
func commSupplier(t *testing.T, w *World, label string, archived bool) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	row := js.O("id", id, "name", "Diff Supplier "+label+" "+w.Tag, "kind", "resort", "default_commission_pct", 12)
	if archived {
		row = row.Set("archived_at", "2026-01-01T00:00:00Z")
	}
	commMust(t, S.DB.From("supplier").Insert(ctx, row, nil))
	w.ID(label, id)
	t.Cleanup(func() { _ = S.DB.From("supplier").Eq("id", id).Delete(context.Background(), nil) })
	return id
}

// commTrip makes a trip owned by owner's agent for owner's traveler, labelled in w, and
// removes it and its commission lines at cleanup. cols override or add columns.
func commTrip(t *testing.T, w, owner *World, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "client_id", owner.Traveler.ClientID, "agent_id", owner.Agent.AgentID,
		"title", "Difftest trip", "trip_type", "custom", "status", "booked",
		"start_date", "2027-03-01", "end_date", "2027-03-08", "currency", "USD")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	commMust(t, S.DB.From("trip").Insert(context.Background(), row, nil))
	w.ID(label, id)
	t.Cleanup(func() {
		ctx := context.Background()
		for _, table := range []string{"commission", "trip_status_history", "trip_component", "payment_milestone", "conversation"} {
			_ = S.DB.From(table).Eq("trip_id", id).Delete(ctx, nil)
		}
		_ = S.DB.From("trip").Eq("id", id).Delete(ctx, nil)
	})
	return id
}

// commLine makes a commission line on trip for owner's agent: $1,000 gross at 12% to w's
// supplier, expected, version 3, unless cols say otherwise.
func commLine(t *testing.T, w, owner *World, trip, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "trip_id", trip, "agent_id", owner.Agent.AgentID, "supplier_id", w.Vars["supplier"],
		"gross_booking_cents", 100000, "commission_pct", 12, "expected_commission_cents", 12000,
		"processing_fee_cents", 0, "received_commission_cents", 0, "currency", "USD",
		"payment_terms", "after_travel", "payment_lag_days", 60, "status", "expected", "version", 3)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	commMust(t, S.DB.From("commission").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// commLines reads back every line on a trip.
func commLines(t *testing.T, trip string) string {
	return S.Rows(t, S.DB.From("commission").Select(commCols).Eq("trip_id", trip).Order("created_at", true).Order("id", true))
}

// commTpl fills a body template from the world: {trip}, {line}, {line2}, {supplier},
// {oldsupplier}, {seedtrip}, {seedline}, {seedsupplier}, and {new} (a fresh id no row has).
func commTpl(s string) func(w *World) string {
	return func(w *World) string {
		return strings.NewReplacer("{trip}", w.Vars["trip"], "{line}", w.Vars["line"], "{line2}", w.Vars["line2"],
			"{supplier}", w.Vars["supplier"], "{oldsupplier}", w.Vars["oldsupplier"],
			"{seedtrip}", commSeedTrip, "{seedline}", commSeedLine, "{seedsupplier}", commSeedSupplier,
			"{new}", uuid.New()).Replace(s)
	}
}

// commDefaultWeights are what seed_pipeline_weights() gives a new advisor.
var commDefaultWeights = map[string]int{"inquiry": 20, "proposal": 50, "booked": 100, "in_progress": 100}

func TestAgentCommission(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := commOther(deno, goW)
	for _, w := range []*World{deno, goW} {
		w.Vars["supplier"] = commSupplier(t, w, "supplier", false)
		w.Vars["oldsupplier"] = commSupplier(t, w, "oldsupplier", true)
	}

	// ---- setups ----
	trip := func(t *testing.T, w *World) { w.Vars["trip"] = commTrip(t, w, w, "trip", nil) }
	line := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			trip(t, w)
			w.Vars["line"] = commLine(t, w, w, w.Vars["trip"], "line", cols)
		}
	}
	twoLines := func(cols, cols2 js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			line(cols)(t, w)
			w.Vars["line2"] = commLine(t, w, w, w.Vars["trip"], "line2", cols2)
		}
	}
	theirs := func(t *testing.T, w *World) {
		o := other(w)
		w.Vars["trip"] = commTrip(t, w, o, "othertrip", nil)
		w.Vars["line"] = commLine(t, w, o, w.Vars["trip"], "otherline", nil)
	}
	received := js.O("status", "received", "received_commission_cents", 11500, "processing_fee_cents", 500,
		"received_at", "2026-10-01")
	resetWeights := func(t *testing.T, w *World) {
		for stage, pct := range commDefaultWeights {
			commMust(t, S.DB.From("pipeline_weight").Eq("agent_id", w.Agent.AgentID).Eq("status", stage).
				Update(context.Background(), js.O("weight_pct", pct), nil))
		}
	}

	// ---- snapshots ----
	snap := func(t *testing.T, w *World) string { return commLines(t, w.Vars["trip"]) }
	seedSnap := func(t *testing.T, _ *World) string { return commLines(t, commSeedTrip) }
	weightSnap := func(t *testing.T, w *World) string {
		return S.Rows(t, S.DB.From("pipeline_weight").Select("agent_id,status,weight_pct").
			Eq("agent_id", w.Agent.AgentID).Order("status", true))
	}

	c := func(name, body string, expect int) Case {
		return Case{Name: name, Fn: "agent-commission", Body: commTpl(body), Expect: expect}
	}
	with := func(cs Case, setup func(*testing.T, *World), s func(*testing.T, *World) string) Case {
		cs.Setup, cs.Snap = setup, s
		return cs
	}
	lineBody := `"supplierId":"{supplier}","grossCents":"100000","commissionPct":12,"paymentTerms":"after_travel","paymentLagDays":60`
	ref65 := strings.Repeat("R", 65)

	Run(t, deno, goW, []Case{
		// ---- the door ----
		{Name: "GET", Fn: "agent-commission", Method: "GET", Expect: 400},
		{Name: "traveler", Fn: "agent-commission", Token: func(w *World) string { return w.Traveler.Token },
			Body: commTpl(`{"op":"export"}`), Expect: 403},
		c("not json", `op=export`, 400),
		c("an array", `[{"op":"export"}]`, 400),
		c("no op", `{}`, 400),
		c("unknown op", `{"op":"delete"}`, 400),
		c("op not text", `{"op":["create"]}`, 400),

		// ---- create: validation, in the order the Deno literal read the fields ----
		c("create: bad trip id", `{"op":"create","tripId":"banana","status":"lost"}`, 400),
		c("create: status received", `{"op":"create","tripId":"{new}","status":"received"}`, 400),
		c("create: status not text", `{"op":"create","tripId":"{new}","status":1}`, 400),
		c("create: no supplier", `{"op":"create","tripId":"{new}"}`, 400),
		c("create: gross missing", `{"op":"create","tripId":"{new}","supplierId":"{supplier}"}`, 400),
		c("create: gross blank", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":""}`, 400),
		c("create: gross fractional", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":10.5}`, 400),
		c("create: gross negative", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":"-1"}`, 400),
		c("create: gross too large", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":10000000000}`, 400),
		c("create: rate missing", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1}`, 400),
		c("create: rate not a number", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1,"commissionPct":" "}`, 400),
		c("create: rate over 100", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1,"commissionPct":"100.01"}`, 400),
		c("create: terms", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1,"commissionPct":5,"paymentTerms":"later"}`, 400),
		c("create: lag missing", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking"}`, 400),
		c("create: lag over 365", `{"op":"create","tripId":"{new}","supplierId":"{supplier}","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking","paymentLagDays":"366"}`, 400),
		c("create: reference not text", `{"op":"create","tripId":"{new}",`+lineBody+`,"inteletravelReference":12}`, 400),
		c("create: reference too long", `{"op":"create","tripId":"{new}",`+lineBody+`,"inteletravelReference":"`+ref65+`"}`, 400),
		c("create: notes not text", `{"op":"create","tripId":"{new}",`+lineBody+`,"notes":["x"]}`, 400),
		c("create: notes with a NUL", `{"op":"create","tripId":"{new}",`+lineBody+`,"notes":"a`+"\\u0000"+`b"}`, 400),

		// ---- create: whose trip ----
		with(c("create: no such trip", `{"op":"create","tripId":"{new}",`+lineBody+`}`, 404), nil, nil),
		with(c("create: the seed advisor's trip", `{"op":"create","tripId":"{seedtrip}",`+lineBody+`}`, 404), nil, seedSnap),
		with(c("create: the other world's trip", `{"op":"create","tripId":"{trip}",`+lineBody+`}`, 404),
			func(t *testing.T, w *World) { w.Vars["trip"] = commTrip(t, w, other(w), "othertrip", nil) }, snap),
		with(c("create: an archived trip", `{"op":"create","tripId":"{trip}",`+lineBody+`}`, 404),
			func(t *testing.T, w *World) {
				w.Vars["trip"] = commTrip(t, w, w, "trip", js.O("archived_at", "2026-01-01T00:00:00Z"))
			}, snap),

		// ---- create: the 200 outcomes ----
		with(c("create: archived supplier", `{"op":"create","tripId":"{trip}","supplierId":"{oldsupplier}","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking","paymentLagDays":0}`, 200),
			trip, snap),
		with(c("create: unknown supplier", `{"op":"create","tripId":"{trip}","supplierId":"{new}","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking","paymentLagDays":0}`, 200),
			trip, snap),
		with(c("create: duplicate reference", `{"op":"create","tripId":"{trip}",`+lineBody+`,"inteletravelReference":"  ITV-DUP-1 "}`, 200),
			line(js.O("status", "invoiced", "inteletravel_reference", "ITV-DUP-1")), snap),
		with(c("create: created", `{"op":"create","tripId":"{trip}","status":"invoiced","supplierId":"{supplier}","grossCents":"100001",`+
			`"commissionPct":"12.345","paymentTerms":"after_travel","paymentLagDays":"45","inteletravelReference":" ITV-NEW-1 ",`+
			`"notes":"  Window seat, \"quoted\" <b>&</b>  ","extra":true}`, 200), trip, snap),
		with(c("create: null status is expected", `{"op":"create","tripId":"{trip}","status":null,`+lineBody+`,"inteletravelReference":"","notes":""}`, 200),
			trip, snap),
		with(c("create: on the seed supplier", `{"op":"create","tripId":"{trip}","supplierId":"{seedsupplier}","grossCents":0,"commissionPct":0,"paymentTerms":"at_booking","paymentLagDays":365}`, 200),
			trip, snap),

		// ---- the line ops need an id and a version first ----
		c("update: bad line id", `{"op":"update","commissionId":"x","expectedVersion":1,"status":"nope"}`, 400),
		c("payment: no version", `{"op":"payment","commissionId":"{new}","status":"nope"}`, 400),
		c("remove: version zero", `{"op":"remove","commissionId":"{new}","expectedVersion":0}`, 400),
		c("remove: version past int4", `{"op":"remove","commissionId":"{new}","expectedVersion":2147483648}`, 400),
		c("remove: version as text", `{"op":"remove","commissionId":"{new}","expectedVersion":"3"}`, 400),

		// ---- update ----
		with(c("update: status", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"paid"}`, 400), line(nil), snap),
		with(c("update: line fields", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"lost","supplierId":"{supplier}"}`, 400), line(nil), snap),
		with(c("update: the seed advisor's line", `{"op":"update","commissionId":"{seedline}","expectedVersion":1,"status":"lost",`+lineBody+`}`, 404),
			nil, seedSnap),
		with(c("update: the other world's line", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"lost",`+lineBody+`}`, 404),
			theirs, snap),
		c("update: no such line", `{"op":"update","commissionId":"{new}","expectedVersion":3,"status":"lost",`+lineBody+`}`, 404),
		with(c("update: a removed line", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"lost",`+lineBody+`}`, 404),
			line(js.O("archived_at", "2026-01-01T00:00:00Z")), snap),
		with(c("update: stale", `{"op":"update","commissionId":"{line}","expectedVersion":2,"status":"lost",`+lineBody+`}`, 409), line(nil), snap),
		with(c("update: needs payment", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"received",`+lineBody+`}`, 400), line(nil), snap),
		with(c("update: archived supplier", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"expected","supplierId":"{oldsupplier}","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking","paymentLagDays":0}`, 200),
			line(nil), snap),
		with(c("update: duplicate reference", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"expected",`+lineBody+`,"inteletravelReference":"ITV-DUP-2"}`, 200),
			twoLines(nil, js.O("status", "invoiced", "inteletravel_reference", "ITV-DUP-2")), snap),
		with(c("update: payment would clear", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"expected","clearPayment":"yes",`+lineBody+`}`, 200),
			line(received), snap),
		with(c("update: payment cleared", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"lost","clearPayment":true,`+lineBody+`,"notes":"refunded"}`, 200),
			line(received), snap),
		with(c("update: received stays received", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"received",`+lineBody+`,"notes":"kept"}`, 200),
			line(received), snap),
		with(c("update: noop", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"expected",`+lineBody+`,"notes":"  "}`, 200),
			line(nil), snap),
		with(c("update: changed", `{"op":"update","commissionId":"{line}","expectedVersion":3,"status":"invoiced","supplierId":"{seedsupplier}",`+
			`"grossCents":250000,"commissionPct":10.5,"paymentTerms":"at_booking","paymentLagDays":0,"inteletravelReference":"ITV-CHG-1","notes":"Window seat"}`, 200),
			line(js.O("notes", "old")), snap),

		// ---- payment ----
		with(c("payment: status", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"expected"}`, 400), line(nil), snap),
		with(c("payment: amount missing", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received"}`, 400), line(nil), snap),
		with(c("payment: amount as words", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":"ten"}`, 400), line(nil), snap),
		with(c("payment: received nothing", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":"0","feeCents":"x"}`, 400), line(nil), snap),
		with(c("payment: fee negative", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"disputed","receivedCents":0,"feeCents":-5}`, 400), line(nil), snap),
		with(c("payment: no date", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"disputed","receivedCents":0}`, 400), line(nil), snap),
		with(c("payment: impossible date", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"disputed","receivedCents":0,"receivedAt":"2026-02-30"}`, 400), line(nil), snap),
		with(c("payment: the seed advisor's line", `{"op":"payment","commissionId":"{seedline}","expectedVersion":1,"status":"received","receivedCents":1,"receivedAt":"2026-10-01"}`, 404),
			nil, seedSnap),
		with(c("payment: the other world's line", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":1,"receivedAt":"2026-10-01"}`, 404),
			theirs, snap),
		with(c("payment: stale", `{"op":"payment","commissionId":"{line}","expectedVersion":4,"status":"received","receivedCents":1,"receivedAt":"2026-10-01"}`, 409),
			line(nil), snap),
		with(c("payment: future date", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":1,"receivedAt":"2099-01-01"}`, 200),
			line(nil), snap),
		with(c("payment: recorded", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":"11500","feeCents":500,"receivedAt":"2026-10-01"}`, 200),
			line(nil), snap),
		with(c("payment: short", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":9000,"receivedAt":"2026-09-15"}`, 200),
			line(nil), snap),
		with(c("payment: disputed for nothing", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"disputed","receivedCents":0,"feeCents":"","receivedAt":"2026-10-02"}`, 200),
			line(nil), snap),
		with(c("payment: noop", `{"op":"payment","commissionId":"{line}","expectedVersion":3,"status":"received","receivedCents":11500,"feeCents":"500","receivedAt":"2026-10-01"}`, 200),
			line(received), snap),

		// ---- remove ----
		with(c("remove: the seed advisor's line", `{"op":"remove","commissionId":"{seedline}","expectedVersion":1}`, 404), nil, seedSnap),
		with(c("remove: the other world's line", `{"op":"remove","commissionId":"{line}","expectedVersion":3}`, 404), theirs, snap),
		with(c("remove: already removed", `{"op":"remove","commissionId":"{line}","expectedVersion":3}`, 404),
			line(js.O("archived_at", "2026-01-01T00:00:00Z")), snap),
		with(c("remove: stale", `{"op":"remove","commissionId":"{line}","expectedVersion":1}`, 409), line(nil), snap),
		with(c("remove: on the record", `{"op":"remove","commissionId":"{line}","expectedVersion":3}`, 200), line(js.O("status", "invoiced")), snap),
		with(c("remove: has a reference", `{"op":"remove","commissionId":"{line}","expectedVersion":3}`, 200),
			line(js.O("inteletravel_reference", "ITV-REF-9")), snap),
		with(c("remove: removed", `{"op":"remove","commissionId":"{line}","expectedVersion":3}`, 200), line(nil), snap),

		// ---- weights ----
		with(c("weights: expected missing", `{"op":"weights","weights":{"inquiry":10,"proposal":40,"booked":80,"in_progress":90}}`, 400),
			resetWeights, weightSnap),
		with(c("weights: a stage missing", `{"op":"weights","expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100},"weights":{"inquiry":10,"proposal":40,"booked":80}}`, 400),
			resetWeights, weightSnap),
		with(c("weights: an extra stage", `{"op":"weights","expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100,"completed":100},"weights":{"inquiry":10,"proposal":40,"booked":80,"in_progress":90}}`, 400),
			resetWeights, weightSnap),
		with(c("weights: text weight", `{"op":"weights","expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100},"weights":{"inquiry":"10","proposal":40,"booked":80,"in_progress":90}}`, 400),
			resetWeights, weightSnap),
		with(c("weights: over 100", `{"op":"weights","expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100},"weights":{"inquiry":10,"proposal":40,"booked":80,"in_progress":101}}`, 400),
			resetWeights, weightSnap),
		with(c("weights: stale", `{"op":"weights","expected":{"inquiry":25,"proposal":50,"booked":100,"in_progress":100},"weights":{"inquiry":10,"proposal":40,"booked":80,"in_progress":90}}`, 409),
			resetWeights, weightSnap),
		with(c("weights: noop", `{"op":"weights","expected":{"in_progress":100,"booked":100,"proposal":50,"inquiry":20},"weights":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100}}`, 200),
			resetWeights, weightSnap),
		with(c("weights: saved", `{"op":"weights","expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100},"weights":{"inquiry":10,"proposal":50,"booked":80,"in_progress":90}}`, 200),
			resetWeights, weightSnap),
	})
}

// TestAgentCommissionExport runs the ledger export in two fresh worlds whose only lines are
// this test's, so the whole-ledger file can be compared.
func TestAgentCommissionExport(t *testing.T) {
	deno, goW := NewWorlds(t)
	for _, w := range []*World{deno, goW} {
		w.Vars["supplier"] = commSupplier(t, w, "supplier", false)
		w.Vars["supplier2"] = commSupplier(t, w, "supplier2", false)
		t1 := commTrip(t, w, w, "trip1", js.O("title", "=HYPERLINK(\"x\") Lake, Como", "start_date", "2026-05-01", "end_date", "2026-05-09"))
		t2 := commTrip(t, w, w, "trip2", js.O("title", "Plain trip", "start_date", "2026-09-01", "end_date", "2026-09-05"))
		t3 := commTrip(t, w, w, "trip3", js.O("title", "+Undated", "start_date", nil, "end_date", nil))
		w.Vars["trip"] = t1
		commLine(t, w, w, t1, "l1", js.O("status", "received", "received_commission_cents", 11500, "processing_fee_cents", 500,
			"received_at", "2026-06-01", "inteletravel_reference", "-ITV-1", "commission_pct", 12.5, "expected_commission_cents", 12500))
		commLine(t, w, w, t1, "l2", js.O("status", "invoiced", "supplier_id", w.Vars["supplier2"], "payment_terms", "at_booking", "payment_lag_days", 0))
		commLine(t, w, w, t2, "l3", js.O("status", "lost", "gross_booking_cents", 5, "commission_pct", 10, "expected_commission_cents", 1))
		commLine(t, w, w, t3, "l4", nil)
		commLine(t, w, w, t3, "l5", js.O("archived_at", "2026-01-01T00:00:00Z"))
		commLine(t, w, w, t2, "l6", js.O("status", "disputed", "received_commission_cents", 1, "received_at", "2026-10-01"))
	}
	c := func(name, filters string, expect int) Case {
		return Case{Name: name, Fn: "agent-commission", Body: func(w *World) string {
			return strings.NewReplacer("{trip}", w.Vars["trip"], "{supplier2}", w.Vars["supplier2"], "{seedtrip}", commSeedTrip).
				Replace(`{"op":"export"` + filters + `}`)
		}, Expect: expect}
	}
	Run(t, deno, goW, []Case{
		c("everything", ``, 200),
		c("null filters", `,"filters":null`, 200),
		c("filters not an object", `,"filters":"received"`, 200),
		c("empty status list", `,"filters":{"statuses":[]}`, 200),
		c("statuses, repeated", `,"filters":{"statuses":["received","lost","received"]}`, 200),
		c("one supplier", `,"filters":{"supplierId":"{supplier2}"}`, 200),
		c("one trip", `,"filters":{"tripId":"{trip}","supplierId":""}`, 200),
		c("travel window", `,"filters":{"travelFrom":"2026-04-01","travelTo":"2026-06-30"}`, 200),
		c("the seed advisor's trip", `,"filters":{"tripId":"{seedtrip}"}`, 200),
		c("statuses not a list", `,"filters":{"statuses":"lost"}`, 400),
		c("an unknown status", `,"filters":{"statuses":["lost","won"]}`, 400),
		c("a bad supplier id", `,"filters":{"supplierId":"sandals"}`, 400),
		c("a bad trip id", `,"filters":{"tripId":7}`, 400),
		c("an impossible date", `,"filters":{"travelTo":"2026-02-29"}`, 400),
	})
}
