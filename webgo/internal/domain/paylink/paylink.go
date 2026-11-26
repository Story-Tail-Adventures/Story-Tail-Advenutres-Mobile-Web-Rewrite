// Package paylink ports supabase/functions/_shared/payLink.ts: §3.6 pay links and the paid
// record (Data-Model §9.5), server-free so they are tested on their own. The SQL CHECKs on
// payment_milestone refuse all of this again; these answer in English first, so a refused
// save is a 400 with a sentence rather than a 500 off a constraint.
//
// NO CARD NUMBERS, EVER. A pay link, a confirmation number or a note holding a 13 to 19 digit
// run that passes Luhn is REFUSED, not masked: the advisor is typing, so the right answer is
// to say no and say why. public.text_has_card_digits is the SQL twin.
//
// The Deno version leans on `new URL()`. Go's net/url is not the WHATWG parser (no IDNA, no
// backslashes, no dot segments, other escaping), so url.go is a hand port of the WHATWG basic
// URL parser as Deno runs it, and idna.go its host mapping. The one place it cannot match
// exactly is listed in idna.go: a host Deno would accept only by looking at its neighbours
// (right-to-left scripts, combining marks, Hangul jamo, joiners) is refused here instead.
package paylink

import (
	"regexp"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The caps the SQL CHECKs repeat.
const (
	MaxPayURL        = 2048
	MaxPaidReference = 100
	MaxPaidNote      = 1000
)

// HasCardNumber and LuhnValid are re-exported, as payLink.ts re-exports them: the rule lives
// in carddigits, shared with the maskers (Data-Model §18).
func HasCardNumber(text string) bool { return carddigits.HasCardNumber(text) }

// LuhnValid reports whether an all-digit string passes the Luhn check.
func LuhnValid(digits string) bool { return carddigits.LuhnValid(digits) }

var digitsAndDots = regexp.MustCompile(`^[0-9.]+$`)

// IsNamedHost reports a dotted host name: not an IP literal, not `localhost`, not a bare word.
func IsNamedHost(hostname string) bool {
	if strings.HasPrefix(hostname, "[") {
		return false
	}
	if digitsAndDots.MatchString(hostname) {
		return false
	}
	return strings.Contains(hostname, ".") && !strings.HasSuffix(hostname, ".localhost")
}

const cardRefusal = "That looks like a card number. Card numbers never go in the app."

// ReadPayURL reads a pay link as the advisor typed it; nil means remove one (null, undefined
// or blank).
//
// It is parsed as `new URL()` would and stored as its href, so what is saved is what was
// checked: the host comes back lower-cased and in its ASCII (punycode) form, which is what
// the client is shown as the site name. Refused: anything not https:, a user name or
// password, no host, a card number, or more than 2,048 characters.
func ReadPayURL(value js.Value) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest("The pay link must be text.")
	}
	raw := js.Trim(s)
	if raw == "" {
		return nil, nil
	}

	u, ok := parseURL(raw)
	if !ok {
		return nil, problem.BadRequest("That doesn't look like a link. Paste the full address, starting https://")
	}
	if u.scheme != "https" {
		return nil, problem.BadRequest("Pay links must start with https:// so the client's payment is secure.")
	}
	if u.username != "" || u.password != "" {
		return nil, problem.BadRequest("A pay link can't carry a user name or password.")
	}
	hostname := u.hostname()
	if hostname == "" {
		return nil, problem.BadRequest("That link has no site in it.")
	}
	// The host is what the client is shown as the trust signal, so it has to be a real name.
	if !IsNamedHost(hostname) {
		return nil, problem.BadRequest("Use the supplier's web address, not a number or a local address.")
	}

	href := u.href()
	if js.Len(href) > MaxPayURL {
		return nil, problem.BadRequest("That link is too long.")
	}
	if HasCardNumber(href) || HasCardNumber(raw) {
		return nil, problem.BadRequest(cardRefusal)
	}
	return &href, nil
}

// readPaidText is optional free text for Mark Paid. undefined and null mean "not sent" (keep
// what is stored, nil here); a blank string means "clear it" and is passed through as "" for
// the SQL to clear.
func readPaidText(value js.Value, field string, max int) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(field + " must be text.")
	}
	trimmed := js.Trim(s)
	if js.Len(trimmed) > max {
		return nil, problem.BadRequest(field + " is too long.")
	}
	if HasCardNumber(trimmed) {
		return nil, problem.BadRequest(cardRefusal)
	}
	return &trimmed, nil
}

// ReadPaidReference is Mark Paid's confirmation number.
func ReadPaidReference(value js.Value) (*string, error) {
	return readPaidText(value, "Confirmation number", MaxPaidReference)
}

// ReadPaidNote is Mark Paid's note.
func ReadPaidNote(value js.Value) (*string, error) {
	return readPaidText(value, "Note", MaxPaidNote)
}

var isoDay = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ReadPaidOn is Mark Paid's "Date paid", as yyyy-mm-dd, or nil to keep the stored date. A
// real calendar date, and not after tomorrow in UTC: the advisor's own today can run up to a
// day ahead of or behind UTC, and the SQL refuses anything after the advisor's today exactly.
func ReadPaidOn(value js.Value, now time.Time) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, isString := value.Str()
	if isString && s == "" {
		return nil, nil
	}
	if !isString || !isoDay.MatchString(s) {
		return nil, problem.BadRequest("Pick a real date for when this was paid.")
	}
	parsed, ok := js.ParseDate(s + "T00:00:00Z")
	if !ok || js.ISOString(parsed)[:10] != s {
		return nil, problem.BadRequest("Pick a real date for when this was paid.")
	}
	tomorrow := js.ISOString(now.Add(24 * time.Hour))[:10]
	if s > tomorrow {
		return nil, problem.BadRequest("The date paid can't be in the future.")
	}
	return &s, nil
}
