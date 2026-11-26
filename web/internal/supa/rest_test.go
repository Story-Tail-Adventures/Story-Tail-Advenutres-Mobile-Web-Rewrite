package supa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type tripRow struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	TotalCents int64  `json:"total_cents"`
}

type restSeen struct {
	method, path, query, auth, apikey, ctype, body string
}

func fakeRest(t *testing.T, status int, reply string) (*Client, *restSeen) {
	t.Helper()
	got := &restSeen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*got = restSeen{r.Method, r.URL.Path, r.URL.RawQuery, r.Header.Get("Authorization"), r.Header.Get("apikey"), r.Header.Get("Content-Type"), string(b)}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL, "anon-key", nil), got
}

func TestSelectReadsAsTheVisitor(t *testing.T) {
	c, got := fakeRest(t, 200, `[{"id":"a","title":"Aruba","total_cents":9007199254740993}]`)
	rows, err := Select[tripRow](context.Background(), c, "visitor-token", "trip",
		Q().Select("id,title,total_cents").Eq("client_id", "x&y=z").Order("starts_on", true).Limit(20))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Title != "Aruba" {
		t.Fatalf("rows = %+v", rows)
	}
	// Above 2^53: a float64 would have rounded it. Cents stay exact.
	if rows[0].TotalCents != 9007199254740993 {
		t.Errorf("cents = %d, lost precision", rows[0].TotalCents)
	}
	if got.method != "GET" || got.path != "/rest/v1/trip" {
		t.Errorf("request %s %s", got.method, got.path)
	}
	if got.auth != "Bearer visitor-token" || got.apikey != "anon-key" {
		t.Errorf("auth %q apikey %q: must be the visitor's token and the anon key", got.auth, got.apikey)
	}
	// The value is a literal: & and = are encoded, not new parameters.
	if !strings.Contains(got.query, "client_id=eq.x%26y%3Dz") || strings.Contains(got.query, "&y=z") {
		t.Errorf("query %q", got.query)
	}
	for _, want := range []string{"order=starts_on.asc", "limit=20", "select=id%2Ctitle%2Ctotal_cents"} {
		if !strings.Contains(got.query, want) {
			t.Errorf("query %q lacks %s", got.query, want)
		}
	}
}

func TestSelectWithoutATokenIsAnonymous(t *testing.T) {
	c, got := fakeRest(t, 200, `[]`)
	if _, err := Select[tripRow](context.Background(), c, "", "trip", Q()); err != nil {
		t.Fatal(err)
	}
	if got.auth != "Bearer anon-key" {
		t.Errorf("auth %q", got.auth)
	}
}

func TestInQuotesItsValues(t *testing.T) {
	q := Q().In("status", "booked", `a,b)"c`)
	if got := q.Encode(); got != "status=in.%28%22booked%22%2C%22a%2Cb%29%5C%22c%22%29" {
		t.Errorf("In = %s", got)
	}
}

func TestUntypedResultsAreRefused(t *testing.T) {
	c, got := fakeRest(t, 200, `[{"total_cents":1}]`)
	if _, err := Select[map[string]any](context.Background(), c, "t", "trip", Q()); err == nil {
		t.Error("map[string]any was accepted")
	}
	if _, err := Select[any](context.Background(), c, "t", "trip", Q()); err == nil {
		t.Error("any was accepted")
	}
	if _, err := RPC[[]map[string]any](context.Background(), c, "t", "agent_worklist", nil); err == nil {
		t.Error("[]map[string]any was accepted from an RPC")
	}
	type nested struct {
		Trip  tripRow        `json:"trip"`
		Extra map[string]any `json:"extra"`
	}
	if _, err := Select[nested](context.Background(), c, "t", "trip", Q()); err == nil || !strings.Contains(err.Error(), "extra") {
		t.Errorf("a nested map[string]any was accepted: %v", err)
	}
	type floatCents struct {
		TotalCents float64 `json:"total_cents"`
	}
	if _, err := Select[floatCents](context.Background(), c, "t", "trip", Q()); err == nil || !strings.Contains(err.Error(), "total_cents") {
		t.Errorf("float cents were accepted: %v", err)
	}
	type rate struct {
		Rate float64 `json:"commission_rate"` // a float that is not money is fine
		Self *rate   `json:"self"`            // and a recursive type terminates
	}
	if err := typed[rate](); err != nil {
		t.Errorf("a non-money float was refused: %v", err)
	}
	if got.path != "" {
		t.Error("an untyped read was sent at all")
	}
}

func TestNamesMustBeIdentifiers(t *testing.T) {
	c, _ := fakeRest(t, 200, `[]`)
	for _, bad := range []string{"trip?select=*", "../auth/v1/user", "Trip", "rpc/x", ""} {
		if _, err := Select[tripRow](context.Background(), c, "t", bad, Q()); err == nil {
			t.Errorf("table %q accepted", bad)
		}
		if _, err := RPC[tripRow](context.Background(), c, "t", bad, nil); err == nil {
			t.Errorf("function %q accepted", bad)
		}
	}
}

func TestMaybeOne(t *testing.T) {
	c, _ := fakeRest(t, 200, `[]`)
	if _, found, err := MaybeOne[tripRow](context.Background(), c, "t", "trip", Q()); err != nil || found {
		t.Errorf("none: found=%v err=%v", found, err)
	}
	c, _ = fakeRest(t, 200, `[{"id":"a"}]`)
	if row, found, err := MaybeOne[tripRow](context.Background(), c, "t", "trip", Q()); err != nil || !found || row.ID != "a" {
		t.Errorf("one: %+v %v %v", row, found, err)
	}
	c, _ = fakeRest(t, 200, `[{"id":"a"},{"id":"b"}]`)
	if _, _, err := MaybeOne[tripRow](context.Background(), c, "t", "trip", Q()); !errors.Is(err, ErrMultipleRows) {
		t.Errorf("two: %v", err)
	}
}

func TestRPCPostsItsArguments(t *testing.T) {
	c, got := fakeRest(t, 200, `{"id":"a","title":"Aruba","total_cents":120000}`)
	type args struct {
		TripID string `json:"p_trip_id"`
	}
	row, err := RPC[tripRow](context.Background(), c, "visitor", "agent_trip_detail", args{"abc"})
	if err != nil {
		t.Fatal(err)
	}
	if row.TotalCents != 120000 {
		t.Errorf("row %+v", row)
	}
	if got.method != "POST" || got.path != "/rest/v1/rpc/agent_trip_detail" || got.ctype != "application/json" {
		t.Errorf("request %s %s %s", got.method, got.path, got.ctype)
	}
	var sent map[string]string
	if json.Unmarshal([]byte(got.body), &sent) != nil || sent["p_trip_id"] != "abc" {
		t.Errorf("body %q", got.body)
	}
	// A void function answers 204 with no body: no error, zero value.
	c, _ = fakeRest(t, 204, ``)
	if _, err := RPC[tripRow](context.Background(), c, "v", "touch", nil); err != nil {
		t.Errorf("204: %v", err)
	}
}

func TestRestErrors(t *testing.T) {
	for _, c := range []struct {
		status int
		reply  string
		check  func(error) bool
	}{
		{401, `{"message":"JWT expired"}`, func(err error) bool { return errors.Is(err, ErrUnauthenticated) }},
		// A 403 is a refusal for a signed-in visitor (a grant or RLS), not a lost session.
		{403, `{"code":"42501"}`, func(err error) bool {
			var pe *Error
			return errors.As(err, &pe) && pe.Status == 403 && pe.Code == "42501" && !errors.Is(err, ErrUnauthenticated)
		}},
		{302, ``, func(err error) bool { return errors.Is(err, ErrUnavailable) }},
		{500, `{}`, func(err error) bool { return errors.Is(err, ErrUnavailable) }},
		{400, `{"code":"22P02","message":"invalid input syntax for type uuid: \"Jordan Hale\""}`, func(err error) bool {
			var pe *Error
			// The code is kept; the message, which quotes the value, is not.
			return errors.As(err, &pe) && pe.Status == 400 && pe.Code == "22P02" && !strings.Contains(err.Error(), "Jordan")
		}},
	} {
		cl, _ := fakeRest(t, c.status, c.reply)
		_, err := Select[tripRow](context.Background(), cl, "t", "trip", Q())
		if !c.check(err) {
			t.Errorf("%d: err = %v", c.status, err)
		}
	}

	// A reply that does not fit the type names the field, never the value.
	cl, _ := fakeRest(t, 200, `[{"id":"a","total_cents":1234.5}]`)
	if _, err := Select[tripRow](context.Background(), cl, "t", "trip", Q()); err == nil || strings.Contains(err.Error(), "1234") || !strings.Contains(err.Error(), "total_cents") {
		t.Errorf("decode error: %v", err)
	}

	// Unreachable: the error names the path, never the query.
	cl = New("http://127.0.0.1:1", "anon", nil)
	_, err := Select[tripRow](context.Background(), cl, "t", "client", Q().Eq("email", "jordan@example.com"))
	if !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "jordan") {
		t.Errorf("unreachable: %v", err)
	}
}
