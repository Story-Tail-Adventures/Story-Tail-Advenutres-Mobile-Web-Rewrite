package validate

import "testing"

// Ported from web/lib/validation/mfa.test.ts.

func TestNormalizeMFACode(t *testing.T) {
	cases := [][2]string{
		{"483921", "483921"},
		// Authenticator apps display the code with a space in the middle, and it comes along
		// on paste. Rejecting it would be rejecting the app's own formatting.
		{"483 921", "483921"},
		{"483-921", "483921"},
		{"  483921  ", "483921"},
		{"4 8 3 9 2 1", "483921"},
		// \D without the u flag: anything not ASCII 0-9 goes, Arabic-Indic digits included.
		{"\u0664\u0668\u0663921", "921"},
	}
	for _, c := range cases {
		if got := NormalizeMFACode(c[0]); got != c[1] {
			t.Errorf("NormalizeMFACode(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

func mfaIssue(code string) string {
	_, errs := MFACode(code)
	return errs.First("code")
}

func TestMFAFormSchema(t *testing.T) {
	if code, errs := MFACode("483 921"); len(errs) != 0 || code != "483921" {
		t.Errorf("a spaced six-digit code = %q %v", code, errs)
	}
	for _, in := range []string{"", "   "} {
		if got := mfaIssue(in); got != MFACodeRequired {
			t.Errorf("MFACode(%q) = %q", in, got)
		}
	}
	for _, in := range []string{"12345", "1234567", "12345a"} {
		if got := mfaIssue(in); got != MFACodeShape {
			t.Errorf("MFACode(%q) = %q, want the shape message", in, got)
		}
	}
	// Nothing survives normalisation, so there is no code: "that code is six digits" would be
	// answering a question they did not ask.
	if got := mfaIssue("abcdef"); got != MFACodeRequired {
		t.Errorf("all letters = %q", got)
	}
}
