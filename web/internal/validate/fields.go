package validate

import "time"

// The field rules the traveler's own screens share — 2.1.10 Profile, 2.1.11 Preferences,
// 2.1.12 Companions and their 2.5.x twins in account settings. They sit on text.go's
// JavaScript primitives (JSTrim, UTF16Len, HasControl), so a value zod accepted in Next is
// accepted here and one it refused is refused here.
//
// GROUP ERRORS. Three of these screens report a rule about a SET of inputs on a pseudo-field
// named for the group ("address", "emergencyContact", "passport"), because marking the city
// box red when the real problem is "this address has no country" points at the wrong box.
// The pages render those under the group's heading.
//
// NIL IS "nothing on file". Every optional value is a *string, and nil means the traveler has
// none: the functions read an explicit null as "clear it" and an absent key as "leave it
// alone", so a page that sent "" where it meant nil would write an empty string into a column
// that wanted NULL (address.line2 is the one that bites).

// optionalText is optionalTextSchema: trimmed, capped in UTF-16 units as zod's .max counts
// them, no control characters, and "" becomes nil.
func optionalText(raw string, max int, field, tooLong, invalid string, errs Errors) *string {
	v := JSTrim(raw)
	switch {
	case UTF16Len(v) > max:
		errs.Add(field, tooLong)
		return nil
	case HasControl(v):
		errs.Add(field, invalid)
		return nil
	case v == "":
		return nil
	}
	return &v
}

// optionalDate trims, maps "" to nil, and reports message when what is left is not a real
// date. A future date is allowed: a passport expiry is one.
func optionalDate(raw, field, message string, errs Errors) *string {
	v := JSTrim(raw)
	if v == "" {
		return nil
	}
	if !IsRealDate(v) {
		errs.Add(field, message)
		return nil
	}
	return &v
}

// optionalBirthDate: real, in the past, and — when tooEarly is set — this side of 1900.
func optionalBirthDate(raw, field, invalid, tooEarly string, now time.Time, errs Errors) *string {
	v := JSTrim(raw)
	if v == "" {
		return nil
	}
	if !IsRealDate(v) || v >= TodayISO(now) {
		errs.Add(field, invalid)
		return nil
	}
	if tooEarly != "" && v < earliestBirthDate {
		errs.Add(field, tooEarly)
		return nil
	}
	return &v
}

// optionalCountry trims, upper-cases and checks the alpha-2 code against the assigned list,
// because char(2) truncates silently — "USA" would land in the column as "US".
func optionalCountry(raw, field, message string, errs Errors) *string {
	v := JSTrim(raw)
	if v == "" {
		return nil
	}
	v = upperASCII(v)
	if !IsCountryCode(v) {
		errs.Add(field, message)
		return nil
	}
	return &v
}

// upperASCII is JavaScript's toUpperCase for the only input that can pass IsCountryCode
// afterwards: two ASCII letters. Unicode's own upper-casing differs on ß and ı, and a country
// code has neither.
func upperASCII(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 'a' - 'A'
		}
	}
	return string(b)
}

// Text is the string a pointer holds, or "" for nil: what a page puts back in the input.
func Text(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
