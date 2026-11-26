package client

import "testing"

// The advisor card is the one place a database row decides what a traveler's browser loads
// and where a link sends them, so these are the two checks worth having.

func TestAnAvatarPathOnlyEverResolvesOnTheSupabaseOrigin(t *testing.T) {
	const origin = "https://abc.supabase.co"
	const good = "/storage/v1/object/public/agent-avatars/gyasi.jpg"
	if got := AvatarSrc(good, origin); got != origin+good {
		t.Errorf("= %q", got)
	}
	for _, bad := range []string{
		"",
		// An absolute URL written into the column would point a traveler's browser at
		// another host. agent.avatar_url holds a PATH (Data-Model §7.1); anything else is
		// not an avatar.
		"https://evil.example/portrait.jpg",
		"//evil.example/portrait.jpg",
		"/storage/v1/object/public/other-bucket/x.jpg",
		"/etc/passwd",
		"javascript:alert(1)",
	} {
		if got := AvatarSrc(bad, origin); got != "" {
			t.Errorf("AvatarSrc(%q) = %q, want nothing — initials beat a stranger's host", bad, got)
		}
	}
	// With no configured origin there is nowhere safe to put it.
	if got := AvatarSrc(good, ""); got != "" {
		t.Errorf("with no origin = %q", got)
	}
}

func TestACardOnlyCarriesHttpsLinks(t *testing.T) {
	card := toAdvisorCard(advisorCardRow{
		SocialLinks: map[string]string{
			"instagram": "https://instagram.com/storytail",
			"facebook":  "http://facebook.com/storytail",
			"linkedin":  "javascript:alert(1)",
			"website":   "https://story-tail.com",
			"tiktok":    "https://tiktok.com/@storytail",
		},
	}, "https://abc.supabase.co")

	if len(card.Links) != 2 {
		t.Fatalf("links = %+v", card.Links)
	}
	// In the order the card draws them, and only the keys it knows.
	if card.Links[0].Label != "Instagram" || card.Links[1].Label != "Website" {
		t.Errorf("links = %+v", card.Links)
	}
}

func TestTheCardFallsBackRatherThanRenderingNothing(t *testing.T) {
	card := toAdvisorCard(advisorCardRow{}, "")
	if card.DisplayName != "Your advisor" || card.FirstName != "Your" {
		t.Errorf("name = %q / %q", card.DisplayName, card.FirstName)
	}
	// "Your advisor" is two words, so the first and last initial are Y and A.
	if card.Initials != "YA" {
		t.Errorf("initials = %q", card.Initials)
	}
	if card.ReplyLabel != "Usually replies within a day" {
		t.Errorf("reply = %q", card.ReplyLabel)
	}
}

func TestTheReplyAndAwayPromises(t *testing.T) {
	hours := func(n int) *int { return &n }
	for _, tc := range []struct {
		in   *int
		want string
	}{
		{hours(2), "Usually replies within 2 hours"},
		{hours(4), "Usually replies within 4 hours"},
		{hours(12), "Usually replies within 12 hours"},
		// A day and two days read better than 24 and 48 hours (Q13).
		{hours(48), "Usually replies within 2 days"},
		{hours(24), "Usually replies within a day"},
		{hours(99), "Usually replies within a day"},
		{nil, "Usually replies within a day"},
	} {
		if got := ReplyLabel(tc.in); got != tc.want {
			t.Errorf("ReplyLabel(%v) = %q", tc.in, got)
		}
	}

	// A DATE and not an instant, so it is read in UTC and never shifts a day.
	if got := AwayLabel("2026-10-20"); got != "Away until Tuesday, October 20" {
		t.Errorf("= %q", got)
	}
	for _, bad := range []string{"", "tomorrow", "2026-10-20T00:00:00Z", "20/10/2026"} {
		if got := AwayLabel(bad); got != "" {
			t.Errorf("AwayLabel(%q) = %q", bad, got)
		}
	}
}
