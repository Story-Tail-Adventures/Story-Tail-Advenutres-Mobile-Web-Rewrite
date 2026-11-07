package people

import (
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// The client form (§3.3.3 New client, §3.3.4 Edit): ports of web/lib/agent/clientFormState.ts
// and web/lib/validation/client.ts. Every message is CLIENT_MESSAGES' word for word; a field
// shows its FIRST failing check, in the order the zod schema declares them (flattenIssues
// keeps every message per field and the form shows [0]).

// clientMessages is CLIENT_MESSAGES.
const (
	msgFirstNameRequired = "A first name, so the roster has something to sort by."
	msgLastNameRequired  = "A last name, for the same reason."
	msgNameTooLong       = "That name is longer than the field allows."
	msgEmailRequired     = "An email — it's how the portal invitation and every update reaches them."
	msgEmailShape        = "That doesn't look like an email address."
	msgEmailTooLong      = "That email is longer than the field allows."
	msgPhoneShape        = "That phone number isn't one I can dial. US numbers unless you add a country code."
	msgDobShape          = "That isn't a date."
	msgDobFuture         = "That date of birth is in the future."
	msgNotesTooLong      = "That's longer than the notes field holds."
	msgTagTooLong        = "That tag is too long."
	msgTooManyTags       = "That's more tags than one client can carry."
	msgDateLabelRequired = "Give the date a name — Anniversary, Passport renewal, whatever it is."
	msgDateRequired      = "That entry needs a date."
	msgDateShape         = "That isn't a date."
	msgTooManyDates      = "That's more dates than the record holds."
	msgCountryShape      = "Pick a country from the list."
	msgAddressTooLong    = "That's longer than the field allows."
)

// clientLimits is CLIENT_LIMITS (lengths are UTF-16 code units in zod; see textLen).
const (
	limName        = 120
	limEmail       = 200
	limPhone       = 40
	limNotes       = 4000
	limTag         = 40
	limTags        = 20
	limDates       = 12
	limDateLabel   = 60
	limAddressLine = 200
	limCity        = 120
	limRegion      = 120
	limPostalCode  = 20
)

type importantDate struct {
	Label     string `json:"label"`
	Date      string `json:"date"`
	Recurring bool   `json:"recurring"`
}

// clientValues is ClientFormValues: the form exactly as typed (untrimmed), for re-filling.
type clientValues struct {
	FirstName, LastName, PreferredName, Email, Phone, DateOfBirth, Notes string
	AddressLine1, AddressLine2, AddressCity, AddressRegion               string
	AddressPostalCode, AddressCountry                                    string
	Tags                                                                 []string
	ImportantDates                                                       []importantDate
}

// clientValuesRaw reads the form as typed, for re-rendering it after a step that saves
// nothing (adding or removing a tag or a date row): every date row is kept, blank or not, and
// the New tag box is left out.
func clientValuesRaw(f url.Values) clientValues {
	v := clientValues{
		FirstName: f.Get("firstName"), LastName: f.Get("lastName"), PreferredName: f.Get("preferredName"),
		Email: f.Get("email"), Phone: f.Get("phone"), DateOfBirth: f.Get("dateOfBirth"), Notes: f.Get("notes"),
		AddressLine1: f.Get("addressLine1"), AddressLine2: f.Get("addressLine2"), AddressCity: f.Get("addressCity"),
		AddressRegion: f.Get("addressRegion"), AddressPostalCode: f.Get("addressPostalCode"),
		AddressCountry: f.Get("addressCountry"),
	}
	dates := f["dateValue"]
	recurring := map[string]bool{}
	for _, r := range f["dateRecurring"] {
		recurring[r] = true
	}
	for i, label := range f["dateLabel"] {
		d := importantDate{Label: label, Recurring: recurring[strconv.Itoa(i)]}
		if i < len(dates) {
			d.Date = dates[i]
		}
		v.ImportantDates = append(v.ImportantDates, d)
	}
	for _, t := range f["tag"] {
		if t = strings.ToLower(strings.TrimSpace(t)); t != "" && !slices.Contains(v.Tags, t) {
			v.Tags = append(v.Tags, t)
		}
	}
	return v
}

// clientValuesFrom ports clientFormFromFormData. The date rows zip by position; a row with
// both halves blank is dropped, a half-filled one kept so validation can say what is missing.
// Tags are lower-cased and blanks dropped. The New tag box counts as one more tag: in Next it
// only joined the set when "Add" was pressed, and a word typed there and then saved was lost.
func clientValuesFrom(f url.Values) clientValues {
	v := clientValuesRaw(f)
	var dates []importantDate
	for _, d := range v.ImportantDates {
		d.Label, d.Date = strings.TrimSpace(d.Label), strings.TrimSpace(d.Date)
		if d.Label != "" || d.Date != "" {
			dates = append(dates, d)
		}
	}
	v.ImportantDates = dates
	if t := strings.ToLower(strings.TrimSpace(f.Get("newTag"))); t != "" && !slices.Contains(v.Tags, t) {
		v.Tags = append(v.Tags, t)
	}
	return v
}

// textLen is a JS string's length: UTF-16 code units, which is what zod's max counts.
func textLen(s string) int {
	n := 0
	for _, r := range s {
		if r >= 0x10000 {
			n += 2
		} else {
			n++
		}
	}
	return n
}

var isoDateShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// isRealDate ports isRealDate: well-shaped AND a day the calendar has (not 2026-02-30).
func isRealDate(v string) bool {
	if !isoDateShape.MatchString(v) {
		return false
	}
	t, err := time.Parse(time.DateOnly, v)
	return err == nil && t.Format(time.DateOnly) == v
}

// todayISO ports todayIso: the UTC date.
func todayISO(now time.Time) string { return now.UTC().Format(time.DateOnly) }

var nanp = regexp.MustCompile(`^[2-9]\d{2}[2-9]\d{6}$`)
var phoneJunk = regexp.MustCompile(`[\s().-]`)
var phoneDigits = regexp.MustCompile(`^\+?\d+$`)

// normalizePhone ports normalizePhone: E.164, or ok false. "" is ok with no number. A
// number with no country code must be a real NANP number (area and exchange 2-9).
func normalizePhone(raw string) (value string, ok bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", true
	}
	cleaned := phoneJunk.ReplaceAllString(trimmed, "")
	if !phoneDigits.MatchString(cleaned) {
		return "", false
	}
	if strings.HasPrefix(cleaned, "+") {
		digits := cleaned[1:]
		if len(digits) < 7 || len(digits) > 15 {
			return "", false
		}
		return "+" + digits, true
	}
	national := cleaned
	if len(cleaned) == 11 && strings.HasPrefix(cleaned, "1") {
		national = cleaned[1:]
	}
	if len(national) != 10 || !nanp.MatchString(national) {
		return "", false
	}
	return "+1" + national, true
}

// emailShaped is the schema's deliberately loose check: an @ that is neither first nor
// last, and no whitespace.
func emailShaped(v string) bool {
	return strings.Contains(v, "@") && !strings.HasPrefix(v, "@") && !strings.HasSuffix(v, "@") &&
		!strings.ContainsFunc(v, unicode.IsSpace)
}

// fieldErrors maps a ClientField to the message it shows (the first that failed).
type fieldErrors map[string]string

func (e fieldErrors) add(field, msg string) {
	if _, ok := e[field]; !ok {
		e[field] = msg
	}
}

// jsTrim is String.prototype.trim: whitespace and line terminators, as zod's .trim() does.
func jsTrim(s string) string {
	return strings.TrimFunc(s, func(r rune) bool { return unicode.IsSpace(r) || r == 0xFEFF })
}

// validateClient ports clientSchema. The returned values are trimmed, as zod outputs them.
func validateClient(in clientValues, now time.Time) (clientValues, fieldErrors) {
	e := fieldErrors{}
	v := in
	text := func(field string, s *string, maxLen int, tooLong string) {
		*s = jsTrim(*s)
		if textLen(*s) > maxLen {
			e.add(field, tooLong)
		}
	}

	v.FirstName = jsTrim(v.FirstName)
	if v.FirstName == "" {
		e.add("firstName", msgFirstNameRequired)
	}
	if textLen(v.FirstName) > limName {
		e.add("firstName", msgNameTooLong)
	}
	v.LastName = jsTrim(v.LastName)
	if v.LastName == "" {
		e.add("lastName", msgLastNameRequired)
	}
	if textLen(v.LastName) > limName {
		e.add("lastName", msgNameTooLong)
	}
	text("preferredName", &v.PreferredName, limName, msgNameTooLong)

	v.Email = jsTrim(v.Email)
	if v.Email == "" {
		e.add("email", msgEmailRequired)
	}
	if textLen(v.Email) > limEmail {
		e.add("email", msgEmailTooLong)
	}
	if !emailShaped(v.Email) {
		e.add("email", msgEmailShape)
	}

	text("phone", &v.Phone, limPhone, msgPhoneShape)
	if _, ok := normalizePhone(v.Phone); v.Phone != "" && !ok {
		e.add("phone", msgPhoneShape)
	}

	text("dateOfBirth", &v.DateOfBirth, 10, msgDobShape)
	if v.DateOfBirth != "" && !isRealDate(v.DateOfBirth) {
		e.add("dateOfBirth", msgDobShape)
	}
	if v.DateOfBirth != "" && v.DateOfBirth > todayISO(now) {
		e.add("dateOfBirth", msgDobFuture)
	}

	if len(v.Tags) > limTags {
		e.add("tags", msgTooManyTags)
	}
	for i, t := range v.Tags {
		v.Tags[i] = jsTrim(t)
		if textLen(v.Tags[i]) > limTag {
			e.add("tags", msgTagTooLong)
		}
	}

	if len(v.ImportantDates) > limDates {
		e.add("importantDates", msgTooManyDates)
	}
	for i := range v.ImportantDates {
		d := &v.ImportantDates[i]
		d.Label, d.Date = jsTrim(d.Label), jsTrim(d.Date)
		if d.Label == "" || textLen(d.Label) > limDateLabel {
			e.add("importantDates", msgDateLabelRequired)
		}
		if d.Date == "" {
			e.add("importantDates", msgDateRequired)
		} else if !isRealDate(d.Date) {
			e.add("importantDates", msgDateShape)
		}
	}

	text("notes", &v.Notes, limNotes, msgNotesTooLong)
	text("addressLine1", &v.AddressLine1, limAddressLine, msgAddressTooLong)
	text("addressLine2", &v.AddressLine2, limAddressLine, msgAddressTooLong)
	text("addressCity", &v.AddressCity, limCity, msgAddressTooLong)
	text("addressRegion", &v.AddressRegion, limRegion, msgAddressTooLong)
	text("addressPostalCode", &v.AddressPostalCode, limPostalCode, msgAddressTooLong)
	text("addressCountry", &v.AddressCountry, 2, msgCountryShape)
	if v.AddressCountry != "" && !isCountryCode(v.AddressCountry) {
		e.add("addressCountry", msgCountryShape)
	}
	return v, e
}

// clientAddress and clientPayload are toClientPayload's shape: null, never "", for every
// optional field.
type clientAddress struct {
	Line1      *string `json:"line1"`
	Line2      *string `json:"line2"`
	City       *string `json:"city"`
	Region     *string `json:"region"`
	PostalCode *string `json:"postalCode"`
	Country    *string `json:"country"`
}

type clientPayload struct {
	FirstName      string          `json:"firstName"`
	LastName       string          `json:"lastName"`
	PreferredName  *string         `json:"preferredName"`
	Email          string          `json:"email"`
	Phone          *string         `json:"phone"`
	DateOfBirth    *string         `json:"dateOfBirth"`
	Tags           []string        `json:"tags"`
	ImportantDates []importantDate `json:"importantDates"`
	Notes          *string         `json:"notes"`
	Address        clientAddress   `json:"address"`
}

func orNull(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// toClientPayload ports toClientPayload on validated values.
func toClientPayload(v clientValues) clientPayload {
	p := clientPayload{
		FirstName: v.FirstName, LastName: v.LastName, PreferredName: orNull(v.PreferredName),
		Email: v.Email, DateOfBirth: orNull(v.DateOfBirth), Notes: orNull(v.Notes),
		Tags: []string{}, ImportantDates: v.ImportantDates,
		Address: clientAddress{
			Line1: orNull(v.AddressLine1), Line2: orNull(v.AddressLine2), City: orNull(v.AddressCity),
			Region: orNull(v.AddressRegion), PostalCode: orNull(v.AddressPostalCode), Country: orNull(v.AddressCountry),
		},
	}
	if p.ImportantDates == nil {
		p.ImportantDates = []importantDate{}
	}
	if phone, ok := normalizePhone(v.Phone); ok && phone != "" {
		p.Phone = &phone
	}
	for _, t := range v.Tags {
		if strings.TrimSpace(t) != "" {
			p.Tags = append(p.Tags, t)
		}
	}
	return p
}
