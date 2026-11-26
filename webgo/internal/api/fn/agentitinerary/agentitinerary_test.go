package agentitinerary

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

const (
	idA = "0191a3b4-0000-7000-8000-000000000001"
	idB = "0191a3b4-0000-7000-8000-000000000002"
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
	_, err := Func(&edge.Deps{}, httptest.NewRequest(http.MethodGet, "/functions/v1/agent-itinerary", nil))
	wantProblem(t, err, 400, "Use POST.")
}

func TestRequireOp(t *testing.T) {
	for _, v := range []string{`{}`, `{"op":"Generate"}`, `{"op":1}`} {
		_, err := requireOp(obj(t, v).Get("op"))
		wantProblem(t, err, 400, "op must be one of generate, day_upsert, activity_upsert, activity_delete, reorder.")
	}
	if op, err := requireOp(obj(t, `{"op":"reorder"}`).Get("op")); err != nil || op != "reorder" {
		t.Fatal(op, err)
	}
}

func TestStr(t *testing.T) {
	long := strings.Repeat("\U0001F334", 61) // 122 UTF-16 units, 61 characters
	for _, c := range []struct {
		body     string
		required bool
		want     any // string, nil, or an error detail prefixed "!"
	}{
		{`{}`, false, nil},
		{`{"v":null}`, false, nil},
		{`{"v":""}`, false, nil},
		{`{"v":"   "}`, false, nil},
		{`{"v":" Beach day "}`, false, "Beach day"},
		{`{"v":3}`, false, "!Label must be text."},
		{`{}`, true, "!Label is required."},
		{`{"v":"  "}`, true, "!Label is required."},
		{`{"v":"` + long + `"}`, false, "!Label is too long."},
	} {
		got, err := str(obj(t, c.body).Get("v"), "Label", maxLabel, c.required)
		switch w := c.want.(type) {
		case nil:
			if err != nil || got != nil {
				t.Errorf("%s: %v %v", c.body, got, err)
			}
		case string:
			if strings.HasPrefix(w, "!") {
				wantProblem(t, err, 400, w[1:])
			} else if err != nil || got == nil || *got != w {
				t.Errorf("%s: %v %v", c.body, got, err)
			}
		}
	}
}

func TestDayFields(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{"date":"2026-1-01"}`, "Date must be a date."},
		{`{"date":20260101}`, "Date must be a date."},
	} {
		_, err := isoDate(obj(t, c.body).Get("date"), "Date", false)
		wantProblem(t, err, 400, c.detail)
	}
	_, err := isoDate(obj(t, `{}`).Get("date"), "Date", true)
	wantProblem(t, err, 400, "Date is required.")
	// The shape only: Postgres judges the calendar.
	if d, err := isoDate(obj(t, `{"date":"2026-13-45"}`).Get("date"), "Date", true); err != nil || *d != "2026-13-45" {
		t.Fatal(d, err)
	}
	_, err = optionalID(obj(t, `{"dayId":"x"}`).Get("dayId"), "day id")
	wantProblem(t, err, 400, "That is not a day id.")
	if id, err := optionalID(obj(t, `{"dayId":""}`).Get("dayId"), "day id"); err != nil || id != nil {
		t.Fatal(id, err)
	}
}

func TestActivityArgs(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{"activityId":"nope"}`, "That is not a activity id."},
		{`{"dayId":5}`, "That is not a day id."},
		{`{"dayId":"` + idA + `"}`, "Title is required."},
		{`{"title":"x","block":"night"}`, "block must be one of morning, afternoon, evening, all_day."},
		{`{"title":"x","startTime":"9am"}`, "Start time must be a time like 14:30."},
		{`{"title":"x","endTime":"24:00"}`, "End time is not a real time."},
		{`{"title":"x","body":7}`, "Description must be text."},
		{`{"title":"x","phone":"` + strings.Repeat("1", 41) + `"}`, "Phone is too long."},
		{`{"title":"x","confirmationNumber":"` + strings.Repeat("A", 81) + `"}`, "Confirmation number is too long."},
		{`{"title":"x","gyasisTip":true}`, "Tip must be text."},
	} {
		_, _, err := activityArgs(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
	args, id, err := activityArgs(obj(t, `{"activityId":"`+idA+`","title":" Snorkel ","block":"","startTime":"09:30","location":" "}`))
	if err != nil || id == nil || *id != idA {
		t.Fatal(id, err)
	}
	b, _ := js.Marshal(args)
	want := `{"p_activity_id":"` + idA + `","p_day_id":null,"p_title":"Snorkel","p_block":null,"p_start_time":"09:30:00","p_end_time":null,` +
		`"p_body":null,"p_location":null,"p_address":null,"p_phone":null,"p_confirmation_number":null,"p_gyasis_tip":null}`
	if string(b) != want {
		t.Errorf("args\n got %s\nwant %s", b, want)
	}
}

func TestReorderIDs(t *testing.T) {
	many := make([]string, 201)
	for i := range many {
		many[i] = `"` + idA + `"`
	}
	for _, c := range []struct{ body, detail string }{
		{`{}`, "That is not a day id."},
		{`{"dayId":"` + idA + `"}`, "Send the activities in their new order."},
		{`{"dayId":"` + idA + `","activityIds":[]}`, "Send the activities in their new order."},
		{`{"dayId":"` + idA + `","activityIds":"` + idB + `"}`, "Send the activities in their new order."},
		{`{"dayId":"` + idA + `","activityIds":[` + strings.Join(many, ",") + `]}`, "That is too many activities."},
		{`{"dayId":"` + idA + `","activityIds":["` + idB + `",null]}`, "That is not a activity id."},
		{`{"dayId":"` + idA + `","activityIds":["` + idB + `","` + idB + `"]}`, "That order lists an activity twice."},
	} {
		_, _, err := reorderIDs(obj(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
	// new Set compares strings exactly, so the same id in two cases is not "twice" here.
	day, ids, err := reorderIDs(obj(t, `{"dayId":"`+idA+`","activityIds":["`+idB+`","`+strings.ToUpper(idB)+`"]}`))
	if err != nil || day != idA || len(ids) != 2 {
		t.Fatal(day, ids, err)
	}
}
