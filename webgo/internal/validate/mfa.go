package validate

// Ports web/lib/validation/mfa.ts: the six-digit code from an authenticator app (Screens 2.1.6
// and 2.1.7). Normalised before it is checked, because apps display "483 921" and the space
// comes along on paste.

// Messages (MFA_MESSAGES). Web-only until mobile builds 2.1.6/2.1.7.
const (
	MFACodeRequired = "Enter the code from your authenticator app"
	MFACodeShape    = "That code is six digits"
)

// MFACodeLength is the code's length.
const MFACodeLength = 6

// NormalizeMFACode strips everything that is not an ASCII digit (/\D/g without the u flag).
func NormalizeMFACode(raw string) string {
	out := make([]byte, 0, len(raw))
	for i := 0; i < len(raw); i++ {
		if c := raw[i]; c >= '0' && c <= '9' {
			out = append(out, c)
		}
	}
	return string(out)
}

// MFACode is mfaFormSchema: the normalised code, or the "code" field's messages.
func MFACode(raw string) (string, Errors) {
	code := NormalizeMFACode(raw)
	errs := Errors{}
	if len(code) < 1 {
		errs.Add("code", MFACodeRequired)
	}
	if len(code) != MFACodeLength {
		errs.Add("code", MFACodeShape)
	}
	return code, errs
}
