package validate

import (
	"strings"
	"testing"
)

// Ported from web/lib/validation/registration.test.ts.

var valid = RegistrationInput{
	FirstName: "Jordan",
	LastName:  "Hayes",
	Email:     "jordan@example.com",
	Password:  "GreenPastures1",
	Terms:     "on",
}

func TestRegistrationTrimsNames(t *testing.T) {
	in := valid
	in.FirstName = "  Jose-Maria "
	data, errs := Registration(in)
	if !errs.Empty() || data.FirstName != "Jose-Maria" {
		t.Errorf("trimmed name = %q %v", data.FirstName, errs)
	}
}

func TestRegistrationRequiresAName(t *testing.T) {
	in := valid
	in.FirstName = "  "
	if _, errs := Registration(in); errs.First("firstName") != NameRequired {
		t.Errorf("blank first name = %v", errs)
	}
}

func TestRegistrationCapsANameAtNameMax(t *testing.T) {
	in := valid
	in.LastName = strings.Repeat("x", NameMax+1)
	if _, errs := Registration(in); errs.First("lastName") != NameTooLong {
		t.Errorf("long last name = %v", errs)
	}
	in.LastName = strings.Repeat("x", NameMax)
	if _, errs := Registration(in); !errs.Empty() {
		t.Errorf("NameMax characters refused: %v", errs)
	}
	// .max counts UTF-16 units: 40 astral characters are 80 units, 41 are 82.
	in.LastName = strings.Repeat("\U0001F334", 41)
	if _, errs := Registration(in); errs.First("lastName") != NameTooLong {
		t.Errorf("41 astral characters = %v", errs)
	}
}

func TestRegistrationRejectsControlCharactersInAName(t *testing.T) {
	in := valid
	in.FirstName = "Jor\x07dan"
	if _, errs := Registration(in); errs.First("firstName") != NameInvalid {
		t.Errorf("control character = %v", errs)
	}
	// C1 controls are \p{Cc} too.
	in.FirstName = "Jor\u0085dan"
	if _, errs := Registration(in); errs.First("firstName") != NameInvalid {
		t.Errorf("C1 control character = %v", errs)
	}
}

func TestRegistrationRequiresTheTermsCheckbox(t *testing.T) {
	for _, terms := range []string{"", "true"} {
		in := valid
		in.Terms = terms
		if _, errs := Registration(in); errs.First("terms") != TermsRequired {
			t.Errorf("terms %q = %v", terms, errs)
		}
	}
}

func TestRegistrationAppliesTheSharedPasswordPolicy(t *testing.T) {
	in := valid
	in.Password = "short1A"
	if _, errs := Registration(in); errs.First("password") != PasswordTooShort {
		t.Errorf("short password = %v", errs)
	}
}

func TestRegistrationReturnsTheTrimmedEmail(t *testing.T) {
	in := valid
	in.Email = "  jordan@example.com "
	if data, _ := Registration(in); data.Email != "jordan@example.com" {
		t.Errorf("email = %q", data.Email)
	}
}

func TestPasswordPair(t *testing.T) {
	const pw = "GreenPastures1"
	if _, errs := PasswordPair(pw, pw); !errs.Empty() {
		t.Errorf("matching pair = %v", errs)
	}

	// The mismatch is reported on the confirmation field, never on the first one.
	_, errs := PasswordPair(pw, "GreenPastures2")
	if errs.First("confirmPassword") != ConfirmMismatch || errs.First("password") != "" {
		t.Errorf("mismatch = %v", errs)
	}

	if _, errs := PasswordPair(pw, ""); errs.First("confirmPassword") != ConfirmRequired {
		t.Errorf("empty confirmation = %v", errs)
	}

	// A weak password AND a mismatch, together on the first submit.
	_, errs = PasswordPair("short", "shore")
	if errs.First("password") != PasswordTooShort || errs.First("confirmPassword") != ConfirmMismatch {
		t.Errorf("weak and mismatched = %v", errs)
	}
}

func TestRegistrationWithConfirmIsTheSameRule(t *testing.T) {
	in := valid
	in.ConfirmPassword = "GreenPastures2"
	if _, errs := RegistrationWithConfirm(in); errs.First("confirmPassword") != ConfirmMismatch {
		t.Errorf("mismatch = %v", errs)
	}
	// An unticked box is an aborting issue in zod 4: the object-level mismatch never runs.
	// (Checked against zod: {terms: ["Check the box..."]} and nothing for confirmPassword.)
	in.Terms = ""
	if _, errs := RegistrationWithConfirm(in); errs.First("terms") != TermsRequired || errs.First("confirmPassword") != "" {
		t.Errorf("unticked terms + mismatch = %v", errs)
	}
	// The field rule still runs.
	in.ConfirmPassword = ""
	if _, errs := RegistrationWithConfirm(in); errs.First("confirmPassword") != ConfirmRequired {
		t.Errorf("unticked terms + empty confirmation = %v", errs)
	}
	in.Terms = "on"
	in.ConfirmPassword = in.Password
	if _, errs := RegistrationWithConfirm(in); !errs.Empty() {
		t.Errorf("valid = %v", errs)
	}
	// The 2.0.6 gate's schema has no confirmation field at all.
	in.ConfirmPassword = ""
	if _, errs := Registration(in); !errs.Empty() {
		t.Errorf("Registration asked for a confirmation: %v", errs)
	}
}

func TestRegistrationMessagesAreByteIdentical(t *testing.T) {
	want := map[string]string{
		NameRequired:    "Tell us your name",
		NameTooLong:     "Keep it to 80 characters or fewer",
		NameInvalid:     "Some of those characters won't work here",
		TermsRequired:   "Check the box to agree to our terms",
		ConfirmRequired: "Type your password once more",
		ConfirmMismatch: "Those two don't match yet",
	}
	for got, w := range want {
		if got != w {
			t.Errorf("message %q != %q", got, w)
		}
	}
}
