package cruisesync

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/cruise"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// budget.ts: the pre-flight guard and the header that overrules it.

func TestTheHeaderWinsOnlyWhenItIsStricter(t *testing.T) {
	cases := []struct {
		b         Budget
		allowance int64
		drift     string
	}{
		{Budget{LedgerSpent: 10, Ceiling: 90}, 80, "<nil>"},
		{Budget{LedgerSpent: 10, Ceiling: 90, QuotaRemaining: i64(5), QuotaLimit: i64(100)}, 5, "85"},
		// A generous header never grants more than the ceiling: the reserve has to survive it.
		{Budget{LedgerSpent: 10, Ceiling: 90, QuotaRemaining: i64(1000), QuotaLimit: i64(10000)}, 80, "8990"},
		{Budget{LedgerSpent: 95, Ceiling: 90, QuotaRemaining: i64(50)}, 0, "<nil>"},
		{Budget{LedgerSpent: 0, Ceiling: 90, QuotaRemaining: i64(-3), QuotaLimit: i64(100)}, 0, "103"},
	}
	for i, c := range cases {
		got := finalise(c.b)
		drift := "<nil>"
		if got.Drift != nil {
			drift = marshal(t, *got.Drift)
		}
		if got.Allowance != c.allowance || drift != c.drift {
			t.Errorf("%d: allowance %d drift %s", i, got.Allowance, drift)
		}
	}
}

func TestApplyQuotaCountsTheRequestAndKeepsWhatTheHeadersOmit(t *testing.T) {
	b := finalise(Budget{LedgerSpent: 3, Ceiling: 90, QuotaRemaining: i64(40), QuotaLimit: i64(100)})
	b = applyQuota(b, cruise.QuotaSnapshot{}) // a response with no quota headers (a network error)
	if b.LedgerSpent != 4 || *b.QuotaRemaining != 40 || *b.QuotaLimit != 100 || b.Allowance != 40 || *b.Drift != 56 {
		t.Errorf("%+v", b)
	}
	b = applyQuota(b, cruise.QuotaSnapshot{Remaining: i64(0)})
	if b.LedgerSpent != 5 || b.Allowance != 0 || exhaustionReason(b) != "provider reports no requests remaining on the plan" {
		t.Errorf("%+v", b)
	}
}

func TestExhaustionReason(t *testing.T) {
	cases := []struct {
		b    Budget
		want string
	}{
		{Budget{LedgerSpent: 90, Ceiling: 90}, "monthly ceiling reached (90/90 this month)"},
		{Budget{LedgerSpent: 91, Ceiling: 90, QuotaRemaining: i64(4)}, "monthly ceiling reached (91/90 this month)"},
		{Budget{LedgerSpent: 1, Ceiling: 90}, "no allowance left (ceiling 90, relay remaining unknown)"},
		{Budget{LedgerSpent: 1, Ceiling: 90, QuotaRemaining: i64(7)}, "no allowance left (ceiling 90, relay remaining 7)"},
	}
	for _, c := range cases {
		if got := exhaustionReason(c.b); got != c.want {
			t.Errorf("%q", got)
		}
	}
}

func TestMonthStartIsTheUTCFirst(t *testing.T) {
	at := time.Date(2026, 12, 1, 3, 0, 0, 0, time.FixedZone("x", 10*3600)) // still November in UTC
	if got := monthStart(at); got != "2026-11-01T00:00:00.000Z" {
		t.Errorf("%s", got)
	}
}

func TestMonthlyCeilingIsParseInt(t *testing.T) {
	cases := map[string]int64{
		"": 90, "10000": 10000, "  250": 250, "+40": 40, "12abc": 12, "1e3": 1, "0": 90, "-5": 90,
		"abc": 90, "0x10": 90, "99999999999999999999": 9007199254740991,
	}
	for raw, want := range cases {
		if got := monthlyCeiling(raw); got != want {
			t.Errorf("%q: %d, want %d", raw, got, want)
		}
	}
}

func TestReadBudgetTrustsTheLatestQuotaOnRecord(t *testing.T) {
	db := newFakeDB(script{ledgerSpent: 30, latestQuota: &quotaRow{QuotaLimit: i64(100), QuotaRemaining: i64(60)}})
	b, err := testEngine(db, nil).readBudget(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := marshal(t, b); got != `{"ledgerSpent":30,"ceiling":90,"quotaRemaining":60,"quotaLimit":100,"allowance":60,"drift":10}` {
		t.Errorf("%s", got)
	}
	db = newFakeDB(script{failOn: map[string]string{"latestQuotaSince": "boom"}})
	if _, err := testEngine(db, nil).readBudget(context.Background()); err == nil || err.Error() != "cruise quota read failed: boom" {
		t.Errorf("%v", err)
	}
}

func TestTheLedgerRowIsTheRequestAndNeverTheKey(t *testing.T) {
	db := newFakeDB(script{})
	e := testEngine(db, nil)
	status, rows := 429, 0
	code, detail := "rate_limit_exceeded", "slow down"
	run := uuid.New()
	e.recorder(&run)(context.Background(), cruise.RequestRecord{
		Endpoint: cruise.EndpointCruises, Path: "/cruises",
		Query:      cruise.Query{{Key: "limit", Value: "10"}, {Key: "company", Value: "msc"}},
		StatusCode: &status, RowsReturned: &rows, DurationMs: 12,
		Quota:     cruise.QuotaSnapshot{Limit: i64(100), Remaining: i64(80), ResetSeconds: i64(3600)},
		ErrorCode: &code, ErrorDetail: &detail,
	})
	w := db.writesTo("cruise_api_request", "insert")
	if len(w) != 1 {
		t.Fatalf("rows %d", len(w))
	}
	got := marshal(t, w[0].payload)
	want := `"run_id":"` + run + `","endpoint":"cruises","path":"/cruises","query":{"limit":"10","company":"msc"},` +
		`"status_code":429,"rows_returned":0,"duration_ms":12,"provider_request_id":null,"quota_limit":100,` +
		`"quota_remaining":80,"quota_reset_seconds":3600,"error_code":"rate_limit_exceeded","error_detail":"slow down"}`
	if !strings.HasPrefix(got, `{"id":"`) || !strings.HasSuffix(got, want) || strings.Contains(got, "test-key") {
		t.Errorf("%s", got)
	}

	// A failed ledger insert is swallowed: the request is spent either way.
	db = newFakeDB(script{failOn: map[string]string{"insertRequest": "down"}})
	testEngine(db, nil).recorder(nil)(context.Background(), cruise.RequestRecord{Endpoint: cruise.EndpointCruiseDetail})
	if v, has := db.writesTo("cruise_api_request", "insert")[0].get("run_id"); !has || v != nil {
		t.Errorf("run_id %v", v)
	}
}
