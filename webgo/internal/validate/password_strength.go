package validate

import "strings"

// Ports web/lib/validation/password-strength.ts: the policy as something a meter can render.
// The rules are exactly NewPassword's, never a second heuristic; the meter's browser twin is
// webgo/assets/js/auth/password-strength.js, which must say the same words.

// Rule labels (PASSWORD_RULE_LABELS), in the order they are read out.
const (
	RuleLength    = "at least 12 characters"
	RuleUppercase = "a capital letter"
	RuleLowercase = "a lowercase letter"
	RuleDigit     = "a number"
)

// Strength messages (STRENGTH_MESSAGES).
const (
	StrengthStrong      = "Strong — 12+ characters, upper and lower case, and a number."
	StrengthNeedsPrefix = "Still needs "
)

// Strength is how many of the four rules a password meets.
type Strength struct {
	Score   int      // 0-4, drives the bar and its colour
	Missing []string // unmet rules, in reading order
	Meets   bool     // passes NewPassword
}

// PasswordStrength scores v.
func PasswordStrength(v string) Strength {
	rules := []struct {
		label string
		met   bool
	}{
		{RuleLength, UTF16Len(v) >= PasswordMin},
		{RuleUppercase, strings.ContainsAny(v, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")},
		{RuleLowercase, strings.ContainsAny(v, "abcdefghijklmnopqrstuvwxyz")},
		{RuleDigit, strings.ContainsAny(v, "0123456789")},
	}
	missing := []string{}
	for _, r := range rules {
		if !r.met {
			missing = append(missing, r.label)
		}
	}
	return Strength{Score: len(rules) - len(missing), Missing: missing, Meets: len(missing) == 0}
}

// JoinReadably is "a and b" / "a, b and c".
func JoinReadably(parts []string) string {
	switch len(parts) {
	case 0:
		return ""
	case 1:
		return parts[0]
	case 2:
		return parts[0] + " and " + parts[1]
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
}

// StrengthMessage is the line under the bar: nothing before anything is typed.
func StrengthMessage(v string) string {
	if v == "" {
		return ""
	}
	s := PasswordStrength(v)
	if s.Meets {
		return StrengthStrong
	}
	return StrengthNeedsPrefix + JoinReadably(s.Missing) + "."
}
