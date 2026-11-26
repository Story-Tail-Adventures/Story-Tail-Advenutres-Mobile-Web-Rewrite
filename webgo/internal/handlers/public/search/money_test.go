package search

import (
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Ports web/lib/public/money.test.ts.

func usd(cents int64) content.Money { return content.Money{AmountCents: cents, Currency: "USD"} }

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		name  string
		cents int64
		whole bool
		want  string
	}{
		{"formats whole dollars without cents", 329_000, false, "$3,290"},
		{"keeps cents when present", 185_050, false, "$1,850.50"},
		{"rounds to whole dollars when asked", 185_050, true, "$1,851"},
	}
	for _, c := range cases {
		got, err := FormatMoney(usd(c.cents), MoneyOptions{Whole: c.whole})
		if err != nil || got != c.want {
			t.Errorf("%s: FormatMoney(%d, %v) = %q, %v; want %q", c.name, c.cents, c.whole, got, err, c.want)
		}
	}
}

func TestFormatMoneyRejects(t *testing.T) {
	// Non-integer cents cannot be expressed in int64; negative ones can (CLAUDE.md rule 5).
	if _, err := FormatMoney(usd(-1), MoneyOptions{}); err == nil {
		t.Error("FormatMoney(-1) did not fail")
	}
	// The TypeScript's Currency type is "USD" alone.
	if _, err := FormatMoney(content.Money{AmountCents: 100, Currency: "EUR"}, MoneyOptions{}); err == nil {
		t.Error("FormatMoney(EUR) did not fail")
	}
}

func TestBandFromCents(t *testing.T) {
	// Uses 2k and 4k per-person boundaries.
	cases := []struct {
		cents int64
		want  BudgetBand
	}{
		{199_999, BudgetUnder2k},
		{200_000, Budget2kTo4k},
		{399_999, Budget2kTo4k},
		{400_000, Budget4kPlus},
	}
	for _, c := range cases {
		if got := BandFromCents(c.cents); got != c.want {
			t.Errorf("BandFromCents(%d) = %s, want %s", c.cents, got, c.want)
		}
	}
	for _, b := range BudgetBands {
		if BudgetBandLabels[b] == "" {
			t.Errorf("budget band %s has no label", b)
		}
	}
}
