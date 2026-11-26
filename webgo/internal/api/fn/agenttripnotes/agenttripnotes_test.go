package agenttripnotes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

const trip = "0191a3b4-0000-7000-8000-000000000001"

func body(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("err = %v, want a %d problem", err, status)
	}
	if p.Status != status || p.Detail != detail {
		t.Fatalf("got %d %q, want %d %q", p.Status, p.Detail, status, detail)
	}
}

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(&edge.Deps{}, httptest.NewRequest(http.MethodGet, "/functions/v1/agent-trip-notes", nil))
	wantProblem(t, err, 400, "Use POST.")
}

func TestParse(t *testing.T) {
	for _, c := range []struct{ name, body, detail string }{
		{"no trip id", `{}`, "That is not a trip id."},
		{"trip id not a string", `{"tripId":5}`, "That is not a trip id."},
		{"trip id not a uuid", `{"tripId":"banana"}`, "That is not a trip id."},
		{"notes missing", `{"tripId":"` + trip + `"}`, "notes must be text."},
		{"notes null", `{"tripId":"` + trip + `","notes":null}`, "notes must be text."},
		{"notes a number", `{"tripId":"` + trip + `","notes":3}`, "notes must be text."},
		{"version missing", `{"tripId":"` + trip + `","notes":""}`, "Send the expectedVersion the board was rendered from."},
		{"version a string", `{"tripId":"` + trip + `","notes":"","expectedVersion":"1"}`, "Send the expectedVersion the board was rendered from."},
		{"version zero", `{"tripId":"` + trip + `","notes":"","expectedVersion":0}`, "Send the expectedVersion the board was rendered from."},
		{"version fraction", `{"tripId":"` + trip + `","notes":"","expectedVersion":1.5}`, "Send the expectedVersion the board was rendered from."},
		{"version past int4", `{"tripId":"` + trip + `","notes":"","expectedVersion":2147483648}`, "Send the expectedVersion the board was rendered from."},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parse(body(t, c.body))
			wantProblem(t, err, 400, c.detail)
		})
	}
	got, err := parse(body(t, `{"tripId":"`+trip+`","notes":"","expectedVersion":2147483647}`))
	if err != nil || got.TripID != trip || got.Notes != "" || got.ExpectedVersion != 2147483647 {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestOutcome(t *testing.T) {
	_, _, err := outcome(trip, false, result{})
	wantProblem(t, err, 404, "No such trip.")
	_, _, err = outcome(trip, true, result{Outcome: "stale", Version: 3})
	wantProblem(t, err, 409, "This trip changed since you opened it. Reload and try again.")

	b, changed, err := outcome(trip, true, result{Outcome: "noop", Version: 3})
	if err != nil || changed {
		t.Fatalf("noop: %v %v", changed, err)
	}
	if s, _ := js.Marshal(b); string(s) != `{"tripId":"`+trip+`","version":3,"changed":false}` {
		t.Errorf("noop body %s", s)
	}
	b, changed, err = outcome(trip, true, result{Outcome: "changed", Version: 4})
	if err != nil || !changed {
		t.Fatalf("changed: %v %v", changed, err)
	}
	if s, _ := js.Marshal(b); string(s) != `{"tripId":"`+trip+`","version":4,"changed":true}` {
		t.Errorf("changed body %s", s)
	}
	// An outcome the SQL learned and this layer did not is our failure: a bare 500.
	_, _, err = outcome(trip, true, result{Outcome: "moved"})
	if _, ok := problem.As(err); ok || err == nil {
		t.Errorf("unknown outcome = %v, want a plain error", err)
	}
}
