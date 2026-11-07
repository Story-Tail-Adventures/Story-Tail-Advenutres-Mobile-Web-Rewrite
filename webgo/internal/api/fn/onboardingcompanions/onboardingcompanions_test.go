package onboardingcompanions

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/onboarding-companions", nil))
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Fatalf("err = %v", err)
	}
}

func obj(t *testing.T, s string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func wantProblem(t *testing.T, label string, err error, status int, detail string) {
	t.Helper()
	if p, ok := problem.As(err); !ok || p.Status != status || p.Detail != detail {
		t.Errorf("%s: err = %v, want %d %q", label, err, status, detail)
	}
}

func TestParseAction(t *testing.T) {
	for body, want := range map[string]string{
		`{}`: "add", `{"action":null}`: "add", `{"action":"  "}`: "add", `{"action":" edit "}`: "edit",
		`{"action":"remove"}`: "remove", `{"action":"none"}`: "none", `{"action":"Delete"}`: "Delete",
	} {
		got, err := parseAction(obj(t, body))
		if err != nil || got != want {
			t.Errorf("%s: %q %v", body, got, err)
		}
	}
	_, err := parseAction(obj(t, `{"action":1}`))
	wantProblem(t, "number", err, 400, "action must be a string or null.")
}

func TestRequireID(t *testing.T) {
	const id = "0195a2c0-1a00-7000-8000-000000000013"
	for body, want := range map[string]string{
		`{}`:                   "This action needs the companion's id.",
		`{"id":null}`:          "This action needs the companion's id.",
		`{"id":"   "}`:         "This action needs the companion's id.",
		`{"id":"abc"}`:         "That is not a companion id.",
		`{"id":"` + id + `x"}`: "That is not a companion id.",
		`{"id":7}`:             "id must be a string or null.",
	} {
		_, err := requireID(obj(t, body))
		wantProblem(t, body, err, 400, want)
	}
	got, err := requireID(obj(t, `{"id":" `+id+` "}`))
	if err != nil || got != id {
		t.Errorf("%q %v", got, err)
	}
}

func TestParseCompanionRefusals(t *testing.T) {
	long := func(n int) string { return strings.Repeat("a", n) }
	cases := map[string]string{
		`{}`:                                                "A companion needs a first and a last name.",
		`{"firstName":"Sam"}`:                               "A companion needs a first and a last name.",
		`{"firstName":" ","lastName":"Lee"}`:                "A companion needs a first and a last name.",
		`{"firstName":1,"lastName":"Lee"}`:                  "firstName must be a string or null.",
		`{"firstName":"Sam","lastName":false}`:              "lastName must be a string or null.",
		`{"firstName":"` + long(81) + `","lastName":"Lee"}`: "A name is at most 80 characters.",
		`{"firstName":"Sam","lastName":"` + long(81) + `"}`: "A name is at most 80 characters.",
		`{"firstName":"Sam","lastName":"Lee","relationship":"` + long(41) + `"}`: "A relationship is at most 40 characters.",
		`{"firstName":"Sam","lastName":"Lee","relationship":[]}`:                 "relationship must be a string or null.",
		`{"firstName":"Sam","lastName":"Lee","passportNumber":null}`:             "Passport numbers are not accepted yet \U00002014 send only passportExpiry and passportCountry.",
		`{"firstName":"Sam","lastName":"Lee","dateOfBirth":"2001-13-01"}`:        "dateOfBirth is not a real date.",
		`{"firstName":"Sam","lastName":"Lee","passportExpiry":"tomorrow"}`:       "passportExpiry must be a date in YYYY-MM-DD form.",
		`{"firstName":"Sam","lastName":"Lee","passportCountry":"U"}`:             "passportCountry must be a two-letter country code.",
		// Order: the passport number is refused before the dates are read.
		`{"firstName":"Sam","lastName":"Lee","passportNumber":"1","dateOfBirth":"x"}`: "Passport numbers are not accepted yet \U00002014 send only passportExpiry and passportCountry.",
	}
	for body, want := range cases {
		_, err := parseCompanion(obj(t, body), "now")
		wantProblem(t, body, err, 400, want)
	}
}

// A full replace: every column is written, absent ones as null.
func TestParseCompanionRow(t *testing.T) {
	row, err := parseCompanion(obj(t, `{"firstName":" Sam ","lastName":"Lee","passportCountry":"gb","dateOfBirth":"2012-02-29"}`), "2026-11-06T00:00:00.000Z")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := js.Marshal(row.object())
	want := `{"first_name":"Sam","last_name":"Lee","relationship":null,"date_of_birth":"2012-02-29","passport_expiry":null,"passport_country":"GB","updated_at":"2026-11-06T00:00:00.000Z"}`
	if string(b) != want {
		t.Errorf("\n got %s\nwant %s", b, want)
	}
	if got := strings.Join(rowFields, ","); got != "date_of_birth,first_name,last_name,passport_country,passport_expiry,relationship,updated_at" {
		t.Errorf("fields %s", got)
	}
}
