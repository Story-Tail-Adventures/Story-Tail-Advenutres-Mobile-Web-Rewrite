package validate

import "testing"

// Ported case for case from web/lib/validation/auth.test.ts, whose table is ALSO asserted in
// mobile/shared/src/commonTest/.../AuthValidationTest.kt. Add a case in all three places.

func TestEmailVectorsMatchTheSharedTable(t *testing.T) {
	cases := []struct {
		in   string
		want string // "" = valid
	}{
		{"", EmailRequired},
		{"   ", EmailRequired},
		{"jordan", EmailInvalid},
		{"jordan@", EmailInvalid},
		{"jordan@example", EmailInvalid},
		{"jordan@example.c", EmailInvalid},
		{"jordan hayes@example.com", EmailInvalid},
		{"jordan@example.com", ""},
		{"  jordan@example.com  ", ""},
		{"JORDAN@EXAMPLE.COM", ""},
		{"jordan.hayes+trips@example.co.uk", ""},
	}
	for _, c := range cases {
		_, errs := Email(c.in)
		got := ""
		if len(errs) > 0 {
			got = errs[0]
		}
		if got != c.want {
			t.Errorf("Email(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestEmailIsTrimmedTheWayZodTrims(t *testing.T) {
	// zod's .trim() is String.prototype.trim: it removes U+FEFF and keeps U+0085, the reverse
	// of Go's strings.TrimSpace on both.
	got, errs := Email("\ufeff\u00a0jordan@example.com\u3000\n")
	if len(errs) != 0 || got != "jordan@example.com" {
		t.Errorf("Email with JS whitespace = %q %v", got, errs)
	}
	// U+0085 is not JS whitespace: trim keeps it and the regex takes it as part of the name.
	if got, errs := Email("\u0085jordan@example.com"); len(errs) != 0 || got != "\u0085jordan@example.com" {
		t.Errorf("Email with U+0085 = %q %v", got, errs)
	}
}

func TestEmailRegexCountsUTF16Units(t *testing.T) {
	// [^\s@]{2,} without the u flag counts UTF-16 code units: one astral character is two.
	if _, errs := Email("a@b.\U0001F600"); len(errs) != 0 {
		t.Errorf("an astral TLD is two units in JS: %v", errs)
	}
	// Whitespace anywhere, JS's definition of it, refuses the address.
	if _, errs := Email("jordan\u2028x@example.com"); len(errs) == 0 {
		t.Error("U+2028 is JS whitespace and must be refused inside an address")
	}
	// A dot right after the @ cannot be the separator; a later one can.
	if _, errs := Email("a@.example.com"); len(errs) != 0 {
		t.Errorf("a@.example.com matches the regex (domain part '.example'): %v", errs)
	}
	if _, errs := Email("a@b@c.com"); len(errs) == 0 {
		t.Error("two @ signs never match [^\\s@]")
	}
}

func TestLoginPasswordRequiresPresenceOnly(t *testing.T) {
	_, errs := Login("a@b.co", "")
	if got := errs.First("password"); got != PasswordRequired {
		t.Errorf("empty password = %q", got)
	}
	// A short password is NOT a login-time error: the policy applies at registration, and
	// rejecting it here would leak the policy and lock out anyone whose password predates it.
	for _, pw := range []string{"short", " "} {
		if _, errs := Login("a@b.co", pw); errs.First("password") != "" {
			t.Errorf("Login password %q refused: %v", pw, errs)
		}
	}
}

func TestNewPasswordEnforcesThe12CharPolicy(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", PasswordTooShort},
		{"Short1", PasswordTooShort},
		{"alllowercase", PasswordNeedsDigit},
		{"alllowercase1", PasswordNeedsUppercase},
		// Uppercase + digits but no lowercase. supabase/config.toml requires all three.
		{"PASSWORD12345", PasswordNeedsLowercase},
		{"GreenPastures1", ""},
		{"still-waters-99X", ""},
	}
	for _, c := range cases {
		errs := NewPassword(c.in)
		got := ""
		if len(errs) > 0 {
			got = errs[0]
		}
		if got != c.want {
			t.Errorf("NewPassword(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestNewPasswordLengthIsUTF16Units(t *testing.T) {
	// zod's .min(12) is String.length. Eleven ASCII characters and one astral character are
	// twelve units in JS (and twelve runes would be wrong the other way for "é" spellings).
	if errs := NewPassword("Abcdefghi1\U0001F600"); len(errs) != 0 {
		t.Errorf("10 ASCII + 1 astral = 12 units: %v", errs)
	}
	if errs := NewPassword("Abcdefgh1\U0001F600"); len(errs) == 0 || errs[0] != PasswordTooShort {
		t.Errorf("9 ASCII + 1 astral = 11 units: %v", errs)
	}
}

func TestEmailFormKeysItsErrorOnEmail(t *testing.T) {
	_, errs := EmailForm("nope")
	if errs.First("email") != EmailInvalid {
		t.Errorf("EmailForm = %v", errs)
	}
}

func TestMessagesAreByteIdentical(t *testing.T) {
	// The Kotlin twins and check_copy_parity.py pin these words; a typo here is a drift.
	want := map[string]string{
		EmailRequired:          "Don't forget your email",
		EmailInvalid:           "That doesn't look like an email address",
		PasswordRequired:       "Don't forget your password",
		PasswordTooShort:       "Use at least 12 characters",
		PasswordNeedsDigit:     "Add at least one number",
		PasswordNeedsUppercase: "Add at least one capital letter",
		PasswordNeedsLowercase: "Add at least one lowercase letter",
	}
	for got, w := range want {
		if got != w {
			t.Errorf("message %q != %q", got, w)
		}
	}
}
