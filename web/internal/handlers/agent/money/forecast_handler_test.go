package money

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
)

// §3.7.7's page: what reaches the browser, and what the save sends.

func (wd *world) seedForecast() {
	rows := make([]map[string]any, 0, 4)
	for _, s := range testStages() {
		rows = append(rows, map[string]any{
			"status": s.Status, "weight_pct": s.WeightPct, "trip_count": s.TripCount,
			"raw_cents": itoa(int(s.RawCents)), "weighted_cents": itoa(int(s.WeightedCents)),
			"total_raw_cents": "1110076", "total_weighted_cents": "937516",
		})
	}
	wd.fake.rpc["agent_commission_forecast"] = mustJSON(rows)

	cal := make([]map[string]any, 0, 15)
	for _, r := range testCalendar(20000, 0, 0, 20000) {
		row := map[string]any{"bucket": r.Bucket, "cents": itoa(int(r.Cents)), "received_cents": itoa(int(r.ReceivedCents))}
		if r.MonthStart != nil {
			row["month_start"] = *r.MonthStart
		} else {
			row["month_start"] = nil
		}
		cal = append(cal, row)
	}
	wd.fake.rpc["agent_commission_cash_in"] = mustJSON(cal)
}

func TestForecastPage(t *testing.T) {
	wd := newWorld(t)
	wd.seedForecast()
	rec := wd.get("/agent/commission/forecast")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	has(t, body,
		"Commission forecast", "All open trips",
		"Weighted forecast", "$9,375", "Of $11,101 across 11 open trips · 84% confidence",
		"Inquiry", "Proposal", "Booked", "Traveling", "3 trips", "1 trip",
		"Cash-in calendar", "Overdue", "Oct 2026", "Jan 2027",
		"$200 of the forecast is already received",
		`href="/agent/commission/forecast?edit=1"`,
		`data-w="100"`,
	)
	lacks(t, body,
		"No open trips have commission yet", // there is commission
		`name="weight-booked"`,              // not in edit mode
		"Nothing is expected in the next twelve months.",
	)
}

func TestForecastEditMode(t *testing.T) {
	wd := newWorld(t)
	wd.seedForecast()
	body := wd.get("/agent/commission/forecast?edit=1").Body.String()
	has(t, body,
		`name="weight-inquiry"`, `name="weight-in_progress"`,
		// What the screen showed rides along, so a change made elsewhere is a stale refusal.
		`name="expected-booked"`, `value="100"`,
		"Save weights", "Cancel",
		"Saving also changes the confidence on your worklist",
	)
	lacks(t, body, `href="/agent/commission/forecast?edit=1"`)
}

func TestForecastSaveSendsBothSetsAndRedirects(t *testing.T) {
	wd := newWorld(t)
	wd.seedForecast()
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "60")
		form.Set("expected-"+s, "50")
	}
	rec := wd.post("/agent/commission/forecast", form)
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/agent/commission/forecast" {
		t.Fatalf("status %d to %q", rec.Code, rec.Header().Get("Location"))
	}
	if len(wd.fake.calls) != 1 {
		t.Fatalf("%d function calls", len(wd.fake.calls))
	}
	var body struct {
		Op       string         `json:"op"`
		Weights  map[string]int `json:"weights"`
		Expected map[string]int `json:"expected"`
	}
	raw, _ := json.Marshal(map[string]json.RawMessage(wd.fake.calls[0].Body))
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if body.Op != "weights" || body.Weights["booked"] != 60 || body.Expected["booked"] != 50 {
		t.Fatalf("sent %+v", body)
	}
}

func TestForecastSaveRefusals(t *testing.T) {
	wd := newWorld(t)
	wd.seedForecast()

	// A weight that is not a whole 0-100 never reaches the function.
	form := url.Values{}
	for _, s := range forecastStages {
		form.Set("weight-"+s, "50")
		form.Set("expected-"+s, "50")
	}
	form.Set("weight-booked", "7.5")
	rec := wd.post("/agent/commission/forecast", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec.Body.String(), "Each weight is a whole number from 0 to 100.", `name="weight-booked"`)
	if len(wd.fake.calls) != 0 {
		t.Fatalf("the function was called anyway: %d", len(wd.fake.calls))
	}

	// A 409 is staleness, read off the status and never off the function's English.
	form.Set("weight-booked", "50")
	wd.fake.functions["POST agent-commission"] = reply{Status: 409, Body: `{"detail":"stale"}`}
	rec = wd.post("/agent/commission/forecast", form)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status %d", rec.Code)
	}
	has(t, rec.Body.String(), "These weights were changed somewhere else")

	// Anything else says so and keeps the form open.
	wd.fake.functions["POST agent-commission"] = reply{Status: 500, Body: `{"title":"boom"}`}
	has(t, wd.post("/agent/commission/forecast", form).Body.String(), "save. Try again in a moment.")
}

func TestForecastWithoutOneRowPerStageIsARetry(t *testing.T) {
	// Not one row per open stage is a read that did not answer, not a $0 forecast with a live
	// Adjust button that cannot save.
	wd := newWorld(t)
	wd.seedForecast()
	wd.fake.rpc["agent_commission_forecast"] = "[]"
	rec := wd.get("/agent/commission/forecast")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d, want 503", rec.Code)
	}
	has(t, rec.Body.String(), "That didn’t load", "Commission forecast")
	lacks(t, rec.Body.String(), "Weighted forecast", "Adjust weights")
}
