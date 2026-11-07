package edge

import (
	"net/http"
	"net/netip"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/clientaddr"
)

// VisitorAddress is clientaddr.From held to one more rule: the value must BE an IP address
// (no zone), returned in canonical form. Anything else is no address at all.
//
// Why (review of #182, proven): clientaddr passes on any short string a caller puts in
// Cf-Connecting-Ip or X-Forwarded-For. That string became audit_event.ip_address, an inet
// column, so "nope" failed every audit insert AFTER the write it was meant to cover: a client
// update landed with no audit row, and onboarding-connect's attempt limit (which counts audit
// rows) stopped counting. Deno never saw a caller's string there; its address came from
// Supabase's own edge. Every address a ported function reads goes through here.
func VisitorAddress(h http.Header) (string, bool) {
	raw, ok := clientaddr.From(h)
	if !ok {
		return "", false
	}
	ip, err := netip.ParseAddr(raw)
	if err != nil || ip.Zone() != "" {
		return "", false
	}
	return ip.String(), true
}
