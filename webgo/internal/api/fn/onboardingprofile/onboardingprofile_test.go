package onboardingprofile

import (
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func TestMethodIsCheckedFirst(t *testing.T) {
	_, err := Func(nil, httptest.NewRequest("GET", "/functions/v1/onboarding-profile", nil))
	if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != "Use POST." {
		t.Fatalf("err = %v", err)
	}
}

func mustParse(t *testing.T, body string) request {
	t.Helper()
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	req, err := parse(v)
	if err != nil {
		t.Fatalf("%s: %v", body, err)
	}
	return req
}

// Every refusal, in the order the Deno function reaches them.
func TestParseRefusals(t *testing.T) {
	cases := map[string]string{
		`{"phone":5}`:                                       "phone must be a string or null.",
		`{"phone":"abc"}`:                                   "phone does not look like a phone number.",
		`{"phone":"12345"}`:                                 "phone needs a country code unless it is a US number.",
		`{"phone":"1234567890"}`:                            "phone does not look like a phone number.",
		`{"phone":"+12"}`:                                   "phone does not look like a phone number.",
		`{"dateOfBirth":"1990/01/01"}`:                      "dateOfBirth must be a date in YYYY-MM-DD form.",
		`{"dateOfBirth":"2026-02-30"}`:                      "dateOfBirth is not a real date.",
		`{"dateOfBirth":false}`:                             "dateOfBirth must be a string or null.",
		`{"emergencyContact":[]}`:                           "emergencyContact must be an object or null.",
		`{"emergencyContact":"Sam"}`:                        "emergencyContact must be an object or null.",
		`{"emergencyContact":{"name":5}}`:                   "name must be a string or null.",
		`{"emergencyContact":{"name":"A"}}`:                 "An emergency contact needs both a name and a phone number.",
		`{"emergencyContact":{"phone":"+447700900123"}}`:    "An emergency contact needs both a name and a phone number.",
		`{"emergencyContact":{"name":"A","phone":"nope"}}`:  "The emergency contact's phone does not look like a phone number.",
		`{"emergencyContact":{"name":"A","phone":"55501"}}`: "The emergency contact's phone needs a country code unless it is a US number.",
		`{"emergencyContact":{"name":"A","phone":"3055550184","relationship":1}}`: "relationship must be a string or null.",
		`{"address":1}`:                  "address must be an object or null.",
		`{"address":[]}`:                 "address must be an object or null.",
		`{"address":{"line1":"1 Main"}}`: "An address needs a street, a city and a country.",
		`{"address":{"region":"FL"}}`:    "An address needs a street, a city and a country.",
		`{"address":{"line1":"1 Main","city":"Miami","country":"usa"}}`: "country must be a two-letter country code.",
		`{"address":{"line1":7}}`:               "line1 must be a string or null.",
		`{"address":{"postalCode":7}}`:          "postalCode must be a string or null.",
		`{"passport":"x"}`:                      "passport must be an object or null.",
		`{"passport":{"number":"X1"}}`:          "Passport numbers are not accepted yet \U00002014 send only expiresOn and issuingCountry.",
		`{"passport":{"number":null}}`:          "Passport numbers are not accepted yet \U00002014 send only expiresOn and issuingCountry.",
		`{"passport":{"expiresOn":"soon"}}`:     "expiresOn must be a date in YYYY-MM-DD form.",
		`{"passport":{"issuingCountry":"GBR"}}`: "issuingCountry must be a two-letter country code.",
		// Order: the phone is read before everything else.
		`{"passport":{"number":"1"},"phone":"abc"}`: "phone does not look like a phone number.",
		`{"address":1,"emergencyContact":1}`:        "emergencyContact must be an object or null.",
	}
	for body, want := range cases {
		v, err := js.ParseObject([]byte(body))
		if err != nil {
			t.Fatal(err)
		}
		_, err = parse(v)
		if p, ok := problem.As(err); !ok || p.Status != 400 || p.Detail != want {
			t.Errorf("%s: err = %v, want %q", body, err, want)
		}
	}
}

func TestParseEmptyIsSkip(t *testing.T) {
	req := mustParse(t, `{}`)
	if req.phone.Set || req.dateOfBirth.Set || req.emergencySet || req.addressSet || req.passportSet || req.advance {
		t.Errorf("%+v", req)
	}
	if !mustParse(t, `{"advance":true}`).advance || mustParse(t, `{"advance":"true"}`).advance {
		t.Error("advance must be the boolean true")
	}
}

func TestParseValues(t *testing.T) {
	req := mustParse(t, `{"phone":" (305) 555-0184 ","dateOfBirth":"1990-04-02",
		"emergencyContact":{"name":" Ana ","phone":"+44 7700 900123","relationship":""},
		"address":{"line1":"1 Main","line2":"  ","city":"Miami","country":"us","postalCode":"33101"},
		"passport":{"expiresOn":"2031-01-31","issuingCountry":"gb"}}`)
	if *req.phone.Value != "+13055550184" || *req.dateOfBirth.Value != "1990-04-02" {
		t.Errorf("phone/dob %+v", req)
	}
	e := req.emergency
	if !req.emergencySet || e == nil || e.Name != "Ana" || e.Phone != "+447700900123" || e.Relationship != nil {
		t.Errorf("emergency %+v", e)
	}
	b, _ := js.Marshal(e)
	if string(b) != `{"name":"Ana","phone":"+447700900123","relationship":null}` {
		t.Errorf("emergency json %s", b)
	}
	a := req.address
	if a == nil || a.Line1 != "1 Main" || a.Line2 != nil || a.City != "Miami" || a.Country != "US" || a.Region != nil || *a.PostalCode != "33101" {
		t.Errorf("address %+v", a)
	}
	p := req.passport
	if p == nil || *p.ExpiresOn != "2031-01-31" || *p.IssuingCountry != "GB" {
		t.Errorf("passport %+v", p)
	}
}

// Null, and an object of nothing but blanks, both clear.
func TestParseClears(t *testing.T) {
	for _, body := range []string{
		`{"phone":null,"dateOfBirth":"","emergencyContact":null,"address":null,"passport":null}`,
		`{"phone":" ","dateOfBirth":null,"emergencyContact":{"name":"","phone":null},"address":{"line1":" "},"passport":{"expiresOn":null}}`,
	} {
		req := mustParse(t, body)
		if !req.phone.Set || req.phone.Value != nil || !req.dateOfBirth.Set || req.dateOfBirth.Value != nil {
			t.Errorf("%s: phone/dob %+v", body, req)
		}
		if !req.emergencySet || req.emergency != nil || !req.addressSet || req.address != nil || !req.passportSet || req.passport != nil {
			t.Errorf("%s: objects %+v", body, req)
		}
	}
}

func TestSortedKeys(t *testing.T) {
	got := sortedKeys(js.O("updated_at", 1, "phone", 2, "date_of_birth", 3, "emergency_contact", 4, "mailing_address_id", 5))
	want := []string{"date_of_birth", "emergency_contact", "mailing_address_id", "phone", "updated_at"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%v", got)
		}
	}
}
