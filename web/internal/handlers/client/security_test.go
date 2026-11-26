package client_test

import (
	"strings"
	"testing"
)

// Screen 2.5.7, Security.

func TestSecurityOffersAPasswordChangeAndSaysWhyItIsOff(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("account", map[string]any{"auth_provider": "email"})
	rec := hn.signedIn().get("/account/security")

	has(t, rec, "Security", "How you get in, and how we keep others out.",
		"Password", "Change password",
		esc("Coming with the next release — for now, sign out and use"),
		// Two-factor is off for this account, so the live control is the one that turns it on.
		"Two-factor authentication", ">Off<", "Turn on two-factor", `href="/mfa/setup"`)
	hasNot(t, rec, "How you sign in", "Replace your authenticator")
}

// An account that signs in through a provider has no password here to change, and is sent
// to the screen where it IS managed rather than offered an inert button.
func TestAnOAuthAccountIsNotOfferedAPassword(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("account", map[string]any{"auth_provider": "google"})
	rec := hn.signedIn().get("/account/security")
	has(t, rec, "How you sign in",
		esc("You sign in with Google, so there is no password here to change."),
		"Connected accounts", `href="/account/connected"`)
	hasNot(t, rec, "Change password")
}

// A failed read falls back to the password card: its action is disabled anyway, so the worst
// case is an inert control rather than telling an OAuth user they have a password.
func TestAFailedProviderReadFallsBackToThePasswordCard(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("account")
	rec := hn.signedIn().get("/account/security")
	has(t, rec, "Password", "Change password")
	hasNot(t, rec, "How you sign in")
}

// VERIFIED, not merely enrolled. An enrolment somebody abandoned before confirming a code
// protects nothing, and calling it "On" would tell them they are safe when they are not.
func TestTwoFactorIsOnOnlyWhenAFactorIsVerified(t *testing.T) {
	for _, tc := range []struct{ factor, want, notWant string }{
		{"verified", ">On<", "Turn on two-factor"},
		{"unverified", ">Off<", "Replace your authenticator"},
		{"", ">Off<", "Replace your authenticator"},
	} {
		hn := newHarness(t)
		hn.f.factor = tc.factor
		if tc.factor == "verified" {
			// The gate sends anyone with a factor who has not verified it THIS session to
			// the challenge, so reaching 2.5.7 at all means aal2.
			hn.f.aal = "aal2"
		}
		rec := hn.signedIn().get("/account/security")
		has(t, rec, tc.want)
		hasNot(t, rec, tc.notWant)
	}
}

// The sessions card says what is TRUE rather than "coming soon": the reader's question is
// "can someone else be signed in as me?", and a list that is always empty answers it wrongly.
func TestTheSessionsCardAnswersTheQuestionItCannotShow(t *testing.T) {
	hn := newHarness(t)
	rec := hn.signedIn().get("/account/security")
	has(t, rec, "WHERE YOU ARE SIGNED IN",
		esc("We can’t show you your other devices yet."),
		esc("a list that is always empty would tell you the wrong thing"),
		esc("tell Gyasi. He would rather hear about it early."))

	// No vendor is named and no backup codes are offered: Supabase has no backup-code
	// factor, and a home-grown one would be a promise we could not keep.
	body := rec.Body.String()
	for _, never := range []string{"Google Authenticator", "Authy", "backup code", "recovery code"} {
		if strings.Contains(strings.ToLower(body), strings.ToLower(never)) {
			t.Errorf("2.5.7 mentions %q", never)
		}
	}
}
