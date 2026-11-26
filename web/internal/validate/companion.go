package validate

import "time"

// Screen 2.1.12 Travel Companions and 2.5.4 — the rules, ported from
// web/lib/validation/companion.ts.
//
// A companion is a person a traveler books with, so both halves of the name are required:
// suppliers ticket on the name in the passport. Everything else is optional, with the same
// passport group rule 2.1.10 has.

// CompanionMessages are COMPANION_MESSAGES, word for word.
var CompanionMessages = struct {
	FirstNameRequired   string
	LastNameRequired    string
	NameTooLong         string
	InvalidChars        string
	RelationshipTooLong string
	DobInvalid          string
	DateInvalid         string
	CountryInvalid      string
	PassportNeedsExpiry string
}{
	FirstNameRequired:   "Tell us their first name",
	LastNameRequired:    "And their last name — suppliers need both for ticketing",
	NameTooLong:         "Keep it to 80 characters or fewer",
	InvalidChars:        "Some of those characters won't work here",
	RelationshipTooLong: "Keep it to 40 characters or fewer",
	DobInvalid:          "Check that date — it should be in the past",
	DateInvalid:         "Use the date picker, or type it as YYYY-MM-DD",
	CountryInvalid:      "Pick a country from the list",
	PassportNeedsExpiry: "Add the expiry date too — that's the part I use to remind you",
}

// CompanionLimits are COMPANION_LIMITS.
var CompanionLimits = struct {
	Name         int
	Relationship int
}{Name: 80, Relationship: 40}

// CompanionFields is COMPANION_FIELDS: every key an error can be reported on.
var CompanionFields = []string{
	"firstName", "lastName", "relationship", "dateOfBirth", "passportExpiry", "passportCountry",
}

// CompanionForm is the add/edit form as posted. RAW, like ProfileForm.
type CompanionForm struct {
	FirstName       string
	LastName        string
	Relationship    string
	DateOfBirth     string
	PassportExpiry  string
	PassportCountry string
}

// CompanionPayload is what supabase/functions/onboarding-companions takes beside its action.
type CompanionPayload struct {
	FirstName       string  `json:"firstName"`
	LastName        string  `json:"lastName"`
	Relationship    *string `json:"relationship"`
	DateOfBirth     *string `json:"dateOfBirth"`
	PassportExpiry  *string `json:"passportExpiry"`
	PassportCountry *string `json:"passportCountry"`
}

// ParseCompanion checks a posted companion form.
func ParseCompanion(f CompanionForm, now time.Time) (CompanionPayload, Errors) {
	errs := Errors{}
	p := CompanionPayload{
		FirstName:       companionName(f.FirstName, "firstName", CompanionMessages.FirstNameRequired, errs),
		LastName:        companionName(f.LastName, "lastName", CompanionMessages.LastNameRequired, errs),
		Relationship:    optionalText(f.Relationship, CompanionLimits.Relationship, "relationship", CompanionMessages.RelationshipTooLong, CompanionMessages.InvalidChars, errs),
		DateOfBirth:     optionalBirthDate(f.DateOfBirth, "dateOfBirth", CompanionMessages.DobInvalid, "", now, errs),
		PassportExpiry:  optionalDate(f.PassportExpiry, "passportExpiry", CompanionMessages.DateInvalid, errs),
		PassportCountry: optionalCountry(f.PassportCountry, "passportCountry", CompanionMessages.CountryInvalid, errs),
	}
	// checkPassportGroup: a country of issue with no expiry is a row with nothing to do. It
	// lands on passportExpiry, which is the box that needs filling in.
	if p.PassportCountry != nil && p.PassportExpiry == nil {
		errs.Add("passportExpiry", CompanionMessages.PassportNeedsExpiry)
	}
	return p, errs
}

// companionName: trimmed, required, capped, no control characters.
func companionName(raw, field, required string, errs Errors) string {
	v := JSTrim(raw)
	switch {
	case v == "":
		errs.Add(field, required)
	case UTF16Len(v) > CompanionLimits.Name:
		errs.Add(field, CompanionMessages.NameTooLong)
	case HasControl(v):
		errs.Add(field, CompanionMessages.InvalidChars)
	}
	return v
}

// ExpiresWithinSixMonths reports whether a passport runs out inside the window many
// countries insist on (expiresWithinSixMonths). An already-expired one is inside it.
func ExpiresWithinSixMonths(expiry string, now time.Time) bool {
	if !IsRealDate(expiry) {
		return false
	}
	// JS does this with setUTCMonth(+6), which normalises an impossible result forward
	// (31 August + 6 months is 31 February, so 3 March). Go's AddDate normalises the same
	// way, so the two agree on every date, month end included.
	horizon := now.UTC().AddDate(0, 6, 0).Format(isoDateLayout)
	return expiry <= horizon
}
