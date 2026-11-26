package money

import (
	"strings"
	"unicode"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// §3.7.3 / §3.7.4's form vocabulary, parsing and validation — a port of
// web/lib/agent/commissionForm.ts, with payments.ts's dollarsToCents and tripBuilder.ts's
// supplier grouping, which only these two screens need.
//
// TWO FORMS, KEPT APART AT EVERY LAYER, as the TypeScript keeps them. The LINE form says
// what was booked and what is owed; the PAYMENT form says what arrived. Only the second
// reaches received / disputed, and the SQL, the function, these parsers and the handlers all
// hold that line.
//
// The validation here is so the advisor reads a sentence beside the field. The Edge Function
// and the SQL both check again; nothing here is trusted.

// option is one <option> in a picker.
type option struct{ Value, Label string }

// PAYMENT_TERMS_OPTIONS is not here: both its labels are always drawn, so they live in the
// page files, and copy_test checks copyTermsAfterTravel / copyTermsAtBooking against the
// TypeScript for the two places Go does choose between them.

// createStatusOptions is CREATE_STATUS_OPTIONS: what a NEW line may be. A line has not been
// paid when it is first entered.
var createStatusOptions = []option{
	{"expected", copyFilterExpected},
	{"invoiced", copyFilterInvoiced},
}

// editStatusOptions ports it: a line that is currently received or disputed KEEPS that
// status as an option, so editing its notes cannot move it. Moving TO a paid status is the
// payment form's job.
func editStatusOptions(current string) []option {
	out := []option{
		{"expected", copyFilterExpected},
		{"invoiced", copyFilterInvoiced},
		{"lost", copyFilterLost},
	}
	switch current {
	case "received":
		out = append(out, option{"received", copyFilterReceived})
	case "disputed":
		out = append(out, option{"disputed", copyFilterDisputed})
	}
	return out
}

// ── Parsing ─────────────────────────────────────────────────────────────────────────────

// jsSpace is JavaScript's \s, which is not Go's unicode.IsSpace: \s has no U+0085 and does
// have U+FEFF. The parsers below strip exactly what the TypeScript strips.
func jsSpace(r rune) bool {
	if r == '\u0085' {
		return false
	}
	return unicode.IsSpace(r) || r == '\ufeff'
}

// strip removes every rune in cut, and every JS space, as a /[...\s]/g replace does.
func strip(s string, cut string) string {
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune(cut, r) || jsSpace(r) {
			return -1
		}
		return r
	}, s)
}

// dollarsToCents ports payments.ts: "$6,480.00" is 648000, a BLANK is 0 (not refused here —
// validateLine refuses it, so a forgotten field is not saved as a deliberate $0), and
// anything else is no number at all.
//
// The digits are read as integers rather than through a float: Math.round(Number(s) * 100)
// is right for every input this regexp admits, and 0.07 * 100 is 7.000000000000001, which is
// a cent that only survives because JS rounds it. Cents are the money rule (CLAUDE.md).
//
// AND IT REFUSES WHAT WOULD NOT FIT, which the TypeScript does not have to: a JS number keeps
// growing and the Edge Function then rejects it (readCents checks isSafeInteger and a ten-digit
// ceiling), where an int64 WRAPS. "184467440737095516.16" came out as 0 and saved a $0 line
// that read as a deliberate one, and "92233720368547758.08" came out negative. Sixteen whole
// digits is already past int64, so fifteen is the line; the server's own ceiling is far lower,
// and this is the parser, not the rule.
func dollarsToCents(input string) (Cents, bool) {
	cleaned := strip(input, "$,")
	if cleaned == "" {
		return 0, true
	}
	whole, frac, hasFrac := strings.Cut(cleaned, ".")
	if whole == "" || !allDigits(whole) {
		return 0, false
	}
	if hasFrac && (len(frac) < 1 || len(frac) > 2 || !allDigits(frac)) {
		return 0, false
	}
	// Leading zeros are digits the regexp allows and the value does not have: "007.00" is $7.
	if trimmed := strings.TrimLeft(whole, "0"); len(trimmed) != len(whole) {
		whole = trimmed
		if whole == "" {
			whole = "0"
		}
	}
	if len(whole) > maxWholeDigits {
		return 0, false
	}
	var n Cents
	for _, c := range whole {
		n = n*10 + Cents(c-'0')
	}
	n *= 100
	switch len(frac) {
	case 1:
		n += Cents(frac[0]-'0') * 10
	case 2:
		n += Cents(frac[0]-'0')*10 + Cents(frac[1]-'0')
	}
	return n, true
}

// maxWholeDigits is where an amount stops fitting in cents as an int64: 10^15 cents is
// 10^17, and 10^16 cents is past the 9.22×10^18 ceiling.
const maxWholeDigits = 15

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// parseRate ports it: a percent, 0–100 with at most two decimals, or no number.
func parseRate(input string) (float64, bool) {
	cleaned := strip(input, "%")
	whole, frac, hasFrac := strings.Cut(cleaned, ".")
	if len(whole) < 1 || len(whole) > 3 || !allDigits(whole) {
		return 0, false
	}
	if hasFrac && (len(frac) < 1 || len(frac) > 2 || !allDigits(frac)) {
		return 0, false
	}
	// Through cents and back: 12.5 is 1250 hundredths exactly, where 12.5 parsed as a float
	// and multiplied is not always.
	hundredths := 0
	for _, c := range whole {
		hundredths = hundredths*10 + int(c-'0')
	}
	hundredths *= 100
	switch len(frac) {
	case 1:
		hundredths += int(frac[0]-'0') * 10
	case 2:
		hundredths += int(frac[0]-'0')*10 + int(frac[1]-'0')
	}
	if hundredths > 10000 {
		return 0, false
	}
	return float64(hundredths) / 100, true
}

// parseLagDays ports it: whole days, 0–365.
func parseLagDays(input string) (int, bool) {
	t := strings.TrimSpace(input)
	if len(t) < 1 || len(t) > 3 || !allDigits(t) {
		return 0, false
	}
	n := 0
	for _, c := range t {
		n = n*10 + int(c-'0')
	}
	if n > 365 {
		return 0, false
	}
	return n, true
}

// ── The line form ───────────────────────────────────────────────────────────────────────

// lineValues is LineValues: the fields as typed, never as numbers.
type lineValues struct {
	SupplierID string
	// Gross is dollars, as typed: "6480.00".
	Gross string
	// Rate is a percent, as typed: "12.5".
	Rate         string
	PaymentTerms string
	// PaymentLagDays is whole days, as typed.
	PaymentLagDays        string
	Status                string
	InteletravelReference string
	Notes                 string
}

// form is url.Values or multipart's equivalent: whatever can Get a field.
type form interface{ Get(string) string }

func lineValuesFromForm(f form) lineValues {
	return lineValues{
		SupplierID:            f.Get("supplierId"),
		Gross:                 strings.TrimSpace(f.Get("gross")),
		Rate:                  strings.TrimSpace(f.Get("rate")),
		PaymentTerms:          f.Get("paymentTerms"),
		PaymentLagDays:        strings.TrimSpace(f.Get("paymentLagDays")),
		Status:                f.Get("status"),
		InteletravelReference: strings.TrimSpace(f.Get("inteletravelReference")),
		Notes:                 f.Get("notes"),
	}
}

// fieldErrors are keyed by the form field's own name, so the fill can ask for one by name.
type fieldErrors map[string]string

func (e fieldErrors) any() bool { return len(e) > 0 }

func validateLine(v lineValues) fieldErrors {
	errs := fieldErrors{}
	if v.SupplierID == "" {
		errs["supplierId"] = copySupplierRequired
	}
	// A BLANK gross is refused, not read as $0: dollarsToCents("") is 0, and a forgotten
	// field would otherwise save a $0 line that looks deliberate. A typed 0 is still allowed.
	if cents, ok := dollarsToCents(v.Gross); !ok || strings.TrimSpace(v.Gross) == "" {
		_ = cents
		errs["gross"] = copyGrossInvalid
	}
	if _, ok := parseRate(v.Rate); !ok {
		errs["rate"] = copyRateInvalid
	}
	if _, ok := parseLagDays(v.PaymentLagDays); !ok {
		errs["paymentLagDays"] = copyLagInvalid
	}
	if !errs.any() {
		return nil
	}
	return errs
}

// previewExpectedCents is the read-out beside the Expected field: gross × rate in cents, or
// no figure while either is not a number. A READ-OUT, not a field — the server computes the
// stored figure itself and refuses one that disagrees, so an editable box would be a lie
// about what saving does.
func previewExpectedCents(gross, rate string) (Cents, bool) {
	cents, okC := dollarsToCents(gross)
	pct, okR := parseRate(rate)
	if !okC || !okR {
		return 0, false
	}
	return Cents(jsRound(float64(cents) * pct / 100)), true
}

// ── The payment form ────────────────────────────────────────────────────────────────────

type paymentValues struct {
	Status     string
	Received   string
	Fee        string
	ReceivedAt string
}

func paymentValuesFromForm(f form) paymentValues {
	return paymentValues{
		Status:     strings.TrimSpace(f.Get("status")),
		Received:   strings.TrimSpace(f.Get("received")),
		Fee:        strings.TrimSpace(f.Get("fee")),
		ReceivedAt: strings.TrimSpace(f.Get("receivedAt")),
	}
}

func validatePayment(v paymentValues) fieldErrors {
	errs := fieldErrors{}
	received, okR := dollarsToCents(v.Received)
	switch {
	case strings.TrimSpace(v.Received) == "" || !okR:
		errs["received"] = copyAmountInvalid
	case received == 0 && v.Status != "disputed":
		// Received with nothing received is a Disputed (or Lost) line wearing the wrong status.
		errs["received"] = copyReceivedNeedsAmount
	}
	if _, ok := dollarsToCents(v.Fee); !ok {
		errs["fee"] = copyAmountInvalid
	}
	// Shape only. Whether the date is in the future is the SERVER's call, made in the
	// advisor's zone; a compare against a render-time "today" goes stale past midnight.
	if !isISODate(v.ReceivedAt) {
		errs["receivedAt"] = copyBadDate
	}
	if !errs.any() {
		return nil
	}
	return errs
}

// isISODate is /^\d{4}-\d{2}-\d{2}$/ — the shape, not the calendar.
func isISODate(s string) bool {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return false
	}
	return allDigits(s[0:4]) && allDigits(s[5:7]) && allDigits(s[8:10])
}

// previewGapCents is expected − fee − received, or no figure while either is not a number.
func previewGapCents(expected Cents, received, fee string) (Cents, bool) {
	r, okR := dollarsToCents(received)
	f, okF := dollarsToCents(fee)
	if !okR || !okF {
		return 0, false
	}
	return expected - f - r, true
}

// ── Suppliers ───────────────────────────────────────────────────────────────────────────

// supplierCatalogRow is one row of agent_suppliers — the picker's catalog, not the
// ledger filter's supplierRow (which counts lines on one screen).
type supplierCatalogRow struct {
	SupplierID               string  `json:"supplier_id"`
	Name                     string  `json:"name"`
	Kind                     string  `json:"kind"`
	DefaultCommissionPct     Rate    `json:"default_commission_pct"`
	CommissionPaymentTerms   *string `json:"commission_payment_terms"`
	CommissionPaymentLagDays *int    `json:"commission_payment_lag_days"`
}

// supplierKindLabels is SUPPLIER_KIND_LABELS: supplier_kind's eight values, spelled the way
// an advisor says them. A map rather than a de-underscore helper, because "hotel_brand" is
// "Hotel brands" and an enum value this map does not know should show up as itself rather
// than as a crash.
var supplierKindLabels = map[string]string{
	"airline":       "Airlines",
	"hotel_brand":   "Hotel brands",
	"resort":        "Resorts",
	"cruise_line":   "Cruise lines",
	"tour_operator": "Tour operators",
	"insurance":     "Insurance",
	"transfer":      "Transfers",
	"other":         "Other",
}

func supplierKindLabel(kind string) string {
	if l, ok := supplierKindLabels[kind]; ok {
		return l
	}
	return kind
}

// supplierOption is SupplierOption.
type supplierOption struct {
	SupplierID string
	Name       string
	KindLabel  string
	// DefaultCommissionPct is unset where the supplier has no rate on file, which is not the
	// same as a rate of zero.
	DefaultCommissionPct Rate
	// PaymentTerms is "" where the supplier's terms vary or are not on file.
	PaymentTerms   string
	PaymentLagDays *int
}

type supplierGroup struct {
	KindLabel string
	Suppliers []supplierOption
}

// groupSuppliers ports loadSuppliers' grouping. The accessor already orders by kind then
// name, so one pass keeps THAT order rather than imposing the label map's.
func groupSuppliers(rows []supplierCatalogRow) []supplierGroup {
	var groups []supplierGroup
	for _, row := range rows {
		label := supplierKindLabel(row.Kind)
		at := -1
		for i := range groups {
			if groups[i].KindLabel == label {
				at = i
				break
			}
		}
		if at < 0 {
			groups = append(groups, supplierGroup{KindLabel: label})
			at = len(groups) - 1
		}
		groups[at].Suppliers = append(groups[at].Suppliers, supplierOption{
			SupplierID:           row.SupplierID,
			Name:                 row.Name,
			KindLabel:            label,
			DefaultCommissionPct: row.DefaultCommissionPct,
			PaymentTerms:         str(row.CommissionPaymentTerms),
			PaymentLagDays:       row.CommissionPaymentLagDays,
		})
	}
	return groups
}

// supplierPick is one <option> in the flattened picker.
//
// GROUPED WITHOUT <optgroup>, which this page builder cannot draw: a repeat cannot nest, so
// a group of options inside a group element has nowhere to come from. A disabled option per
// kind is the same shape in one list — it cannot be chosen, it reads as a heading, and the
// scanning benefit the TypeScript argued for survives. (A flat list was the alternative and
// loses it.)
type supplierPick struct {
	Value  string
	Label  string
	Header bool
}

// flattenSuppliers walks the groups in order, a heading before each one's suppliers. A group
// with no suppliers contributes nothing: a heading over nothing is a control that looks broken.
func flattenSuppliers(groups []supplierGroup) []supplierPick {
	var out []supplierPick
	for _, g := range groups {
		if len(g.Suppliers) == 0 {
			continue
		}
		out = append(out, supplierPick{Label: g.KindLabel, Header: true})
		for _, s := range g.Suppliers {
			out = append(out, supplierPick{Value: s.SupplierID, Label: s.Name})
		}
	}
	return out
}

// anySupplier: there is something to pick. An agency with none cannot file a line at all,
// and the form says that rather than offering a submit that will be refused.
func anySupplier(groups []supplierGroup) bool {
	for _, g := range groups {
		if len(g.Suppliers) > 0 {
			return true
		}
	}
	return false
}

// findSupplier looks one up across the groups.
func findSupplier(groups []supplierGroup, id string) (supplierOption, bool) {
	for _, g := range groups {
		for _, s := range g.Suppliers {
			if s.SupplierID == id {
				return s, true
			}
		}
	}
	return supplierOption{}, false
}

// fillSupplierPicker draws the picker and marks the chosen one.
//
// On ADD it also hands the module what each supplier can fill in: that supplier's own usual
// rate and terms, and what THIS trip's bookings with it add up to. The options carry it as
// data attributes, because the CSP allows no inline script to carry anything. form is nil on
// the EDIT page, where changing the supplier changes nothing else: a line's figures are what
// Inteletravel was told, not a supplier default.
func fillSupplierPicker(doc *page.Doc, picks []supplierPick, chosen string, form *addLineForm) {
	doc.Repeat("supplier-pick", len(picks), func(i int, row *page.Row) {
		p := picks[i]
		row.Text("supplier-pick", p.Label)
		row.Attr("supplier-pick", "value", p.Value)
		row.Bool("supplier-pick", "disabled", p.Header)
		row.Bool("supplier-pick", "selected", !p.Header && p.Value == chosen)
		if p.Header || form == nil {
			return
		}
		if s, ok := findSupplier(form.Suppliers, p.Value); ok {
			if s.DefaultCommissionPct.Set {
				row.Attr("supplier-pick", "data-rate", trimZeros(toFixed(s.DefaultCommissionPct.Value, 2)))
			}
			if s.PaymentTerms != "" {
				row.Attr("supplier-pick", "data-terms", s.PaymentTerms)
			}
			if s.PaymentLagDays != nil {
				row.Attr("supplier-pick", "data-lag", itoa(*s.PaymentLagDays))
			}
		}
		if pre, ok := form.Prefill[p.Value]; ok {
			row.Attr("supplier-pick", "data-gross", centsToDollars(pre.GrossCents))
			if pre.Rate.Set {
				row.Attr("supplier-pick", "data-trip-rate", trimZeros(toFixed(pre.Rate.Value, 2)))
			}
		}
	})
}

// ── §3.7.4's prefill ────────────────────────────────────────────────────────────────────

// supplierPrefill is what one supplier's components on a trip add up to.
type supplierPrefill struct {
	GrossCents Cents
	// Rate is set only when EVERY one of that supplier's components carries a rate.
	Rate Rate
}

// componentRow is the part of agent_trip_components this screen reads.
type componentRow struct {
	SupplierID    *string `json:"supplier_id"`
	CostCents     Cents   `json:"cost_cents"`
	CommissionPct Rate    `json:"commission_pct"`
}

// prefillBySupplier ports it. Only components that NAME the supplier count: a trip's package
// components often carry none (Data-Model §10.1), and guessing which supplier an unnamed
// component belongs to would be worse than filling nothing.
func prefillBySupplier(components []componentRow) map[string]supplierPrefill {
	type sum struct {
		gross, rated Cents
		weighted     float64
	}
	sums := map[string]*sum{}
	var order []string
	for _, c := range components {
		if c.SupplierID == nil || *c.SupplierID == "" {
			continue
		}
		s, ok := sums[*c.SupplierID]
		if !ok {
			s = &sum{}
			sums[*c.SupplierID] = s
			order = append(order, *c.SupplierID)
		}
		s.gross += c.CostCents
		if c.CommissionPct.Set {
			s.weighted += float64(c.CostCents) * c.CommissionPct.Value
			s.rated += c.CostCents
		}
	}
	out := make(map[string]supplierPrefill, len(order))
	for _, id := range order {
		s := sums[id]
		p := supplierPrefill{GrossCents: s.gross}
		// Only when every component carries a rate. An average over the rated ones applied
		// to the whole gross would assume the unrated ones earn it too, and overstate Expected.
		if s.rated == s.gross && s.rated > 0 {
			p.Rate = Rate{Value: jsRound(s.weighted/float64(s.rated)*100) / 100, Set: true}
		}
		out[id] = p
	}
	return out
}
