package money

import (
	"strings"
	"testing"
)

// §3.7.5 / §3.7.6's view models — ports of what web/lib/agent/statements.test.ts and
// statementForm.test.ts pin, plus the arithmetic the notes are built on.

// cp and sp are "a pointer to this", which the row types use for every nullable column.
func cp(v Cents) *Cents   { return &v }
func sp(v string) *string { return &v }

func TestStatementLabel(t *testing.T) {
	// One month: the prototype's "April statement", with the year so two Aprils are not one.
	if got := statementLabel("april.csv", "2026-04-01", "2026-04-30"); got != "April 2026 statement" {
		t.Errorf("one month gave %q", got)
	}
	// Spanning two months, no dates at all, or only one end: the file's own name, rather
	// than a month guessed from half the evidence.
	for _, c := range [][3]string{
		{"april.csv", "2026-04-01", "2026-05-02"},
		{"april.csv", "", ""},
		{"april.csv", "2026-04-01", ""},
		{"april.csv", "", "2026-04-30"},
	} {
		if got := statementLabel(c[0], c[1], c[2]); got != "april.csv" {
			t.Errorf("statementLabel(%q, %q, %q) = %q", c[0], c[1], c[2], got)
		}
	}
}

func TestSelectionsFromMap(t *testing.T) {
	got := selectionsFromMap(map[string]int{"reference": 0, "received": 2}, 4)
	want := []string{"reference", "", "received", ""}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("selections are %v, want %v", got, want)
		}
	}
	// An index the headers no longer have, and a field this screen does not know, are both
	// dropped rather than drawn against the wrong column.
	out := selectionsFromMap(map[string]int{"received": 9, "nonsense": 0, "fee": -1}, 3)
	for i, v := range out {
		if v != "" {
			t.Errorf("column %d got %q from a map that should not have reached it", i, v)
		}
	}
	if len(selectionsFromMap(nil, 2)) != 2 {
		t.Error("a statement with no map yet has no selections of the right length")
	}
}

func TestValidateMap(t *testing.T) {
	t.Run("a paid-on column wins, and the typed date is not sent too", func(t *testing.T) {
		m, date, errs := validateMap(mapValues{
			Selections:    []string{"reference", "received", "paid_on"},
			StatementDate: "2026-04-30",
		})
		if errs.any() {
			t.Fatalf("refused: %+v", errs)
		}
		if m["received"] != 1 || m["paid_on"] != 2 {
			t.Errorf("map is %v", m)
		}
		// Sending both would leave the function to guess which the advisor meant.
		if date != "" {
			t.Errorf("the typed date (%q) rode along with a paid-on column", date)
		}
	})

	t.Run("no paid-on column needs the statement's own date", func(t *testing.T) {
		_, date, errs := validateMap(mapValues{Selections: []string{"received"}, StatementDate: " 2026-04-30 "})
		if errs.any() || date != "2026-04-30" {
			t.Errorf("date is %q, errs %+v", date, errs)
		}
		_, _, errs = validateMap(mapValues{Selections: []string{"received"}, StatementDate: ""})
		if errs.StatementDate != copyMapNeedsDate {
			t.Errorf("a missing date said %q", errs.StatementDate)
		}
		// The shape is checked, not the calendar: the function decides what is a real date.
		_, _, errs = validateMap(mapValues{Selections: []string{"received"}, StatementDate: "30/04/2026"})
		if errs.StatementDate == "" {
			t.Error("a non-ISO date passed")
		}
	})

	t.Run("the commission column is the one that cannot be missing", func(t *testing.T) {
		_, _, errs := validateMap(mapValues{Selections: []string{"reference", "supplier"}, StatementDate: "2026-04-30"})
		if errs.Map != copyMapNeedsReceived {
			t.Errorf("said %q", errs.Map)
		}
	})

	t.Run("one field on two columns names the field", func(t *testing.T) {
		_, _, errs := validateMap(mapValues{Selections: []string{"received", "received"}, StatementDate: "2026-04-30"})
		if errs.Map != "Commission paid is chosen for two columns. Pick one." {
			t.Errorf("said %q", errs.Map)
		}
	})

	t.Run("an unknown selection is ignored, not mapped", func(t *testing.T) {
		m, _, errs := validateMap(mapValues{Selections: []string{"received", "nonsense", ""}, StatementDate: "2026-04-30"})
		if errs.any() {
			t.Fatalf("refused: %+v", errs)
		}
		if len(m) != 1 {
			t.Errorf("map is %v", m)
		}
	})
}

func TestClampHeaderCount(t *testing.T) {
	// It sizes an array and a hidden field can be edited, so it is bounded on both sides.
	for _, c := range []struct {
		in   string
		want int
		ok   bool
	}{
		{"1", 1, true}, {"38", 38, true}, {"60", 60, true},
		{"0", 0, false}, {"61", 0, false}, {"-1", 0, false}, {"", 0, false}, {"abc", 0, false},
		{"999999999999999999999", 0, false},
	} {
		got, ok := clampHeaderCount(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("clampHeaderCount(%q) = %d, %v; want %d, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestNotCSVName(t *testing.T) {
	for _, n := range []string{"april.xlsx", "April.XLS", "statement.numbers", "statement.pdf"} {
		if !notCSVName(n) {
			t.Errorf("%q passed as a CSV", n)
		}
	}
	for _, n := range []string{"april.csv", "april.CSV", "april.txt", "xlsx.csv"} {
		if notCSVName(n) {
			t.Errorf("%q was refused", n)
		}
	}
}

func TestCents2AlwaysShowsCents(t *testing.T) {
	// The shared formatter drops ".00", which in one right-aligned Amount column put "$540"
	// over "$1,189.50".
	for _, c := range []struct {
		in   Cents
		want string
	}{
		{54000, "$540.00"}, {118950, "$1,189.50"}, {0, "$0.00"}, {5, "$0.05"}, {-1200, "-$12.00"},
	} {
		if got := cents2(c.in); got != c.want {
			t.Errorf("cents2(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestPaymentNote(t *testing.T) {
	base := statementLineRow{
		LineExpectedCents: cp(136800), ReceivedCents: cp(136800), LineGrossCents: cp(1140000),
		LineCommissionPct: Rate{Value: 12, Set: true}, Currency: "USD",
	}
	t.Run("a payment that matches says nothing", func(t *testing.T) {
		if note := paymentNote(base, false); note != "" {
			t.Errorf("note is %q", note)
		}
	})
	t.Run("a shortfall says what it means for the line", func(t *testing.T) {
		r := base
		r.ReceivedCents, r.FeeCents = cp(129200), cp(0)
		note := paymentNote(r, false)
		want := "Expected $1,368.00. Paid $1,292.00. That's $76.00 short, so it will be marked Disputed."
		// 129200/1140000 = 11.33…% against the line's 12%, so the rate note rides along.
		if note != want+" Paid at about 11.3% of the booking, not 12%." {
			t.Errorf("note is %q", note)
		}
	})
	t.Run("a fee is named, and counts toward the rate", func(t *testing.T) {
		r := base
		r.ReceivedCents, r.FeeCents = cp(129200), cp(7600)
		// 129200 + 7600 = 136800 = exactly expected, so there is no gap at all.
		if note := paymentNote(r, false); note != "" {
			t.Errorf("a fee that closes the gap still said %q", note)
		}
	})
	t.Run("more than expected is its own sentence", func(t *testing.T) {
		r := base
		r.ReceivedCents = cp(140000)
		if note := paymentNote(r, false); note != "$32.00 more than expected." {
			t.Errorf("note is %q", note)
		}
	})
	t.Run("a reconciled row says it WAS marked, not will be", func(t *testing.T) {
		r := base
		r.ReceivedCents = cp(129200)
		if note := paymentNote(r, true); !strings.Contains(note, "so it was marked Disputed.") {
			t.Errorf("note is %q", note)
		}
	})
	t.Run("nothing to compare is no note", func(t *testing.T) {
		r := base
		r.LineExpectedCents = nil
		if note := paymentNote(r, false); note != "" {
			t.Errorf("note is %q", note)
		}
	})
	t.Run("the rate is against the BOOKED gross, never the statement's", func(t *testing.T) {
		r := base
		r.ReceivedCents = cp(129200)
		r.GrossCents = cp(1) // the statement's own gross, which must not be used
		note := paymentNote(r, false)
		if strings.Contains(note, "not 12%") && !strings.Contains(note, "11.3%") {
			t.Errorf("note is %q", note)
		}
	})
}

func TestCreateNote(t *testing.T) {
	r := statementLineRow{
		NewGrossCents: cp(648000), NewCommissionPct: Rate{Value: 12.5, Set: true},
		ReceivedCents: cp(81000), Currency: "USD",
	}
	// 648000 × 12.5% = 81000, paid in full: just what will be created.
	if got := createNote(r, false); got != "$6,480.00 at 12.5%" {
		t.Errorf("note is %q", got)
	}
	// Short: the shortfall rides along.
	r.ReceivedCents = cp(80000)
	if got := createNote(r, false); !strings.Contains(got, "$6,480.00 at 12.5%. Expected $810.00.") || !strings.Contains(got, "$10.00 short") {
		t.Errorf("note is %q", got)
	}
	// Nothing to work from is no note.
	r.NewGrossCents = nil
	if got := createNote(r, false); got != "" {
		t.Errorf("note is %q", got)
	}
}

func TestImpliedRate(t *testing.T) {
	// Rounded DOWN, never to nearest: at 12.35% a $9,999.00 booking expects $1,234.88 and
	// the new line is born Disputed for 32 cents.
	if got := impliedRate(123456, 0, 999900); got != "12.34" {
		t.Errorf("impliedRate = %q, want 12.34", got)
	}
	if got := impliedRate(81000, 0, 648000); got != "12.5" {
		t.Errorf("impliedRate = %q, want 12.5", got)
	}
	if got := impliedRate(78000, 3000, 648000); got != "12.5" {
		t.Errorf("the fee is part of what was paid: %q", got)
	}
	if got := impliedRate(100, 0, 0); got != "" {
		t.Errorf("no gross gave %q", got)
	}
	// Reachable from a statement's own figures, so it is bounded rather than wrapped.
	if got := impliedRate(Cents(1)<<60, 0, 100); got != "" {
		t.Errorf("an amount past int64 gave %q", got)
	}
}

func TestStatementRowsSortNeedsYouFirst(t *testing.T) {
	rows := []statementLineRow{
		{RowID: "a", RowNumber: 1, State: "confirmed", MatchBasis: "reference"},
		{RowID: "b", RowNumber: 2, State: "unmatched", MatchBasis: "none"},
		{RowID: "c", RowNumber: 3, State: "confirmed", MatchBasis: "reference"},
		{RowID: "d", RowNumber: 4, State: "duplicate", MatchBasis: "none"},
	}
	out := statementRowsView(rows, "imp", false)
	// Needs-you first, and within each group the file's own order.
	want := []string{"b", "d", "a", "c"}
	for i, id := range want {
		if out[i].RowID != id {
			t.Fatalf("order is %v, want %v", ids(out), want)
		}
	}
	if !out[0].NeedsYou || out[2].NeedsYou {
		t.Error("the wrong rows are marked as needing the advisor")
	}
	if out[2].ResolveHref != "/agent/commission/import/imp/rows/a" {
		t.Errorf("resolve href is %q", out[2].ResolveHref)
	}
}

func TestStatementRowStates(t *testing.T) {
	base := statementLineRow{
		RowID: "r1", RowNumber: 1, Currency: "USD",
		Reference: sp("SRB-220119"), SupplierText: sp("Sandals Resorts"), TravelerText: sp("M Hayes"),
		ReceivedCents: cp(136800), PaidOn: sp("2027-02-21"),
		LineID: sp("line-1"), LineSupplierName: sp("Sandals Resorts"),
		LineClientName: sp("Jordan Hayes"), LineTripTitle: sp("Anniversary Week in Negril"),
		LineExpectedCents: cp(136800), LineGrossCents: cp(1140000),
		LineCommissionPct: Rate{Value: 12, Set: true},
	}

	t.Run("the statement cell is the file's own three fields", func(t *testing.T) {
		v := statementRowView(base, "imp", false)
		if v.StatementLine != "SRB-220119 · Sandals Resorts · M Hayes" {
			t.Errorf("statement line is %q", v.StatementLine)
		}
		if v.AmountLabel != "$1,368.00" || v.PaidOnLabel != "Feb 21, 2027" {
			t.Errorf("amount %q, paid on %q", v.AmountLabel, v.PaidOnLabel)
		}
	})

	t.Run("confirmed by reference is Auto; by anything else, Matched", func(t *testing.T) {
		r := base
		r.State, r.MatchBasis = "confirmed", "reference"
		if v := statementRowView(r, "imp", false); v.DoneLabel != copyAuto {
			t.Errorf("done label is %q", v.DoneLabel)
		}
		r.MatchBasis = "supplier_and_traveler"
		if v := statementRowView(r, "imp", false); v.DoneLabel != copyMatched {
			t.Errorf("done label is %q", v.DoneLabel)
		}
	})

	t.Run("a suggestion with nothing to warn about still asks to be checked", func(t *testing.T) {
		r := base
		r.State, r.MatchBasis = "suggested", "supplier_and_traveler"
		v := statementRowView(r, "imp", false)
		if v.Note != copyCheckSuggestion {
			t.Errorf("note is %q", v.Note)
		}
		if v.ConfidenceLabel != copyConfidenceMedium || v.ConfidenceChip != "proposal" {
			t.Errorf("confidence is %q / %q", v.ConfidenceLabel, v.ConfidenceChip)
		}
		if !v.NeedsYou {
			t.Error("a suggestion does not block reconciling")
		}
	})

	t.Run("already recorded says both figures when they disagree", func(t *testing.T) {
		r := base
		r.State, r.MatchBasis = "already_recorded", "reference"
		r.LineReceivedCents, r.LineStatus = cp(130000), sp("received")
		v := statementRowView(r, "imp", false)
		if !strings.Contains(v.Note, "ledger says $1,300.00") || !strings.Contains(v.Note, "statement says $1,368.00") {
			t.Errorf("note is %q", v.Note)
		}
		if v.NeedsYou {
			t.Error("a row already on the ledger blocks reconciling")
		}
	})

	t.Run("a row to create names what will be created, and does not link yet", func(t *testing.T) {
		r := base
		r.State = "to_create"
		r.NewSupplierName, r.NewTripTitle = sp("Sandals Resorts"), sp("Kyoto in the spring")
		r.NewGrossCents, r.NewCommissionPct = cp(648000), Rate{Value: 12.5, Set: true}
		r.ReceivedCents = cp(81000)
		v := statementRowView(r, "imp", false)
		if v.MatchLabel != "Sandals Resorts · Kyoto in the spring" {
			t.Errorf("match label is %q", v.MatchLabel)
		}
		// Before reconcile the line does not exist; LineID is the old suggestion.
		if v.MatchHref != "" {
			t.Errorf("it linked to %q before the line existed", v.MatchHref)
		}
		if v.ConfidenceLabel != "" {
			t.Errorf("a decided row still shows confidence %q", v.ConfidenceLabel)
		}
		after := statementRowView(r, "imp", true)
		if after.MatchHref != linePath("line-1") {
			t.Errorf("after reconcile it links to %q", after.MatchHref)
		}
	})

	t.Run("unreadable shows the parser's own words", func(t *testing.T) {
		r := base
		r.State, r.MatchBasis, r.LineID = "unreadable", "none", nil
		r.ParseError = sp("Amount column is empty")
		v := statementRowView(r, "imp", false)
		if v.Note != "Amount column is empty" || v.MatchLabel != noFigure {
			t.Errorf("note %q, match %q", v.Note, v.MatchLabel)
		}
		if v.ConfidenceLabel != copyConfidenceLow {
			t.Errorf("confidence is %q", v.ConfidenceLabel)
		}
	})

	t.Run("a row with no match at all says so", func(t *testing.T) {
		r := base
		r.State, r.MatchBasis, r.LineID = "unmatched", "none", nil
		v := statementRowView(r, "imp", false)
		if v.MatchLabel != copyNoMatch || v.Note != copyPossibleNew {
			t.Errorf("match %q, note %q", v.MatchLabel, v.Note)
		}
	})
}

func TestStatementView(t *testing.T) {
	r := statementRow{
		ImportID: "imp", OriginalFilename: "april.csv", Status: "review", Version: 4,
		Headers:   []string{"Ref", "Supplier", "Amount"},
		ColumnMap: map[string]int{"reference": 0, "received": 2},
		TotalRows: 38, PeriodStart: sp("2026-04-01"), PeriodEnd: sp("2026-04-30"),
		ConfirmedCount: 30, SuggestedCount: 2, UnmatchedCount: 1, ToCreateCount: 3,
		AlreadyRecordedCount: 2, IgnoredCount: 0,
		SampleRows: [][]string{{"", "Sandals", "540.00"}, {"SRB-1", "  ", "118.50"}},
		AsOfDate:   "2026-11-22",
	}
	v := statementView(r)
	if v.Title != "Reconcile · April 2026 statement" {
		t.Errorf("title is %q", v.Title)
	}
	// Settled rows only: a suggestion is not matched until the advisor confirms it.
	if v.Subtitle != "38 imported · 35 matched · 3 to resolve" {
		t.Errorf("subtitle is %q", v.Subtitle)
	}
	if v.NeedYou != 3 || v.WillPay != 30 || v.WillCreate != 3 {
		t.Errorf("counts are %d / %d / %d", v.NeedYou, v.WillPay, v.WillCreate)
	}
	// The first NON-BLANK sample per column, skipping whitespace-only cells.
	want := []string{"SRB-1", "Sandals", "540.00"}
	for i := range want {
		if v.Samples[i] != want[i] {
			t.Errorf("samples are %v, want %v", v.Samples, want)
			break
		}
	}
	if v.Selections[0] != "reference" || v.Selections[2] != "received" {
		t.Errorf("selections are %v", v.Selections)
	}

	// A status this screen does not know reads as review rather than as itself.
	r.Status = "sideways"
	if statementView(r).Status != "review" {
		t.Error("an unknown status is not treated as review")
	}
	// Nothing to resolve says so in words.
	r.Status, r.SuggestedCount, r.UnmatchedCount = "reconciled", 0, 0
	r.IgnoredCount = 2
	if got := statementView(r).Subtitle; got != "38 imported · 35 matched · 2 set aside · nothing to resolve" {
		t.Errorf("subtitle is %q", got)
	}
}

func TestStatementListView(t *testing.T) {
	out := statementListView([]statementListRow{
		{ImportID: "a", OriginalFilename: "april.csv", Status: "review", TotalRows: 1234,
			MatchedRows: 30, PeriodStart: sp("2026-04-01"), PeriodEnd: sp("2026-04-30"), CreatedOn: "2026-05-02"},
		{ImportID: "b", OriginalFilename: "march.csv", Status: "reconciled", TotalRows: 1,
			MatchedRows: 1, CreatedOn: "2026-04-02"},
	})
	// Grouped, and the matched count only once it is final.
	if out[0].RowsLabel != "1,234 rows" {
		t.Errorf("rows label is %q", out[0].RowsLabel)
	}
	if out[1].RowsLabel != "1 row · 1 matched" {
		t.Errorf("reconciled rows label is %q", out[1].RowsLabel)
	}
	if out[0].Label != "April 2026 statement" || out[1].Label != "march.csv" {
		t.Errorf("labels are %q and %q", out[0].Label, out[1].Label)
	}
	if out[0].StatusChip != "proposal" || out[1].StatusChip != "booked" {
		t.Errorf("chips are %q and %q", out[0].StatusChip, out[1].StatusChip)
	}
	if out[0].UploadedLabel != "May 2, 2026" {
		t.Errorf("uploaded label is %q", out[0].UploadedLabel)
	}
}

func ids(rows []statementRowItem) []string {
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.RowID
	}
	return out
}
