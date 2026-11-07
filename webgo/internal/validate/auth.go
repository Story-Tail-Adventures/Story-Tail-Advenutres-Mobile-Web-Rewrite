package validate

import "strings"

// Ports web/lib/validation/auth.ts. A PARALLEL implementation of
// mobile/shared/.../domain/validation/AuthValidation.kt, kept honest by the shared vectors in
// auth_test.go, web/lib/validation/auth.test.ts and AuthValidationTest.kt.

// Messages are user-facing copy, byte-identical across platforms (AUTH_MESSAGES).
const (
	EmailRequired          = "Don't forget your email"
	EmailInvalid           = "That doesn't look like an email address"
	PasswordRequired       = "Don't forget your password"
	PasswordTooShort       = "Use at least 12 characters"
	PasswordNeedsDigit     = "Add at least one number"
	PasswordNeedsUppercase = "Add at least one capital letter"
	PasswordNeedsLowercase = "Add at least one lowercase letter"
)

// PasswordMin is the policy's length, in UTF-16 units (supabase/config.toml
// minimum_password_length).
const PasswordMin = 12

// Email is emailSchema: trimmed, present, and shaped like /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/. It
// returns the trimmed address and every message that applies (an empty field fails both).
func Email(raw string) (string, []string) {
	v := JSTrim(raw)
	var errs []string
	if UTF16Len(v) < 1 {
		errs = append(errs, EmailRequired)
	}
	if !emailShape(v) {
		errs = append(errs, EmailInvalid)
	}
	return v, errs
}

// emailShape is /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ without the u flag, so its counts are UTF-16
// units and \s is JS whitespace.
func emailShape(s string) bool {
	for _, r := range s {
		if isJSSpace(r) {
			return false
		}
	}
	at := strings.IndexByte(s, '@')
	if at < 1 || strings.Count(s, "@") != 1 {
		return false // nothing before the @, or a second @ that [^@] can never match
	}
	domain := s[at+1:]
	if domain == "" {
		return false
	}
	// [^\s@]+ then a dot: the dot is any '.' after at least one unit. The earliest such dot
	// leaves the longest tail, so if it fails every later one fails too.
	dot := strings.IndexByte(domain[1:], '.')
	if dot < 0 {
		return false
	}
	return UTF16Len(domain[1+dot+1:]) >= 2
}

// EmailForm is emailFormSchema, the one-field email form (2.1.3's resend and change, 2.1.4).
func EmailForm(raw string) (string, Errors) {
	v, msgs := Email(raw)
	errs := Errors{}
	for _, m := range msgs {
		errs.Add("email", m)
	}
	return v, errs
}

// Login is loginSchema. The password rule is presence only: the 12-character policy governs
// registration and reset, and enforcing it at sign-in would lock out anyone whose password
// predates it and leak the policy to an unauthenticated caller.
func Login(email, password string) (string, Errors) {
	v, errs := EmailForm(email)
	if UTF16Len(password) < 1 {
		errs.Add("password", PasswordRequired)
	}
	return v, errs
}

// NewPassword is newPasswordSchema, the registration and reset rule. It must stay in step with
// password_requirements = "lower_upper_letters_digits" in supabase/config.toml: a client rule
// looser than GoTrue's tells someone their password is fine and then hands them weak_password.
// The checks are ASCII, as the TypeScript regexes are.
func NewPassword(pw string) []string {
	var errs []string
	if UTF16Len(pw) < PasswordMin {
		errs = append(errs, PasswordTooShort)
	}
	if !strings.ContainsAny(pw, "0123456789") {
		errs = append(errs, PasswordNeedsDigit)
	}
	if !strings.ContainsAny(pw, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
		errs = append(errs, PasswordNeedsUppercase)
	}
	if !strings.ContainsAny(pw, "abcdefghijklmnopqrstuvwxyz") {
		errs = append(errs, PasswordNeedsLowercase)
	}
	return errs
}
