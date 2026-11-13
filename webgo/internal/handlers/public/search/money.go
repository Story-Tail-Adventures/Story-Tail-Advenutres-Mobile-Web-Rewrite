package search

import (
	"fmt"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// Money on the public surface is display only, but it still follows CLAUDE.md rule 5:
// integer cents plus a currency code, formatted at the edge. Ports web/lib/public/money.ts.

// BudgetBand is the filter rail's "Budget" (2.0.4), per person.
type BudgetBand string

// The budget bands, cheapest first.
const (
	BudgetUnder2k BudgetBand = "under-2k"
	Budget2kTo4k  BudgetBand = "2k-4k"
	Budget4kPlus  BudgetBand = "4k-plus"
)

// BudgetBandMaxCents is each band's upper bound per person, in cents. 4k-plus has none.
var BudgetBandMaxCents = map[BudgetBand]int64{
	BudgetUnder2k: 200_000,
	Budget2kTo4k:  400_000,
}

// BudgetBandLabels are the rail's labels for the bands.
var BudgetBandLabels = map[BudgetBand]string{
	BudgetUnder2k: "Under $2k pp",
	Budget2kTo4k:  "$2–4k pp",
	Budget4kPlus:  "$4k+ pp",
}

// BandFromCents is the budget band a per-person price falls in.
func BandFromCents(amountCents int64) BudgetBand {
	if amountCents < BudgetBandMaxCents[BudgetUnder2k] {
		return BudgetUnder2k
	}
	if amountCents < BudgetBandMaxCents[Budget2kTo4k] {
		return Budget2kTo4k
	}
	return Budget4kPlus
}

// MoneyOptions are FormatMoney's options.
type MoneyOptions struct {
	// Whole rounds to the dollar (half away from zero) even when there are cents.
	Whole bool
}

// FormatMoney writes an amount the way Intl.NumberFormat("en-US", {style: "currency"})
// does: "$3,290", "$1,850.50", or "$1,851" with Whole. Cents show only when there are some.
//
// Negative cents are an error, as they were a throw. So is any currency but USD: the
// TypeScript's Currency type is "USD" alone, so nothing else could reach it there.
func FormatMoney(m content.Money, opts MoneyOptions) (string, error) {
	if m.AmountCents < 0 {
		return "", fmt.Errorf("formatMoney: amountCents must be a non-negative integer, got %d", m.AmountCents)
	}
	if m.Currency != "USD" {
		return "", fmt.Errorf("formatMoney: unsupported currency %q", m.Currency)
	}
	cents := m.AmountCents % 100
	if opts.Whole || cents == 0 {
		dollars := m.AmountCents / 100
		if cents >= 50 {
			dollars++ // half away from zero, as Intl rounds
		}
		return "$" + groupThousands(dollars), nil
	}
	return "$" + groupThousands(m.AmountCents/100) + "." + padStart(strconv.FormatInt(cents, 10), 2), nil
}

// groupThousands writes n with a comma between each group of three digits.
func groupThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	if len(s) <= 3 {
		return s
	}
	out := make([]byte, 0, len(s)+len(s)/3)
	lead := len(s) % 3
	if lead == 0 {
		lead = 3
	}
	out = append(out, s[:lead]...)
	for i := lead; i < len(s); i += 3 {
		out = append(out, ',')
		out = append(out, s[i:i+3]...)
	}
	return string(out)
}
