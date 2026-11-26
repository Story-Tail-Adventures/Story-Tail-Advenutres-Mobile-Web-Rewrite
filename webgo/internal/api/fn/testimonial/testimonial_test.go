package testimonial

import (
	"math"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const id = "0195a2c0-1a00-4000-8000-0000000000f0" // any uuid: parse checks the shape only

func body(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatalf("parse %s: %v", s, err)
	}
	return v
}

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("PUT", "/functions/v1/testimonial", nil))
	p, ok := problem.As(err)
	if !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Errorf("%v", err)
	}
}

func TestParseRefusals(t *testing.T) {
	with := func(rest string) string { return `{"testimonialId":"` + id + `","body":"Rested."` + rest + `}` }
	for _, c := range []struct{ name, in, detail string }{
		{"no id", `{}`, "Pass testimonialId."},
		{"empty id", `{"testimonialId":""}`, "Pass testimonialId."},
		{"id number", `{"testimonialId":5}`, "Pass testimonialId."},
		{"not a uuid", `{"testimonialId":"draft-1"}`, "That is not a reflection id."},
		{"no body", `{"testimonialId":"` + id + `"}`, "A reflection needs something in it."},
		{"blank body", `{"testimonialId":"` + id + `","body":"  \n "}`, "A reflection needs something in it."},
		{"long body", `{"testimonialId":"` + id + `","body":"` + strings.Repeat("a", 4001) + `"}`,
			"Keep the reflection under 4000 characters."},
		{"long attribution", with(`,"attribution":"` + strings.Repeat("\U0001F600", 61) + `"`),
			"Keep the attribution under 120 characters."},
		{"rating 0", with(`,"rating":0`), "A rating is a whole number from 1 to 5."},
		{"rating 6", with(`,"rating":6`), "A rating is a whole number from 1 to 5."},
		{"rating 2.5", with(`,"rating":2.5`), "A rating is a whole number from 1 to 5."},
		{"rating words", with(`,"rating":"five"`), "A rating is a whole number from 1 to 5."},
		{"rating object", with(`,"rating":{}`), "A rating is a whole number from 1 to 5."},
		{"rating empty string", with(`,"rating":""`), "A rating is a whole number from 1 to 5."},
		{"rating false", with(`,"rating":false`), "A rating is a whole number from 1 to 5."},
		{"rating two items", with(`,"rating":[1,2]`), "A rating is a whole number from 1 to 5."},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := parse(body(t, c.in))
			p, ok := problem.As(err)
			if !ok || p.Status != 400 || p.Detail != c.detail {
				t.Errorf("got %v, want %q", err, c.detail)
			}
		})
	}
}

func TestParseAccepts(t *testing.T) {
	// Number() as JavaScript reads a rating.
	for in, want := range map[string]int64{`4`: 4, `"4"`: 4, `" 2 "`: 2, `"3.0"`: 3, `true`: 1, `[3]`: 3, `"0x3"`: 3, `"1e0"`: 1, `5.0`: 5} {
		got, err := parse(body(t, `{"testimonialId":"`+id+`","body":"x","rating":`+in+`}`))
		if err != nil || got.Rating == nil || *got.Rating != want {
			t.Errorf("rating %s: %v %v", in, got.Rating, err)
		}
	}
	got, err := parse(body(t, `{"testimonialId":"`+strings.ToUpper(id)+`","body":"  Rest. ","attribution":"   ","rating":null,"submit":"true","tripId":""}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Body != "Rest." || got.Attribution != nil || got.Rating != nil || got.Submit || got.TripID == nil || *got.TripID != "" {
		t.Errorf("got %+v", got)
	}
	got, _ = parse(body(t, `{"testimonialId":"`+id+`","body":"x","attribution":" The Hayes family ","submit":true,"tripId":7}`))
	if got.Attribution == nil || *got.Attribution != "The Hayes family" || !got.Submit || got.TripID != nil {
		t.Errorf("got %+v", got)
	}
	// 120 UTF-16 units of attribution and 4000 of body are allowed.
	if _, err := parse(body(t, `{"testimonialId":"`+id+`","body":"`+strings.Repeat("a", 4000)+`","attribution":"`+strings.Repeat("\U0001F600", 60)+`"}`)); err != nil {
		t.Errorf("limits refused: %v", err)
	}
}

func TestJSNumber(t *testing.T) {
	for in, want := range map[string]float64{`[]`: 0, `[[2]]`: 2, `[null]`: 0, `"Infinity"`: math.Inf(1)} {
		v, _ := js.Parse([]byte(in))
		if got := jsNumber(v); got != want {
			t.Errorf("Number(%s) = %v", in, got)
		}
	}
	for _, in := range []string{`{}`, `[{}]`, `"1_0"`, `[1,2]`} {
		v, _ := js.Parse([]byte(in))
		if got := jsNumber(v); !math.IsNaN(got) {
			t.Errorf("Number(%s) = %v, want NaN", in, got)
		}
	}
}

func TestRecentV7Problem(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	for in, want := range map[string]string{
		uuid.NewAt(now):                        "",
		uuid.NewAt(now.Add(-90 * time.Minute)): "UUID v7 timestamp is more than 3600000ms old",
		uuid.NewAt(now.Add(90 * time.Minute)):  "UUID v7 timestamp is more than 3600000ms in the future",
		id:                                     "Not a UUID v7: " + id,
	} {
		if got := recentV7Problem(in, now); got != want {
			t.Errorf("%s: %q, want %q", in, got, want)
		}
	}
}
