package client_test

import (
	"strings"
	"testing"
)

// Screen 2.5.8, Connected accounts.

func TestConnectedShowsWhichProviderSignedYouIn(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("account", map[string]any{"auth_provider": "google"})
	rec := hn.signedIn().get("/account/connected")

	has(t, rec, "Connected accounts", "How you sign in.",
		"Google", ">Connected<", ">Unlink<",
		"Apple", ">Not connected<", ">Link<",
		// Signed in through a provider, so there is no password on this account.
		esc("You sign in through the provider above"),
		esc("Unlinking never deletes anything."))
	hasNot(t, rec, esc("You sign in with an email address and password."))
}

func TestAnEmailAccountIsToldWhatLinkingWouldBuy(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("account", map[string]any{"auth_provider": "email"})
	rec := hn.signedIn().get("/account/connected")
	has(t, rec, esc("You sign in with an email address and password."), ">Link<")
	// ">Unlink<" rather than "Unlink": the safety note contains the word "Unlinking".
	hasNot(t, rec, ">Unlink<", ">Connected<")
}

// A FAILED read is not the same as "no provider". Telling somebody who signs in with Google
// that they are not connected is worse than saying nothing about it.
func TestAFailedProviderReadDoesNotClaimNothingIsConnected(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("account")
	rec := hn.signedIn().get("/account/connected")
	// The rows still draw, because the page is about how sign-in works — but nothing says
	// "Connected", and the note is the one that is true either way.
	has(t, rec, "Google", "Apple", esc("You sign in with an email address and password."))
	hasNot(t, rec, ">Unlink<", ">Connected<")
}

// The artboard adds a Facebook row marked "Not connected · available". auth_provider is an
// ENUM of three, so a provider it cannot hold is not available and must not be drawn.
func TestOnlyTheProvidersTheEnumCanHoldAreDrawn(t *testing.T) {
	hn := newHarness(t)
	body := hn.signedIn().get("/account/connected").Body.String()
	for _, never := range []string{"Facebook", "Twitter", "GitHub"} {
		if strings.Contains(body, never) {
			t.Errorf("the page offers %s, which auth_provider cannot hold", never)
		}
	}
}

// Both actions are disabled, with the reason on them: linking needs linkIdentity and a
// re-authentication story, and a button that silently does nothing is worse than one that
// says why.
func TestNeitherActionPretendsToWork(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("account", map[string]any{"auth_provider": "google"})
	body := hn.signedIn().get("/account/connected").Body.String()
	for _, slot := range formSlots(body) {
		f := readForm(t, body, slot)
		for _, b := range f.submits {
			t.Errorf("form %q offers a submit %q; nothing on 2.5.8 can be submitted", slot, b.value)
		}
	}
	// Twice per provider, inside the list: a disabled button has pointer-events: none, so
	// the wrapping span carries the same title and the reason still shows on hover. Scoped
	// to the list because the shell's own chrome uses the same sentence.
	list := body
	if i := strings.Index(list, `<ul class="cl-providers">`); i >= 0 {
		list = list[i:]
		if j := strings.Index(list, "</ul>"); j >= 0 {
			list = list[:j]
		}
	}
	if got := strings.Count(list, "Coming with the next release"); got != 4 {
		t.Errorf("the reason appears %d times in the list, want one per button and one per wrapper", got)
	}
}
