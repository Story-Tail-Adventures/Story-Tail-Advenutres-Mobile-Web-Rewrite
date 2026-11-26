//go:build difftest && difftest_trips

package difftest

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Fixtures shared by the trips-area tests (agent-trip-notes, agent-trip-status,
// agent-itinerary, agent-trip). Every row is fresh and removed in t.Cleanup; seed rows are
// only ever read.

// tripsSeedTrip is a trip of the seed advisor's: the "not yours" target, read-only.
const tripsSeedTrip = "0195a2c0-1a00-7000-8000-000000000040"

func tripsMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// tripsNewTrip makes a trip owned by owner's agent for owner's traveler, labels it in w, and
// removes it (and every child row a test may have written) at cleanup. cols override or add
// columns.
func tripsNewTrip(t *testing.T, w *World, owner *World, label string, cols js.Ordered) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	row := js.O("id", id, "client_id", owner.Traveler.ClientID, "agent_id", owner.Agent.AgentID,
		"title", "Difftest trip", "trip_type", "custom", "status", "proposal", "version", 3)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	for _, f := range cols {
		if f.Key == "id" {
			id = f.Value.(string) // a caller that needs ids in a known order
		}
	}
	tripsMust(t, S.DB.From("trip").Insert(ctx, row, nil))
	w.ID(label, id)
	t.Cleanup(func() { tripsDropTrip(id) })
	return id
}

// tripsDropTrip removes a fixture trip and its children, leaves first.
func tripsDropTrip(id string) {
	ctx := context.Background()
	var its []struct {
		ID string `json:"id"`
	}
	_ = S.DB.From("itinerary").Select("id").Eq("trip_id", id).Rows(ctx, &its)
	for _, it := range its {
		var days []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("itinerary_day").Select("id").Eq("itinerary_id", it.ID).Rows(ctx, &days)
		for _, d := range days {
			_ = S.DB.From("itinerary_activity").Eq("itinerary_day_id", d.ID).Delete(ctx, nil)
		}
		_ = S.DB.From("itinerary_day").Eq("itinerary_id", it.ID).Delete(ctx, nil)
	}
	for _, table := range []string{"itinerary", "payment_milestone", "commission", "trip_component", "trip_status_history", "push_outbox", "conversation"} {
		_ = S.DB.From(table).Eq("trip_id", id).Delete(ctx, nil)
	}
	_ = S.DB.From("trip").Eq("id", id).Delete(ctx, nil)
}

// tripsOther pairs each world with the other one, for "another advisor's row" cases.
func tripsOther(deno, goW *World) func(w *World) *World {
	return func(w *World) *World {
		if w == deno {
			return goW
		}
		return deno
	}
}

// tripsRow reads one trip back with the columns a write may touch.
func tripsRow(t *testing.T, id string) string {
	return S.Rows(t, S.DB.From("trip").Select("id,title,status,notes,version,cancellation_reason,refund_status,refund_detail,"+
		"start_date,end_date,destinations,traveler_count,total_value_cents,total_paid_cents,total_commission_cents,currency,archived_at,updated_at").
		Eq("id", id))
}

// tripsSupplier is a seed supplier, read-only.
const tripsSupplier = "0195a2c0-1a00-7000-8000-000000000030"

// tripsNewLine makes an Expected commission line on a trip of owner's, labelled in w.
func tripsNewLine(t *testing.T, w *World, owner *World, tripID, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "trip_id", tripID, "agent_id", owner.Agent.AgentID, "supplier_id", tripsSupplier,
		"gross_booking_cents", 100000, "commission_pct", 10, "expected_commission_cents", 10000,
		"payment_terms", "after_travel", "currency", "USD", "status", "expected")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	tripsMust(t, S.DB.From("commission").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// tripsWithAudit makes each case compare the audit rows ITS request wrote, and nothing else.
//
// The harness's own audit read starts a second before the request (clock slack), so on a run
// of fast cases it also picks up the previous cases' rows, whose order differs between the
// worlds. Instead every request carries its own User-Agent, which every audit row records
// (the SQL-written ones through p_user_agent too), and the rows are read by it, normalized
// and sorted, so ids minted in the same millisecond cannot reorder them.
func tripsWithAudit(cases []Case) []Case {
	out := make([]Case, len(cases))
	for i, cs := range cases {
		hdr, snap := cs.Header, cs.Snap
		cs.Header = func(w *World) http.Header {
			h := http.Header{}
			if hdr != nil {
				for k, v := range hdr(w) {
					h[k] = v
				}
			}
			ua := "difftest-ua-" + Unique()
			w.Vars["ua"] = w.ID("ua", ua)
			h.Set("User-Agent", ua)
			return h
		}
		cs.Snap = func(t *testing.T, w *World) string {
			s := ""
			if snap != nil {
				s = snap(t, w)
			}
			return s + tripsAudit(t, w)
		}
		cs.SkipAudit = true
		out[i] = cs
	}
	return out
}

// tripsAudit is the audit rows world w's actors wrote with this case's User-Agent, each
// normalized, in sorted order.
func tripsAudit(t *testing.T, w *World) string {
	t.Helper()
	raw := S.Rows(t, S.DB.From("audit_event").
		Select("actor_role,event_type,target_entity,target_id,metadata,user_agent").
		In("actor_user_id", []string{w.Agent.PlatformUserID, w.Traveler.PlatformUserID}).
		Eq("user_agent", w.Vars["ua"]))
	var rows []json.RawMessage
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		t.Fatalf("audit rows: %v", err)
	}
	norm := make([]string, len(rows))
	for i, r := range rows {
		norm[i] = w.Normalize(string(r))
	}
	sort.Strings(norm)
	return "audit:[" + strings.Join(norm, ",\n") + "]"
}

// tripsSorted returns n fresh v7 ids in ascending order, so rows keyed by them sort the same
// way in both worlds.
func tripsSorted(n int) []string {
	ids := make([]string, n)
	for i := range ids {
		ids[i] = uuid.New()
	}
	sort.Strings(ids)
	return ids
}

// tripsNewComponent makes a trip_component on a trip, labelled in w.
func tripsNewComponent(t *testing.T, w *World, tripID, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "trip_id", tripID, "kind", "excursion", "display_name", "Snorkel trip", "currency", "USD")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	tripsMust(t, S.DB.From("trip_component").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// tripsNewItinerary makes a trip's itinerary with one day per date and the given activity
// titles on the first day, labelled itin, day1..dayN and act1..actN in w.
func tripsNewItinerary(t *testing.T, w *World, tripID string, dates []string, activities []string) {
	t.Helper()
	ctx := context.Background()
	itin := w.ID("itin", uuid.New())
	tripsMust(t, S.DB.From("itinerary").Insert(ctx, js.O("id", itin, "trip_id", tripID), nil))
	for i, d := range dates {
		n := strconv.Itoa(i + 1)
		day := w.ID("day"+n, uuid.New())
		w.Vars["day"+n] = day
		tripsMust(t, S.DB.From("itinerary_day").Insert(ctx, js.O("id", day, "itinerary_id", itin, "day_number", i+1, "date", d), nil))
	}
	for i, title := range activities {
		n := strconv.Itoa(i + 1)
		act := w.ID("act"+n, uuid.New())
		w.Vars["act"+n] = act
		tripsMust(t, S.DB.From("itinerary_activity").Insert(ctx, js.O("id", act, "itinerary_day_id", w.Vars["day1"],
			"block", "morning", "title", title, "order_index", i), nil))
	}
}

// tripsItinerary reads a trip's itinerary back: the itinerary, its days in order, each day's
// activities in order (separate reads, so the order never depends on how ids were minted).
func tripsItinerary(t *testing.T, tripID string) string {
	t.Helper()
	ctx := context.Background()
	var b strings.Builder
	b.WriteString(S.Rows(t, S.DB.From("itinerary").Select("id,trip_id,version").Eq("trip_id", tripID)))
	var its []struct {
		ID string `json:"id"`
	}
	tripsMust(t, S.DB.From("itinerary").Select("id").Eq("trip_id", tripID).Rows(ctx, &its))
	for _, it := range its {
		var days []struct {
			ID string `json:"id"`
		}
		tripsMust(t, S.DB.From("itinerary_day").Select("id").Eq("itinerary_id", it.ID).Order("day_number", true).Rows(ctx, &days))
		b.WriteString(S.Rows(t, S.DB.From("itinerary_day").Select("id,day_number,date,label,summary").Eq("itinerary_id", it.ID).Order("day_number", true)))
		for _, d := range days {
			b.WriteString(S.Rows(t, S.DB.From("itinerary_activity").
				Select("id,itinerary_day_id,block,start_time,end_time,title,body,location,address,phone,confirmation_number,gyasis_tip,component_id,order_index").
				Eq("itinerary_day_id", d.ID).Order("order_index", true).Order("title", true)))
		}
	}
	return b.String()
}

// tripsNewMilestone makes a payment_milestone on a trip, labelled in w.
func tripsNewMilestone(t *testing.T, w *World, tripID, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "trip_id", tripID, "kind", "deposit", "label", "Deposit", "amount_cents", 50000, "currency", "USD")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	tripsMust(t, S.DB.From("payment_milestone").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// tripsBuilder reads back what agent-trip writes on a trip: the trip row (its totals move
// with the components and milestones), its components and its milestones, in a stable order.
func tripsBuilder(t *testing.T, id string) string {
	return tripsRow(t, id) +
		S.Rows(t, S.DB.From("trip_component").Select("id,kind,supplier_id,display_name,start_date,end_date,start_time,end_time,"+
			"location,confirmation_number,cost_cents,commission_pct,commission_cents,currency,payload,order_index,archived_at,updated_at").
			Eq("trip_id", id).Order("order_index", true).Order("display_name", true)) +
		S.Rows(t, S.DB.From("payment_milestone").Select("id,kind,label,amount_cents,currency,due_date,paid_at,paid_cents,status,"+
			"order_index,pay_url,paid_reference,paid_note,updated_at").
			Eq("trip_id", id).Order("order_index", true).Order("label", true))
}
