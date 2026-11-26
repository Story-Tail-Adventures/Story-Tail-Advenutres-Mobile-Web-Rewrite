package people

import (
	"encoding/json"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"
)

// Ported from web/lib/validation/client.test.ts (clientSchema, toClientPayload) and its
// clientFormFromFormData cases.

var formNow = time.Date(2026, 9, 26, 12, 0, 0, 0, time.UTC)

func validClient(mod func(*clientValues)) clientValues {
	v := clientValues{FirstName: "Imani", LastName: "Osei", Email: "imani.osei@example.com"}
	if mod != nil {
		mod(&v)
	}
	return v
}

func okClient(t *testing.T, v clientValues) bool {
	t.Helper()
	_, errs := validateClient(v, formNow)
	return len(errs) == 0
}

func TestClientSchema(t *testing.T) {
	t.Run("needs a name and an email, and says which is missing", func(t *testing.T) {
		_, errs := validateClient(clientValues{}, formNow)
		if errs["firstName"] != msgFirstNameRequired || errs["lastName"] != msgLastNameRequired || errs["email"] != msgEmailRequired {
			t.Errorf("errors = %v", errs)
		}
	})
	t.Run("refuses a name that is only whitespace", func(t *testing.T) {
		if okClient(t, validClient(func(v *clientValues) { v.FirstName = "   " })) {
			t.Error("accepted")
		}
	})
	t.Run("is loose about email on purpose", func(t *testing.T) {
		for _, email := range []string{"a@b.co", "first+tag@sub.domain.travel", "x@localhost", "someone@ünïcode.example"} {
			if !okClient(t, validClient(func(v *clientValues) { v.Email = email })) {
				t.Errorf("refused %q", email)
			}
		}
	})
	t.Run("still refuses shapes that are obviously not addresses", func(t *testing.T) {
		for _, email := range []string{"nope", "@example.com", "who@", "two words@example.com"} {
			_, errs := validateClient(validClient(func(v *clientValues) { v.Email = email }), formNow)
			if errs["email"] != msgEmailShape {
				t.Errorf("%q: %v", email, errs)
			}
		}
	})
	t.Run("a phone it can dial, and one it cannot", func(t *testing.T) {
		for phone, want := range map[string]bool{"305-555-0199": true, "+44 20 7946 0958": true, "not a phone": false, "": true,
			"123-456-7890": false, "1 (305) 555-0199": true, "+123": false} {
			if got := okClient(t, validClient(func(v *clientValues) { v.Phone = phone })); got != want {
				t.Errorf("phone %q ok=%v", phone, got)
			}
		}
	})
	t.Run("a date of birth in the future, or not a date", func(t *testing.T) {
		for dob, want := range map[string]string{"2999-01-01": msgDobFuture, "1991-02-08": "", "not-a-date": msgDobShape, "2026-02-30": msgDobShape} {
			_, errs := validateClient(validClient(func(v *clientValues) { v.DateOfBirth = dob }), formNow)
			if errs["dateOfBirth"] != want {
				t.Errorf("dob %q: %q", dob, errs["dateOfBirth"])
			}
		}
	})
	t.Run("a label AND a date on every important date", func(t *testing.T) {
		for _, c := range []struct {
			d    importantDate
			want string
		}{
			{importantDate{Label: "Anniversary", Date: "2020-06-12", Recurring: true}, ""},
			{importantDate{Label: "", Date: "2020-06-12"}, msgDateLabelRequired},
			{importantDate{Label: "Anniversary", Date: ""}, msgDateRequired},
			{importantDate{Label: "Anniversary", Date: "2020-13-01"}, msgDateShape},
		} {
			_, errs := validateClient(validClient(func(v *clientValues) { v.ImportantDates = []importantDate{c.d} }), formNow)
			if errs["importantDates"] != c.want {
				t.Errorf("%+v: %q", c.d, errs["importantDates"])
			}
		}
	})
	t.Run("caps the tag list and the tag length", func(t *testing.T) {
		var many []string
		for i := range 21 {
			many = append(many, "t"+strings.Repeat("x", i))
		}
		if _, errs := validateClient(validClient(func(v *clientValues) { v.Tags = many }), formNow); errs["tags"] != msgTooManyTags {
			t.Errorf("21 tags: %v", errs)
		}
		if _, errs := validateClient(validClient(func(v *clientValues) { v.Tags = []string{strings.Repeat("x", 41)} }), formNow); errs["tags"] != msgTagTooLong {
			t.Errorf("long tag: %v", errs)
		}
	})
	t.Run("a country that is not on the list", func(t *testing.T) {
		for code, want := range map[string]bool{"US": true, "": true, "ZZ": false} {
			if got := okClient(t, validClient(func(v *clientValues) { v.AddressCountry = code })); got != want {
				t.Errorf("country %q ok=%v", code, got)
			}
		}
	})
	t.Run("lengths count like JS strings", func(t *testing.T) {
		if okClient(t, validClient(func(v *clientValues) { v.FirstName = strings.Repeat("😀", 61) })) {
			t.Error("61 emoji are 122 UTF-16 units, over the 120 a name holds")
		}
	})
}

func TestToClientPayload(t *testing.T) {
	v, _ := validateClient(validClient(func(v *clientValues) { v.Phone = "(305) 555-0199" }), formNow)
	if p := toClientPayload(v); p.Phone == nil || *p.Phone != "+13055550199" {
		t.Errorf("phone = %v", p.Phone)
	}
	v, _ = validateClient(validClient(nil), formNow)
	b, _ := json.Marshal(toClientPayload(v))
	for _, want := range []string{`"phone":null`, `"preferredName":null`, `"dateOfBirth":null`, `"notes":null`,
		`"address":{"line1":null,"line2":null,"city":null,"region":null,"postalCode":null,"country":null}`,
		`"tags":[]`, `"importantDates":[]`} {
		if !strings.Contains(string(b), want) {
			t.Errorf("payload %s lacks %s", b, want)
		}
	}
	v, _ = validateClient(validClient(func(v *clientValues) { v.Tags = []string{"vip", "   ", "repeat"} }), formNow)
	if p := toClientPayload(v); !slices.Equal(p.Tags, []string{"vip", "repeat"}) {
		t.Errorf("tags = %v", p.Tags)
	}
}

func TestClientValuesFrom(t *testing.T) {
	v := clientValuesFrom(url.Values{
		"dateLabel": {"Anniversary", "Passport"}, "dateValue": {"2020-06-12", "2027-02-14"}, "dateRecurring": {"0"},
	})
	if !slices.Equal(v.ImportantDates, []importantDate{{"Anniversary", "2020-06-12", true}, {"Passport", "2027-02-14", false}}) {
		t.Errorf("zipped = %+v", v.ImportantDates)
	}
	if v := clientValuesFrom(url.Values{"dateLabel": {"Anniversary", ""}, "dateValue": {"2020-06-12", ""}}); len(v.ImportantDates) != 1 {
		t.Errorf("a blank row was kept: %+v", v.ImportantDates)
	}
	half := clientValuesFrom(url.Values{"dateLabel": {"Anniversary"}, "dateValue": {""}})
	if len(half.ImportantDates) != 1 || okClient(t, half) {
		t.Errorf("a half-filled row: %+v", half.ImportantDates)
	}
	if v := clientValuesFrom(url.Values{"tag": {"VIP", "  ", "Honeymoon", "vip"}, "newTag": {" Repeat "}}); !slices.Equal(v.Tags, []string{"vip", "honeymoon", "repeat"}) {
		t.Errorf("tags = %v", v.Tags)
	}
	if v := clientValuesFrom(url.Values{}); v.FirstName != "" || len(v.Tags) != 0 || len(v.ImportantDates) != 0 {
		t.Errorf("empty form = %+v", v)
	}
}
