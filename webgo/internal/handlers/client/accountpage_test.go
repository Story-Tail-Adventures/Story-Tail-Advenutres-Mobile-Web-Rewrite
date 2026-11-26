package client_test

import (
	"strings"
	"testing"
)

// Screen 2.5.1, the account hub.

func TestTheAccountHubNamesTheTravelerAndCountsTheirFiles(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{
		"first_name": "Jordan", "last_name": "Hayes", "preferred_name": nil,
		"email": "jordan.hayes@example.com", "created_at": "2026-03-04T12:00:00Z",
	})
	hn.f.rows("document", map[string]any{"id": "d1"}, map[string]any{"id": "d2"})
	rec := hn.signedIn().get("/account")

	has(t, rec, "Jordan Hayes", "JH", "Traveling with Gyasi since March 2026",
		"YOU", "APP", "SUPPORT",
		"Personal info", "Travel preferences", "Travel documents", "2 files",
		"Security", "Connected accounts", esc("Help & support"), esc("Privacy & data"),
		// The one place in the app that owns sign out.
		`action="/account/sign-out"`, "Sign out")
}

// A failed COUNT must not render as "0 files". That is a statement about their documents,
// and a wrong one — so it falls back to the neutral subtitle.
func TestAFailedDocumentCountIsNotZeroFiles(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("document")
	rec := hn.signedIn().get("/account")
	has(t, rec, "Passports, visas, insurance")
	hasNot(t, rec, "0 files")
}

// A hub whose NAME read failed should still offer the destinations.
func TestAFailedNameReadStillOffersEverySection(t *testing.T) {
	hn := newHarness(t)
	hn.f.failTable("client")
	rec := hn.signedIn().get("/account")
	has(t, rec, "Your account", "Personal info", "Security", "Sign out")
	hasNot(t, rec, "Traveling with Gyasi since")
}

// The preferred name wins, because that is what a traveler asked to be called.
func TestThePreferredNameWins(t *testing.T) {
	hn := newHarness(t)
	hn.f.rows("client", map[string]any{
		"first_name": "Jordan", "last_name": "Hayes", "preferred_name": "Jo",
		"email": "jordan.hayes@example.com", "created_at": nil,
	})
	has(t, hn.signedIn().get("/account"), "Jo Hayes", "JH")
}

// THE HUB NEVER LINKS TO A 404. A destination that is not built is drawn plainly
// unavailable, the way the notifications tile is, and becomes a link as its page lands.
func TestEveryTileEitherGoesSomewhereOrSaysItIsNotReady(t *testing.T) {
	hn := newHarness(t)
	body := hn.signedIn().get("/account").Body.String()

	// Notifications is never a link: notification_preference has RLS with no policy and no
	// row-creation path, so 2.5.6 would read zero rows forever.
	if strings.Contains(body, `href="/account/notifications"`) {
		t.Error("the notifications tile links somewhere")
	}
	// Whatever is drawn as a link must be a route this area serves.
	c := hn.signedIn()
	for _, href := range hrefsIn(body, "cl-tile") {
		if strings.HasPrefix(href, "/account/sign-out") {
			continue
		}
		if code := c.get(href).Code; code == 404 {
			t.Errorf("the hub links to %s, which is a 404", href)
		}
	}
}

// hrefsIn lists the href of every anchor carrying class.
func hrefsIn(body, class string) []string {
	var out []string
	for _, chunk := range strings.Split(body, "<a ")[1:] {
		tag := chunk
		if i := strings.Index(tag, ">"); i >= 0 {
			tag = tag[:i]
		}
		if !strings.Contains(tag, class) {
			continue
		}
		const key = `href="`
		if i := strings.Index(tag, key); i >= 0 {
			rest := tag[i+len(key):]
			if j := strings.Index(rest, `"`); j >= 0 {
				out = append(out, rest[:j])
			}
		}
	}
	return out
}
