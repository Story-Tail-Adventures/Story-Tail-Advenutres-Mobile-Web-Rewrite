// Package clientaddr finds the visitor's IP address, in one place. It ports
// web/lib/client-address.ts exactly.
//
// Two things depend on it and they must not drift: the address GoTrue records for the
// advisor's Login activity (informational), and the lead form's rate limit (security). The
// lead path matters most: while lead-message is still an Edge Function, the web server
// forwards this address with a key the function trusts, so a forgeable address is a
// forgeable rate-limit bucket.
//
// cf-connecting-ip comes first because Cloudflare sets it from the connection it terminated
// and strips any copy the client sent, so it cannot be forged from outside. The left-most
// x-forwarded-for entry is only a fallback, and only as trustworthy as the proxy in front:
// a proxy that APPENDS leaves the left-most entry attacker-chosen. Run the forged-header
// test in docs/RENDER-MIGRATION.md §5.1 before real traffic, and keep Cloudflare in front.
package clientaddr

import (
	"net/http"
	"strings"
)

// maxLen bounds the value: the column it lands in is bounded, and anything longer is not
// an address worth passing on.
const maxLen = 64

// From returns the visitor's address as the infrastructure in front of us saw it, and
// false when no header carries a usable one.
func From(h http.Header) (string, bool) {
	if addr, ok := bounded(h.Get("Cf-Connecting-Ip")); ok {
		return addr, true
	}
	first, _, _ := strings.Cut(h.Get("X-Forwarded-For"), ",")
	return bounded(first)
}

func bounded(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || len(trimmed) > maxLen {
		return "", false
	}
	return trimmed, true
}
