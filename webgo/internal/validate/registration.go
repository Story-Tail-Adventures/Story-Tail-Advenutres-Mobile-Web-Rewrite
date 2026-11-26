package validate

// Ports web/lib/validation/registration.ts: the rules shared by every screen that creates an
// account, Screen 2.1.2 Registration (/register) and Screen 2.0.6 the sign-up gate (/join).
// They differ only in that 2.1.2 asks for the password twice.

// Messages (REGISTRATION_MESSAGES). Web-only until mobile builds 2.1.2.
const (
	NameRequired    = "Tell us your name"
	NameTooLong     = "Keep it to 80 characters or fewer"
	NameInvalid     = "Some of those characters won't work here"
	TermsRequired   = "Check the box to agree to our terms"
	ConfirmRequired = "Type your password once more"
	ConfirmMismatch = "Those two don't match yet"
)

// NameMax is a name's longest, in UTF-16 units.
const NameMax = 80

// Name is nameSchema: trimmed, present, at most NameMax, no control characters.
func Name(raw string) (string, []string) {
	v := JSTrim(raw)
	var errs []string
	n := UTF16Len(v)
	if n < 1 {
		errs = append(errs, NameRequired)
	}
	if n > NameMax {
		errs = append(errs, NameTooLong)
	}
	if HasControl(v) {
		errs = append(errs, NameInvalid)
	}
	return v, errs
}

// RegistrationInput is the posted form, as strings ("" when a field is absent).
type RegistrationInput struct {
	FirstName       string
	LastName        string
	Email           string
	Password        string
	ConfirmPassword string // 2.1.2 only
	// Terms is the checkbox: a checked box posts the literal "on", an unchecked one nothing.
	Terms string
}

// RegistrationData is what passed: names and email trimmed, the password as typed.
type RegistrationData struct {
	FirstName string
	LastName  string
	Email     string
	Password  string
}

// Registration is registrationSchema, the fields both screens ask for. The error keys are the
// form's field names: firstName, lastName, email, password, terms.
func Registration(in RegistrationInput) (RegistrationData, Errors) {
	errs := Errors{}
	var d RegistrationData
	var msgs []string
	d.FirstName, msgs = Name(in.FirstName)
	for _, m := range msgs {
		errs.Add("firstName", m)
	}
	d.LastName, msgs = Name(in.LastName)
	for _, m := range msgs {
		errs.Add("lastName", m)
	}
	d.Email, msgs = Email(in.Email)
	for _, m := range msgs {
		errs.Add("email", m)
	}
	d.Password = in.Password
	for _, m := range NewPassword(in.Password) {
		errs.Add("password", m)
	}
	if in.Terms != "on" {
		errs.Add("terms", TermsRequired)
	}
	return d, errs
}

// confirmRequired is confirmPasswordSchema, a field rule: it runs whatever else failed.
func confirmRequired(errs Errors, confirm string) {
	if UTF16Len(confirm) < 1 {
		errs.Add("confirmPassword", ConfirmRequired)
	}
}

// confirmMismatch is checkConfirmMatches, the object-level superRefine. The mismatch goes on
// confirmPassword, never on password, and it runs even when the password failed the policy (a
// string check does not stop zod), so a short password and a mistyped repeat show together.
func confirmMismatch(errs Errors, password, confirm string) {
	if confirm != "" && confirm != password {
		errs.Add("confirmPassword", ConfirmMismatch)
	}
}

// RegistrationWithConfirm is registrationWithConfirmSchema (Screen 2.1.2).
//
// zod 4 skips an object's superRefine when a field failed with an ABORTING issue, and the
// terms literal is one (a string's min or regex is not). So an unticked box hides the
// mismatch until the box is ticked, exactly as the TypeScript does.
func RegistrationWithConfirm(in RegistrationInput) (RegistrationData, Errors) {
	d, errs := Registration(in)
	confirmRequired(errs, in.ConfirmPassword)
	if errs.First("terms") == "" {
		confirmMismatch(errs, in.Password, in.ConfirmPassword)
	}
	return d, errs
}

// PasswordPair is passwordPairSchema (Screen 2.1.5): the new password and its repeat.
func PasswordPair(password, confirm string) (string, Errors) {
	errs := Errors{}
	for _, m := range NewPassword(password) {
		errs.Add("password", m)
	}
	confirmRequired(errs, confirm)
	confirmMismatch(errs, password, confirm)
	return password, errs
}
