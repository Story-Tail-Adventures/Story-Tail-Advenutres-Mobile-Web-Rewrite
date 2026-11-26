package public

import "testing"

// EMAIL_RE is shared with the web and mobile twins, so "what counts as a space" has to be
// JavaScript's answer, not Go's. Go's \s is the five ASCII spaces; JavaScript's also covers
// NBSP, the Unicode space separators, the line and paragraph separators and the BOM. The
// pattern alone let all of those through, so Go accepted addresses the other two rejected.
//
// The runes are written as numbers on purpose: several of these are invisible, and one of
// them is a byte order mark, which a Go source file may not begin a token with.
func TestTheEmailRuleRejectsEveryJavaScriptSpace(t *testing.T) {
	spaces := []rune{
		' ', '\t', '\n', '\v', '\f', '\r',
		0x00a0, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
	}
	for _, space := range spaces {
		if matchesJoinEmail("a" + string(space) + "b@example.co") {
			t.Errorf("accepted an address containing U+%04X", space)
		}
	}
}

// And it still accepts what it always did, so the fix did not tighten the rule generally.
func TestTheEmailRuleStillAcceptsOrdinaryAddresses(t *testing.T) {
	for _, address := range []string{
		"gyasi@story-tail.com", "a+tag@example.co",
		"first.last@sub.example.travel", "x@y.io",
	} {
		if !matchesJoinEmail(address) {
			t.Errorf("rejected %q", address)
		}
	}
	for _, bad := range []string{"", "no-at.example.co", "a@b", "a@b.c", "a@@b.co"} {
		if matchesJoinEmail(bad) {
			t.Errorf("accepted %q", bad)
		}
	}
}
