package page

import (
	"net/url"
	"strings"
)

// SafeURL decides whether raw may go into an href, src, action or formaction. It returns
// the trimmed value and true when it may.
//
// Escaping an attribute does not stop javascript: in an href, so this is an allowlist:
// relative references (paths, ?query, #fragment), https: with a host, mailto: and tel:.
// Everything else is refused, including http:, data:, javascript: in any letter case, and
// scheme-relative //host links that would leave the site.
//
// Control characters and backslashes are refused outright rather than cleaned: browsers
// drop tabs and newlines inside a URL ("java\tscript:" runs as javascript:) and read a
// backslash as a slash ("/\evil.com" leaves the site). A value carrying either was not typed
// by a person.
func SafeURL(raw string) (string, bool) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", false
	}
	for i := 0; i < len(v); i++ {
		if c := v[i]; c < 0x20 || c == 0x7f || c == '\\' {
			return "", false
		}
	}
	u, err := url.Parse(v) // lower-cases the scheme
	if err != nil {
		return "", false
	}
	switch u.Scheme {
	case "":
		if u.Host != "" || strings.HasPrefix(v, "//") {
			return "", false
		}
		return v, true
	case "https":
		// A user part (https://good.example@evil.example) is a classic phishing disguise.
		if u.Host == "" || u.User != nil {
			return "", false
		}
		return v, true
	case "mailto", "tel":
		if u.Opaque == "" {
			return "", false
		}
		return v, true
	}
	return "", false
}

// SafePayURL is the stricter rule for a payment milestone's pay link (CLAUDE.md rule 4):
// absolute https:// with a host, nothing else. A swapped or downgraded link could send a
// client's money to the wrong place.
func SafePayURL(raw string) (string, bool) {
	v, ok := SafeURL(raw)
	if !ok {
		return "", false
	}
	if u, err := url.Parse(v); err != nil || u.Scheme != "https" {
		return "", false
	}
	return v, true
}
