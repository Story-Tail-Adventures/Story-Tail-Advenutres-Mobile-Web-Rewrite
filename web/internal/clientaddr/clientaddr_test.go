package clientaddr

import (
	"net/http"
	"strings"
	"testing"
)

// Ported case for case from web/lib/client-address.test.ts. The precedence is the
// security-relevant part, so it is pinned rather than left to whichever header happens to
// be present in production.
func TestFrom(t *testing.T) {
	long := strings.Repeat("a", 65)
	cases := []struct {
		name    string
		headers map[string]string
		want    string
		ok      bool
	}{
		{
			"prefers cf-connecting-ip over x-forwarded-for",
			map[string]string{"cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.7, 10.0.0.1"},
			"203.0.113.9", true,
		},
		{
			// The case the precedence exists for: behind a proxy that appends, the left-most
			// forwarded entry is whatever the attacker put there.
			"ignores a forged x-forwarded-for when the edge supplied the address",
			map[string]string{"cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9"},
			"203.0.113.9", true,
		},
		{
			"falls back to the left-most forwarded entry",
			map[string]string{"x-forwarded-for": "203.0.113.9, 10.0.0.1"},
			"203.0.113.9", true,
		},
		{
			"trims whitespace around the forwarded entry",
			map[string]string{"x-forwarded-for": "  203.0.113.9 , 10.0.0.1"},
			"203.0.113.9", true,
		},
		{
			"trims whitespace around cf-connecting-ip",
			map[string]string{"cf-connecting-ip": "  203.0.113.9  "},
			"203.0.113.9", true,
		},
		{"nothing with no address headers at all", map[string]string{"user-agent": "x"}, "", false},
		{"nothing for an empty forwarded value", map[string]string{"x-forwarded-for": ""}, "", false},
		{"nothing for a blank cf value", map[string]string{"cf-connecting-ip": "   "}, "", false},
		{"rejects a cf value over 64 characters", map[string]string{"cf-connecting-ip": long}, "", false},
		{"rejects a forwarded value over 64 characters", map[string]string{"x-forwarded-for": long}, "", false},
		{
			// Behind Cloudflare this cannot be reached from outside, and without Cloudflare
			// the header is simply absent, so falling through is the normal path, not a way
			// around the preference.
			"falls through to the forwarded entry when cf-connecting-ip is unusable",
			map[string]string{"cf-connecting-ip": long, "x-forwarded-for": "203.0.113.9"},
			"203.0.113.9", true,
		},
	}
	for _, c := range cases {
		h := http.Header{}
		for k, v := range c.headers {
			h.Set(k, v)
		}
		got, ok := From(h)
		if got != c.want || ok != c.ok {
			t.Errorf("%s: From = (%q, %v), want (%q, %v)", c.name, got, ok, c.want, c.ok)
		}
	}
}
