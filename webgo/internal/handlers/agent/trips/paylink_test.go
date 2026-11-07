package trips

import (
	"strconv"
	"strings"
	"testing"
)

// Ported from web/lib/trips/payLink.test.ts.

func luhnValid(prefix string, length int) string {
	for check := 0; check <= 9; check++ {
		c := prefix + strings.Repeat("0", length-1-len(prefix)) + strconv.Itoa(check)
		if passesLuhn(c) {
			return c
		}
	}
	panic("no luhn digit")
}

func TestPaySiteName(t *testing.T) {
	cases := map[string]string{
		"https://www.sandals.com/pay/SRB-220119":      "sandals.com",
		"https://WWW.RoyalCaribbean.COM/checkout?x=1": "royalcaribbean.com",
		"https://pay.travefy.com/invoice/st-4471":     "pay.travefy.com",
		"https://shop.www.example.com/":               "shop.www.example.com", // only at the start
		"https://wwwsandals.com/":                     "wwwsandals.com",
		"":                                            "",
		"not a url":                                   "",
		"http://sandals.com/pay":                      "",
		"javascript:alert(1)":                         "",
	}
	for in, want := range cases {
		if got := paySiteName(in); got != want {
			t.Errorf("paySiteName(%q) = %q, want %q", in, got, want)
		}
	}
	// A look-alike internationalised host shows in punycode, so it cannot pass as the real one.
	lookAlike := "https://www.s" + string(rune(0x430)) + "ndals.com/pay"
	if got := paySiteName(lookAlike); got == "sandals.com" || !strings.HasPrefix(got, "xn--") || !strings.HasSuffix(got, ".com") {
		t.Errorf("look-alike = %q", got)
	}
}

func TestIsOpenMilestone(t *testing.T) {
	for s, want := range map[string]bool{"scheduled": true, "overdue": true, "paid": false, "waived": false} {
		if isOpenMilestone(s) != want {
			t.Errorf("isOpenMilestone(%q) != %v", s, want)
		}
	}
}

func TestCheckPayURL(t *testing.T) {
	ok := map[string]string{
		"  https://www.sandals.com/pay/SRB-220119  ": "https://www.sandals.com/pay/SRB-220119",
		"https://Sandals.com":                        "https://sandals.com/",
		"":                                           "",
		"   ":                                        "",
	}
	for in, want := range ok {
		got := checkPayURL(in)
		if !got.ok || got.url != want {
			t.Errorf("checkPayURL(%q) = %+v, want ok %q", in, got, want)
		}
	}
	refused := map[string]string{
		"http://sandals.com/pay":                           "https",
		"sandals.com/pay":                                  "https",
		"javascript:alert(1)":                              "https",
		"https://user:pw@sandals.com/":                     "https",
		"https://sandals.com/a b":                          "https",
		"https://203.0.113.9/pay":                          "https",
		"https://[::1]/pay":                                "https",
		"https://intranet/pay":                             "https",
		"https://sandals.com/" + strings.Repeat("a", 2048): "length",
	}
	for in, reason := range refused {
		if got := checkPayURL(in); got.ok || got.reason != reason {
			t.Errorf("checkPayURL(%.40q) = %+v, want refused %q", in, got, reason)
		}
	}
	pan := luhnValid("4", 16)
	if got := checkPayURL("https://sandals.com/pay?card=" + pan); got.ok || got.reason != "card" {
		t.Errorf("card in a link = %+v", got)
	}
	// A long reference that fails Luhn gets through.
	last, _ := strconv.Atoi(pan[len(pan)-1:])
	notLuhn := pan[:len(pan)-1] + strconv.Itoa((last+1)%10)
	if looksLikeCardNumber(notLuhn) || !checkPayURL("https://sandals.com/pay/"+notLuhn).ok {
		t.Errorf("a non-Luhn reference was refused")
	}
}

func TestLooksLikeCardNumber(t *testing.T) {
	pan := luhnValid("4", 16)
	spaced := func(sep string) string {
		var b strings.Builder
		for i, r := range pan {
			if i > 0 && i%4 == 0 {
				b.WriteString(sep)
			}
			b.WriteRune(r)
		}
		return b.String()
	}
	for _, s := range []string{"card " + spaced(" "), "Paid 12 " + pan, "ref" + pan, "x_" + pan + "x", spaced("  ")} {
		if !looksLikeCardNumber(s) {
			t.Errorf("missed a card in %q", s)
		}
	}
	if looksLikeCardNumber("Invoice 2026 10 16 booking 4471") {
		t.Error("a date and a booking number read as a card")
	}
}
