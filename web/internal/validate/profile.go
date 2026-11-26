package validate

import "time"

// Screen 2.1.10 Profile Completion and 2.5.2 Personal Info — the rules, ported from
// web/lib/validation/profile.ts.
//
// Every field on the screen is optional and the whole step is skippable, so almost none of
// this is "you must". What it is instead is three GROUP rules — address, emergency contact,
// passport — where a half-filled group is worse than an empty one, and the columns behind
// them say so: address.line1, .city and .country are all NOT NULL (Data-Model §6.3), an
// emergency contact with no phone number cannot be called, and a passport row whose only
// reason to exist is the expiry reminder needs an expiry.

// ProfileMessages are PROFILE_MESSAGES, word for word.
var ProfileMessages = struct {
	PhoneInvalid          string
	PhoneNeedsCountryCode string
	DobInvalid            string
	DobTooEarly           string
	DateInvalid           string
	CountryInvalid        string
	PostalInvalid         string
	TooLong               string
	InvalidChars          string
	AddressIncomplete     string
	EmergencyIncomplete   string
	PassportIncomplete    string
}{
	PhoneInvalid:          "That doesn't look like a phone number yet",
	PhoneNeedsCountryCode: "Add a country code — like +44 — for a number outside the US",
	DobInvalid:            "Check that date — it should be in the past",
	DobTooEarly:           "Check that year",
	DateInvalid:           "Use the date picker, or type it as YYYY-MM-DD",
	CountryInvalid:        "Pick a country from the list",
	PostalInvalid:         "Letters, numbers, spaces and hyphens only",
	TooLong:               "That's longer than this field can hold",
	InvalidChars:          "Some of those characters won't work here",
	AddressIncomplete:     "An address needs at least a street, a city and a country",
	EmergencyIncomplete:   "Add both a name and a phone, so we know who to call and how",
	PassportIncomplete:    "Add the expiry date too — that's the part I use to remind you",
}

// ProfileLimits are the column widths from
// supabase/migrations/20260514120000_initial.sql (PROFILE_LIMITS).
var ProfileLimits = struct {
	AddressLine           int
	City                  int
	Region                int
	PostalCode            int
	EmergencyName         int
	EmergencyRelationship int
}{
	AddressLine:           200,
	City:                  120,
	Region:                120,
	PostalCode:            20,
	EmergencyName:         160,
	EmergencyRelationship: 60,
}

// ProfileForm is every input on the screen as the strings a form posts, and the prefill
// shape. RAW, never normalised: the values are echoed straight back into the inputs after a
// refusal, so somebody who typed "(305) 555-0184" and got a different field wrong is not
// shown "+13055550184" instead of their own typing.
type ProfileForm struct {
	Phone                 string
	DateOfBirth           string
	AddressLine1          string
	AddressLine2          string
	AddressCity           string
	AddressRegion         string
	AddressPostalCode     string
	AddressCountry        string
	EmergencyName         string
	EmergencyPhone        string
	EmergencyRelationship string
	PassportExpiry        string
	PassportCountry       string
}

// ProfileValues is the parsed form: normalised, with nil where the traveler has nothing.
type ProfileValues struct {
	Phone                 *string
	DateOfBirth           *string
	AddressLine1          *string
	AddressLine2          *string
	AddressCity           *string
	AddressRegion         *string
	AddressPostalCode     *string
	AddressCountry        *string
	EmergencyName         *string
	EmergencyPhone        *string
	EmergencyRelationship *string
	PassportExpiry        *string
	PassportCountry       *string
}

// ProfileFields is every key an error can be reported on: the inputs, plus the three group
// pseudo-fields (PROFILE_FIELDS).
var ProfileFields = []string{
	"phone", "dateOfBirth",
	"address", "addressLine1", "addressLine2", "addressCity", "addressRegion",
	"addressPostalCode", "addressCountry",
	"emergencyContact", "emergencyName", "emergencyPhone", "emergencyRelationship",
	"passport", "passportExpiry", "passportCountry",
}

// ParseProfile checks a posted form. now is the clock for "a birthday must be in the past".
func ParseProfile(f ProfileForm, now time.Time) (ProfileValues, Errors) {
	errs := Errors{}
	v := ProfileValues{
		Phone:                 optionalPhone(f.Phone, "phone", errs),
		DateOfBirth:           optionalBirthDate(f.DateOfBirth, "dateOfBirth", ProfileMessages.DobInvalid, ProfileMessages.DobTooEarly, now, errs),
		AddressLine1:          profileText(f.AddressLine1, ProfileLimits.AddressLine, "addressLine1", errs),
		AddressLine2:          profileText(f.AddressLine2, ProfileLimits.AddressLine, "addressLine2", errs),
		AddressCity:           profileText(f.AddressCity, ProfileLimits.City, "addressCity", errs),
		AddressRegion:         profileText(f.AddressRegion, ProfileLimits.Region, "addressRegion", errs),
		AddressPostalCode:     postalCode(f.AddressPostalCode, "addressPostalCode", errs),
		AddressCountry:        optionalCountry(f.AddressCountry, "addressCountry", ProfileMessages.CountryInvalid, errs),
		EmergencyName:         profileText(f.EmergencyName, ProfileLimits.EmergencyName, "emergencyName", errs),
		EmergencyPhone:        optionalPhone(f.EmergencyPhone, "emergencyPhone", errs),
		EmergencyRelationship: profileText(f.EmergencyRelationship, ProfileLimits.EmergencyRelationship, "emergencyRelationship", errs),
		PassportExpiry:        optionalDate(f.PassportExpiry, "passportExpiry", ProfileMessages.DateInvalid, errs),
		PassportCountry:       optionalCountry(f.PassportCountry, "passportCountry", ProfileMessages.CountryInvalid, errs),
	}
	checkProfileGroups(v, errs)
	return v, errs
}

func profileText(raw string, max int, field string, errs Errors) *string {
	return optionalText(raw, max, field, ProfileMessages.TooLong, ProfileMessages.InvalidChars, errs)
}

// postalCode is deliberately not a five-digit US pattern: K1A 0B1 and SW1A 1AA are postal
// codes too, and this field is reachable from every country in the list.
func postalCode(raw, field string, errs Errors) *string {
	v := JSTrim(raw)
	if UTF16Len(v) > ProfileLimits.PostalCode {
		errs.Add(field, ProfileMessages.TooLong)
		return nil
	}
	for _, r := range v {
		if r == ' ' || r == '-' || (r >= '0' && r <= '9') || (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
			continue
		}
		errs.Add(field, ProfileMessages.PostalInvalid)
		return nil
	}
	if v == "" {
		return nil
	}
	return &v
}

// checkProfileGroups is checkGroups: the three group rules, reported on a pseudo-field named
// for the group so the message renders under the group heading. Marking addressCity red when
// the real problem is "this address has no country" points at the wrong box.
func checkProfileGroups(v ProfileValues, errs Errors) {
	// Country is deliberately NOT part of this test. The picker starts on US because most of
	// the practice's clients are American, so its value is evidence of a default rather than
	// of intent — counting it would mean an untouched form failed with "an address needs at
	// least a street, a city and a country". Everything here is something a person typed.
	addressTouched := v.AddressLine1 != nil || v.AddressLine2 != nil || v.AddressCity != nil ||
		v.AddressRegion != nil || v.AddressPostalCode != nil
	if addressTouched && !(v.AddressLine1 != nil && v.AddressCity != nil && v.AddressCountry != nil) {
		errs.Add("address", ProfileMessages.AddressIncomplete)
	}

	emergencyTouched := v.EmergencyName != nil || v.EmergencyPhone != nil || v.EmergencyRelationship != nil
	if emergencyTouched && !(v.EmergencyName != nil && v.EmergencyPhone != nil) {
		errs.Add("emergencyContact", ProfileMessages.EmergencyIncomplete)
	}

	// Expiry without a country is fine — the reminder still works. A country without an
	// expiry is a row with nothing to do.
	if v.PassportCountry != nil && v.PassportExpiry == nil {
		errs.Add("passport", ProfileMessages.PassportIncomplete)
	}
}

// ProfileAddress is the address half of the function's body.
type ProfileAddress struct {
	Line1      string  `json:"line1"`
	Line2      *string `json:"line2"`
	City       string  `json:"city"`
	Region     *string `json:"region"`
	PostalCode *string `json:"postalCode"`
	Country    string  `json:"country"`
}

// ProfileEmergencyContact is the emergency-contact half.
type ProfileEmergencyContact struct {
	Name         string  `json:"name"`
	Phone        string  `json:"phone"`
	Relationship *string `json:"relationship"`
}

// ProfilePassport is the passport half. There is no number field and no key for one: the
// encryption Data-Model §18.2 requires is not built, and collecting a passport number to
// store it unprotected would be worse than not collecting it.
type ProfilePassport struct {
	ExpiresOn      *string `json:"expiresOn"`
	IssuingCountry *string `json:"issuingCountry"`
}

// ProfilePayload is the body supabase/functions/onboarding-profile expects.
//
// Every key is always present, and that is the point: the function treats an ABSENT key as
// "leave it alone" and an explicit null as "clear it". This screen shows all of these fields
// at once, so a field left empty is a person saying they do not have one — which is how
// somebody who came back to this step removes an emergency contact they no longer want on
// their itinerary.
type ProfilePayload struct {
	Phone            *string                  `json:"phone"`
	DateOfBirth      *string                  `json:"dateOfBirth"`
	Address          *ProfileAddress          `json:"address"`
	EmergencyContact *ProfileEmergencyContact `json:"emergencyContact"`
	Passport         *ProfilePassport         `json:"passport"`
	// Advance moves the wizard cursor to the next step. The account screen omits it.
	Advance bool `json:"advance,omitempty"`
}

// Payload builds the function's body from parsed values (toProfilePayload).
func (v ProfileValues) Payload(advance bool) ProfilePayload {
	p := ProfilePayload{Phone: v.Phone, DateOfBirth: v.DateOfBirth, Advance: advance}
	if v.AddressLine1 != nil && v.AddressCity != nil && v.AddressCountry != nil {
		p.Address = &ProfileAddress{
			Line1: *v.AddressLine1, Line2: v.AddressLine2, City: *v.AddressCity,
			Region: v.AddressRegion, PostalCode: v.AddressPostalCode, Country: *v.AddressCountry,
		}
	}
	if v.EmergencyName != nil && v.EmergencyPhone != nil {
		p.EmergencyContact = &ProfileEmergencyContact{
			Name: *v.EmergencyName, Phone: *v.EmergencyPhone, Relationship: v.EmergencyRelationship,
		}
	}
	if v.PassportExpiry != nil || v.PassportCountry != nil {
		p.Passport = &ProfilePassport{ExpiresOn: v.PassportExpiry, IssuingCountry: v.PassportCountry}
	}
	return p
}
