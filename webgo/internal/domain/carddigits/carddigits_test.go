package carddigits

import (
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// Ported from _shared/cardDigits_test.ts, case for case.
//
// Card numbers are BUILT AT RUNTIME: the repo's guard refuses any Luhn-valid literal in
// source, tests included. withCheckDigit appends the digit that makes a body Luhn-valid.
func withCheckDigit(body string) string {
	for d := 0; d <= 9; d++ {
		if LuhnValid(body + strconv.Itoa(d)) {
			return body + strconv.Itoa(d)
		}
	}
	panic("unreachable")
}

const bullets = "\U00002022\U00002022\U00002022\U00002022"

var (
	pan   = withCheckDigit("4" + strings.Repeat("1", 14))
	last4 = pan[len(pan)-4:]
)

// joined puts sep after every group of four digits that has a digit after it.
func joined(sep string) string {
	var b strings.Builder
	for i, c := range pan {
		if i > 0 && i%4 == 0 {
			b.WriteString(sep)
		}
		b.WriteRune(c)
	}
	return b.String()
}

func eq(t *testing.T, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("got  %q\nwant %q", got, want)
	}
}

func TestMaskAShortNumberInFrontCannotHideTheCard(t *testing.T) {
	eq(t, MaskCardNumbers("Paid 12 "+joined(" ")), "Paid 12 "+bullets+" "+last4)
	eq(t, MaskCardNumbers("Paid 12 "+pan), "Paid 12 "+bullets+" "+last4)
}

func TestMaskLettersOrAnUnderscoreTouchingTheDigits(t *testing.T) {
	eq(t, MaskCardNumbers("ref"+pan), "ref"+bullets+" "+last4)
	eq(t, MaskCardNumbers("x_"+pan+"x"), "x_"+bullets+" "+last4+"x")
	eq(t, MaskCardNumbers("card:"+joined("-")+"."), "card:"+bullets+" "+last4+".")
}

func TestMaskDoubleSpacesAndASpacedDash(t *testing.T) {
	eq(t, MaskCardNumbers("a "+joined("  ")+" b"), "a "+bullets+" "+last4+" b")
	eq(t, MaskCardNumbers("a "+joined(" - ")+" b"), "a "+bullets+" "+last4+" b")
	eq(t, MaskCardNumbers("a "+joined("\U00002009")+" b"), "a "+bullets+" "+last4+" b") // thin spaces
}

func TestMaskFullwidthDigitsAreLeftAloneWithoutACrash(t *testing.T) {
	var b strings.Builder
	for _, c := range pan {
		b.WriteRune(0xff10 + (c - '0'))
	}
	wide := b.String()
	eq(t, MaskCardNumbers("card "+wide), "card "+wide)
	if HasCardNumber(wide) {
		t.Error("the guard and the masker agree")
	}
}

func TestMaskShortAndUnrelatedNumbersStay(t *testing.T) {
	plain := "$7,845 due 10/29, call 312-555-0142, conf 8841207, Invoice 2026 10 16 booking 4471"
	eq(t, MaskCardNumbers(plain), plain)
	eq(t, MaskCardNumbers("123456789012"), "123456789012")
	// A long number that fails Luhn is a reference, not a card: the guard lets it through too.
	lastDigit, _ := strconv.Atoi(pan[len(pan)-1:])
	notCard := pan[:len(pan)-1] + strconv.Itoa((lastDigit+1)%10)
	eq(t, MaskCardNumbers("ref "+notCard), "ref "+notCard)
	eq(t, MaskCardNumbers(""), "")
}

func TestMaskTwoCardsInOneMessage(t *testing.T) {
	eq(t, MaskCardNumbers(pan+" or "+joined(" ")+"?"), bullets+" "+last4+" or "+bullets+" "+last4+"?")
}

func TestMaskAndGuardReadTheSameSpans(t *testing.T) {
	for _, text := range []string{"Paid 12 " + pan, "ref" + pan, joined("  "), "Invoice 2026 10 16 booking 4471"} {
		if HasCardNumber(text) != (len(FindCardSpans(text)) > 0) {
			t.Errorf("guard/spans disagree on %q", text)
		}
		if HasCardNumber(text) != (MaskCardNumbers(text) != text) {
			t.Errorf("guard/mask disagree on %q", text)
		}
	}
}

// The pattern must hold exactly the separators the Deno class held, no more.
func TestSeparatorClassIsTheDenoOne(t *testing.T) {
	want := regexp.MustCompile("[0-9]+(?:[ .\U000000A0\U00002009\U0000202F-]{1,3}[0-9]+)*")
	if digitRun.String() != want.String() {
		t.Errorf("digitRun = %s", digitRun)
	}
}
