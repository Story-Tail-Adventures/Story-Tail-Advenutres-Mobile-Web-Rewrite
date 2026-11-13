// Package statement ports supabase/functions/_shared/statement.ts: reading an Inteletravel
// statement. The bytes, the CSV, the column guesses, and each row's amounts and dates: the
// commission-import route's pure half. Everything here is a case that would otherwise reach
// Postgres as a cast error, or worse, land as the wrong number.
//
// NO PARSING LIBRARY. CSV only (Gyasi, 2026-10-11), and RFC 4180 is small enough to read by
// hand: a new dependency on the path money takes would need a security review first. Go's
// encoding/csv is not used either, because it differs from the Deno parser on bare quotes,
// lone CRs and line counting.
//
// WHAT IS STILL A GUESS. No real Inteletravel statement has been seen yet. The header hints
// below are common names, not Inteletravel's; the mapping screen shows every guess and the
// advisor confirms it, and the map is remembered for next month by header NAME. When a real
// file arrives, its headers belong at the front of these lists.
//
// Where Go cannot hold what JavaScript held: a lone UTF-16 surrogate. JSON input carrying one
// reaches Go as U+FFFD, and a cut through an emoji (.slice) leaves U+FFFD where Deno left
// half a pair. So readFilename's isWellFormed check cannot fire here, and a quoted cell or a
// file name cut mid-emoji carries U+FFFD (in Deno that half pair made Postgres refuse the
// row with a 500).
package statement

import (
	"encoding/base64"
	"encoding/hex"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The caps.
const (
	// MaxFileBytes is 512 KiB: thousands of rows for one advisor, and under the web's 1 MB
	// action body cap.
	MaxFileBytes = 512 * 1024
	// MaxRows matches commission_import_rows_range, and PostgREST's max_rows, which the rows
	// read relies on.
	MaxRows    = 1000
	MaxColumns = 60
	// MaxAmountCents is $99,999,999.99, hand entry's cap: a wrongly mapped column is not $90
	// trillion.
	MaxAmountCents = 9_999_999_999

	maxCell = 1000
	// maxReference is the ledger's own reference cap, so a matched line's edit form takes it.
	maxReference = 64
	maxName      = 200
)

// clip is the first n characters by CODE POINT: slicing UTF-16 units can cut an emoji in
// half, and a lone surrogate reached Postgres as a 500 (found in review).
func clip(value string, n int) string {
	i := 0
	for pos := range value {
		if i == n {
			return value[:pos]
		}
		i++
	}
	return value
}

// StatementFields are the fields a column can be mapped to.
var StatementFields = []string{"reference", "supplier", "traveler", "gross", "received", "fee", "paid_on"}

// ColumnMap is Partial<Record<StatementField, number>>: field to column index. It keeps its
// keys in the order they were set, because the Deno object did and JSON.stringify wrote them
// in that order.
type ColumnMap struct {
	fields  []string
	indexes []int
}

// Get returns a field's column.
func (m ColumnMap) Get(field string) (int, bool) {
	if i := slices.Index(m.fields, field); i >= 0 {
		return m.indexes[i], true
	}
	return 0, false
}

// Set maps a field to a column; a field already set keeps its place.
func (m *ColumnMap) Set(field string, index int) {
	if i := slices.Index(m.fields, field); i >= 0 {
		m.indexes[i] = index
		return
	}
	m.fields = append(m.fields, field)
	m.indexes = append(m.indexes, index)
}

// AsMap is the map without its order, for comparisons.
func (m ColumnMap) AsMap() map[string]int {
	out := make(map[string]int, len(m.fields))
	for i, f := range m.fields {
		out[f] = m.indexes[i]
	}
	return out
}

// MarshalJSON writes the fields in the order they were set.
func (m ColumnMap) MarshalJSON() ([]byte, error) {
	o := js.O()
	for i, f := range m.fields {
		o = append(o, js.Field{Key: f, Value: m.indexes[i]})
	}
	return o.MarshalJSON()
}

// ─── Bytes → text → rows ───

// windows1252High is how the WHATWG windows-1252 decoder reads 0x80 to 0x9F; every other
// byte is the code point of the same number.
var windows1252High = [32]rune{
	0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F,
	0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
	0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178,
}

// DecodeStatement reads the file as text. UTF-8 first; anything that is not valid UTF-8 is
// read as Windows-1252, which is what Excel on Windows writes when it saves "CSV", so "Peña"
// survives either way. An Excel workbook (a zip: "PK\3\4") is named for what it is, so the
// advisor knows to save it as CSV, rather than parsed into noise.
func DecodeStatement(b []byte) (string, error) {
	if len(b) >= 4 && b[0] == 0x50 && b[1] == 0x4b && b[2] == 3 && b[3] == 4 {
		return "", problem.BadRequest("That's an Excel file. Save it as CSV (File, Save As, CSV) and upload that.")
	}
	var text string
	if utf8.Valid(b) {
		// A fatal UTF-8 TextDecoder: valid input only, and one leading byte-order mark dropped.
		text = strings.TrimPrefix(string(b), "\U0000FEFF")
	} else {
		var sb strings.Builder
		for _, c := range b {
			if c >= 0x80 && c <= 0x9f {
				sb.WriteRune(windows1252High[c-0x80])
			} else {
				sb.WriteRune(rune(c))
			}
		}
		text = sb.String()
	}
	if strings.ContainsRune(text, 0) {
		return "", problem.BadRequest("That file doesn't look like a CSV. Download the statement as CSV and try again.")
	}
	return text, nil
}

// ParseCSV is RFC 4180: commas between cells; a cell in double quotes may hold commas, line
// breaks and doubled quotes; rows end in CRLF, LF or CR. A quote that is not at the start of
// a cell is kept as text, as spreadsheets do. A quoted cell that never closes is an error
// with its line. (It walks bytes where the Deno version walked UTF-16 units: every byte it
// looks for is ASCII, and no byte of a multi-byte character is.)
func ParseCSV(text string) ([][]string, error) {
	rows := [][]string{}
	row := []string{}
	var cell strings.Builder
	inQuotes := false
	quoteLine, line := 0, 1

	for i := 0; i < len(text); {
		ch := text[i]
		if inQuotes {
			if ch == '"' {
				if i+1 < len(text) && text[i+1] == '"' {
					cell.WriteByte('"')
					i += 2
					continue
				}
				inQuotes = false
				i++
				continue
			}
			if ch == '\n' {
				line++
			}
			cell.WriteByte(ch)
			i++
			continue
		}
		if ch == '"' && cell.Len() == 0 {
			inQuotes = true
			quoteLine = line
			i++
			continue
		}
		if ch == ',' {
			row = append(row, cell.String())
			cell.Reset()
			i++
			continue
		}
		if ch == '\r' || ch == '\n' {
			row = append(row, cell.String())
			rows = append(rows, row)
			row = []string{}
			cell.Reset()
			if ch == '\r' && i+1 < len(text) && text[i+1] == '\n' {
				i += 2
			} else {
				i++
			}
			line++
			continue
		}
		cell.WriteByte(ch)
		i++
	}
	if inQuotes {
		return nil, problem.BadRequest("Line " + strconv.Itoa(quoteLine) + " has a quote mark that never closes. Fix it in the file and upload again.")
	}
	if cell.Len() > 0 || len(row) > 0 {
		row = append(row, cell.String())
		rows = append(rows, row)
	}
	return rows, nil
}

// StatementFile is the header row and the rows under it.
type StatementFile struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

func filledCells(r []string) int {
	n := 0
	for _, c := range r {
		if js.Trim(c) != "" {
			n++
		}
	}
	return n
}

// ReadStatementFile finds the header row and the rows under it. Blank lines are dropped
// (Excel leaves them at the end); every row is padded to one width so a cell index always
// means the same column; a blank header gets a name the mapping screen can show.
//
// THE HEADER IS THE FIRST LINE WITH TWO OR MORE FILLED CELLS. A title line above it
// ("Commission Statement") otherwise became the header and the real header a data row
// (found in review).
func ReadStatementFile(text string) (StatementFile, error) {
	parsed, err := ParseCSV(text)
	if err != nil {
		return StatementFile{}, err
	}
	var all [][]string
	for _, r := range parsed {
		if filledCells(r) > 0 {
			all = append(all, r)
		}
	}
	var lines [][]string
	if start := slices.IndexFunc(all, func(r []string) bool { return filledCells(r) >= 2 }); start >= 0 {
		lines = all[start:]
	}
	if len(lines) < 2 {
		return StatementFile{}, problem.BadRequest("The file needs a header row and at least one row under it.")
	}
	head, data := lines[0], lines[1:]
	if len(data) > MaxRows {
		return StatementFile{}, problem.BadRequest("A statement can have up to " + localeInt(MaxRows) + " rows. This one has " + localeInt(len(data)) + ".")
	}
	width := len(head)
	for _, r := range data {
		width = max(width, len(r))
	}
	if width > MaxColumns {
		return StatementFile{}, problem.BadRequest("A statement can have up to " + strconv.Itoa(MaxColumns) + " columns. This one has " + strconv.Itoa(width) + ".")
	}
	for _, r := range data {
		if slices.ContainsFunc(r, func(c string) bool { return js.Len(c) > maxCell }) {
			return StatementFile{}, problem.BadRequest("A cell in this file is over " + localeInt(maxCell) + " characters. Check that it's the right file.")
		}
	}
	headers := make([]string, width)
	for i := range headers {
		h := ""
		if i < len(head) {
			h = head[i]
		}
		h = clip(js.Trim(h), 100)
		if h == "" {
			h = "Column " + strconv.Itoa(i+1)
		}
		headers[i] = h
	}
	rows := make([][]string, len(data))
	for j, r := range data {
		padded := make([]string, width)
		copy(padded, r)
		rows[j] = padded
	}
	return StatementFile{Headers: headers, Rows: rows}, nil
}

// localeInt is n.toLocaleString("en-US") for a whole number: 1000 is "1,000".
func localeInt(n int) string {
	s := strconv.Itoa(n)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// ─── Guessing the map ───

// headerRun is one run of headerRuns (header_table.go): code points lo to hi keep s, or with
// inc, the letter s plus their distance from lo.
type headerRun struct {
	lo, hi rune
	s      string
	inc    bool
}

// NormalizeHeader makes "Booking Ref #" and "booking_ref" one header:
// h.toLowerCase().normalize("NFKD"), accents dropped, then everything but a-z and 0-9.
// Go's standard library has no NFKD, so what each non-ASCII code point leaves behind comes
// from a table generated with Deno itself (header_table.go); per code point is exact, as
// that file explains.
func NormalizeHeader(h string) string {
	var b strings.Builder
	for _, r := range h {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r + ('a' - 'A'))
		case r >= 0x80:
			i := sort.Search(len(headerRuns), func(i int) bool { return headerRuns[i].hi >= r })
			if i < len(headerRuns) && headerRuns[i].lo <= r {
				run := headerRuns[i]
				if run.inc {
					b.WriteRune(rune(run.s[0]) + (r - run.lo))
				} else {
					b.WriteString(run.s)
				}
			}
		}
	}
	return b.String()
}

// exact holds EXACT names, best first. For received, what ARRIVED comes before a gross
// "commission": a statement with both a commission column and a net-paid column pays the net.
var exact = map[string][]string{
	"reference": {
		"bookingref", "bookingreference", "bookingnumber", "bookingno", "bookingid", "booking",
		"confirmation", "confirmationnumber", "confirmationno", "confno", "reservation",
		"reservationnumber", "resno", "reference", "ref", "recordlocator", "pnr",
	},
	"supplier": {"supplier", "suppliername", "vendor", "vendorname", "provider", "cruiseline", "brand"},
	"traveler": {
		"pax", "paxname", "passenger", "passengername", "traveler", "traveller", "travelername",
		"client", "clientname", "customer", "customername", "guest", "guestname", "leadpassenger",
		"name",
	},
	"gross": {
		"gross", "grossamt", "grossamount", "grosssale", "grosssales", "grossbooking",
		"bookingamount", "bookingtotal", "totalsale", "totalsales", "saleamount", "fare", "totalfare",
	},
	"received": {
		"commissionpaid", "netcommission", "advisorcommission", "agentcommission", "yourcommission",
		"payout", "amountpaid", "paidamount", "netpaid", "netamount", "net", "commissionamt",
		"commissionamount", "commission",
	},
	"fee": {
		"fee", "fees", "hostfee", "processingfee", "split", "hostsplit", "deduction",
		"inteletravelshare", "inteletravelfee", "withheld",
	},
	"paid_on": {
		"paidon", "paiddate", "datepaid", "paymentdate", "paydate", "statementdate",
		"commissiondate", "depositdate", "date",
	},
}

// contains holds CONTAINS hints, kept narrow on purpose: a bare "date" would take
// "TravelDate" for the paid-on date, and a bare "booking" would take "BookingDate" for the
// reference.
var contains = map[string][]string{
	"reference": {"confirmation", "bookingref", "bookingnum", "reservation", "locator"},
	"supplier":  {"supplier", "vendor"},
	"traveler":  {"passenger", "traveler", "traveller", "client", "customer", "guest"},
	"gross":     {"gross", "fare"},
	"received":  {"commission", "payout"},
	"fee":       {"fee", "split", "withheld"},
	"paid_on":   {"paiddate", "paidon", "datepaid", "statementdate", "paymentdate"},
}

// claimOrder is the order fields claim headers in, within each pass: the specific before the
// generic.
var claimOrder = []string{"reference", "received", "fee", "paid_on", "gross", "supplier", "traveler"}

// PreviousMap is the advisor's last confirmed map and the headers it was made for.
type PreviousMap struct {
	Headers   []string
	ColumnMap ColumnMap
}

// GuessColumnMap guesses a column map for these headers: the advisor's LAST statement first
// (matched by header name, so a reordered file still maps), then the hints. It never maps one
// header twice. previous may be nil.
func GuessColumnMap(headers []string, previous *PreviousMap) ColumnMap {
	norm := make([]string, len(headers))
	for i, h := range headers {
		norm[i] = NormalizeHeader(h)
	}
	used := make([]bool, len(headers))
	var m ColumnMap

	if previous != nil {
		for _, field := range StatementFields {
			idx, ok := previous.ColumnMap.Get(field)
			if !ok || idx < 0 || idx >= len(previous.Headers) {
				continue
			}
			name := NormalizeHeader(previous.Headers[idx])
			for i, h := range norm {
				if !used[i] && h == name {
					m.Set(field, i)
					used[i] = true
					break
				}
			}
		}
	}

	// Two passes: every EXACT name first, then the looser CONTAINS hints for what is left.
	// One pass per field let "Net Paid" go to the paid-on date (it contains "paid") before the
	// commission column, which wanted it by its exact name, got a turn.
	for _, field := range claimOrder {
		if _, ok := m.Get(field); ok {
			continue
		}
		best, bestRank := -1, len(exact[field])
		for i, h := range norm {
			if used[i] {
				continue
			}
			if rank := slices.Index(exact[field], h); rank >= 0 && rank < bestRank {
				best, bestRank = i, rank
			}
		}
		if best >= 0 {
			m.Set(field, best)
			used[best] = true
		}
	}
	for _, field := range claimOrder {
		if _, ok := m.Get(field); ok {
			continue
		}
		for i, h := range norm {
			if !used[i] && slices.ContainsFunc(contains[field], func(c string) bool { return strings.Contains(h, c) }) {
				m.Set(field, i)
				used[i] = true
				break
			}
		}
	}
	return m
}

// ReadColumnMap checks the map the advisor confirmed: known fields, whole indexes into these
// headers, no header twice, and the one column a statement cannot do without.
func ReadColumnMap(value js.Value, headerCount int) (ColumnMap, error) {
	obj, ok := value.Object()
	if !ok {
		return ColumnMap{}, problem.BadRequest("Send the column map as an object.")
	}
	var m ColumnMap
	used := map[int]bool{}
	for _, key := range ownKeys(obj) {
		if !slices.Contains(StatementFields, key) {
			return ColumnMap{}, problem.BadRequest("Unknown field in the column map: " + key + ".")
		}
		idx := obj.Get(key)
		if idx.IsNullish() {
			continue
		}
		n, ok := idx.Num()
		if !ok || !js.IsInteger(n) || n < 0 || n >= float64(headerCount) {
			return ColumnMap{}, problem.BadRequest("A column in the map is not one of this file's columns.")
		}
		i := int(n)
		if used[i] {
			return ColumnMap{}, problem.BadRequest("Each column can be used for one thing only.")
		}
		used[i] = true
		m.Set(key, i)
	}
	if _, ok := m.Get("received"); !ok {
		return ColumnMap{}, problem.BadRequest("Choose the column that holds the commission paid.")
	}
	return m, nil
}

// ownKeys is Object.entries' key order: integer-like keys ("0", "7") first in numeric order,
// then the rest in the order they were written. js.Obj keeps only the written order, so the
// split is made here; it decides which unknown field the 400 names first.
func ownKeys(o *js.Obj) []string {
	var indexes, others []string
	for _, k := range o.Keys() {
		if isArrayIndex(k) {
			indexes = append(indexes, k)
		} else {
			others = append(others, k)
		}
	}
	slices.SortFunc(indexes, func(a, b string) int {
		x, _ := strconv.ParseUint(a, 10, 64)
		y, _ := strconv.ParseUint(b, 10, 64)
		switch {
		case x < y:
			return -1
		case x > y:
			return 1
		}
		return 0
	})
	return append(indexes, others...)
}

// isArrayIndex is a canonical whole number below 2^32 - 1 ("01" is not one).
func isArrayIndex(k string) bool {
	if k == "" || (len(k) > 1 && k[0] == '0') {
		return false
	}
	for i := 0; i < len(k); i++ {
		if k[i] < '0' || k[i] > '9' {
			return false
		}
	}
	n, err := strconv.ParseUint(k, 10, 64)
	return err == nil && n < 1<<32-1
}

// ─── One row's amounts and dates ───

func quoteShort(raw string) string {
	t := js.Trim(raw)
	if js.Len(t) > 30 {
		t = js.Slice(t, 0, 30) + "\U00002026"
	}
	return `"` + t + `"`
}

var (
	// JavaScript's /i on these patterns matches ASCII letters only; Go's (?i) would also
	// match ſ (U+017F) for s and K (U+212A) for k, so the cases are spelled out instead.
	currencyPrefix = js.Regexp(`^([uU][sS][dD]|[uU][sS]\$|\$)\s*`, "")
	currencySuffix = js.Regexp(`\s*[uU][sS][dD]$`, "")
	thousands      = regexp.MustCompile(`^\d{1,3}(,\d{3})+(\.\d*)?$`)
	amountShape    = regexp.MustCompile(`^(\d+(\.\d{0,2})?|\.\d{1,2})$`)
	nonZeroDigit   = regexp.MustCompile(`[1-9]`)
)

// ParseAmountCents reads dollars as cents, exactly: "$1,234.56", "1234.5", "USD 80". Read
// from the digits, never through a float. Commas must be thousands groups (US only, BRD §2):
// "12,34" is refused rather than read as 1,234. A NEGATIVE amount is refused by name: one row
// per booking (Gyasi, 2026-10-11) means a clawback is not something this import applies.
//
// deduction is for a FEE column, which may show its deduction as negative, "(36.00)": read
// it as the amount kept.
//
// The answer is {cents} or {error}: cents nil and problem "" is a blank cell; problem is the
// sentence when the cell cannot be read.
func ParseAmountCents(raw string, deduction bool) (cents *int64, problem string) {
	s := js.Trim(raw)
	if s == "" {
		return nil, ""
	}
	negative := false
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		negative = true
		s = js.Trim(s[1 : len(s)-1])
	}
	if strings.HasPrefix(s, "-") {
		negative = true
		s = js.Trim(s[1:])
	}
	s = replaceFirst(currencyPrefix, s)
	s = replaceFirst(currencySuffix, s)
	if strings.HasPrefix(s, "-") {
		negative = true
		s = s[1:]
	}
	if strings.Contains(s, ",") && !thousands.MatchString(s) {
		return nil, quoteShort(raw) + " is not an amount."
	}
	s = strings.ReplaceAll(s, ",", "")
	if !amountShape.MatchString(s) {
		return nil, quoteShort(raw) + " is not an amount."
	}
	if negative && !deduction && nonZeroDigit.MatchString(s) {
		return nil, "This row takes money back (a negative amount), which this import doesn't apply. Set the row aside, then edit the line by hand."
	}
	whole, frac, _ := strings.Cut(s, ".")
	whole = strings.TrimLeft(whole, "0")
	if len(whole) > 8 {
		return nil, quoteShort(raw) + " is too large. Check that the column is the right one."
	}
	var dollars int64
	if whole != "" {
		dollars, _ = strconv.ParseInt(whole, 10, 64)
	}
	part, _ := strconv.ParseInt((frac + "00")[:2], 10, 64)
	c := dollars*100 + part
	if c > MaxAmountCents {
		return nil, quoteShort(raw) + " is too large. Check that the column is the right one."
	}
	return &c, ""
}

// replaceFirst is String.prototype.replace with a non-global regex: the first match only.
func replaceFirst(re *regexp.Regexp, s string) string {
	if loc := re.FindStringIndex(s); loc != nil {
		return s[:loc[0]] + s[loc[1]:]
	}
	return s
}

var months = []string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}

func monthOf(name string) int {
	return slices.Index(months, strings.ToLower(name[:3])) + 1
}

var (
	timeSuffix = js.Regexp(`[Tt ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*([aA][mM]|[pP][mM])?([zZ]|[+-]\d{2}:?\d{2})?$`, "")
	ymd        = regexp.MustCompile(`^(\d{4})-(\d{1,2})-(\d{1,2})$`)
	mdy        = regexp.MustCompile(`^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$`)
	monthDY    = js.Regexp(`^([a-zA-Z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$`, "")
	dMonY      = js.Regexp(`^(\d{1,2})[-\s]([a-zA-Z]{3,9})[-\s](\d{2}|\d{4})$`, "")
)

// ParseDate reads a calendar date as ISO: "2026-04-15", "4/15/2026", "4/15/26", "Apr 15,
// 2026", "15-Apr-2026", with or without a time after it. Month first, as US statements write
// it. A date that does not exist ("2/30/2026") is refused, not rolled into March.
//
// The answer is {date} or {error}, as ParseAmountCents's: date nil and problem "" is a blank
// cell.
func ParseDate(raw string) (date *string, problem string) {
	s := js.Trim(raw)
	if s == "" {
		return nil, ""
	}
	s = js.Trim(replaceFirst(timeSuffix, s))

	atoi := func(d string) int { n, _ := strconv.Atoi(d); return n }
	year := func(d string) int {
		if len(d) == 2 {
			return 2000 + atoi(d)
		}
		return atoi(d)
	}
	var y, m, d int
	if match := ymd.FindStringSubmatch(s); match != nil {
		y, m, d = atoi(match[1]), atoi(match[2]), atoi(match[3])
	} else if match := mdy.FindStringSubmatch(s); match != nil {
		m, d, y = atoi(match[1]), atoi(match[2]), year(match[3])
	} else if match := monthDY.FindStringSubmatch(s); match != nil {
		m, d, y = monthOf(match[1]), atoi(match[2]), atoi(match[3])
	} else if match := dMonY.FindStringSubmatch(s); match != nil {
		d, m, y = atoi(match[1]), monthOf(match[2]), year(match[3])
	}

	iso := js.PadStart(strconv.Itoa(y), 4, "0") + "-" + js.PadStart(strconv.Itoa(m), 2, "0") + "-" + js.PadStart(strconv.Itoa(d), 2, "0")
	check, ok := js.ParseDate(iso + "T00:00:00Z")
	if y < 2000 || y > 2100 || m < 1 || !ok || js.ISOString(check)[:10] != iso {
		return nil, quoteShort(raw) + " is not a date we can read. Use one like 4/15/2026."
	}
	return &iso, ""
}

// ParsedRow is one row, as agent_map_commission_import takes it.
type ParsedRow struct {
	Reference     *string `json:"reference"`
	Supplier      *string `json:"supplier"`
	Traveler      *string `json:"traveler"`
	GrossCents    *int64  `json:"gross_cents"`
	ReceivedCents *int64  `json:"received_cents"`
	FeeCents      *int64  `json:"fee_cents"`
	PaidOn        *string `json:"paid_on"`
	ParseError    *string `json:"parse_error"`
}

// ParseRows reads every row under the confirmed map. A row that cannot be read keeps its
// FIRST problem as a sentence the screen shows; it is still stored, so nothing in the file
// disappears. statementDate stands in for the paid-on date when no column carries one, or a
// cell is blank. Whether a date is after the advisor's TODAY is SQL's call: only SQL knows
// their zone.
func ParseRows(rows [][]string, m ColumnMap, statementDate *string) []ParsedRow {
	out := make([]ParsedRow, 0, len(rows))
	for _, cells := range rows {
		cell := func(f string) string {
			idx, ok := m.Get(f)
			if !ok || idx < 0 || idx >= len(cells) {
				return ""
			}
			return js.Trim(cells[idx])
		}
		var errs []string
		amount := func(f string) *int64 {
			if _, ok := m.Get(f); !ok {
				return nil
			}
			c, problem := ParseAmountCents(cell(f), f == "fee")
			if problem != "" {
				errs = append(errs, problem)
				return nil
			}
			return c
		}

		reference := cell("reference")
		if utf8.RuneCountInString(reference) > maxReference {
			errs = append(errs, "The booking reference is longer than "+strconv.Itoa(maxReference)+" characters.")
		}

		received := amount("received")
		gross := amount("gross")
		fee := amount("fee")
		if len(errs) == 0 && received == nil {
			errs = append(errs, "No commission amount on this row.")
		}
		if len(errs) == 0 && *received == 0 {
			errs = append(errs, "Nothing was paid on this row.")
		}

		var paidOn *string
		if _, mapped := m.Get("paid_on"); mapped && cell("paid_on") != "" {
			date, problem := ParseDate(cell("paid_on"))
			if problem != "" {
				errs = append(errs, problem)
			} else {
				paidOn = date
			}
		} else {
			paidOn = statementDate
		}
		if len(errs) == 0 && paidOn == nil {
			errs = append(errs, "No paid-on date for this row.")
		}

		row := ParsedRow{
			Supplier:   orNil(clip(cell("supplier"), maxName)),
			Traveler:   orNil(clip(cell("traveler"), maxName)),
			GrossCents: gross,
			FeeCents:   fee,
		}
		if reference != "" {
			row.Reference = &reference
		}
		if len(errs) == 0 {
			row.ReceivedCents = received
			row.PaidOn = paidOn
		} else {
			row.ParseError = &errs[0]
		}
		out = append(out, row)
	}
	return out
}

func orNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ToHex is lowercase hex, which PostgREST takes for a bytea as \x...
func ToHex(b []byte) string { return hex.EncodeToString(b) }

// ReadFileBase64 decodes the upload, refusing anything over the size cap BEFORE it is decoded.
func ReadFileBase64(value js.Value) ([]byte, error) {
	s, ok := value.Str()
	if !ok || s == "" {
		return nil, problem.BadRequest("Choose a CSV file to upload.")
	}
	if js.Len(s) > (MaxFileBytes*4+2)/3+4 {
		return nil, problem.BadRequest("That file is larger than 512 KB. Check that it's the statement.")
	}
	b, ok := atob(s)
	if !ok {
		return nil, problem.BadRequest("That file didn't come through. Try uploading it again.")
	}
	if len(b) > MaxFileBytes {
		return nil, problem.BadRequest("That file is larger than 512 KB. Check that it's the statement.")
	}
	return b, nil
}

// atob is the HTML standard's forgiving-base64 decode: ASCII white space ignored, one or two
// trailing "=" allowed when the length is a multiple of four, leftover bits dropped.
func atob(s string) ([]byte, bool) {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		switch c := s[i]; {
		case c == '\t' || c == '\n' || c == '\f' || c == '\r' || c == ' ':
		case c >= 0x80:
			return nil, false
		default:
			b.WriteByte(c)
		}
	}
	data := b.String()
	if len(data)%4 == 0 {
		if strings.HasSuffix(data, "==") {
			data = data[:len(data)-2]
		} else if strings.HasSuffix(data, "=") {
			data = data[:len(data)-1]
		}
	}
	if len(data)%4 == 1 {
		return nil, false
	}
	for i := 0; i < len(data); i++ {
		c := data[i]
		if !(c == '+' || c == '/' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
			return nil, false
		}
	}
	out, err := base64.RawStdEncoding.DecodeString(data)
	if err != nil {
		return nil, false
	}
	return out, true
}

var pathSeparators = regexp.MustCompile(`[\\/]`)

// ReadFilename is the name the advisor will recognise in the list. Path parts are dropped.
// (The Deno version also refused a name that is not well formed UTF-16; see the package
// comment for why that cannot happen here.)
func ReadFilename(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok {
		return "", problem.BadRequest("The file needs a name.")
	}
	parts := pathSeparators.Split(s, -1)
	base := js.Trim(parts[len(parts)-1])
	if base == "" || strings.ContainsRune(base, 0) {
		return "", problem.BadRequest("The file needs a name.")
	}
	return js.Slice(base, 0, 255), nil
}
