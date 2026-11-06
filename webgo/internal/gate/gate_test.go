package gate

import (
	"net/url"
	"testing"
)

// Ported case for case from web/lib/supabase/middleware.test.ts and web/lib/safe-next.test.ts.

func expect(t *testing.T, path string, signedIn bool, a Assurance, next, want string) {
	t.Helper()
	if got := RedirectFor(path, signedIn, a, next); got != want {
		t.Errorf("RedirectFor(%q, signedIn=%v, %v, next=%q) = %q, want %q", path, signedIn, a, next, got, want)
	}
}

func TestSignedOut(t *testing.T) {
	for _, p := range []string{"/dashboard", "/dashboard/", "/trips/abc", "/account/security", "/agent/worklist"} {
		expect(t, p, false, None, "", "/login")
	}
	for _, p := range []string{"/", "/join", "/join/", "/login", "/register", "/explore/results", "/legal/terms"} {
		expect(t, p, false, None, "", "")
	}
	// A prefix lookalike is not protected.
	expect(t, "/dashboards-are-public", false, None, "", "")
	expect(t, "/tripster", false, None, "", "")
}

func TestSignedIn(t *testing.T) {
	for _, p := range []string{"/login", "/register", "/join", "/join/", "/forgot-password"} {
		expect(t, p, true, None, "", "/dashboard")
	}
	expect(t, "/", true, None, "", "/dashboard")
	for _, p := range []string{"/explore", "/caribbean", "/about", "/legal/privacy", "/how-it-works"} {
		expect(t, p, true, None, "", "")
	}
	expect(t, "/dashboard", true, None, "", "")
	expect(t, "/trips/abc", true, None, "", "")
}

func TestSignedInWithNext(t *testing.T) {
	// The regression the next parameter exists for: a signed-in client clicking "Request a
	// quote" must land on the quote, not be bounced to the dashboard.
	expect(t, "/join", true, None, "/trips/new?kind=hotel&name=Bucuti", "/trips/new?kind=hotel&name=Bucuti")
	expect(t, "/join", true, None, "", "/dashboard")
	// A next that would bounce straight back here loops; it falls through to the dashboard.
	expect(t, "/join", true, None, "/join?intent=quote", "/dashboard")
	expect(t, "/login", true, None, "/register", "/dashboard")
	expect(t, "/join", true, None, "/", "/dashboard")
	// Not an open redirect.
	for _, hostile := range []string{"https://evil.example/x", "//evil.example/x", `/\evil.example`, "javascript:alert(1)"} {
		expect(t, "/join", true, None, hostile, "/dashboard")
	}
	// A next cannot jump a half-authenticated session past the challenge.
	expect(t, "/join", true, Required, "/trips/new?kind=hotel", MFAChallenge)
	// Signed-out visitors stay on the gate, next or not.
	expect(t, "/join", false, None, "/trips/new?kind=hotel", "")
}

func TestSecondFactorEnrolledNotVerified(t *testing.T) {
	for _, p := range []string{"/dashboard", "/trips/abc", "/account/security", "/agent/worklist"} {
		expect(t, p, true, Required, "", MFAChallenge)
	}
	// The signed-in rule would send these to /dashboard, which would bounce back: a loop.
	for _, p := range []string{"/", "/login", "/register", "/join", "/forgot-password"} {
		expect(t, p, true, Required, "", MFAChallenge)
	}
	for _, p := range []string{"/explore", "/explore/results", "/legal/terms", "/caribbean"} {
		expect(t, p, true, Required, "", "")
	}
	expect(t, MFAChallenge, true, Required, "", "")
}

func TestChallengeScreenPreconditions(t *testing.T) {
	expect(t, MFAChallenge, false, None, "", "/login")
	expect(t, MFAChallenge, true, None, "", "/dashboard")
	expect(t, MFAChallenge, true, Satisfied, "", "/dashboard")
}

func TestSecondFactorVerified(t *testing.T) {
	for _, p := range []string{"/dashboard", "/trips/abc", "/account/security"} {
		expect(t, p, true, Satisfied, "", "")
	}
	expect(t, "/login", true, Satisfied, "", "/dashboard")
	expect(t, "/", true, Satisfied, "", "/dashboard")
}

func TestNoSecondFactorIsUnaffected(t *testing.T) {
	expect(t, "/dashboard", true, None, "", "")
	expect(t, "/dashboard", false, None, "", "/login")
	expect(t, "/login", true, None, "", "/dashboard")
}

// The public lead form and the protected thread list differ by one letter.
func TestMessageVsMessages(t *testing.T) {
	expect(t, "/message", false, None, "", "")
	expect(t, "/messages", false, None, "", "/login")
	expect(t, "/messages/abc", false, None, "", "/login")
}

func TestSafeNextNeverLeavesTheOrigin(t *testing.T) {
	for _, attack := range []string{
		`/\evil.com`, "//evil.com", `/\\evil.com`, "https://evil.com", "//evil.com/path",
		`\/evil.com`, "/\t/evil.com", "javascript:alert(1)", "", "/\n/evil.com", "/%5Cevil.com",
	} {
		got := SafeNext(attack, "/dashboard")
		u, err := url.Parse(got)
		if err != nil || u.Host != "" || u.Scheme != "" || len(got) > 1 && got[1] == '/' {
			t.Errorf("SafeNext(%q) = %q, which leaves the origin", attack, got)
		}
	}
}

func TestSafeNextKeepsLegitimateDestinations(t *testing.T) {
	for _, legit := range []string{"/dashboard", "/trips/123?tab=itinerary", "/account#security", "/"} {
		if got := SafeNext(legit, "/dashboard"); got != legit {
			t.Errorf("SafeNext(%q) = %q", legit, got)
		}
	}
	if got := SafeNext("", "/dashboard"); got != "/dashboard" {
		t.Errorf("empty next = %q", got)
	}
}
