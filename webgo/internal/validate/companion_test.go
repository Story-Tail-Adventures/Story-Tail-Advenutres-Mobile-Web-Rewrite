package validate

import (
	"strings"
	"testing"
	"time"
)

// Ported case for case from web/lib/validation/companion.test.ts.

func validCompanion() CompanionForm { return CompanionForm{FirstName: "Sam", LastName: "Hayes"} }

func companionErrors(t *testing.T, f CompanionForm) Errors {
	t.Helper()
	_, errs := ParseCompanion(f, clock)
	return errs
}

func TestCompanionSchema(t *testing.T) {
	t.Run("accepts a traveler with nothing but a name", func(t *testing.T) {
		p, errs := ParseCompanion(validCompanion(), clock)
		if !errs.Empty() {
			t.Fatalf("errors: %v", errs)
		}
		if p.FirstName != "Sam" || p.LastName != "Hayes" || p.Relationship != nil ||
			p.DateOfBirth != nil || p.PassportExpiry != nil || p.PassportCountry != nil {
			t.Errorf("payload = %+v", p)
		}
	})

	t.Run("needs both halves of the name", func(t *testing.T) {
		f := validCompanion()
		f.FirstName = ""
		if got := companionErrors(t, f).First("firstName"); got != CompanionMessages.FirstNameRequired {
			t.Errorf("firstName = %q", got)
		}
		f = validCompanion()
		f.LastName = ""
		if got := companionErrors(t, f).First("lastName"); got != CompanionMessages.LastNameRequired {
			t.Errorf("lastName = %q", got)
		}
	})

	t.Run("refuses a name that is only whitespace, rather than letting the column do it", func(t *testing.T) {
		f := validCompanion()
		f.LastName = "   "
		if got := companionErrors(t, f).First("lastName"); got != CompanionMessages.LastNameRequired {
			t.Errorf("lastName = %q", got)
		}
	})

	t.Run("refuses a name longer than the column", func(t *testing.T) {
		f := validCompanion()
		f.FirstName = strings.Repeat("x", CompanionLimits.Name+1)
		if got := companionErrors(t, f).First("firstName"); got != CompanionMessages.NameTooLong {
			t.Errorf("firstName = %q", got)
		}
	})

	t.Run("has no minimum age — a household's children have records too", func(t *testing.T) {
		f := validCompanion()
		f.DateOfBirth = "2019-06-12"
		if errs := companionErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("refuses a birthday in the future", func(t *testing.T) {
		f := validCompanion()
		f.DateOfBirth = "2999-01-01"
		if got := companionErrors(t, f).First("dateOfBirth"); got != CompanionMessages.DobInvalid {
			t.Errorf("dateOfBirth = %q", got)
		}
	})

	t.Run("accepts an expired passport — it is the record that triggers the renewal", func(t *testing.T) {
		f := validCompanion()
		f.PassportExpiry = "2019-08-14"
		if errs := companionErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("stores a two-letter country code, uppercased", func(t *testing.T) {
		f := validCompanion()
		f.PassportCountry, f.PassportExpiry = "us", "2031-02-28"
		p, errs := ParseCompanion(f, clock)
		if !errs.Empty() || p.PassportCountry == nil || *p.PassportCountry != "US" {
			t.Errorf("country = %v, errors %v", p.PassportCountry, errs)
		}
	})

	t.Run("refuses the prototype's three-letter 'USA'", func(t *testing.T) {
		f := validCompanion()
		f.PassportCountry = "USA"
		if got := companionErrors(t, f).First("passportCountry"); got != CompanionMessages.CountryInvalid {
			t.Errorf("passportCountry = %q", got)
		}
	})

	t.Run("refuses a country of issue with no expiry", func(t *testing.T) {
		f := validCompanion()
		f.PassportCountry = "US"
		if got := companionErrors(t, f).First("passportExpiry"); got != CompanionMessages.PassportNeedsExpiry {
			t.Errorf("passportExpiry = %q", got)
		}
	})

	t.Run("accepts an expiry with no country of issue", func(t *testing.T) {
		f := validCompanion()
		f.PassportExpiry = "2031-02-28"
		if errs := companionErrors(t, f); !errs.Empty() {
			t.Errorf("errors: %v", errs)
		}
	})

	t.Run("leaves relationship free text rather than an enum", func(t *testing.T) {
		f := validCompanion()
		f.Relationship = "Mother-in-law"
		p, errs := ParseCompanion(f, clock)
		if !errs.Empty() || p.Relationship == nil || *p.Relationship != "Mother-in-law" {
			t.Errorf("relationship = %v, errors %v", p.Relationship, errs)
		}
	})
}

func TestExpiresWithinSixMonths(t *testing.T) {
	now := time.Date(2026, 9, 4, 0, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		expiry string
		want   bool
		why    string
	}{
		{"2026-11-30", true, "runs out inside the window"},
		{"2031-02-28", false, "years left"},
		{"2020-01-01", true, "already expired"},
		{"", false, "no expiry to judge"},
	} {
		if got := ExpiresWithinSixMonths(c.expiry, now); got != c.want {
			t.Errorf("ExpiresWithinSixMonths(%q) = %v (%s)", c.expiry, got, c.why)
		}
	}
}
