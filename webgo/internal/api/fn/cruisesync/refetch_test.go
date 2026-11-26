package cruisesync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// refetchSailing: the demand-driven branch (index.ts's sailingId path). Not covered by the Deno
// tests; reachable here with a fake relay.

const refetchID = "0190f3b2-1c4e-7d6a-9b2f-3e4d5c6b7a89"

func refetchScript(locale string) script {
	return script{
		sailing: &sailingRef{ID: refetchID, Provider: str("track_cruises"), ProviderKey: str("DT1"),
			ProviderLocale: str(locale), CruiseLineID: "line-1"},
		lineKey:      str("royal-caribbean"),
		upsertReturn: true,
	}
}

// detailRoute answers GET /cruises/DT1 in a market, optionally edited.
func detailRoute(t *testing.T, locale string, edit func(map[string]any)) func(u *url.URL) (int, string, http.Header) {
	return func(u *url.URL) (int, string, http.Header) {
		if u.Path != "/cruises/DT1" || u.Query().Get("company") != "royal-caribbean" {
			t.Errorf("unexpected request %s", u)
		}
		data := map[string]any{
			"cruise_id": "DT1", "company": "royal-caribbean", "locale": locale, "ship_name": "Wonder of the Seas",
			"title": "7 Night Caribbean", "departure_date": "2027-03-01", "duration": 7, "price": 899.5,
			"currency": "USD", "price_euro": 820,
			"cabin_prices_per_person": map[string]any{"interior": 899.5, "oceanview": 999, "suite": nil},
			"ports_list":              []any{map[string]any{"port": "Miami", "day": 1}, map[string]any{"port": "Nassau", "day": 2}},
			"updated_at":              "2026-11-01T00:00:00Z",
		}
		if edit != nil {
			edit(data)
		}
		b, _ := json.Marshal(map[string]any{"data": data, "request_id": "req-1"})
		return 200, string(b), quotaHeaders(100, 80)
	}
}

func TestARefetchInTheSameMarketRefreshesTheFare(t *testing.T) {
	db := newFakeDB(refetchScript("en_US"))
	r := newRelay(nil, relayOpts{})
	r.route = detailRoute(t, "en_US", nil)
	e := testEngine(db, r.client())
	reply, err := e.serve(context.Background(), input{trigger: "cron", sailingID: refetchID})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"sailingId":"` + refetchID + `","cruiseId":"DT1","company":"royal-caribbean","cabinPricesWritten":2,` +
		`"portCallsWritten":2,"leadPriceCents":89950,"currency":"USD",` +
		`"budget":{"ledgerSpent":1,"ceiling":90,"quotaRemaining":80,"quotaLimit":100,"allowance":80,"drift":19}}`
	if got := marshal(t, reply.Body); got != want {
		t.Errorf("reply\n got  %s\n want %s", got, want)
	}

	// The ledger row belongs to no run.
	ledger := db.writesTo("cruise_api_request", "insert")
	if len(ledger) != 1 {
		t.Fatalf("ledger rows %d", len(ledger))
	}
	if v, has := ledger[0].get("run_id"); !has || v != nil {
		t.Errorf("run_id %v", v)
	}
	if v, _ := ledger[0].get("path"); v != "/cruises/DT1" {
		t.Errorf("path %v", v)
	}

	up := db.writesTo("cruise_sailing", "update")
	if len(up) != 1 || up[0].where["id"] != refetchID {
		t.Fatalf("sailing updates %+v", up)
	}
	keys := []string{}
	for _, f := range up[0].payload {
		keys = append(keys, f.Key)
	}
	if got := strings.Join(keys, ","); got != "ship_id,title,departure_date,duration_nights,destinations,itinerary_url,"+
		"provider_updated_at,provider_payload,synced_at,last_seen_at,updated_at,lead_price_cents,currency,lead_price_eur_cents" {
		t.Errorf("patch keys %s", got)
	}
	if v, _ := up[0].get("lead_price_eur_cents"); flat(v) == nil {
		t.Error("no euro fare")
	}

	// The ship stub, keyed by the provider's company, not the line's uuid.
	ship := db.writesTo("cruise_ship", "upsert")
	if len(ship) != 1 {
		t.Fatalf("ship writes %d", len(ship))
	}
	if v, _ := ship[0].get("provider_key"); v != "royal-caribbean:Wonder of the Seas" {
		t.Errorf("ship provider_key %v", v)
	}
	if len(db.writesTo("cruise_port_call", "delete")) != 1 || len(db.writesTo("cruise_port_call", "insert")[0].rows) != 2 {
		t.Error("port calls were not replaced")
	}
	cabins := db.writesTo("cruise_sailing_cabin_price", "upsert")
	if len(cabins) != 1 || marshal(t, cabins[0].rows[0][:4]) != `{"cabin_code":"INTERIOR","price_cents":89950,"currency":"USD","provider_locale":"en_US"}` {
		t.Errorf("cabin prices %+v", cabins)
	}

	if len(db.audits) != 1 || !strings.Contains(string(db.audits[0]), `"event_type":"cruise_sailing.refetched","target_entity":"cruise_sailing",`+
		`"target_id":"`+refetchID+`","metadata":{"cruiseId":"DT1","company":"royal-caribbean","cabinPricesWritten":2,`+
		`"portCallsWritten":2,"skipped":null,"monthToDateSpend":1,"quotaRemaining":80}`) {
		t.Errorf("audit %s", db.audits)
	}
}

func TestARefetchInAnotherMarketLeavesTheFareAlone(t *testing.T) {
	db := newFakeDB(refetchScript("en_US"))
	r := newRelay(nil, relayOpts{})
	r.route = detailRoute(t, "de_DE", func(d map[string]any) { d["currency"] = "EUR" })
	res, err := testEngine(db, r.client()).refetchSailing(context.Background(), refetchID, base)
	if err != nil {
		t.Fatal(err)
	}
	wantSkipped := "provider answered in de_DE, not the row's en_US \U00002014 the sailing's own lead fare was left " +
		"untouched. Cabin prices were stored, tagged de_DE. The detail endpoint takes no locale parameter and ignores one."
	if res.Skipped == nil || *res.Skipped != wantSkipped || res.LeadPriceCents != nil || res.Currency != nil || res.CabinPricesWritten != 2 {
		t.Errorf("result %+v", res)
	}
	up := db.writesTo("cruise_sailing", "update")[0]
	for _, k := range []string{"lead_price_cents", "currency", "lead_price_eur_cents", "provider_locale"} {
		if _, has := up.get(k); has {
			t.Errorf("%s was written for another market", k)
		}
	}
	if got := marshal(t, db.writesTo("cruise_sailing_cabin_price", "upsert")[0].rows[0][:4]); got !=
		`{"cabin_code":"INTERIOR","price_cents":89950,"currency":"EUR","provider_locale":"de_DE"}` {
		t.Errorf("cabin row %s", got)
	}
}

func TestARefetchRefusesRatherThanOverspends(t *testing.T) {
	cases := []struct {
		name  string
		edit  func(*script)
		reply string
	}{
		{"a curated line has no provider company", func(s *script) { s.lineKey = nil },
			`{"sailingId":"` + refetchID + `","cruiseId":"DT1","company":null,"cabinPricesWritten":0,"portCallsWritten":0,` +
				`"leadPriceCents":null,"currency":null,"budget":{"ledgerSpent":0,"ceiling":90,"quotaRemaining":null,"quotaLimit":null,` +
				`"allowance":90,"drift":null},"skipped":"the sailing's line has no provider coverage"}`},
		{"an empty provider key is no company either", func(s *script) { s.lineKey = str("") },
			`"company":null`},
		{"the budget is gone", func(s *script) { s.ledgerSpent = 90 },
			`"company":"royal-caribbean","cabinPricesWritten":0,"portCallsWritten":0,"leadPriceCents":null,"currency":null,` +
				`"budget":{"ledgerSpent":90,"ceiling":90,"quotaRemaining":null,"quotaLimit":null,"allowance":0,"drift":null},` +
				`"skipped":"monthly ceiling reached (90/90 this month)"}`},
		{"the relay says the plan is out", func(s *script) { s.latestQuota = &quotaRow{QuotaLimit: i64(100), QuotaRemaining: i64(0)} },
			`"skipped":"provider reports no requests remaining on the plan"}`},
	}
	for _, c := range cases {
		s := refetchScript("en_US")
		c.edit(&s)
		db := newFakeDB(s)
		res, err := testEngine(db, nil).refetchSailing(context.Background(), refetchID, base) // nil: any request fails the test
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got := marshal(t, res.object()); !strings.Contains(got, c.reply) {
			t.Errorf("%s:\n got %s\n want %s", c.name, got, c.reply)
		}
		if len(db.writes) != 0 {
			t.Errorf("%s: wrote %+v", c.name, db.writes)
		}
	}
}

func TestARefetchOfNoSuchSailingIs404(t *testing.T) {
	db := newFakeDB(script{})
	_, err := testEngine(db, nil).refetchSailing(context.Background(), refetchID, base)
	wantProblem(t, err, 404, "No such sailing.")
}

func TestAnUnusableDetailIsA500(t *testing.T) {
	db := newFakeDB(refetchScript("en_US"))
	r := newRelay(nil, relayOpts{})
	r.route = detailRoute(t, "en_US", func(d map[string]any) { delete(d, "departure_date") })
	_, err := testEngine(db, r.client()).refetchSailing(context.Background(), refetchID, base)
	if err == nil || err.Error() != "provider returned an unusable sailing for royal-caribbean/DT1" {
		t.Fatalf("got %v", err)
	}
	if len(db.writesTo("cruise_api_request", "insert")) != 1 {
		t.Error("the spent request has no ledger row")
	}
}

func TestANullProviderKeyIsSentAsDenoSentIt(t *testing.T) {
	s := refetchScript("en_US")
	s.sailing.ProviderKey = nil
	db := newFakeDB(s)
	r := newRelay(nil, relayOpts{})
	r.route = func(u *url.URL) (int, string, http.Header) {
		return 404, `{"code":"not_found","detail":"no such cruise"}`, nil
	}
	_, err := testEngine(db, r.client()).refetchSailing(context.Background(), refetchID, base)
	if err == nil || describe(err) != "not_found: no such cruise" {
		t.Fatalf("got %v", err)
	}
	// `${null}` in the path, as encodeURIComponent(null) gave.
	if len(r.calls) != 1 || r.calls[0].Path != "/cruises/null" {
		t.Errorf("calls %v", r.calls)
	}
}
