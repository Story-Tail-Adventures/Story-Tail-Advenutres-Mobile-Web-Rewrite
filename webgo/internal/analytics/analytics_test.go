package analytics

import "testing"

// Every case here is web/lib/analytics.test.ts's, unchanged: this is the same contract
// web/content/public/legal/privacy.ts describes to travelers.
const origin = "https://storytailadventures.vercel.app"

func TestRedactURL(t *testing.T) {
	cases := []struct {
		name, in, want string
		ok             bool
	}{
		{"passes a plain public page through unchanged",
			origin + "/how-it-works", origin + "/how-it-works", true},
		{"keeps utm_* and drops every other query param and the hash",
			origin + "/explore/results?mode=hotels&destination=Lisbon&utm_campaign=fall&utm_source=ig#top",
			origin + "/explore/results?utm_campaign=fall&utm_source=ig", true},
		{"leaves no bare ? when nothing survives",
			origin + "/trips?status=upcoming", origin + "/trips", true},
		{"drops the agent surface", origin + "/agent", "", false},
		{"drops the agent client-name search", origin + "/agent/clients?q=Smith", "", false},
		{"drops an agent trip", origin + "/agent/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", "", false},
		{"only treats /agent as a whole segment",
			origin + "/agentic", origin + "/agentic", true},
		{"replaces record ids in the path with [id]",
			origin + "/trips/0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", origin + "/trips/[id]", true},
		{"replaces an upper-case id and keeps the rest of the path",
			origin + "/trips/0199A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B/update?x=1", origin + "/trips/[id]/update", true},
		{"leaves slugs that are not ids alone",
			origin + "/legal/cookies", origin + "/legal/cookies", true},
		{"strips an email out of the query",
			origin + "/join?email=a%40b.co", origin + "/join", true},
		{"strips the hash even when the query survives",
			origin + "/dashboard?utm_source=ig#access_token=secret", origin + "/dashboard?utm_source=ig", true},
		{"drops a URL that will not parse", "not a url", "", false},
	}
	for _, c := range cases {
		got, ok := RedactURL(c.in)
		if ok != c.ok {
			t.Errorf("%s: RedactURL(%q) ok = %v, want %v", c.name, c.in, ok, c.ok)
			continue
		}
		if got != c.want {
			t.Errorf("%s: RedactURL(%q)\n got  %q\n want %q", c.name, c.in, got, c.want)
		}
	}
}

// Nothing a visitor typed may travel, whatever the parameter is called.
func TestRedactURLKeepsNothingButUTM(t *testing.T) {
	in := origin + "/explore/results?dest=Nassau&email=a%40b.co&q=Smith&in=2026-12-01&utm_source=ig"
	got, ok := RedactURL(in)
	if !ok {
		t.Fatal("a results URL was dropped entirely")
	}
	for _, leaked := range []string{"Nassau", "a%40b.co", "a@b.co", "Smith", "2026-12-01"} {
		if contains(got, leaked) {
			t.Errorf("RedactURL kept %q: %s", leaked, got)
		}
	}
	if !contains(got, "utm_source=ig") {
		t.Errorf("RedactURL dropped the campaign: %s", got)
	}
}

func contains(haystack, needle string) bool {
	return len(needle) > 0 && len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0
}

func indexOf(haystack, needle string) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return i
		}
	}
	return -1
}
