//go:build difftest && difftest_trips

package difftest

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttrip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-trip"] = api.Port{Gate: api.GateUser, Fn: agenttrip.Func}
}

// tripsCard is a 16-digit Luhn-valid number, BUILT AT RUNTIME: the repo's guard refuses any
// Luhn-valid literal in source, tests included.
var tripsCard = func() string {
	body := "4" + strings.Repeat("1", 14)
	for d := 0; d < 10; d++ {
		if carddigits.LuhnValid(body + strconv.Itoa(d)) {
			return body + strconv.Itoa(d)
		}
	}
	panic("no check digit")
}()

// tripsSeedClient is the seed advisor's client, read-only.
const tripsSeedClient = "0195a2c0-1a00-7000-8000-000000000013"

func TestAgentTrip(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := tripsOther(deno, goW)
	const fn = "agent-trip"
	ctx := context.Background()

	snap := func(t *testing.T, w *World) string {
		s := tripsBuilder(t, w.Vars["trip"])
		if w.Vars["side"] != "" {
			s += tripsBuilder(t, w.Vars["side"])
		}
		return s
	}
	fresh := func(w *World) {
		for _, k := range []string{"side", "c1", "c2", "c3", "m1", "sidec", "sidem"} {
			delete(w.Vars, k)
		}
	}
	// trip: one of w's trips, with n components (c1..cn) and, when ms is set, a milestone m1.
	trip := func(cols js.Ordered, n int, ms js.Ordered) func(*testing.T, *World) {
		return func(t *testing.T, w *World) {
			fresh(w)
			id := tripsNewTrip(t, w, w, "trip", cols)
			w.Vars["trip"] = id
			for i := 1; i <= n; i++ {
				k := "c" + strconv.Itoa(i)
				w.Vars[k] = tripsNewComponent(t, w, id, k, js.O("display_name", "Part "+k, "order_index", i-1,
					"cost_cents", 10000*i, "commission_pct", 10, "commission_cents", 1000*i, "start_date", "2027-03-0"+strconv.Itoa(i)))
			}
			if ms != nil {
				w.Vars["m1"] = tripsNewMilestone(t, w, id, "m1", ms)
			}
		}
	}
	plain := trip(nil, 0, nil)
	// theirs: the trip, a component and a milestone with a pay link belong to the other
	// world's advisor; named by w's request, read back to show nothing moved.
	theirs := func(t *testing.T, w *World) {
		fresh(w)
		id := tripsNewTrip(t, w, other(w), "trip", nil)
		w.Vars["trip"] = id
		w.Vars["c1"] = tripsNewComponent(t, w, id, "c1", nil)
		w.Vars["m1"] = tripsNewMilestone(t, w, id, "m1", js.O("pay_url", "https://pay.example.com/theirs"))
	}
	// side: my trip, and a second trip of mine whose component and milestone are named
	// against the first.
	side := func(t *testing.T, w *World) {
		trip(nil, 1, js.O())(t, w)
		sid := tripsNewTrip(t, w, w, "side", nil)
		w.Vars["side"] = sid
		w.Vars["sidec"] = tripsNewComponent(t, w, sid, "sidec", nil)
		w.Vars["sidem"] = tripsNewMilestone(t, w, sid, "sidem", js.O("pay_url", "https://pay.example.com/side"))
	}
	archived := trip(js.O("archived_at", "2026-01-01T00:00:00Z"), 1, js.O())

	c := func(name string, setup func(*testing.T, *World), b string, expect int) Case {
		cs := Case{Name: name, Fn: fn, Setup: setup, Body: func(w *World) string { return tripsFill(w, b) }, Expect: expect}
		if setup != nil {
			cs.Snap = snap
		}
		return cs
	}
	traveler := func(w *World) string { return w.Traveler.Token }
	tomorrow := time.Now().UTC().Add(24 * time.Hour).Format("2006-01-02")
	inTwoDays := time.Now().UTC().Add(48 * time.Hour).Format("2006-01-02")

	// ---- create ----
	created := func(title string) func(*testing.T, *World) {
		return func(t *testing.T, w *World) {
			fresh(w)
			w.Vars["title"] = title + " " + w.Tag
			client := w.Traveler.ClientID
			t.Cleanup(func() {
				var rows []struct {
					ID string `json:"id"`
				}
				_ = S.DB.From("trip").Select("id").Eq("client_id", client).Eq("title", title+" "+w.Tag).Rows(ctx, &rows)
				for _, r := range rows {
					tripsDropTrip(r.ID)
				}
			})
		}
	}
	createdSnap := func(t *testing.T, w *World) string {
		return S.Rows(t, S.DB.From("trip").Select("id,client_id,agent_id,title,trip_type,status,traveler_count,currency,version,notes").
			Eq("client_id", w.Traveler.ClientID).Eq("title", w.Vars["title"]))
	}
	cr := func(name, title, b string, expect int) Case {
		cs := c(name, created(title), b, expect)
		cs.Snap = createdSnap
		return cs
	}
	otherClient := func(w *World) string { return other(w).Traveler.ClientID }

	cases := []Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "a traveler", Fn: fn, Token: traveler, Body: func(*World) string { return `{"op":"create"}` }, Expect: 403},
		c("not json", nil, `"create"`, 400),
		c("no op", nil, `{}`, 400),
		c("an unknown op", nil, `{"op":"payment_refund"}`, 400),
		c("no trip id", nil, `{"op":"component_archive"}`, 400),

		cr("create: bad client id", "Created", `{"op":"create","clientId":"c1","tripType":"custom","title":"{title}"}`, 400),
		cr("create: bad trip type", "Created", `{"op":"create","clientId":"`+"{client}"+`","tripType":"honeymoon","title":"{title}"}`, 400),
		cr("create: no title", "Created", `{"op":"create","clientId":"{client}","tripType":"custom","title":"   "}`, 400),
		cr("create: title too long", "Created", `{"op":"create","clientId":"{client}","tripType":"custom","title":"`+strings.Repeat("t", 161)+`"}`, 400),
		cr("create: the seed advisor's client", "Created", `{"op":"create","clientId":"`+tripsSeedClient+`","tripType":"custom","title":"{title}"}`, 200),
		cr("create", "Created", `{"op":"create","clientId":"{client}","tripType":"all_inclusive","title":"  {title}  ","travelerCount":3}`, 200),
		cr("create: travelers clamped", "Big group", `{"op":"create","clientId":"{client}","tripType":"group","title":"{title}","travelerCount":100}`, 200),
		cr("create: travelers not a whole number", "Odd", `{"op":"create","clientId":"{client}","tripType":"cruise","title":"{title}","travelerCount":2.5}`, 200),
	}
	// {client} is the world's own traveler's client; the other world's is set per case.
	for i := range cases {
		b := cases[i].Body
		if b == nil {
			continue
		}
		cases[i].Body = func(w *World) string {
			return strings.ReplaceAll(b(w), "{client}", w.Traveler.ClientID)
		}
	}
	cases = append(cases, Case{Name: "create: the other world's client", Fn: fn, Setup: created("Created"), Snap: createdSnap,
		Body: func(w *World) string {
			return `{"op":"create","clientId":"` + otherClient(w) + `","tripType":"custom","title":"` + w.Vars["title"] + `"}`
		}, Expect: 200})

	const h = `"tripId":"{trip}"`
	cases = append(cases,
		// ---- component_upsert ----
		c("component: no kind", plain, `{"op":"component_upsert",`+h+`,"displayName":"x"}`, 400),
		c("component: a dining kind", plain, `{"op":"component_upsert",`+h+`,"kind":"dining","displayName":"x"}`, 400),
		c("component: empty component id", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel","componentId":"","displayName":"x"}`, 400),
		c("component: no name", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel"}`, 400),
		c("component: negative cost", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x","costCents":-1}`, 400),
		c("component: a rate too large", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x","commissionPct":1000}`, 400),
		c("component: bad time", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x","endTime":"24:00"}`, 400),
		c("component: unknown detail key", plain, `{"op":"component_upsert",`+h+`,"kind":"flight","displayName":"x","detail":{"airline":"AA"}}`, 400),
		c("component: create", trip(nil, 1, nil), `{"op":"component_upsert",`+h+`,"kind":"cruise","displayName":" Caribbean sailing ",`+
			`"supplierId":"`+tripsSupplier+`","startDate":"2027-03-01","endDate":"2027-03-08","startTime":"16:00","location":"Miami",`+
			`"confirmationNumber":" RC-123 ","costCents":"412345","commissionPct":"12.505",`+
			`"detail":{"ship":" Wonder ","gratuities_included":true,"notes":"","cabin":null}}`, 200),
		c("component: create with an explicit zero", plain, `{"op":"component_upsert",`+h+`,"kind":"insurance","displayName":"Cover",`+
			`"costCents":9900,"commissionPct":10,"commissionCents":0,"detail":{"plan":"Basic"}}`, 200),
		c("component: update", trip(nil, 2, nil), `{"op":"component_upsert",`+h+`,"kind":"excursion","componentId":"{c2}","displayName":"Reef",`+
			`"costCents":30000,"commissionCents":"4500","detail":{"duration":"3 hours"}}`, 200),
		c("component: noop", trip(nil, 1, nil), `{"op":"component_upsert",`+h+`,"kind":"excursion","componentId":"{c1}","displayName":" Part c1 ",`+
			`"costCents":10000,"commissionPct":10,"commissionCents":1000,"startDate":"2027-03-01","detail":{}}`, 200),
		c("component: another trip's component", side, `{"op":"component_upsert",`+h+`,"kind":"excursion","componentId":"{sidec}","displayName":"x"}`, 404),
		c("component: the other world's trip", theirs, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x"}`, 404),
		c("component: an archived trip", archived, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x"}`, 404),
		c("component: a supplier that does not exist", plain, `{"op":"component_upsert",`+h+`,"kind":"hotel","displayName":"x","supplierId":"`+tripsSeedTrip+`"}`, 500),

		// ---- component_archive ----
		c("archive: no component id", trip(nil, 1, nil), `{"op":"component_archive",`+h+`}`, 400),
		c("archive", trip(nil, 2, nil), `{"op":"component_archive",`+h+`,"componentId":"{c1}"}`, 200),
		c("archive: already archived", func(t *testing.T, w *World) {
			trip(nil, 0, nil)(t, w)
			w.Vars["c1"] = tripsNewComponent(t, w, w.Vars["trip"], "c1", js.O("archived_at", "2026-01-01T00:00:00Z"))
		}, `{"op":"component_archive",`+h+`,"componentId":"{c1}"}`, 200),
		c("archive: another trip's component", side, `{"op":"component_archive",`+h+`,"componentId":"{sidec}"}`, 404),
		c("archive: the other world's", theirs, `{"op":"component_archive",`+h+`,"componentId":"{c1}"}`, 404),

		// ---- component_reorder ----
		c("reorder: no list", trip(nil, 2, nil), `{"op":"component_reorder",`+h+`}`, 400),
		c("reorder: empty", trip(nil, 2, nil), `{"op":"component_reorder",`+h+`,"componentIds":[]}`, 400),
		c("reorder: twice", trip(nil, 2, nil), `{"op":"component_reorder",`+h+`,"componentIds":["{c1}","{c1}"]}`, 400),
		c("reorder: a bad id", trip(nil, 2, nil), `{"op":"component_reorder",`+h+`,"componentIds":["{c1}",null]}`, 400),
		c("reorder: part of the trip", trip(nil, 3, nil), `{"op":"component_reorder",`+h+`,"componentIds":["{c2}","{c1}"]}`, 409),
		c("reorder", trip(nil, 3, nil), `{"op":"component_reorder",`+h+`,"componentIds":["{c3}","{c1}","{c2}"]}`, 200),
		c("reorder: unchanged", trip(nil, 2, nil), `{"op":"component_reorder",`+h+`,"componentIds":["{c1}","{c2}"]}`, 200),
		c("reorder: the other world's", theirs, `{"op":"component_reorder",`+h+`,"componentIds":["{c1}"]}`, 404),

		// ---- payment_upsert ----
		c("milestone: bad kind", plain, `{"op":"payment_upsert",`+h+`,"kind":"balance","label":"x"}`, 400),
		c("milestone: bad id", plain, `{"op":"payment_upsert",`+h+`,"kind":"deposit","milestoneId":"m","label":"x"}`, 400),
		c("milestone: no label", plain, `{"op":"payment_upsert",`+h+`,"kind":"deposit","label":""}`, 400),
		c("milestone: negative amount", plain, `{"op":"payment_upsert",`+h+`,"kind":"deposit","label":"x","amountCents":-100}`, 400),
		c("milestone: bad due date", plain, `{"op":"payment_upsert",`+h+`,"kind":"deposit","label":"x","dueDate":"next week"}`, 400),
		c("milestone: an impossible due date", plain, `{"op":"payment_upsert",`+h+`,"kind":"deposit","label":"x","dueDate":"2027-02-30"}`, 500),
		c("milestone: create", trip(nil, 0, js.O()), `{"op":"payment_upsert",`+h+`,"kind":"final","label":" Balance ","amountCents":"250000","dueDate":"2027-01-15"}`, 200),
		c("milestone: update", trip(nil, 0, js.O()), `{"op":"payment_upsert",`+h+`,"kind":"interim","milestoneId":"{m1}","label":"Second","amountCents":60000}`, 200),
		c("milestone: noop", trip(nil, 0, js.O("due_date", "2027-01-01")), `{"op":"payment_upsert",`+h+`,"kind":"deposit","milestoneId":"{m1}","label":"Deposit","amountCents":"50000","dueDate":"2027-01-01"}`, 200),
		c("milestone: another trip's", side, `{"op":"payment_upsert",`+h+`,"kind":"deposit","milestoneId":"{sidem}","label":"x"}`, 404),
		c("milestone: the other world's trip", theirs, `{"op":"payment_upsert",`+h+`,"kind":"deposit","label":"x"}`, 404),

		// ---- payment_paid ----
		c("paid: bad status", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"refunded","milestoneId":"{m1}"}`, 400),
		c("paid: no milestone id", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid"}`, 400),
		c("paid: negative amount", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidCents":-1}`, 400),
		c("paid: a card number as the reference", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidReference":"`+tripsCard+`"}`, 400),
		c("paid: a card number in the note", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidNote":"paid with `+
			tripsCard[0:4]+" "+tripsCard[4:8]+" "+tripsCard[8:12]+" "+tripsCard[12:]+`"}`, 400),
		c("paid: reference too long", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidReference":"`+strings.Repeat("R", 101)+`"}`, 400),
		c("paid: not a real date", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidOn":"2026-02-29"}`, 400),
		c("paid: two days ahead", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidOn":"`+inTwoDays+`"}`, 400),
		c("paid: after the advisor's today", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidOn":"`+tomorrow+`"}`, 400),
		c("paid: the whole amount", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}"}`, 200),
		c("paid: part, with a reference, a note and a date", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}",`+
			`"paidCents":"20000","paidReference":"  CONF-77 ","paidNote":" Wire from the client ","paidOn":"2026-10-01"}`, 200),
		c("paid: nothing changed", trip(nil, 0, js.O("status", "paid", "paid_at", "2026-10-01T17:00:00Z", "paid_cents", 50000)),
			`{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}"}`, 200),
		c("paid: waived, clearing the reference", trip(nil, 0, js.O("paid_reference", "OLD-1", "paid_note", "kept")),
			`{"op":"payment_paid",`+h+`,"status":"waived","milestoneId":"{m1}","paidReference":""}`, 200),
		c("paid: cleared back to scheduled", trip(nil, 0, js.O("status", "paid", "paid_at", "2026-10-01T17:00:00Z", "paid_cents", 50000, "paid_reference", "R-1")),
			`{"op":"payment_paid",`+h+`,"status":"scheduled","milestoneId":"{m1}"}`, 200),
		c("paid: overdue", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"overdue","milestoneId":"{m1}","paidCents":""}`, 200),
		c("paid: zero is an amount", trip(nil, 0, js.O()), `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}","paidCents":0}`, 200),
		c("paid: another trip's milestone", side, `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{sidem}"}`, 404),
		c("paid: the other world's", theirs, `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}"}`, 404),
		c("paid: an archived trip", archived, `{"op":"payment_paid",`+h+`,"status":"paid","milestoneId":"{m1}"}`, 404),

		// ---- payment_link: https only, advisor only, card numbers refused, every change audited ----
		Case{Name: "link: a traveler on their own trip", Fn: fn, Token: traveler, Setup: trip(nil, 0, js.O()), Snap: snap,
			Body: func(w *World) string {
				return tripsFill(w, `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/x"}`)
			}, Expect: 403},
		c("link: no milestone id", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"payUrl":"https://pay.example.com/x"}`, 400),
		c("link: http", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"http://pay.example.com/invoice/7"}`, 400),
		c("link: http over an existing link", trip(nil, 0, js.O("pay_url", "https://pay.example.com/a")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"HTTP://pay.example.com/a"}`, 400),
		c("link: javascript", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"javascript:alert(1)"}`, 400),
		c("link: a card number in the path", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/`+tripsCard+`"}`, 400),
		c("link: a card number in the query, grouped", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/p?c=`+
			tripsCard[0:4]+"-"+tripsCard[4:8]+"-"+tripsCard[8:12]+"-"+tripsCard[12:]+`"}`, 400),
		c("link: a user and password", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://agent:secret@pay.example.com/"}`, 400),
		c("link: an IP address", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://192.168.1.10/pay"}`, 400),
		c("link: an IPv6 address", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://[::1]/pay"}`, 400),
		c("link: localhost", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://shop.localhost/pay"}`, 400),
		c("link: a bare word host", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://intranet/pay"}`, 400),
		c("link: not a link", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"pay.example.com/x"}`, 400),
		c("link: no host", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://"}`, 400),
		c("link: not text", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":["https://pay.example.com/"]}`, 400),
		c("link: too long", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/`+strings.Repeat("a", 2030)+`"}`, 400),
		c("link: set", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"  https://Pay.Example.com/invoice?id=77#top  "}`, 200),
		c("link: set, an international host", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://b`+"\U000000fc"+`cher.example/pay"}`, 200),
		c("link: set, dot segments and spaces", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/a/../b/./c?q=a b"}`, 200),
		c("link: changed", trip(nil, 0, js.O("pay_url", "https://pay.example.com/old")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://travefy.com/invoice/new"}`, 200),
		c("link: removed with null", trip(nil, 0, js.O("pay_url", "https://pay.example.com/old")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":null}`, 200),
		c("link: removed with blank", trip(nil, 0, js.O("pay_url", "https://pay.example.com/old")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"   "}`, 200),
		c("link: removed by leaving it out", trip(nil, 0, js.O("pay_url", "https://pay.example.com/old")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}"}`, 200),
		c("link: unchanged", trip(nil, 0, js.O("pay_url", "https://pay.example.com/same")), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://PAY.example.com/same"}`, 200),
		c("link: nothing to remove", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":""}`, 200),
		c("link: a host the database refuses", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay_desk.example.com/x"}`, 400),
		c("link: a trailing dot", trip(nil, 0, js.O()), `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com./x"}`, 400),
		c("link: another trip's milestone", side, `{"op":"payment_link",`+h+`,"milestoneId":"{sidem}","payUrl":"https://evil.example.com/"}`, 404),
		c("link: the other world's milestone", theirs, `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://evil.example.com/"}`, 404),
		c("link: removing the other world's", theirs, `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":null}`, 404),
		c("link: an archived trip", archived, `{"op":"payment_link",`+h+`,"milestoneId":"{m1}","payUrl":"https://pay.example.com/x"}`, 404),
		Case{Name: "link: the seed advisor's trip", Fn: fn, Body: func(*World) string {
			return `{"op":"payment_link","tripId":"` + tripsSeedTrip + `","milestoneId":"` + uuid.New() + `","payUrl":"https://evil.example.com/"}`
		}, Expect: 404},

		// ---- payment_delete ----
		c("delete: no milestone id", trip(nil, 0, js.O()), `{"op":"payment_delete",`+h+`}`, 400),
		c("delete", trip(nil, 0, js.O("status", "paid", "paid_at", "2026-10-01T17:00:00Z", "paid_cents", 50000, "pay_url", "https://pay.example.com/d")),
			`{"op":"payment_delete",`+h+`,"milestoneId":"{m1}"}`, 200),
		c("delete: no such milestone", trip(nil, 0, js.O()), `{"op":"payment_delete",`+h+`,"milestoneId":"`+tripsSeedTrip+`"}`, 404),
		c("delete: another trip's milestone", side, `{"op":"payment_delete",`+h+`,"milestoneId":"{sidem}"}`, 404),
		c("delete: the other world's", theirs, `{"op":"payment_delete",`+h+`,"milestoneId":"{m1}"}`, 404),
	)
	Run(t, deno, goW, tripsWithAudit(cases))
}
