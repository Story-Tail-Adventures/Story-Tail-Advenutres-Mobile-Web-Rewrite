package validate

import (
	"reflect"
	"testing"
)

// Ported from web/lib/validation/password-strength.test.ts. The meter and the schema have to
// agree: a meter that says "strong" about a password GoTrue will reject is worse than none.

func TestPasswordStrengthAgreesWithNewPassword(t *testing.T) {
	vectors := []string{
		"",
		"short",
		"alllowercaseletters",
		"ALLUPPERCASELETTERS",
		"NoDigitsInHere",
		"nouppercase123456",
		"NOLOWERCASE123456",
		"GreenPastures1",
		"Sh0rt",
		"12345678901234567890",
		"Restful Waters 23",
		"Abcdefghi1\U0001F600", // twelve UTF-16 units
	}
	for _, v := range vectors {
		if got, want := PasswordStrength(v).Meets, len(NewPassword(v)) == 0; got != want {
			t.Errorf("%q: meter says %v, schema says %v", v, got, want)
		}
	}
}

func TestPasswordStrength(t *testing.T) {
	all := []string{RuleLength, RuleUppercase, RuleLowercase, RuleDigit}
	if got := PasswordStrength(""); !reflect.DeepEqual(got, Strength{Score: 0, Missing: all, Meets: false}) {
		t.Errorf("empty = %+v", got)
	}
	if got := PasswordStrength("GreenPastures1"); !reflect.DeepEqual(got, Strength{Score: 4, Missing: []string{}, Meets: true}) {
		t.Errorf("strong = %+v", got)
	}
	cases := map[string][]string{
		"GreenPasturesAll": {"a number"},
		"greenpastures1":   {"a capital letter"},
		"Green1":           {"at least 12 characters"},
	}
	for in, want := range cases {
		if got := PasswordStrength(in).Missing; !reflect.DeepEqual(got, want) {
			t.Errorf("%q missing = %v, want %v", in, got, want)
		}
	}
}

func TestStrengthMessage(t *testing.T) {
	cases := map[string]string{
		"":               "",
		"GreenPastures1": "Strong — 12+ characters, upper and lower case, and a number.",
		"greenpastures":  "Still needs a capital letter and a number.",
		"green":          "Still needs at least 12 characters, a capital letter and a number.",
	}
	for in, want := range cases {
		if got := StrengthMessage(in); got != want {
			t.Errorf("StrengthMessage(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestJoinReadably(t *testing.T) {
	cases := []struct {
		in   []string
		want string
	}{
		{nil, ""},
		{[]string{"a"}, "a"},
		{[]string{"a", "b"}, "a and b"},
		{[]string{"a", "b", "c"}, "a, b and c"},
		{[]string{"a", "b", "c", "d"}, "a, b, c and d"},
	}
	for _, c := range cases {
		if got := JoinReadably(c.in); got != c.want {
			t.Errorf("JoinReadably(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}
