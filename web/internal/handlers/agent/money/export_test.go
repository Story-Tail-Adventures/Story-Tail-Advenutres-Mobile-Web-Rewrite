package money

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"testing"
)

// §3.7.2's Export route, a port of
// app/(agent)/agent/commission/ledger/export/route.test.ts.
//
// What it must get right, beyond "returns a CSV": the file is filtered EXACTLY as the screen
// was (the same parser reads both URLs), a malformed filter never reaches the function, and
// Excel reads accented names correctly (the byte-order mark). The audit row is the SQL
// function's job and is tested there.

func csvReply(csv string) reply {
	return reply{Status: 200, Body: mustJSON(map[string]any{"outcome": "exported", "rowCount": 1, "csv": csv})}
}

func TestExportPassesTheLedgersFiltersThrough(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = csvReply("Trip\r\n")
	rec := wd.get("/agent/commission/ledger/export?status=lost&status=bogus&supplier=nope&from=2026-01-01&to=2026-02-31")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if len(wd.fake.calls) != 1 {
		t.Fatalf("%d function calls", len(wd.fake.calls))
	}
	var body struct {
		Op      string `json:"op"`
		Filters struct {
			Statuses   []string `json:"statuses"`
			SupplierID *string  `json:"supplierId"`
			TripID     *string  `json:"tripId"`
			TravelFrom *string  `json:"travelFrom"`
			TravelTo   *string  `json:"travelTo"`
		} `json:"filters"`
	}
	raw, _ := json.Marshal(map[string]json.RawMessage(wd.fake.calls[0].Body))
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if body.Op != "export" {
		t.Errorf("op is %q", body.Op)
	}
	if len(body.Filters.Statuses) != 1 || body.Filters.Statuses[0] != "lost" {
		t.Errorf("statuses are %v", body.Filters.Statuses)
	}
	// "nope" is not a uuid and 2026-02-31 is not a date: neither reaches the function.
	if body.Filters.SupplierID != nil || body.Filters.TripID != nil || body.Filters.TravelTo != nil {
		t.Errorf("a malformed filter was passed on: %+v", body.Filters)
	}
	if body.Filters.TravelFrom == nil || *body.Filters.TravelFrom != "2026-01-01" {
		t.Errorf("travelFrom is %v", body.Filters.TravelFrom)
	}
}

func TestExportAnswersWithAnAttachment(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = csvReply("Trip\r\nRoatán\r\n")
	rec := wd.get("/agent/commission/ledger/export")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/csv; charset=utf-8" {
		t.Errorf("content type is %q", got)
	}
	disp := rec.Header().Get("Content-Disposition")
	if !regexp.MustCompile(`^attachment; filename="commission-ledger-\d{4}-\d{2}-\d{2}\.csv"$`).MatchString(disp) {
		t.Errorf("content disposition is %q", disp)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache control is %q", got)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("nosniff is %q", got)
	}
	body := rec.Body.Bytes()
	// EF BB BF: the UTF-8 byte-order mark, without which Excel reads "Roatán" as "RoatÃ¡n".
	if len(body) < 3 || body[0] != 0xef || body[1] != 0xbb || body[2] != 0xbf {
		t.Fatalf("no byte-order mark: % x", body[:min(3, len(body))])
	}
	if !strings.Contains(string(body), "Roatán") {
		t.Error("the CSV did not come through")
	}
}

func TestExportSendsASignedOutCallerToSignIn(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = reply{Status: 401, Body: `{"title":"Unauthorized"}`}
	rec := wd.get("/agent/commission/ledger/export")
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status %d", rec.Code)
	}
	if to := rec.Header().Get("Location"); !strings.HasPrefix(to, "/login?next=") {
		t.Fatalf("sent to %q", to)
	}
}

func TestExportRefusesACrossSiteRequest(t *testing.T) {
	// SameSite=Lax cookies ride along on a cross-site top-level navigation, so a link
	// elsewhere could otherwise make a signed-in advisor's browser "export" — and write the
	// audit row that goes with it.
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = csvReply("Trip\r\n")
	rec := wd.get("/agent/commission/ledger/export", [2]string{"Sec-Fetch-Site", "cross-site"})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d", rec.Code)
	}
	if len(wd.fake.calls) != 0 {
		t.Fatalf("the export ran anyway: %d calls", len(wd.fake.calls))
	}
}

func TestExportDoesNotAnswerHEADByRunningAnExport(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = csvReply("Trip\r\n")
	rec := wd.do(http.MethodHead, "/agent/commission/ledger/export")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d", rec.Code)
	}
	if got := rec.Header().Get("Allow"); got != "GET" {
		t.Errorf("Allow is %q", got)
	}
	if len(wd.fake.calls) != 0 {
		t.Fatalf("the export ran anyway: %d calls", len(wd.fake.calls))
	}
}

func TestExportTreatsA200WithNoCSVAsAFailure(t *testing.T) {
	// A function that changed shape, not an empty ledger: an empty ledger still has a
	// header row.
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = reply{Status: 200, Body: `{"outcome":"exported"}`}
	rec := wd.get("/agent/commission/ledger/export")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestExportSaysSoInWordsWhenTheFunctionFails(t *testing.T) {
	wd := newWorld(t)
	wd.fake.functions["POST agent-commission"] = reply{Status: 500, Body: `{"title":"Server error"}`}
	rec := wd.get("/agent/commission/ledger/export")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "didn't come through") {
		t.Fatalf("body is %q", rec.Body.String())
	}
}
