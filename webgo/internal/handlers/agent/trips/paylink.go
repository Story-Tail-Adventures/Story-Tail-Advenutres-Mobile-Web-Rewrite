package trips

import (
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/net/idna"
)

// Pay links on a payment milestone (Screen-Inventory §3.6, Data-Model §9.5), ported from
// web/lib/trips/payLink.ts. Ruled 2026-10-16: the app never holds a card. A milestone may
// carry one pay_url, the supplier's own payment page or a Travefy invoice; only the advisor
// adds, changes or removes it (through agent-trip, which writes the audit_event), and it is
// rendered only through page.PayURL, which refuses anything but absolute https:// (CLAUDE.md
// rule 4). These checks are the first of three: the Edge Function and the database CHECK
// refuse the same things.

// Data-Model §9.5's limits.
const (
	payURLMax        = 2048
	paidReferenceMax = 100
	paidNoteMax      = 1000
)

// whatwgHost is the host step of the WHATWG URL parser, the one new URL() runs in the browser
// and in the Edge Function: UTS #46 ToASCII, non-transitional, with hyphens and underscores
// allowed and no DNS length check. idna.Lookup applies STD3 rules and refused hosts such as
// pay_portal.supplier.com that Next and the function store.
var whatwgHost = idna.New(idna.MapForLookup(), idna.Transitional(false), idna.BidiRule(), idna.CheckJoiners(true),
	idna.CheckHyphens(false), idna.StrictDomainName(false), idna.VerifyDNSLength(false))

// paySiteName is the site a client sees under the pay button, read from the link itself:
// lower case, a leading www. removed, in its ASCII (punycode) form, so a look-alike host
// (a Cyrillic "а" in sandals) cannot pass as the real one. "" for anything that is not a
// parseable https: link with a host.
func paySiteName(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Hostname() == "" {
		return ""
	}
	host, err := whatwgHost.ToASCII(u.Hostname())
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(host), "www.")
}

// isOpenMilestone: the two statuses the client's pay button appears for.
func isOpenMilestone(status string) bool { return status == "scheduled" || status == "overdue" }

// digitRun is payLink.ts DIGIT_RUN: ASCII digit groups joined by up to three spaces, dots,
// dashes, no-break or thin spaces. Letters and other punctuation end a run but never hide one.
var digitRun = regexp.MustCompile(`[0-9]+(?:[ .\x{00a0}\x{2009}\x{202f}-]{1,3}[0-9]+)*`)

var nonDigits = regexp.MustCompile(`[^0-9]+`)

func passesLuhn(digits string) bool {
	sum, double := 0, false
	for i := len(digits) - 1; i >= 0; i-- {
		d := int(digits[i] - '0')
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return sum%10 == 0
}

// looksLikeCardNumber: a 13 to 19 digit run that also passes Luhn (Data-Model §9.5). The
// Luhn step lets a long supplier reference through when it is not a card number.
func looksLikeCardNumber(text string) bool {
	for _, run := range digitRun.FindAllString(text, -1) {
		groups := nonDigits.Split(run, -1)
		for i := range groups {
			digits := ""
			for j := i; j < len(groups); j++ {
				digits += groups[j]
				if len(digits) > 19 {
					break
				}
				if len(digits) >= 13 && passesLuhn(digits) {
					return true
				}
			}
		}
	}
	return false
}

var ipLiteral = regexp.MustCompile(`^[0-9.]+$`)

// isNamedHost: a dotted host name, not an IP literal, localhost or a bare word.
func isNamedHost(host string) bool {
	if strings.HasPrefix(host, "[") || ipLiteral.MatchString(host) {
		return false
	}
	return strings.Contains(host, ".") && !strings.HasSuffix(host, ".localhost")
}

// payURLCheck is PayUrlCheck: ok with the URL to save ("" means remove the link), or the
// reason it was refused ("https", "length" or "card").
type payURLCheck struct {
	ok     bool
	url    string
	reason string
}

// checkPayURL ports checkPayUrl: https: only, a dotted host, no user part, no spaces, at
// most 2,048 characters, never a card-shaped number. What comes back is the normalised
// link (lower-case punycode host, "/" for an empty path), so what is saved is what was
// checked.
func checkPayURL(raw string) payURLCheck {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return payURLCheck{ok: true}
	}
	if looksLikeCardNumber(trimmed) {
		return payURLCheck{reason: "card"}
	}
	if strings.IndexFunc(trimmed, unicode.IsSpace) >= 0 {
		return payURLCheck{reason: "https"}
	}
	u, err := url.Parse(trimmed)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" || u.User != nil || u.Opaque != "" {
		return payURLCheck{reason: "https"}
	}
	host := u.Hostname()
	ascii, err := whatwgHost.ToASCII(host)
	if err != nil || ascii == "" {
		return payURLCheck{reason: "https"}
	}
	ascii = strings.ToLower(ascii)
	if !isNamedHost(ascii) {
		return payURLCheck{reason: "https"}
	}
	u.Scheme = "https"
	u.Host = ascii
	if p := u.Port(); p != "" && p != "443" {
		u.Host = ascii + ":" + p
	}
	if u.Path == "" && u.RawPath == "" {
		u.Path = "/"
	}
	href := u.String()
	if len(href) > payURLMax {
		return payURLCheck{reason: "length"}
	}
	if looksLikeCardNumber(href) {
		return payURLCheck{reason: "card"}
	}
	return payURLCheck{ok: true, url: href}
}
