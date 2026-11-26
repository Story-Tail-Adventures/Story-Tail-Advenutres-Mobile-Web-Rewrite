package cruise

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Ported from supabase/functions/_shared/cruise/client_test.ts, one Go test per Deno.test.
//
// The costly failures this pins down are all about a metered budget: a retry that cannot
// succeed spends requests to learn nothing, an unrecorded attempt makes the ledger lie, and
// an error shape we do not parse turns a 429 into an unhandled crash mid-run.

const testKey = "test-rapidapi-key-do-not-use"

type harnessResult struct {
	client  *Client
	stub    *stub
	records *[]RequestRecord
}

func harness(t *testing.T, responses []stubResponse) harnessResult {
	t.Helper()
	s := stubFetch(responses)
	records := &[]RequestRecord{}
	c, err := NewClient(ClientOptions{
		APIKey: testKey,
		HTTP:   s.client,
		OnRequest: func(_ context.Context, r RequestRecord) error {
			*records = append(*records, r)
			return nil
		},
		// Tests must not actually wait out a backoff.
		Sleep: noSleep,
	})
	if err != nil {
		t.Fatal(err)
	}
	return harnessResult{client: c, stub: s, records: records}
}

func intPtr(n int) *int { return &n }

func eqInt64(t *testing.T, what string, got *int64, want int64) {
	t.Helper()
	if got == nil || *got != want {
		t.Errorf("%s: got %v want %d", what, got, want)
	}
}

func asTrackError(t *testing.T, err error) *TrackCruisesError {
	t.Helper()
	var e *TrackCruisesError
	if !errors.As(err, &e) {
		t.Fatalf("want a TrackCruisesError, got %v", err)
	}
	return e
}

func parseURL(t *testing.T, s string) *url.URL {
	t.Helper()
	u, err := url.Parse(s)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// Deno.test("sends both RapidAPI headers and keeps the key out of the URL")
func TestSendsBothRapidAPIHeadersAndKeepsTheKeyOutOfTheURL(t *testing.T) {
	h := harness(t, []stubResponse{{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(99)}})
	if _, err := h.client.CruiseLines(context.Background()); err != nil {
		t.Fatal(err)
	}
	call := h.stub.calls[0]
	if call.headers["x-rapidapi-key"] != testKey {
		t.Errorf("key header %q", call.headers["x-rapidapi-key"])
	}
	if call.headers["x-rapidapi-host"] != TrackCruisesHost {
		t.Errorf("host header %q", call.headers["x-rapidapi-host"])
	}
	// A key in a query string ends up in every access log between here and there.
	if strings.Contains(call.url, testKey) {
		t.Errorf("key in url %q", call.url)
	}
	if call.url != "https://"+TrackCruisesHost+"/cruise-lines" {
		t.Errorf("url %q", call.url)
	}
}

// Deno.test("captures the quota triple from the response headers")
func TestCapturesTheQuotaTripleFromTheResponseHeaders(t *testing.T) {
	h := harness(t, []stubResponse{{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(87, 100, 604_800)}})
	page, err := h.client.CruiseLines(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	eqInt64(t, "limit", page.Quota.Limit, 100)
	eqInt64(t, "remaining", page.Quota.Remaining, 87)
	eqInt64(t, "reset", page.Quota.ResetSeconds, 604_800)
	eqInt64(t, "record remaining", (*h.records)[0].Quota.Remaining, 87)
}

// Deno.test("survives a response with no quota headers at all")
func TestSurvivesAResponseWithNoQuotaHeadersAtAll(t *testing.T) {
	h := harness(t, []stubResponse{{body: fixture("CRUISE_LINES_PAGE")}})
	page, err := h.client.CruiseLines(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if page.Quota != (QuotaSnapshot{}) {
		t.Errorf("quota %+v", page.Quota)
	}
}

// Deno.test("records rows_returned, which is what exposes a silent tier clamp")
func TestRecordsRowsReturnedWhichExposesASilentTierClamp(t *testing.T) {
	// The provider clamps an over-tier `limit` down to the cap and still answers 200, so a
	// run that asks for 100 and is handed 10 looks healthy without this column.
	h := harness(t, []stubResponse{{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(99)}})
	if _, err := h.client.CruiseLines(context.Background()); err != nil {
		t.Fatal(err)
	}
	r := (*h.records)[0]
	if r.RowsReturned == nil || *r.RowsReturned != 3 {
		t.Errorf("rows %v", r.RowsReturned)
	}
	if r.Endpoint != EndpointCruiseLines || r.Path != "/cruise-lines" {
		t.Errorf("endpoint %q path %q", r.Endpoint, r.Path)
	}
}

// Deno.test("paginates by cursor, and sends no page or offset parameter")
func TestPaginatesByCursorAndSendsNoPageOrOffsetParameter(t *testing.T) {
	h := harness(t, []stubResponse{
		{body: fixture("CRUISES_PAGE_ONE"), headers: quotaHeaders(98)},
		{body: fixture("CRUISES_PAGE_TWO"), headers: quotaHeaders(97)},
	})
	ctx := context.Background()
	first, err := h.client.Cruises(ctx, CruiseListParams{ListParams: ListParams{Limit: intPtr(10), Company: "holland-america"}})
	if err != nil {
		t.Fatal(err)
	}
	if !first.HasMore || first.NextCursor == nil || *first.NextCursor != "cursor-page-2" {
		t.Fatalf("first page: hasMore %v cursor %v", first.HasMore, first.NextCursor)
	}
	second, err := h.client.Cruises(ctx, CruiseListParams{ListParams: ListParams{
		Limit: intPtr(10), Company: "holland-america", StartingAfter: *first.NextCursor,
	}})
	if err != nil {
		t.Fatal(err)
	}
	if second.HasMore || second.NextCursor != nil {
		t.Errorf("second page: hasMore %v cursor %v", second.HasMore, second.NextCursor)
	}
	q := parseURL(t, h.stub.calls[1].url).Query()
	if q.Get("starting_after") != "cursor-page-2" || q.Get("limit") != "10" {
		t.Errorf("query %v", q)
	}
	// Their pagination is cursor-only; sending these is silently ignored, which reads as a
	// loop paying for page one forever.
	for _, k := range []string{"page", "offset", "cursor"} {
		if q.Has(k) {
			t.Errorf("sent %s", k)
		}
	}
}

// Deno.test("omits empty and undefined query parameters entirely")
func TestOmitsEmptyAndUndefinedQueryParametersEntirely(t *testing.T) {
	h := harness(t, []stubResponse{{body: fixture("CRUISES_PAGE_TWO"), headers: quotaHeaders(96)}})
	if _, err := h.client.Cruises(context.Background(), CruiseListParams{ListParams: ListParams{Limit: intPtr(10)}}); err != nil {
		t.Fatal(err)
	}
	q := parseURL(t, h.stub.calls[0].url).Query()
	for _, k := range []string{"company", "locale", "sort"} {
		if q.Has(k) {
			t.Errorf("sent %s", k)
		}
	}
	if got := (*h.records)[0].Query; !slices.Equal(got, Query{{"limit", "10"}}) {
		t.Errorf("record query %v", got)
	}
}

// Deno.test("parses their RFC 9457 problem body")
func TestParsesTheirRFC9457ProblemBody(t *testing.T) {
	r := stubResponse{status: 429, body: fixture("PROBLEM_429"), headers: quotaHeaders(0)}
	h := harness(t, []stubResponse{r, r, r})
	_, err := h.client.CruiseLines(context.Background())
	e := asTrackError(t, err)
	if e.Code != "rate_limit_exceeded" || e.Status == nil || *e.Status != 429 {
		t.Errorf("code %q status %v", e.Code, e.Status)
	}
	if e.RetryAfterSeconds == nil || *e.RetryAfterSeconds != 2 {
		t.Errorf("retry after %v", e.RetryAfterSeconds)
	}
	if e.ProviderRequestID == nil || *e.ProviderRequestID != "01JSAX0000000000000000429" {
		t.Errorf("request id %v", e.ProviderRequestID)
	}
	if e.Permanent {
		t.Error("permanent")
	}
}

// Deno.test("parses the relay's bare message body, which carries no code")
func TestParsesTheRelaysBareMessageBodyWhichCarriesNoCode(t *testing.T) {
	// Shape 2 of the two their §RateLimited response documents. Observed verbatim from a
	// keyless probe of /coverage, an endpoint their spec calls public.
	r := stubResponse{status: 429, body: fixture("RELAY_429")}
	h := harness(t, []stubResponse{r, r, r})
	_, err := h.client.CruiseLines(context.Background())
	e := asTrackError(t, err)
	if e.Code != "rate_limit_exceeded" {
		t.Errorf("code %q", e.Code)
	}
	if !strings.Contains(e.Detail, "rate limit per minute") {
		t.Errorf("detail %q", e.Detail)
	}
	if e.ProviderRequestID != nil {
		t.Errorf("request id %v", *e.ProviderRequestID)
	}
}

// Deno.test("retries a 429 and succeeds, honouring retry_after_seconds")
func TestRetriesA429AndSucceedsHonouringRetryAfterSeconds(t *testing.T) {
	h := harness(t, []stubResponse{
		{status: 429, body: fixture("PROBLEM_429"), headers: quotaHeaders(5)},
		{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(4)},
	})
	page, err := h.client.CruiseLines(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 3 {
		t.Errorf("rows %d", len(page.Data))
	}
	// BOTH attempts are on the record, because the relay counted both.
	rs := *h.records
	if len(rs) != 2 {
		t.Fatalf("records %d", len(rs))
	}
	if rs[0].StatusCode == nil || *rs[0].StatusCode != 429 || rs[0].ErrorCode == nil || *rs[0].ErrorCode != "rate_limit_exceeded" {
		t.Errorf("first record %+v", rs[0])
	}
	if rs[1].StatusCode == nil || *rs[1].StatusCode != 200 || rs[1].ErrorCode != nil {
		t.Errorf("second record %+v", rs[1])
	}
}

// Deno.test("does NOT retry a 403 tier gate — a retry cannot change the answer")
func TestDoesNotRetryA403TierGate(t *testing.T) {
	h := harness(t, []stubResponse{{status: 403, body: fixture("PROBLEM_403")}})
	_, err := h.client.CruiseLines(context.Background())
	e := asTrackError(t, err)
	if e.Code != "tier_insufficient" || !e.Permanent || e.RequiredTier == nil || *e.RequiredTier != "PRO" {
		t.Errorf("error %+v", e)
	}
	// One attempt, one ledger row, two requests saved.
	if len(h.stub.calls) != 1 || len(*h.records) != 1 {
		t.Errorf("calls %d records %d", len(h.stub.calls), len(*h.records))
	}
}

// Deno.test("does NOT retry a 401 — three attempts to learn the key is still bad")
func TestDoesNotRetryA401(t *testing.T) {
	h := harness(t, []stubResponse{{status: 401, body: fixture("RELAY_401")}})
	_, err := h.client.CruiseLines(context.Background())
	e := asTrackError(t, err)
	if e.Code != "unauthorized" || !e.Permanent {
		t.Errorf("error %+v", e)
	}
	if len(h.stub.calls) != 1 {
		t.Errorf("calls %d", len(h.stub.calls))
	}
}

// Deno.test("retries a 5xx, which is the one failure a retry does fix")
func TestRetriesA5xxWhichIsTheOneFailureARetryDoesFix(t *testing.T) {
	h := harness(t, []stubResponse{
		{status: 503, body: js.ObjectValue("message", js.StringValue("upstream unavailable"))},
		{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(50)},
	})
	page, err := h.client.CruiseLines(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 3 || len(h.stub.calls) != 2 {
		t.Errorf("rows %d calls %d", len(page.Data), len(h.stub.calls))
	}
}

// Deno.test("gives up after maxRetries rather than looping on a budget")
func TestGivesUpAfterMaxRetriesRatherThanLoopingOnABudget(t *testing.T) {
	r := stubResponse{status: 503, body: js.ObjectValue()}
	s := stubFetch([]stubResponse{r, r, r, r})
	var records []RequestRecord
	c, err := NewClient(ClientOptions{
		APIKey:     testKey,
		HTTP:       s.client,
		OnRequest:  func(_ context.Context, r RequestRecord) error { records = append(records, r); return nil },
		Sleep:      noSleep,
		MaxRetries: intPtr(2),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.CruiseLines(context.Background())
	asTrackError(t, err)
	// maxRetries 2 means three attempts, not four, and never an unbounded loop.
	if len(s.calls) != 3 || len(records) != 3 || s.remaining() != 1 {
		t.Errorf("calls %d records %d remaining %d", len(s.calls), len(records), s.remaining())
	}
}

// Deno.test("records an attempt that never completed, with a null status")
func TestRecordsAnAttemptThatNeverCompletedWithANullStatus(t *testing.T) {
	// Network-level failure: timeout, DNS, abort. "Never completed" has to be distinguishable
	// in the ledger from "completed with an error".
	var records []RequestRecord
	c, err := NewClient(ClientOptions{
		APIKey: testKey,
		HTTP: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return nil, errors.New("connection reset")
		})},
		OnRequest:  func(_ context.Context, r RequestRecord) error { records = append(records, r); return nil },
		Sleep:      noSleep,
		MaxRetries: intPtr(0),
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.CruiseLines(context.Background())
	asTrackError(t, err)
	if len(records) != 1 {
		t.Fatalf("records %d", len(records))
	}
	if records[0].StatusCode != nil || records[0].ErrorCode == nil || *records[0].ErrorCode != "network_error" {
		t.Errorf("record %+v", records[0])
	}
}

// Deno.test("redacts the api key from anything it is about to persist")
func TestRedactsTheAPIKeyFromAnythingItIsAboutToPersist(t *testing.T) {
	// The key lives only in a header and should never reach an error string, but
	// error_detail outlives the incident, and a credential in a table is worse than the
	// failure that put it there.
	var records []RequestRecord
	c, err := NewClient(ClientOptions{
		APIKey: testKey,
		HTTP: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, _ := js.Marshal(js.ObjectValue("message", js.StringValue("bad key "+testKey+" rejected")))
			return &http.Response{
				StatusCode: 401,
				Header:     http.Header{"Content-Type": {"application/json"}},
				Body:       io.NopCloser(strings.NewReader(string(body))),
				Request:    r,
			}, nil
		})},
		OnRequest: func(_ context.Context, r RequestRecord) error { records = append(records, r); return nil },
		Sleep:     noSleep,
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = c.CruiseLines(context.Background())
	asTrackError(t, err)
	d := records[0].ErrorDetail
	if d == nil || strings.Contains(*d, testKey) || !strings.Contains(*d, "[redacted]") {
		t.Errorf("detail %v", d)
	}
}

// Deno.test("cruise detail passes company, without which the id is ambiguous")
func TestCruiseDetailPassesCompanyWithoutWhichTheIDIsAmbiguous(t *testing.T) {
	// Cruise ids are unique only per line, and Princess and Holland America share the Y731
	// voyage-code format. Omitting company is how you fetch the wrong ship's prices.
	first, _ := fixture("CRUISES_PAGE_ONE").Get("data").Array()
	h := harness(t, []stubResponse{{body: js.ObjectValue("data", first[0]), headers: quotaHeaders(80)}})
	if _, err := h.client.Cruise(context.Background(), "Y731", "holland-america"); err != nil {
		t.Fatal(err)
	}
	u := parseURL(t, h.stub.calls[0].url)
	if u.Path != "/cruises/Y731" || u.Query().Get("company") != "holland-america" {
		t.Errorf("url %s", u)
	}
}

// Deno.test("filter-options accepts a wrapped or unwrapped body")
func TestFilterOptionsAcceptsAWrappedOrUnwrappedBody(t *testing.T) {
	// Their spec does not pin whether this endpoint wraps in `data`, and finding out costs a
	// request. Accept both rather than lose one to a shape assumption.
	list := func(s ...string) js.Value {
		items := make([]js.Value, len(s))
		for i, v := range s {
			items[i] = js.StringValue(v)
		}
		return js.ArrayValue(items...)
	}
	wrapped := harness(t, []stubResponse{{body: js.ObjectValue("data", js.ObjectValue("ports", list("Miami"), "destinations", list("Caribbean")))}})
	a, err := wrapped.client.FilterOptions(context.Background(), "")
	if err != nil || !slices.Equal(a.Data.Ports, []string{"Miami"}) {
		t.Errorf("wrapped: %v, %v", a.Data.Ports, err)
	}
	bare := harness(t, []stubResponse{{body: js.ObjectValue("ports", list("Nassau"), "destinations", list("Bahamas"))}})
	b, err := bare.client.FilterOptions(context.Background(), "")
	if err != nil || !slices.Equal(b.Data.Ports, []string{"Nassau"}) {
		t.Errorf("bare: %v, %v", b.Data.Ports, err)
	}
}

// Deno.test("an unguided 429 is NOT retried — the relay's throttle wants a minute")
func TestAnUnguided429IsNotRetried(t *testing.T) {
	// The relay's per-minute throttle sends no Retry-After and no retry_after_seconds, just a
	// bare message. The window it wants is ~60s against a backoff measured in hundreds of
	// milliseconds, so retrying fails again immediately: three metered requests to learn
	// nothing. Measured in the wild: a scope budgeted for 4 requests spent 6.
	//
	// Giving up is free because the work is resumable: the scope's cursor persists and the
	// next run continues from the same page.
	h := harness(t, []stubResponse{{status: 429, body: fixture("RELAY_429")}})
	_, err := h.client.CruiseLines(context.Background())
	e := asTrackError(t, err)
	if e.Code != "rate_limit_exceeded" || !e.Permanent {
		t.Errorf("error %+v", e)
	}
	// One attempt, one ledger row, two requests saved.
	if len(h.stub.calls) != 1 || len(*h.records) != 1 {
		t.Errorf("calls %d records %d", len(h.stub.calls), len(*h.records))
	}
}

// Deno.test("a 429 that says when to come back IS retried")
func TestA429ThatSaysWhenToComeBackIsRetried(t *testing.T) {
	// Their own backend sends retry_after_seconds, and those waits are short and worth
	// honouring: that is the case the retry path exists for.
	s := stubFetch([]stubResponse{
		{status: 429, body: fixture("PROBLEM_429"), headers: quotaHeaders(5)},
		{body: fixture("CRUISE_LINES_PAGE"), headers: quotaHeaders(4)},
	})
	c, err := NewClient(ClientOptions{APIKey: testKey, HTTP: s.client, Sleep: noSleep})
	if err != nil {
		t.Fatal(err)
	}
	page, err := c.CruiseLines(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 3 || len(s.calls) != 2 {
		t.Errorf("rows %d calls %d", len(page.Data), len(s.calls))
	}
}
