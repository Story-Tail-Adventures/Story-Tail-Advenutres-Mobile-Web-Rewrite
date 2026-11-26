package validate

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// Ported case for case from web/lib/validation/profile.test.ts.

var clock = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

func blankProfile() ProfileForm { return ProfileForm{AddressCountry: "US"} }

func profileErrors(t *testing.T, f ProfileForm) Errors {
	t.Helper()
	_, errs := ParseProfile(f, clock)
	return errs
}

func TestNormalizePhone(t *testing.T) {
	t.Run("treats an empty field as nothing rather than as a mistake", func(t *testing.T) {
		value, message := NormalizePhone("   ")
		if value != nil || message != "" {
			t.Fatalf("got %v %q", value, message)
		}
	})

	for _, c := range []struct{ in, want string }{
		{"+1 (305) 555-0184", "+13055550184"},
		{"(305) 555-0184", "+13055550184"},
		{"305.555.0184", "+13055550184"},
		{"1 305 555 0184", "+13055550184"},
		{"+44 20 7946 0958", "+442079460958"},
		// A real North American number, and an explicit country code taken at its word
		// whatever shape follows it.
		{"13055550184", "+13055550184"},
		{"+11234567890", "+11234567890"},
	} {
		value, message := NormalizePhone(c.in)
		if message != "" || value == nil || *value != c.want {
			t.Errorf("NormalizePhone(%q) = %v %q, want %q", c.in, value, message, c.want)
		}
	}

	t.Run("asks for a country code rather than guessing at a foreign number", func(t *testing.T) {
		if _, message := NormalizePhone("020 7946 0958"); message != ProfileMessages.PhoneNeedsCountryCode {
			t.Errorf("message = %q", message)
		}
	})

	for _, in := range []string{"not a phone", "+", "+1234", "+1234567890123456", "3055550184\u0007"} {
		if value, message := NormalizePhone(in); message == "" || value != nil {
			t.Errorf("NormalizePhone(%q) was accepted", in)
		}
	}

	// Ten digits that cannot ring anywhere: refused rather than stored as a well-formed
	// +1 number nobody can tell from a real one.
	for _, c := range []struct{ in, why string }{
		{"1234567890", "area code starting 1"},
		{"0234567890", "area code starting 0"},
		{"3050550184", "exchange code starting 0"},
		{"3051550184", "exchange code starting 1"},
		{"11234567890", "a leading 1 in front of an impossible area code"},
	} {
		if _, message := NormalizePhone(c.in); message != ProfileMessages.PhoneInvalid {
			t.Errorf("NormalizePhone(%q) (%s) = %q, want phoneInvalid", c.in, c.why, message)
		}
	}
}

func TestProfileSchema(t *testing.T) {
	t.Run("accepts an entirely empty form", func(t *testing.T) {
		if errs := profileErrors(t, blankProfile()); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("does not treat the pre-selected country as somebody having typed an address", func(t *testing.T) {
		f := blankProfile()
		f.AddressCountry = "US"
		if got := profileErrors(t, f).First("address"); got != "" {
			t.Errorf("address error: %q", got)
		}
	})

	t.Run("refuses a half-written address, on the group and not on one input", func(t *testing.T) {
		f := blankProfile()
		f.AddressLine1 = "1240 Brickell Bay Dr"
		errs := profileErrors(t, f)
		if got := errs.First("address"); got != ProfileMessages.AddressIncomplete {
			t.Errorf("address error = %q", got)
		}
		if got := errs.First("addressCity"); got != "" {
			t.Errorf("addressCity should carry no message, got %q", got)
		}
	})

	t.Run("accepts an address once street, city and country are all there", func(t *testing.T) {
		f := blankProfile()
		f.AddressLine1, f.AddressCity, f.AddressCountry = "1240 Brickell Bay Dr", "Miami", "US"
		if errs := profileErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("refuses an emergency contact with no way to reach them, and the reverse", func(t *testing.T) {
		f := blankProfile()
		f.EmergencyName = "Sam Hayes"
		if got := profileErrors(t, f).First("emergencyContact"); got != ProfileMessages.EmergencyIncomplete {
			t.Errorf("name only: %q", got)
		}
		f = blankProfile()
		f.EmergencyPhone = "3055550186"
		if got := profileErrors(t, f).First("emergencyContact"); got != ProfileMessages.EmergencyIncomplete {
			t.Errorf("phone only: %q", got)
		}
	})

	t.Run("lets the relationship stay empty", func(t *testing.T) {
		f := blankProfile()
		f.EmergencyName, f.EmergencyPhone = "Sam Hayes", "3055550186"
		if errs := profileErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("refuses a passport country with no expiry", func(t *testing.T) {
		f := blankProfile()
		f.PassportCountry = "US"
		if got := profileErrors(t, f).First("passport"); got != ProfileMessages.PassportIncomplete {
			t.Errorf("passport error = %q", got)
		}
	})

	t.Run("accepts an expiry with no country, and one already in the past", func(t *testing.T) {
		for _, expiry := range []string{"2029-08-14", "2019-08-14"} {
			f := blankProfile()
			f.PassportExpiry = expiry
			if errs := profileErrors(t, f); !errs.Empty() {
				t.Errorf("%s: %v", expiry, errs)
			}
		}
	})

	t.Run("refuses a date of birth in the future or on a day that does not exist", func(t *testing.T) {
		for _, dob := range []string{"2999-01-01", "2026-02-30"} {
			f := blankProfile()
			f.DateOfBirth = dob
			if got := profileErrors(t, f).First("dateOfBirth"); got != ProfileMessages.DobInvalid {
				t.Errorf("%s: %q", dob, got)
			}
		}
	})

	t.Run("has no minimum age — households travel together", func(t *testing.T) {
		f := blankProfile()
		f.DateOfBirth = clock.AddDate(-4, 0, 0).Format("2006-01-02")
		if errs := profileErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("checks the year rather than the person", func(t *testing.T) {
		f := blankProfile()
		f.DateOfBirth = "1823-04-02"
		if got := profileErrors(t, f).First("dateOfBirth"); got != ProfileMessages.DobTooEarly {
			t.Errorf("dateOfBirth = %q", got)
		}
	})

	t.Run("refuses a country that is not an assigned alpha-2 code", func(t *testing.T) {
		f := blankProfile()
		f.AddressCountry = "USA"
		if got := profileErrors(t, f).First("addressCountry"); got != ProfileMessages.CountryInvalid {
			t.Errorf("addressCountry = %q", got)
		}
	})

	t.Run("uppercases a lowercase country code rather than refusing it", func(t *testing.T) {
		f := blankProfile()
		f.AddressLine1, f.AddressCity, f.AddressCountry = "1240 Brickell Bay Dr", "Miami", "us"
		v, errs := ParseProfile(f, clock)
		if !errs.Empty() || v.AddressCountry == nil || *v.AddressCountry != "US" {
			t.Errorf("country = %v, errors %v", v.AddressCountry, errs)
		}
	})

	t.Run("accepts postal codes that are not five digits", func(t *testing.T) {
		for _, postal := range []string{"33131", "K1A 0B1", "SW1A 1AA"} {
			f := blankProfile()
			f.AddressLine1, f.AddressCity, f.AddressPostalCode = "1 Test St", "Somewhere", postal
			if errs := profileErrors(t, f); !errs.Empty() {
				t.Errorf("%s: %v", postal, errs)
			}
		}
	})

	t.Run("refuses a control character in a free-text field", func(t *testing.T) {
		f := blankProfile()
		f.EmergencyName = "Sam\u0007Hayes"
		if got := profileErrors(t, f).First("emergencyName"); got != ProfileMessages.InvalidChars {
			t.Errorf("emergencyName = %q", got)
		}
	})
}

func TestProfilePayload(t *testing.T) {
	payload := func(t *testing.T, f ProfileForm) ProfilePayload {
		t.Helper()
		v, errs := ParseProfile(f, clock)
		if !errs.Empty() {
			t.Fatalf("expected the form to parse, got %v", errs)
		}
		return v.Payload(true)
	}

	t.Run("sends every key, so an emptied field clears rather than being ignored", func(t *testing.T) {
		b, err := json.Marshal(payload(t, blankProfile()))
		if err != nil {
			t.Fatal(err)
		}
		const want = `{"phone":null,"dateOfBirth":null,"address":null,"emergencyContact":null,"passport":null,"advance":true}`
		if string(b) != want {
			t.Errorf("body = %s\nwant   %s", b, want)
		}
	})

	t.Run("sends a phone number in E.164, not as it was typed", func(t *testing.T) {
		f := blankProfile()
		f.Phone = "(305) 555-0184"
		if got := payload(t, f).Phone; got == nil || *got != "+13055550184" {
			t.Errorf("phone = %v", got)
		}
	})

	t.Run("sends the address as the structured object the address table needs", func(t *testing.T) {
		f := ProfileForm{
			AddressLine1: "1240 Brickell Bay Dr", AddressLine2: "Apt 4B", AddressCity: "Miami",
			AddressRegion: "FL", AddressPostalCode: "33131", AddressCountry: "US",
		}
		b, err := json.Marshal(payload(t, f).Address)
		if err != nil {
			t.Fatal(err)
		}
		const want = `{"line1":"1240 Brickell Bay Dr","line2":"Apt 4B","city":"Miami","region":"FL","postalCode":"33131","country":"US"}`
		if string(b) != want {
			t.Errorf("address = %s\nwant      %s", b, want)
		}
	})

	t.Run("normalises the emergency contact's phone too", func(t *testing.T) {
		f := blankProfile()
		f.EmergencyName, f.EmergencyPhone = "Sam Hayes", "(305) 555-0186"
		b, _ := json.Marshal(payload(t, f).EmergencyContact)
		const want = `{"name":"Sam Hayes","phone":"+13055550186","relationship":null}`
		if string(b) != want {
			t.Errorf("emergencyContact = %s", b)
		}
	})

	t.Run("never sends a passport number — there is no field and no key for one", func(t *testing.T) {
		f := blankProfile()
		f.PassportExpiry, f.PassportCountry = "2029-08-14", "US"
		sent := payload(t, f)
		b, _ := json.Marshal(sent)
		if sent.Passport == nil || *sent.Passport.ExpiresOn != "2029-08-14" || *sent.Passport.IssuingCountry != "US" {
			t.Errorf("passport = %+v", sent.Passport)
		}
		if strings.Contains(string(b), "number") {
			t.Errorf("the body mentions a number: %s", b)
		}
	})

	t.Run("the account screen's save does not move the wizard cursor", func(t *testing.T) {
		v, _ := ParseProfile(blankProfile(), clock)
		b, _ := json.Marshal(v.Payload(false))
		if strings.Contains(string(b), "advance") {
			t.Errorf("body carries advance: %s", b)
		}
	})
}

func TestIsRealDate(t *testing.T) {
	for _, c := range []struct {
		in   string
		want bool
	}{
		{"2026-08-14", true},
		{"2026-02-30", false},
		{"2026-13-01", false},
		{"26-08-14", false},
		{"2026-8-14", false},
		{"", false},
		{"2026-08-14T00:00:00Z", false},
	} {
		if got := IsRealDate(c.in); got != c.want {
			t.Errorf("IsRealDate(%q) = %v", c.in, got)
		}
	}
}
