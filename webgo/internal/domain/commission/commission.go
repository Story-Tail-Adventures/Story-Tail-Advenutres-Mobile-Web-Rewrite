// Package commission ports supabase/functions/_shared/commission.ts: §3.7's request vocabulary
// and the ledger CSV, the agent-commission route's pure half.
//
// Kept apart from the route for the reason component is: every check here is a case that
// would otherwise reach Postgres and come back as an opaque 500 (a cast error, a CHECK
// violation) or, worse, land in the row.
//
// The SQL functions defend the same rules again (status sets, the 0-100 rate, the 0-365 lag,
// the expected-from-gross arithmetic). This layer exists so the advisor reads a sentence
// instead of a 500; it is not the only fence.
//
// Everything in commission.ts is pure, so everything is ported.
package commission

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/component"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// ReadCents is component.ReadCents, re-exported as commission.ts re-exports readCents.
func ReadCents(value js.Value, field string) (int64, error) { return component.ReadCents(value, field) }

// RequireCents is requireCents: a REQUIRED amount in cents. ReadCents reads absent and blank
// as 0, which is right for an optional fee and wrong for a gross or an amount received: a
// forgotten field saved a $0 line, or marked a line received for nothing (found in review).
func RequireCents(value js.Value, field string) (int64, error) {
	if value.IsNullish() || isEmptyString(value) {
		return 0, problem.BadRequest(field + " is required.")
	}
	return component.ReadCents(value, field)
}

// strictNumber is a number, or a non-blank numeric string. Number(" ") and Number([5]) are
// not answers.
func strictNumber(value js.Value) float64 {
	if n, ok := value.Num(); ok {
		return n
	}
	if s, ok := value.Str(); ok && js.Trim(s) != "" {
		return js.ToNumber(js.Trim(s))
	}
	return math.NaN()
}

// cleanText refuses text Postgres will not accept. A NUL byte or a lone surrogate passes a
// length check and then fails inside Postgres ("\u0000 cannot be converted to text") as a 500.
//
// A lone surrogate is invalid UTF-8 in Go (isWellFormed is utf8.ValidString). One that
// arrives as a JSON escape ("\ud800") never gets here: js.Parse, like encoding/json, already
// turned it into U+FFFD, which Postgres accepts. Deno answered 400 to that body; Go saves
// the replacement character. The difference is in the body parser, not here.
func cleanText(value, field string) (string, error) {
	if strings.ContainsRune(value, 0) || !utf8.ValidString(value) {
		return "", problem.BadRequest(field + ": some characters can't be saved. Remove them and try again.")
	}
	return value, nil
}

// CommissionStatuses are the commission_status values.
var CommissionStatuses = []string{"expected", "invoiced", "received", "disputed", "lost"}

// CreateStatuses: a new line has not been paid; received / disputed arrive through the
// payment op.
var CreateStatuses = []string{"expected", "invoiced"}

// PaymentStatuses are the only two statuses the payment op sets, the ones that carry money and
// a date.
var PaymentStatuses = []string{"received", "disputed"}

// PaymentTerms are the payment_terms values.
var PaymentTerms = []string{"at_booking", "after_travel"}

const (
	maxReference = 64
	maxNotes     = 4000
)

// ReadStatus is readStatus. The Deno default for field was "Status".
func ReadStatus(value js.Value, allowed []string, field string) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(allowed, s) {
		return "", problem.BadRequest(field + " must be one of: " + strings.Join(allowed, ", ") + ".")
	}
	return s, nil
}

// ReadTerms is readTerms.
func ReadTerms(value js.Value) (string, error) {
	return ReadStatus(value, PaymentTerms, "Payment terms")
}

// ReadRate is readRate: 0 to 100 with at most two decimals (numeric(5,2) under a 0-100
// CHECK). Required: a line with no rate has no expected amount, and expected is always
// computed from it.
func ReadRate(value js.Value) (float64, error) {
	if value.IsNullish() || isEmptyString(value) {
		return 0, problem.BadRequest("Commission rate is required.")
	}
	n := strictNumber(value)
	if !js.IsFinite(n) {
		return 0, problem.BadRequest("Commission rate must be a number.")
	}
	if n < 0 || n > 100 {
		return 0, problem.BadRequest("Commission rate must be between 0 and 100.")
	}
	// Rounded, not refused: component makes the same call for a third decimal nobody meant.
	return js.Round(n*100) / 100, nil
}

// ReadLagDays is readLagDays: days after booking or travel the supplier pays, a whole number
// from 0 to 365.
func ReadLagDays(value js.Value) (int64, error) {
	n := strictNumber(value)
	if !js.IsInteger(n) {
		return 0, problem.BadRequest("Payment days must be a whole number.")
	}
	if n < 0 || n > 365 {
		return 0, problem.BadRequest("Payment days must be between 0 and 365.")
	}
	return int64(n), nil
}

// ReadReference is readReference: Inteletravel's own reference for the line. Optional;
// trimmed; blank is none (nil).
func ReadReference(value js.Value) (*string, error) {
	return readOptionalText(value, "Inteletravel reference", "Inteletravel reference must be text.",
		maxReference, "Inteletravel reference is too long.")
}

// ReadNotes is readNotes: optional, trimmed, blank is none (nil).
func ReadNotes(value js.Value) (*string, error) {
	return readOptionalText(value, "Notes", "Notes must be text.", maxNotes, "Notes are too long.")
}

func readOptionalText(value js.Value, field, notText string, max int, tooLong string) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(notText)
	}
	clean, err := cleanText(s, field)
	if err != nil {
		return nil, err
	}
	trimmed := js.Trim(clean)
	if js.Len(trimmed) > max {
		return nil, problem.BadRequest(tooLong)
	}
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}

var isoDateShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ReadDate is readDate: a real calendar date, or a 400. Shaped right is not enough:
// 2026-02-31 would reach Postgres and come back as a 500 for what is a typo.
func ReadDate(value js.Value, field string) (string, error) {
	s, ok := value.Str()
	if !ok || !isoDateShape.MatchString(s) || strings.HasPrefix(s, "0000") {
		return "", problem.BadRequest(field + " must be a date.")
	}
	d, valid := js.ParseDate(s + "T00:00:00Z")
	if !valid || js.ISOString(d)[:10] != s {
		return "", problem.BadRequest(field + " must be a date.")
	}
	return s, nil
}

// ReadID is readId: a uuid-shaped string, or "That is not a <what> id."
func ReadID(value js.Value, what string) (string, error) {
	s, ok := value.Str()
	if !ok || !uuid.IsUUID(s) {
		return "", problem.BadRequest("That is not a " + what + " id.")
	}
	return s, nil
}

func optionalID(value js.Value, what string) (*string, error) {
	if value.IsNullish() || isEmptyString(value) {
		return nil, nil
	}
	id, err := ReadID(value, what)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func optionalDate(value js.Value, field string) (*string, error) {
	if value.IsNullish() || isEmptyString(value) {
		return nil, nil
	}
	d, err := ReadDate(value, field)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// LedgerFilters is the ledger's filters as agent_list_commission's arguments. A nil Status is
// null: all statuses.
type LedgerFilters struct {
	Status     []string `json:"p_status"`
	SupplierID *string  `json:"p_supplier_id"`
	TripID     *string  `json:"p_trip_id"`
	TravelFrom *string  `json:"p_travel_from"`
	TravelTo   *string  `json:"p_travel_to"`
}

// ReadLedgerFilters is readLedgerFilters: the ledger's filters, exactly as the web's
// ledgerQueryFromParams produces them. Checked in the order the Deno object literal
// evaluated them, so the first bad field is the one the 400 names.
func ReadLedgerFilters(value js.Value) (LedgerFilters, error) {
	f := value // (value ?? {}): Get on null, undefined or a non-object answers undefined
	var out LedgerFilters
	if st := f.Get("statuses"); !st.IsNullish() {
		items, ok := st.Array()
		if !ok {
			return LedgerFilters{}, problem.BadRequest("statuses must be a list.")
		}
		read := make([]string, 0, len(items))
		for _, item := range items {
			s, err := ReadStatus(item, CommissionStatuses, "Status")
			if err != nil {
				return LedgerFilters{}, err
			}
			read = append(read, s)
		}
		// [...new Set(...)]: first occurrence wins, order kept.
		for _, s := range read {
			if !slices.Contains(out.Status, s) {
				out.Status = append(out.Status, s)
			}
		}
	}
	var err error
	if out.SupplierID, err = optionalID(f.Get("supplierId"), "supplier"); err != nil {
		return LedgerFilters{}, err
	}
	if out.TripID, err = optionalID(f.Get("tripId"), "trip"); err != nil {
		return LedgerFilters{}, err
	}
	if out.TravelFrom, err = optionalDate(f.Get("travelFrom"), "Travel from"); err != nil {
		return LedgerFilters{}, err
	}
	if out.TravelTo, err = optionalDate(f.Get("travelTo"), "Travel to"); err != nil {
		return LedgerFilters{}, err
	}
	return out, nil
}

// ForecastStages are the four open stages the forecast weights (Data-Model §7.4), in pipeline
// order.
var ForecastStages = []string{"inquiry", "proposal", "booked", "in_progress"}

// StageWeights is one whole-number weight per open stage, fields in FORECAST_STAGES order.
type StageWeights struct {
	Inquiry    int64 `json:"inquiry"`
	Proposal   int64 `json:"proposal"`
	Booked     int64 `json:"booked"`
	InProgress int64 `json:"in_progress"`
}

// ReadWeights is readWeights: exactly the four open stages, each a whole number from 0 to 100.
// A missing stage, an extra one, "50" as text or 50.5 is a 400 here rather than a 500 from the
// SQL fence. The Deno default for what was "Weights".
func ReadWeights(value js.Value, what string) (StageWeights, error) {
	v, ok := value.Object()
	if !ok {
		return StageWeights{}, problem.BadRequest(what + " must be an object.")
	}
	// Object.keys(v).sort().join() against the stages sorted and joined, compared as the
	// joined strings, as the Deno code did. A non-ASCII key can never match the ASCII
	// target, so byte order sorts the same as UTF-16 order wherever the answer can differ.
	keys := slices.Clone(v.Keys())
	slices.Sort(keys)
	stages := slices.Clone(ForecastStages)
	slices.Sort(stages)
	if strings.Join(keys, ",") != strings.Join(stages, ",") {
		// The screen's names, not the enum's: a 4xx detail reaches the form's alert as written.
		return StageWeights{}, problem.BadRequest(what + " must cover Inquiry, Proposal, Booked and Traveling.")
	}
	var w [4]int64
	for i, stage := range ForecastStages {
		n, isNum := v.Get(stage).Num()
		if !isNum || !js.IsInteger(n) || n < 0 || n > 100 {
			return StageWeights{}, problem.BadRequest("Each weight must be a whole number from 0 to 100.")
		}
		w[i] = int64(n)
	}
	return StageWeights{Inquiry: w[0], Proposal: w[1], Booked: w[2], InProgress: w[3]}, nil
}

// MaxCloseLines is the most lines one cancellation closes; agent_cancel_trip refuses more.
const MaxCloseLines = 100

// CloseLine is one line the cancel dialog showed, at the version it showed.
type CloseLine struct {
	ID      string `json:"id"`
	Version int64  `json:"version"`
}

// ReadCloseLines is readCloseLines: the cancel dialog's "Mark these as Lost". Absent (the box
// unchecked) is none, an empty list. A malformed list is a 400 here rather than a 500 off the
// SQL fence, which checks all of this again.
func ReadCloseLines(value js.Value) ([]CloseLine, error) {
	if value.IsNullish() {
		return []CloseLine{}, nil
	}
	items, ok := value.Array()
	if !ok {
		return nil, problem.BadRequest("closeCommission must be a list.")
	}
	if len(items) > MaxCloseLines {
		return nil, problem.BadRequest("That is too many commission lines to close at once.")
	}
	seen := map[string]bool{}
	out := make([]CloseLine, 0, len(items))
	for _, e := range items {
		// (entry && typeof entry === "object" ? entry : {}): Get on anything that is not an
		// object answers undefined, as reading a property of {} would.
		id, isString := e.Get("id").Str()
		if !isString || !uuid.IsUUID(id) {
			return nil, problem.BadRequest("That is not a commission line id.")
		}
		version, isNum := e.Get("version").Num()
		if !isNum || !js.IsInteger(version) || version < 1 || version > 2147483647 {
			return nil, problem.BadRequest("Each commission line needs the version the dialog showed.")
		}
		key := js.ToLower(id)
		if seen[key] {
			return nil, problem.BadRequest("A commission line is named twice.")
		}
		seen[key] = true
		out = append(out, CloseLine{ID: id, Version: int64(version)})
	}
	return out, nil
}

// ExportRow is one row of agent_export_commission. Money is a digit-string, as it crosses
// PostgREST.
type ExportRow struct {
	TripTitle               string       `json:"trip_title"`
	ClientDisplayName       string       `json:"client_display_name"`
	SupplierName            string       `json:"supplier_name"`
	TravelStart             *string      `json:"travel_start"`
	TravelEnd               *string      `json:"travel_end"`
	Status                  string       `json:"status"`
	GrossBookingCents       string       `json:"gross_booking_cents"`
	CommissionPct           NumberOrText `json:"commission_pct"`
	ExpectedCommissionCents string       `json:"expected_commission_cents"`
	ProcessingFeeCents      string       `json:"processing_fee_cents"`
	ReceivedCommissionCents string       `json:"received_commission_cents"`
	ReceivedAt              *string      `json:"received_at"`
	PaymentTerms            string       `json:"payment_terms"`
	PaymentLagDays          int64        `json:"payment_lag_days"`
	InteletravelReference   *string      `json:"inteletravel_reference"`
	Currency                string       `json:"currency"`
}

// NumberOrText is a row field typed `number | string` in the Deno code (commission_pct:
// PostgREST sends numeric as a JSON number). It keeps which one arrived, because String(12.50)
// is "12.5" while the text "12.50" stays "12.50". The zero value is null, an empty cell.
//
// It decodes null, a number or a string. Any other JSON kind is a decode error where Deno
// would have written String(value) into the cell; the column is numeric, so none can arrive.
type NumberOrText struct {
	kind uint8 // 0 null, 1 number, 2 text
	num  float64
	text string
}

// NumberValue is a numeric cell value.
func NumberValue(f float64) NumberOrText { return NumberOrText{kind: 1, num: f} }

// TextValue is a text cell value.
func TextValue(s string) NumberOrText { return NumberOrText{kind: 2, text: s} }

// IsNull reports the null value.
func (v NumberOrText) IsNull() bool { return v.kind == 0 }

// String is String(value) for a number or a string; "" for null.
func (v NumberOrText) String() string {
	switch v.kind {
	case 1:
		return js.NumberString(v.num)
	case 2:
		return v.text
	}
	return ""
}

// UnmarshalJSON implements json.Unmarshaler.
func (v *NumberOrText) UnmarshalJSON(b []byte) error {
	val, err := js.Parse(b)
	if err != nil {
		return err
	}
	if n, ok := val.Num(); ok {
		*v = NumberValue(n)
		return nil
	}
	if s, ok := val.Str(); ok {
		*v = TextValue(s)
		return nil
	}
	if val.IsNull() {
		*v = NumberOrText{}
		return nil
	}
	return fmt.Errorf("commission: want a number or text, got %s", val.TypeOf())
}

// MarshalJSON implements json.Marshaler.
func (v NumberOrText) MarshalJSON() ([]byte, error) {
	switch v.kind {
	case 1:
		return js.Marshal(js.Num(v.num))
	case 2:
		return js.Marshal(v.text)
	}
	return []byte("null"), nil
}

var header = []string{
	"Trip",
	"Client",
	"Supplier",
	"Travel start",
	"Travel end",
	"Status",
	"Gross",
	"Rate %",
	"Expected",
	"Fee",
	"Received",
	"Received on",
	"Payment terms",
	"Payment days",
	"Inteletravel reference",
	"Currency",
}

var centsDigits = regexp.MustCompile(`^-?\d+$`)

// CentsToDecimal is centsToDecimal: cents as an exact decimal string, "1234.56", never a
// float. The screens show whole dollars; an export is data for the books and keeps every
// cent. Done on the digit-string, so no value passes through a float. A value that is not a
// digit-string is a plain error (a 500): the file must not be written.
func CentsToDecimal(cents string) (string, error) {
	raw := js.Trim(cents)
	if !centsDigits.MatchString(raw) {
		return "", errors.New("not a cents value: " + raw)
	}
	negative := strings.HasPrefix(raw, "-")
	digits := raw
	if negative {
		digits = raw[1:]
	}
	digits = js.PadStart(digits, 3, "0")
	// The Deno code strips leading zeros with /^0+(?=\d)/: every leading zero that has a
	// digit after it, so an all-zero run keeps its last digit. RE2 has no lookahead.
	whole := digits[:len(digits)-2]
	for len(whole) > 1 && whole[0] == '0' {
		whole = whole[1:]
	}
	sign := ""
	if negative {
		sign = "-"
	}
	return sign + whole + "." + digits[len(digits)-2:], nil
}

// CSVCell is csvCell for a value that is there (String(value) for a number). text is the
// Deno parameter of the same name, which defaulted to true. Two jobs:
//
//  1. RFC 4180 quoting: commas, quotes and line breaks are wrapped and doubled.
//  2. FORMULA INJECTION. A trip title or a client name is typed by a person, and a cell that
//     starts with =, +, -, @, a tab or a carriage return is a formula to Excel and Sheets.
//     "=HYPERLINK(...)" in a client's surname would run on the advisor's machine the moment
//     the file opened. Such a cell gets an apostrophe in front, which spreadsheets read as
//     "this is text". Text cells only: a negative number is a number.
func CSVCell(s string, text bool) string {
	if text && s != "" && strings.IndexByte("=+-@\t\r", s[0]) >= 0 {
		s = "'" + s
	}
	if strings.ContainsAny(s, "\",\r\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

// CSVCellOpt is csvCell for a value that may be null or undefined (nil): the empty cell.
func CSVCellOpt(s *string, text bool) string {
	if s == nil {
		return ""
	}
	return CSVCell(*s, text)
}

// termsLabel files the two terms in words. A third enum value must not be filed silently as
// "After travel".
func termsLabel(terms string) (string, error) {
	switch terms {
	case "at_booking":
		return "At booking", nil
	case "after_travel":
		return "After travel", nil
	}
	return "", errors.New("unknown payment terms in export: " + terms)
}

// ToCSV is toCsv: the ledger export. CRLF line ends per RFC 4180, and a trailing one so the
// last row is a complete line.
func ToCSV(rows []ExportRow) (string, error) {
	cells := make([]string, len(header))
	for i, h := range header {
		cells[i] = CSVCell(h, true)
	}
	lines := []string{strings.Join(cells, ",")}

	for _, r := range rows {
		gross, err := CentsToDecimal(r.GrossBookingCents)
		if err != nil {
			return "", err
		}
		expected, err := CentsToDecimal(r.ExpectedCommissionCents)
		if err != nil {
			return "", err
		}
		fee, err := CentsToDecimal(r.ProcessingFeeCents)
		if err != nil {
			return "", err
		}
		received, err := CentsToDecimal(r.ReceivedCommissionCents)
		if err != nil {
			return "", err
		}
		terms, err := termsLabel(r.PaymentTerms)
		if err != nil {
			return "", err
		}
		pctCell := ""
		if !r.CommissionPct.IsNull() {
			pctCell = CSVCell(r.CommissionPct.String(), false)
		}
		lines = append(lines, strings.Join([]string{
			CSVCell(r.TripTitle, true),
			CSVCell(r.ClientDisplayName, true),
			CSVCell(r.SupplierName, true),
			CSVCellOpt(r.TravelStart, false),
			CSVCellOpt(r.TravelEnd, false),
			CSVCell(r.Status, true),
			CSVCell(gross, false),
			pctCell,
			CSVCell(expected, false),
			CSVCell(fee, false),
			CSVCell(received, false),
			CSVCellOpt(r.ReceivedAt, false),
			CSVCell(terms, true),
			CSVCell(strconv.FormatInt(r.PaymentLagDays, 10), false),
			CSVCellOpt(r.InteletravelReference, true),
			CSVCell(r.Currency, true),
		}, ","))
	}
	return strings.Join(lines, "\r\n") + "\r\n", nil
}

func isEmptyString(v js.Value) bool {
	s, ok := v.Str()
	return ok && s == ""
}
