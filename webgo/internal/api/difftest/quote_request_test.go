//go:build difftest && difftest_traveler

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/quoterequest"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["quote-request"] = api.Port{Gate: api.GateUser, Fn: quoterequest.Func}
}

// travInquiry is what a quote request leaves behind: the trip, its component (the id is the
// server's), and the advisor's alert.
func travInquiry(t *testing.T, w *World) string {
	trip := S.Rows(t, S.DB.From("trip").
		Select("id,client_id,agent_id,title,trip_type,status,start_date,end_date,destinations,traveler_count,"+
			"total_value_cents,total_paid_cents,total_commission_cents,currency,notes,archived_at").
		Eq("id", w.Vars["trip"]))
	comp := S.Rows(t, S.DB.From("trip_component").
		Select("trip_id,kind,supplier_id,display_name,start_date,end_date,location,cost_cents,commission_pct,"+
			"commission_cents,currency,payload,api_source,api_reference,order_index,archived_at").
		Eq("trip_id", w.Vars["trip"]))
	alert := S.Rows(t, S.DB.From("agent_alert_email").Select("agent_id,kind,conversation_id,trip_id,state").
		Eq("trip_id", w.Vars["trip"]))
	push := S.Rows(t, S.DB.From("push_outbox").Select("agent_id,kind,trip_id,message_count").Eq("trip_id", w.Vars["trip"]))
	return "trip:" + trip + "\ncomponent:" + comp + "\nalert:" + alert + "\npush:" + push
}

func TestQuoteRequest(t *testing.T) {
	deno, goW := travWorlds(t)
	agent := func(w *World) string { return w.Agent.Token }
	emoji := "\U0001F600"

	// ask builds a body: this case's fresh trip id (labelled), a hotel by default, and the
	// fields given ("$trip" is the previous trip id, for a retry).
	ask := func(kv ...any) func(w *World) string {
		return func(w *World) string {
			o := js.O("tripId", "new", "kind", "hotel", "name", "Bucuti & Tara Beach Resort")
			for i := 0; i+1 < len(kv); i += 2 {
				o = o.Set(kv[i].(string), kv[i+1])
			}
			for i, f := range o {
				if f.Key == "tripId" && f.Value == "new" {
					id := uuid.New()
					w.Vars["trip"] = w.ID("trip", id)
					o[i].Value = id
				} else if f.Key == "tripId" && f.Value == "$trip" {
					o[i].Value = w.Vars["trip"]
				}
			}
			b, _ := js.Marshal(o)
			return string(b)
		}
	}
	snap := travInquiry

	cases := []Case{
		{Name: "GET", Method: "GET", Body: ask(), Expect: 400},
		{Name: "an advisor", Token: agent, Body: ask(), Expect: 403},
		{Name: "not JSON", Body: travFixed(`tripId=1`), Expect: 400},
		{Name: "no tripId", Body: travFixed(`{"kind":"hotel","name":"x"}`), Expect: 400},
		{Name: "tripId an hour old", Body: ask("tripId", uuid.NewAt(time.Now().Add(-2*time.Hour))), Expect: 400},
		{Name: "tripId not v7", Body: ask("tripId", "nope"), Expect: 400},
		{Name: "a flight", Body: ask("kind", "flight"), Expect: 400},
		{Name: "no name", Body: ask("name", "  \n "), Expect: 400},
		{Name: "an impossible date", Body: ask("checkIn", "2026-02-30", "checkOut", "2026-03-02"), Expect: 400},
		{Name: "one date", Body: ask("checkIn", "2027-02-01"), Expect: 400},
		{Name: "dates backwards", Body: ask("checkIn", "2027-02-10", "checkOut", "2027-02-01"), Expect: 400},

		// An inquiry: the trip in its default status, money at zero, the provider's figure in
		// the payload under its own name, the advisor alerted.
		{Name: "a hotel with dates", Body: ask("location", "  Eagle Beach,\tAruba ", "checkIn", "2027-02-01",
			"checkOut", "2027-02-08", "travelers", 2.5, "note", "Our 10th <anniversary> & a quiet week.",
			"tripType", "all_inclusive", "source", "serpapi_google_hotels", "apiReference", " ChIJ-token ",
			"snapshot", js.O("propertyType", "Resort", "photoUrl", "https://lh3.example.com/p.jpg",
				"indicativeRateCents", 61234, "hotelClass", 5, "rating", 4.7, "reviewCount", -3, "costCents", 999,
				"amenities", []any{"Beach", 7, "Spa", strings.Repeat("x", 70)}, "nested", js.O("a", 1))),
			Snap: snap, Expect: 201},
		{Name: "the same request again", Body: ask("tripId", "$trip"), Snap: snap, Expect: 400},
		{Name: "a cruise, undated, typed from its kind", Body: ask("kind", "cruise", "name", "Seabourn Encore",
			"tripType", "spaceship", "source", "track_cruises", "travelers", 99, "checkIn", "", "checkOut", nil,
			"snapshot", []int{1}), Snap: snap, Expect: 201},
		{Name: "an excursion, travelers not a number", Body: ask("kind", "excursion", "travelers", "4", "source", "elsewhere"),
			Snap: snap, Expect: 201},
		{Name: "an upper-case trip id", Body: func(w *World) string {
			id := uuid.New()
			w.Vars["trip"] = w.ID("trip", id)
			return travJSON("tripId", strings.ToUpper(id), "kind", "custom", "name", "Something bespoke")
		}, Snap: snap, Expect: 201},

		// The TypeScript's .slice() cuts in UTF-16: half an emoji reaches Postgres, which
		// refuses it. In the trip, the request fails; in the component, the trip stands
		// without one (componentWritten false).
		{Name: "a name cut through an emoji", Body: ask("name", strings.Repeat("a", 119)+emoji), Snap: snap},
		{Name: "a title cut through an emoji", Body: ask("name", "Sea", "location", strings.Repeat("b", 113)+emoji+"c"), Snap: snap},
		{Name: "a reference cut through an emoji", Body: ask("apiReference", strings.Repeat("r", 219)+emoji), Snap: snap},
		{Name: "an amenity cut through an emoji", Body: ask("snapshot", js.O("amenities", []string{"Pool", strings.Repeat("m", 59) + emoji})),
			Snap: snap},
	}
	Run(t, deno, goW, travWithAudit("quote-request", cases))
}
