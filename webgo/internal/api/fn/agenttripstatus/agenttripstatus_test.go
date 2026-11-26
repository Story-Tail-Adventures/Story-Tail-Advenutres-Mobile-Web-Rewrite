package agenttripstatus

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

const (
	tripA = "0191a3b4-0000-7000-8000-000000000001"
	tripB = "0191a3b4-0000-7000-8000-000000000002"
	line  = "0191a3b4-0000-7000-8000-0000000000aa"
)

func obj(t *testing.T, s string) js.Value {
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
	_, err := Func(&edge.Deps{}, httptest.NewRequest(http.MethodPut, "/functions/v1/agent-trip-status", nil))
	wantProblem(t, err, 400, "Use POST.")
}

func TestSentences(t *testing.T) {
	if statusDetail != "Send a status of inquiry, proposal, booked, in_progress, completed, cancelled." {
		t.Error(statusDetail)
	}
	if refundDetail != "refundStatus must be one of none_expected, pending, partial, full." {
		t.Error(refundDetail)
	}
	for _, s := range []string{cancelOneAtATime, needsReason} {
		if !strings.Contains(s, " \U00002014 ") {
			t.Errorf("%q lost its em dash", s)
		}
	}
}

func TestParseBulk(t *testing.T) {
	many := make([]string, 101)
	for i := range many {
		many[i] = `{"tripId":"` + tripA + `","fromStatus":"inquiry"}`
	}
	for _, c := range []struct{ name, body, detail string }{
		{"trips missing", `{"op":"bulk"}`, "trips must be a list."},
		{"trips an object", `{"op":"bulk","trips":{}}`, "trips must be a list."},
		{"trips empty", `{"op":"bulk","trips":[]}`, "Pick at least one trip."},
		{"too many", `{"op":"bulk","trips":[` + strings.Join(many, ",") + `],"status":"booked"}`, "That is too many trips."},
		{"no status", `{"op":"bulk","trips":[1]}`, statusDetail},
		{"bad status", `{"op":"bulk","trips":[1],"status":"traveling"}`, statusDetail},
		{"cancelled", `{"op":"bulk","trips":[1],"status":"cancelled"}`, cancelOneAtATime},
		{"entry not an object", `{"op":"bulk","trips":[1],"status":"booked"}`, "That is not a trip id."},
		{"entry null", `{"op":"bulk","trips":[null],"status":"booked"}`, "That is not a trip id."},
		{"entry bad id", `{"op":"bulk","trips":[{"tripId":"x"}],"status":"booked"}`, "That is not a trip id."},
		{"entry no from", `{"op":"bulk","trips":[{"tripId":"` + tripA + `"}],"status":"booked"}`, "Each trip needs the status it was showing."},
		{"second entry bad", `{"op":"bulk","trips":[{"tripId":"` + tripA + `","fromStatus":"inquiry"},{"tripId":"` + tripB + `","fromStatus":"x"}],"status":"booked"}`, "Each trip needs the status it was showing."},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parseBulk(obj(t, c.body))
			wantProblem(t, err, 400, c.detail)
		})
	}
	got, err := parseBulk(obj(t, `{"op":"bulk","trips":[{"tripId":"`+tripA+`","fromStatus":"inquiry"},{"tripId":"`+tripB+`","fromStatus":"proposal"}],"status":"booked"}`))
	if err != nil || got.To != "booked" || strings.Join(got.IDs, ",") != tripA+","+tripB || strings.Join(got.Froms, ",") != "inquiry,proposal" {
		t.Fatalf("got %+v %v", got, err)
	}
}

func TestParse(t *testing.T) {
	head := `{"tripId":"` + tripA + `","expectedVersion":2,`
	for _, c := range []struct{ name, body, detail string }{
		{"no trip id", `{}`, "That is not a trip id."},
		{"bad trip id", `{"tripId":"nope"}`, "That is not a trip id."},
		{"no status", `{"tripId":"` + tripA + `"}`, statusDetail},
		{"status not in the enum", `{"tripId":"` + tripA + `","status":"qualified"}`, statusDetail},
		{"no version", `{"tripId":"` + tripA + `","status":"booked"}`, "Send the expectedVersion the board was rendered from."},
		{"cancelled without a reason", head + `"status":"cancelled"}`, needsReason},
		{"cancelled with a blank reason", head + `"status":"cancelled","cancellationReason":" \t "}`, needsReason},
		{"cancelled with a number", head + `"status":"cancelled","cancellationReason":4}`, needsReason},
		{"reason null on a move", head + `"status":"booked","cancellationReason":null}`, "cancellationReason must be text."},
		{"bad refund status", head + `"status":"cancelled","cancellationReason":"r","refundStatus":"some"}`, refundDetail},
		{"null refund status", head + `"status":"cancelled","cancellationReason":"r","refundStatus":null}`, refundDetail},
		{"refund detail a number", head + `"status":"cancelled","cancellationReason":"r","refundDetail":5}`, "refundDetail must be text."},
		{"refund on a move", head + `"status":"booked","refundStatus":"full"}`, "Refund details belong to a cancellation."},
		{"refund detail on a move", head + `"status":"booked","refundDetail":""}`, "Refund details belong to a cancellation."},
		{"close lines not a list", head + `"status":"cancelled","cancellationReason":"r","closeCommission":{}}`, "closeCommission must be a list."},
		{"close line bad id", head + `"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"x","version":1}]}`, "That is not a commission line id."},
		{"close line twice", head + `"status":"cancelled","cancellationReason":"r","closeCommission":[{"id":"` + line + `","version":1},{"id":"` + strings.ToUpper(line) + `","version":2}]}`, "A commission line is named twice."},
		{"close lines on a move", head + `"status":"booked","closeCommission":[{"id":"` + line + `","version":1}]}`, "Closing commission lines belongs to a cancellation."},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parse(obj(t, c.body))
			wantProblem(t, err, 400, c.detail)
		})
	}

	q, err := parse(obj(t, head+`"status":"cancelled","cancellationReason":"  Storm  ","refundStatus":"pending","refundDetail":"   ","closeCommission":null}`))
	if err != nil {
		t.Fatal(err)
	}
	if q.reasonArg() != "Storm" || q.refundDetailArg() != js.Undef || *q.RefundStatus != "pending" || len(q.CloseLines) != 0 {
		t.Errorf("args %v %v %v %v", q.reasonArg(), q.refundDetailArg(), *q.RefundStatus, q.CloseLines)
	}
	// The audit metadata keeps a blank detail as "" (trimmed), unlike the argument.
	if trimmed(q.RefundDetail) != "" || trimmed(nil) != nil {
		t.Error("trimmed")
	}
	q, err = parse(obj(t, head+`"status":"booked"}`))
	if err != nil || q.reasonArg() != js.Undef || q.RefundStatus != nil || q.refundDetailArg() != js.Undef {
		t.Fatalf("move: %+v %v", q, err)
	}
}

func TestAnswer(t *testing.T) {
	marshal := func(r *edge.Reply) string {
		b, _ := js.Marshal(r.Body)
		return string(b)
	}
	two := int64(2)
	res := result{StageWriteResult: agent.StageWriteResult{Outcome: "changed", FromStatus: "booked", ToStatus: "cancelled", Version: 4}, LinesClosed: &two}
	r, err := answer(request{TripID: tripA, Status: "cancelled"}, res)
	if err != nil {
		t.Fatal(err)
	}
	if got := marshal(r); got != `{"tripId":"`+tripA+`","status":"cancelled","previousStatus":"booked","version":4,"changed":true,"cancellationReasonUpdated":true,"commissionLinesClosed":2,"commissionLinesSkipped":0}` {
		t.Error(got)
	}
	res = result{StageWriteResult: agent.StageWriteResult{Outcome: "noop", FromStatus: "booked", ToStatus: "booked", Version: 4}}
	r, _ = answer(request{TripID: tripA, Status: "booked"}, res)
	if got := marshal(r); got != `{"tripId":"`+tripA+`","status":"booked","version":4,"changed":false}` {
		t.Error(got)
	}
}
