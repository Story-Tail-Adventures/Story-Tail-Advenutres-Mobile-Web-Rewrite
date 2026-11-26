package statement

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/statement_test.ts, one test per Deno.test.
//
// The commission-import route's file handling. Every case here is either a statement that
// would otherwise be read as the wrong money (a comma in the wrong place, a negative, a date
// that rolls into the next month) or one that would reach Postgres as a 500.

// refused checks for a 400. The Deno tests mostly assert only an HttpError; where Deno's
// sentence is known it is pinned too ("" accepts any).
func refused(t *testing.T, err error, detail string) *problem.Error {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("got %v, want a 400", err)
	}
	if p.Status != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", p.Status)
	}
	if detail != "" && p.Detail != detail {
		t.Fatalf("detail %q, want %q", p.Detail, detail)
	}
	return p
}

func equal(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v\nwant %#v", got, want)
	}
}

func p[T any](v T) *T { return &v }

// cents checks {cents: want}; want nil is {cents: null}.
func cents(t *testing.T, raw string, deduction bool, want *int64) {
	t.Helper()
	got, problem := ParseAmountCents(raw, deduction)
	if problem != "" {
		t.Fatalf("ParseAmountCents(%q) = error %q", raw, problem)
	}
	equal(t, got, want)
}

func amountError(t *testing.T, raw string) string {
	t.Helper()
	got, problem := ParseAmountCents(raw, false)
	if problem == "" {
		t.Fatalf("ParseAmountCents(%q) = %v, want an error", raw, got)
	}
	return problem
}

func date(t *testing.T, raw string, want *string) {
	t.Helper()
	got, problem := ParseDate(raw)
	if problem != "" {
		t.Fatalf("ParseDate(%q) = error %q", raw, problem)
	}
	equal(t, got, want)
}

func dateError(t *testing.T, raw string) {
	t.Helper()
	if got, problem := ParseDate(raw); problem == "" {
		t.Fatalf("ParseDate(%q) = %v, want an error", raw, got)
	}
}

func mapOf(kv ...any) ColumnMap {
	var m ColumnMap
	for i := 0; i+1 < len(kv); i += 2 {
		m.Set(kv[i].(string), kv[i+1].(int))
	}
	return m
}

func rowsOf(prefix string, n int) string {
	lines := make([]string, n)
	for i := range lines {
		lines[i] = fmt.Sprintf("%s%d,1", prefix, i)
	}
	return strings.Join(lines, "\n")
}

// Deno.test("parseCsv: quotes, doubled quotes, commas and line breaks inside a cell")
func TestParseCSVQuotes(t *testing.T) {
	got, err := ParseCSV("a,\"b, c\",\"say \"\"hi\"\"\",\"two\nlines\"\r\n1,2,3,4")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, got, [][]string{{"a", "b, c", `say "hi"`, "two\nlines"}, {"1", "2", "3", "4"}})
}

// Deno.test("parseCsv: CRLF, LF and lone CR all end a row; a trailing newline adds none")
func TestParseCSVLineEnds(t *testing.T) {
	got, err := ParseCSV("a,b\r\n1,2\n3,4\r5,6\n")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, got, [][]string{{"a", "b"}, {"1", "2"}, {"3", "4"}, {"5", "6"}})
}

// Deno.test("parseCsv: empty cells are kept, so columns stay where they are")
func TestParseCSVEmptyCells(t *testing.T) {
	got, err := ParseCSV("a,,c\n,,")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, got, [][]string{{"a", "", "c"}, {"", "", ""}})
}

// Deno.test("parseCsv: a quote that never closes is an error naming its line")
func TestParseCSVUnclosedQuote(t *testing.T) {
	_, err := ParseCSV("a,b\n1,\"open\n2,3")
	e := refused(t, err, "Line 2 has a quote mark that never closes. Fix it in the file and upload again.")
	if !strings.Contains(e.Detail, "Line 2") {
		t.Fatal(e.Detail)
	}
}

// Deno.test("decodeStatement: UTF-8 with a BOM, and Windows-1252 from Excel, both read Peña")
func TestDecodeStatementBOMAndWindows1252(t *testing.T) {
	got, err := DecodeStatement(append([]byte{0xef, 0xbb, 0xbf}, []byte("Pe\U000000F1a")...))
	if err != nil || got != "Pe\U000000F1a" {
		t.Fatalf("got %q, %v", got, err)
	}
	// "Peña" in Windows-1252: ñ is the single byte 0xF1, which is not valid UTF-8.
	got, err = DecodeStatement([]byte{0x50, 0x65, 0xf1, 0x61})
	if err != nil || got != "Pe\U000000F1a" {
		t.Fatalf("got %q, %v", got, err)
	}
}

// Deno.test("decodeStatement: an Excel workbook is named, and binary is refused")
func TestDecodeStatementExcelAndBinary(t *testing.T) {
	_, err := DecodeStatement([]byte{0x50, 0x4b, 3, 4, 0, 0})
	xlsx := refused(t, err, "That's an Excel file. Save it as CSV (File, Save As, CSV) and upload that.")
	if !strings.Contains(xlsx.Detail, "Excel") {
		t.Fatal(xlsx.Detail)
	}
	_, err = DecodeStatement([]byte{0x61, 0x00, 0x62})
	refused(t, err, "That file doesn't look like a CSV. Download the statement as CSV and try again.")
}

// Deno.test("readStatementFile: blank lines dropped, rows padded, blank headers named")
func TestReadStatementFilePadsAndNames(t *testing.T) {
	f, err := ReadStatementFile("Ref,,Paid\nA1,x\n\n,,\nA2,y,3.00,extra\n")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, f.Headers, []string{"Ref", "Column 2", "Paid", "Column 4"})
	equal(t, f.Rows, [][]string{{"A1", "x", "", ""}, {"A2", "y", "3.00", "extra"}})
}

// Deno.test("readStatementFile: a title line above the header is skipped, not taken for it")
func TestReadStatementFileSkipsTitleLine(t *testing.T) {
	f, err := ReadStatementFile("Commission Statement\n\nRef,Paid\nA1,3.00\n")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, f.Headers, []string{"Ref", "Paid"})
	equal(t, f.Rows, [][]string{{"A1", "3.00"}})
}

// Deno.test("readStatementFile: a long header is cut by character, never through an emoji")
func TestReadStatementFileCutsByCharacter(t *testing.T) {
	f, err := ReadStatementFile(strings.Repeat("x", 99) + "\U0001F600\U0001F600,Paid\nA,1\n")
	if err != nil {
		t.Fatal(err)
	}
	equal(t, f.Headers[0], strings.Repeat("x", 99)+"\U0001F600")
	if !utf8.ValidString(f.Headers[0]) {
		t.Fatal("not well formed")
	}
}

// Deno.test("readStatementFile: needs a header and a row; refuses more than the row cap")
func TestReadStatementFileHeaderRowAndCap(t *testing.T) {
	_, err := ReadStatementFile("Ref,Paid\n")
	refused(t, err, "The file needs a header row and at least one row under it.")
	_, err = ReadStatementFile("Ref,Paid\n" + rowsOf("R", MaxRows+1))
	refused(t, err, "A statement can have up to 1,000 rows. This one has 1,001.")
	f, err := ReadStatementFile("Ref,Paid\n" + rowsOf("R", MaxRows))
	if err != nil || len(f.Rows) != MaxRows {
		t.Fatalf("got %d rows, %v", len(f.Rows), err)
	}
}

// Deno.test("normalizeHeader: punctuation, case and accents do not matter")
func TestNormalizeHeader(t *testing.T) {
	equal(t, NormalizeHeader(" Booking Ref # "), "bookingref")
	equal(t, NormalizeHeader("R\U000000E9servation_No"), "reservationno")
}

// Deno.test("guessColumnMap: the prototype's headers map as the prototype shows")
func TestGuessColumnMapPrototype(t *testing.T) {
	headers := []string{"BookingRef", "SupplierName", "GrossAmt", "CommissionAmt", "StatementDate", "PaxName"}
	got := GuessColumnMap(headers, nil)
	equal(t, got.AsMap(), map[string]int{"reference": 0, "supplier": 1, "gross": 2, "received": 3, "paid_on": 4, "traveler": 5})
	// Go-only: the key order Deno's JSON.stringify wrote (the order the fields claimed).
	b, _ := js.Marshal(got)
	equal(t, string(b), `{"reference":0,"received":3,"paid_on":4,"gross":2,"supplier":1,"traveler":5}`)
}

// Deno.test("guessColumnMap: a net-paid column is what arrived, not the gross commission")
func TestGuessColumnMapNetPaid(t *testing.T) {
	m := GuessColumnMap([]string{"Commission", "Net Paid", "Host Fee"}, nil)
	received, _ := m.Get("received")
	fee, _ := m.Get("fee")
	if received != 1 || fee != 2 {
		t.Fatalf("got %v", m.AsMap())
	}
}

// Deno.test("guessColumnMap: a travel or booking DATE is never taken for the paid-on date or the reference")
func TestGuessColumnMapDatesAreNotPaidOnOrReference(t *testing.T) {
	m := GuessColumnMap([]string{"Booking Date", "Travel Date", "Commission"}, nil)
	if _, ok := m.Get("paid_on"); ok {
		t.Fatalf("paid_on mapped: %v", m.AsMap())
	}
	if _, ok := m.Get("reference"); ok {
		t.Fatalf("reference mapped: %v", m.AsMap())
	}
}

// Deno.test("guessColumnMap: last month's map wins, by header name, even when columns move")
func TestGuessColumnMapPreviousWins(t *testing.T) {
	previous := &PreviousMap{
		Headers:   []string{"Res #", "Amount", "When"},
		ColumnMap: mapOf("reference", 0, "received", 1, "paid_on", 2),
	}
	got := GuessColumnMap([]string{"When", "Res #", "Amount", "Who"}, previous)
	equal(t, got.AsMap(), map[string]int{"reference": 1, "received": 2, "paid_on": 0})
	b, _ := js.Marshal(got)
	equal(t, string(b), `{"reference":1,"received":2,"paid_on":0}`)
}

// Deno.test("readColumnMap: known fields, real columns, no column twice, and a commission column")
func TestReadColumnMap(t *testing.T) {
	parse := func(src string) js.Value {
		v, err := js.Parse([]byte(src))
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	m, err := ReadColumnMap(parse(`{"reference":0,"received":2,"fee":null}`), 3)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, m.AsMap(), map[string]int{"reference": 0, "received": 2})
	_, err = ReadColumnMap(parse(`{"received":3}`), 3)
	refused(t, err, "A column in the map is not one of this file's columns.")
	_, err = ReadColumnMap(parse(`{"received":1,"fee":1}`), 3)
	refused(t, err, "Each column can be used for one thing only.")
	_, err = ReadColumnMap(parse(`{"reference":0}`), 3)
	refused(t, err, "Choose the column that holds the commission paid.")
	_, err = ReadColumnMap(parse(`{"received":0,"payee":1}`), 3)
	refused(t, err, "Unknown field in the column map: payee.")
	_, err = ReadColumnMap(parse(`{"received":1.5}`), 3)
	refused(t, err, "A column in the map is not one of this file's columns.")
	_, err = ReadColumnMap(parse(`[1]`), 3)
	refused(t, err, "Send the column map as an object.")
	// Go-only: Object.entries puts integer keys first, so Deno named "7" here, not "payee".
	_, err = ReadColumnMap(parse(`{"payee":1,"7":2}`), 3)
	refused(t, err, "Unknown field in the column map: 7.")
}

// Deno.test("parseAmountCents: dollars to exact cents")
func TestParseAmountCentsDollars(t *testing.T) {
	cents(t, "$1,234.56", false, p[int64](123456))
	cents(t, "1234.5", false, p[int64](123450))
	cents(t, "USD 80", false, p[int64](8000))
	cents(t, ".07", false, p[int64](7))
	cents(t, "  ", false, nil)
	// 0.1 + 0.2 in a float is 0.30000000000000004; read from the digits it is 30 cents.
	cents(t, "0.30", false, p[int64](30))
}

// Deno.test("parseAmountCents: commas must be thousands, and three decimals are not cents")
func TestParseAmountCentsCommasAndDecimals(t *testing.T) {
	equal(t, amountError(t, "12,34"), `"12,34" is not an amount.`)
	equal(t, amountError(t, "1.234,56"), `"1.234,56" is not an amount.`)
	equal(t, amountError(t, "12.345"), `"12.345" is not an amount.`)
	equal(t, amountError(t, "abc"), `"abc" is not an amount.`)
}

// Deno.test("parseAmountCents: a wrongly mapped column is too large, not $90 trillion")
func TestParseAmountCentsTooLarge(t *testing.T) {
	cents(t, "99,999,999.99", false, p[int64](9_999_999_999))
	equal(t, amountError(t, "100000000.00"), `"100000000.00" is too large. Check that the column is the right one.`)
	equal(t, amountError(t, "90071992547409"), `"90071992547409" is too large. Check that the column is the right one.`)
}

// Deno.test("parseAmountCents: a fee shown as a deduction is the amount kept")
func TestParseAmountCentsDeduction(t *testing.T) {
	cents(t, "(36.00)", true, p[int64](3600))
	cents(t, "-36", true, p[int64](3600))
}

// Deno.test("parseAmountCents: a negative amount (a clawback) is refused by name, a negative zero is not")
func TestParseAmountCentsNegative(t *testing.T) {
	const clawback = "This row takes money back (a negative amount), which this import doesn't apply. Set the row aside, then edit the line by hand."
	neg := amountError(t, "(12.00)")
	if !strings.Contains(neg, "negative") {
		t.Fatal(neg)
	}
	equal(t, neg, clawback)
	equal(t, amountError(t, "-5"), clawback)
	equal(t, amountError(t, "$-5"), clawback)
	cents(t, "-0.00", false, p[int64](0))
}

// Deno.test("parseDate: the formats a US statement writes")
func TestParseDateFormats(t *testing.T) {
	date(t, "2026-04-15", p("2026-04-15"))
	date(t, "4/15/2026", p("2026-04-15"))
	date(t, "04/05/26", p("2026-04-05"))
	date(t, "Apr 15, 2026", p("2026-04-15"))
	date(t, "15-Apr-2026", p("2026-04-15"))
	date(t, "4/15/2026 0:00", p("2026-04-15"))
	date(t, "2026-04-15T00:00:00Z", p("2026-04-15"))
	date(t, "", nil)
}

// Deno.test("parseDate: a date that does not exist is refused, not rolled forward")
func TestParseDateRefusesNonDates(t *testing.T) {
	dateError(t, "2/30/2026")
	dateError(t, "13/1/2026")
	dateError(t, "Smarch 1, 2026")
	dateError(t, "1/1/1999")
}

// Deno.test("parseRows: each row read under the map, with the statement date standing in")
func TestParseRowsStatementDateStandsIn(t *testing.T) {
	rows := [][]string{
		{"ITV-1", "Sandals", "J Q", "4,800.00", "540.00", "36", "4/10/2026"},
		{"ITV-2", "Sandals", "", "", "$100", "", ""},
	}
	m := mapOf("reference", 0, "supplier", 1, "traveler", 2, "gross", 3, "received", 4, "fee", 5, "paid_on", 6)
	equal(t, ParseRows(rows, m, p("2026-04-30")), []ParsedRow{
		{
			Reference: p("ITV-1"), Supplier: p("Sandals"), Traveler: p("J Q"), GrossCents: p[int64](480000),
			ReceivedCents: p[int64](54000), FeeCents: p[int64](3600), PaidOn: p("2026-04-10"), ParseError: nil,
		},
		{
			Reference: p("ITV-2"), Supplier: p("Sandals"), Traveler: nil, GrossCents: nil,
			ReceivedCents: p[int64](10000), FeeCents: nil, PaidOn: p("2026-04-30"), ParseError: nil,
		},
	})
}

// Deno.test("parseRows: an unreadable row keeps its FIRST problem and is still returned")
func TestParseRowsFirstProblem(t *testing.T) {
	m := mapOf("reference", 0, "received", 1, "paid_on", 2)
	got := ParseRows([][]string{
		{"A", "abc", "4/1/2026"}, {"B", "", "4/1/2026"}, {"C", "0", "4/1/2026"}, {"D", "5", "4/31/2026"}, {"E", "5", ""},
	}, m, nil)
	bad, none, zero, dated, nodate := got[0], got[1], got[2], got[3], got[4]
	equal(t, bad.ParseError, p(`"abc" is not an amount.`))
	equal(t, bad.ReceivedCents, (*int64)(nil))
	equal(t, none.ParseError, p("No commission amount on this row."))
	equal(t, zero.ParseError, p("Nothing was paid on this row."))
	if dated.ParseError == nil || !strings.HasPrefix(*dated.ParseError, `"4/31/2026" is not a date`) {
		t.Fatalf("got %v", dated.ParseError)
	}
	equal(t, dated.PaidOn, (*string)(nil))
	equal(t, nodate.ParseError, p("No paid-on date for this row."))
}

// Deno.test("parseRows: a fee column in accounting style reads; a 65-character reference does not")
func TestParseRowsAccountingFeeAndLongReference(t *testing.T) {
	got := ParseRows([][]string{{"ITV-1", "540.00", "(36.00)"}, {strings.Repeat("R", 65), "1", ""}},
		mapOf("reference", 0, "received", 1, "fee", 2), p("2026-04-30"))
	ok, long := got[0], got[1]
	equal(t, ok.FeeCents, p[int64](3600))
	equal(t, ok.ParseError, (*string)(nil))
	equal(t, long.ParseError, p("The booking reference is longer than 64 characters."))
}

// Deno.test("readFileBase64 and readFilename: the cap is checked before decoding; paths are dropped")
func TestReadFileBase64AndFilename(t *testing.T) {
	got, err := ReadFileBase64(js.StringValue(base64.StdEncoding.EncodeToString([]byte("a,b\n1,2"))))
	if err != nil {
		t.Fatal(err)
	}
	equal(t, got, []byte("a,b\n1,2"))
	_, err = ReadFileBase64(js.StringValue(strings.Repeat("A", 800_000)))
	refused(t, err, "That file is larger than 512 KB. Check that it's the statement.")
	_, err = ReadFileBase64(js.StringValue("%%%"))
	refused(t, err, "That file didn't come through. Try uploading it again.")
	_, err = ReadFileBase64(js.StringValue(""))
	refused(t, err, "Choose a CSV file to upload.")
	name, err := ReadFilename(js.StringValue("C:\\Users\\me\\april.csv"))
	if err != nil || name != "april.csv" {
		t.Fatalf("got %q, %v", name, err)
	}
	name, err = ReadFilename(js.StringValue("../../etc/passwd"))
	if err != nil || name != "passwd" {
		t.Fatalf("got %q, %v", name, err)
	}
	_, err = ReadFilename(js.StringValue("a\x00b"))
	refused(t, err, "The file needs a name.")
	_, err = ReadFilename(js.StringValue("  "))
	refused(t, err, "The file needs a name.")
}

// Deno.test("toHex: bytes as PostgREST's bytea hex")
func TestToHex(t *testing.T) {
	equal(t, ToHex([]byte{0, 15, 255}), "000fff")
}
