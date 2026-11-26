// Package carddigits ports supabase/functions/_shared/cardDigits.ts: the one rule for
// finding a card number in free text (Data-Model §18, CLAUDE.md rule 1).
//
// The guard (HasCardNumber, used by paylink and lead) REFUSES what it finds; the masker
// (MaskCardNumbers, used by push and email) MASKS it. Both read the same spans, so a number
// the guard would refuse can never reach a lock screen or an inbox in full. Twins: the Deno
// original, web/lib/trips/payLink.ts, SQL public.text_has_card_digits, and maskCardNumbers in
// mobile/shared/.../domain/agent/AgentNotifications.kt.
package carddigits

import "regexp"

// digitRun is ASCII digit groups joined by up to three spaces, dots, dashes, or no-break,
// thin or narrow no-break spaces (U+00A0, U+2009, U+202F): the ways people write a card
// number. Letters, underscores and other punctuation end a run but never hide one. ASCII
// digits only, like the SQL twin, so the two can never disagree.
var (
	digitRun = regexp.MustCompile("[0-9]+(?:[ .\U000000A0\U00002009\U0000202F-]{1,3}[0-9]+)*")
	group    = regexp.MustCompile("[0-9]+")
)

// LuhnValid reports whether an all-digit string passes the Luhn check.
func LuhnValid(digits string) bool {
	total := 0
	double := false
	for i := len(digits) - 1; i >= 0; i-- {
		d := int(digits[i]) - '0'
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		total += d
		double = !double
	}
	return total%10 == 0
}

// Span is a card number found in text: its byte offsets, and its digits with the separators
// taken out. (The Deno version kept UTF-16 offsets; offsets only ever slice the same string,
// so bytes are the Go equivalent.)
type Span struct {
	Start, End int
	Digits     string
}

// FindCardSpans returns every span of whole digit groups in a run that joins to 13 to 19
// digits passing Luhn. Every starting group is tried, so a short number in front ("Paid 12
// 4111...") cannot swallow the card. From each start the longest such span wins (it errs
// toward hiding more), and the search goes on after it, so spans never overlap.
func FindCardSpans(text string) []Span {
	var spans []Span
	for _, run := range digitRun.FindAllStringIndex(text, -1) {
		type g struct {
			start, end int
			digits     string
		}
		var groups []g
		for _, m := range group.FindAllStringIndex(text[run[0]:run[1]], -1) {
			groups = append(groups, g{run[0] + m[0], run[0] + m[1], text[run[0]+m[0] : run[0]+m[1]]})
		}
		for i := 0; i < len(groups); {
			digits := ""
			best := -1
			bestDigits := ""
			for j := i; j < len(groups); j++ {
				digits += groups[j].digits
				if len(digits) > 19 {
					break
				}
				if len(digits) >= 13 && LuhnValid(digits) {
					best = j
					bestDigits = digits
				}
			}
			if best < 0 {
				i++
				continue
			}
			spans = append(spans, Span{Start: groups[i].start, End: groups[best].end, Digits: bestDigits})
			i = best + 1
		}
	}
	return spans
}

// HasCardNumber reports whether the text holds a card number.
func HasCardNumber(text string) bool { return len(FindCardSpans(text)) > 0 }

// MaskCardNumbers replaces each card number with four bullets, a space and its last four
// digits; the rest of the text stays.
func MaskCardNumbers(text string) string {
	out := ""
	at := 0
	for _, s := range FindCardSpans(text) {
		out += text[at:s.Start] + "\U00002022\U00002022\U00002022\U00002022 " + s.Digits[len(s.Digits)-4:]
		at = s.End
	}
	return out + text[at:]
}
