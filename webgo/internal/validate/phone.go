package validate

import (
	"strings"
)

// NormalizePhone is the port of normalizePhone (web/lib/validation/profile.ts): a phone
// number as E.164, or a reason it is not one. ok is true with value nil for an empty field,
// because on these screens an emptied box means "remove this", not "you made a mistake".
//
// P1 SCOPE DECISION, September 2026, carried over unchanged. Full E.164 means
// libphonenumber, a dependency CLAUDE.md sends through security review, so this does the
// defensible subset: a number that already carries a + is taken as given, and a bare
// ten-digit number is assumed to be American because the practice is. The field's hint says
// so out loud rather than assuming silently.
func NormalizePhone(raw string) (value *string, message string) {
	trimmed := JSTrim(raw)
	if trimmed == "" {
		return nil, ""
	}
	// Everything people actually type: (305) 555-0184, 305.555.0184, +44 20 7946 0958.
	cleaned := strings.NewReplacer(" ", "", "(", "", ")", "", ".", "", "-", "").Replace(trimmed)
	if !phoneShape(cleaned) {
		return nil, ProfileMessages.PhoneInvalid
	}

	if strings.HasPrefix(cleaned, "+") {
		digits := cleaned[1:]
		// E.164 caps the whole number at 15 digits. The floor is the shortest real one:
		// Niue's +683 xxxx is seven.
		if len(digits) < 7 || len(digits) > 15 {
			return nil, ProfileMessages.PhoneInvalid
		}
		out := "+" + digits
		return &out, ""
	}

	// No country code. North America is the only place we will guess for, and the guess is
	// CHECKED rather than assumed: a NANP area code and exchange code both begin 2-9, so
	// "1234567890" is ten digits that cannot ring anywhere. Storing it would produce a
	// well-formed +11234567890 indistinguishable from a real number — on, among other
	// fields, the one whose entire job is being reachable in an emergency.
	national := cleaned
	if len(national) == 11 && national[0] == '1' {
		national = national[1:]
	}
	if len(national) != 10 {
		return nil, ProfileMessages.PhoneNeedsCountryCode
	}
	if !isNANP(national) {
		return nil, ProfileMessages.PhoneInvalid
	}
	out := "+1" + national
	return &out, ""
}

// phoneShape is /^\+?\d+$/: an optional leading plus and then digits only. A control
// character or a letter anywhere fails here rather than being stripped.
func phoneShape(s string) bool {
	digits := s
	if strings.HasPrefix(digits, "+") {
		digits = digits[1:]
	}
	if digits == "" {
		return false
	}
	for i := 0; i < len(digits); i++ {
		if digits[i] < '0' || digits[i] > '9' {
			return false
		}
	}
	return true
}

// isNANP is /^[2-9]\d{2}[2-9]\d{6}$/: area code and exchange code both begin 2-9 in the
// North American plan.
func isNANP(n string) bool {
	if len(n) != 10 {
		return false
	}
	if n[0] < '2' || n[0] > '9' || n[3] < '2' || n[3] > '9' {
		return false
	}
	for i := 0; i < 10; i++ {
		if n[i] < '0' || n[i] > '9' {
			return false
		}
	}
	return true
}

// optionalPhone normalises a field, recording the refusal against it.
func optionalPhone(raw, field string, errs Errors) *string {
	value, message := NormalizePhone(raw)
	if message != "" {
		errs.Add(field, message)
		return nil
	}
	return value
}
