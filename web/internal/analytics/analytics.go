// Package analytics holds the privacy boundary for Google Analytics, and the whole of it:
// the only thing any provider ever receives from us is a page's URL, so what RedactURL
// strips is what Google never sees. It is the port of web/lib/analytics.ts.
//
// The redaction runs HERE, on the server, rather than in the browser as the Next app did:
// the server already knows the URL it is answering, so the page carries the redacted value
// and the browser module only sends it. That keeps the rule in Go, where its cases are
// tested, and leaves the module small (docs/GO-MIGRATION.md §4.9).
//
// web/content/public/legal/privacy.ts and cookies.ts describe all of this to travelers.
// Change this and they change too.
package analytics

import (
	"net/url"
	"regexp"
	"strings"
)

// ConsentKey is where the browser remembers the visitor's answer. It is localStorage and
// deliberately not a cookie: reading a cookie would make every public page personal, and a
// personal page cannot be cached (§4.7).
const ConsentKey = "sta-analytics-consent"

// recordID matches a UUID, which is what a record id looks like in a path.
var recordID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// RedactURL returns what a provider may be told about this page, and false when it may be
// told nothing at all.
//
// It keeps the path and utm_* parameters. It drops every other query parameter (an address
// typed into the sign-up gate, a client name searched for), the fragment (an implicit-flow
// redirect carries tokens there), and the whole of the agent surface. Record ids in the path
// become [id], so a provider learns which kind of page was opened and never which trip.
func RedactURL(href string) (string, bool) {
	u, err := url.Parse(href)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", false
	}
	if u.Path == "/agent" || strings.HasPrefix(u.Path, "/agent/") {
		return "", false
	}

	kept := url.Values{}
	for key, values := range u.Query() {
		if strings.HasPrefix(key, "utm_") {
			kept[key] = values
		}
	}
	segments := strings.Split(u.Path, "/")
	for i, segment := range segments {
		if recordID.MatchString(segment) {
			segments[i] = "[id]"
		}
	}

	out := *u
	out.Path = strings.Join(segments, "/")
	out.RawPath = ""
	out.RawQuery = kept.Encode()
	out.Fragment = ""
	out.RawFragment = ""
	// Go escapes the brackets in a path; the browser's URL, which wrote these strings in the
	// Next app, leaves them alone. The marker is ours either way, so it is written the way
	// the reports already read it.
	return strings.ReplaceAll(out.String(), "%5Bid%5D", "[id]"), true
}
