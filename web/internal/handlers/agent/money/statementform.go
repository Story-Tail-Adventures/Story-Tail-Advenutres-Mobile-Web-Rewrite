package money

import (
	"strings"
)

// §3.7.5 / §3.7.6's form rules — a port of web/lib/agent/statementForm.ts.
//
// The Edge Function (_shared/statement.ts) checks the same rules again. This layer exists so
// the advisor reads the sentence against the right field instead of a rejection at the top.

// statementFields are the platform fields a statement column can hold, in the order the
// select offers them.
var statementFields = []option{
	{"reference", copyFieldReference},
	{"supplier", copyFieldSupplier},
	{"traveler", copyFieldTraveler},
	{"gross", copyFieldGross},
	{"received", copyFieldReceived},
	{"fee", copyFieldFee},
	{"paid_on", copyFieldPaidOn},
}

func statementFieldLabel(value string) (string, bool) {
	for _, f := range statementFields {
		if f.Value == value {
			return f.Label, true
		}
	}
	return "", false
}

func isStatementField(value string) bool {
	_, ok := statementFieldLabel(value)
	return ok
}

// columnOptions are the select's: every field, then "ignore" as the EMPTY value, which is
// what an unmapped column is.
func columnOptions() []option {
	out := make([]option, 0, len(statementFields)+1)
	out = append(out, option{"", copyIgnoreColumn})
	return append(out, statementFields...)
}

// selectionsFromMap turns the STORED map (field → header index) into one choice per HEADER,
// which is the shape the screen works in. An index the headers no longer have is dropped
// rather than drawn against the wrong column.
func selectionsFromMap(stored map[string]int, headerCount int) []string {
	out := make([]string, headerCount)
	for field, idx := range stored {
		if isStatementField(field) && idx >= 0 && idx < headerCount {
			out[idx] = field
		}
	}
	return out
}

// mapValues is the map form's state: one selection per header, and the fallback date.
type mapValues struct {
	Selections    []string
	StatementDate string
}

// mapErrors are the map form's two places to put a sentence.
type mapErrors struct {
	Map           string
	StatementDate string
}

func (e mapErrors) any() bool { return e.Map != "" || e.StatementDate != "" }

// validateMap turns the selections back into field → header index, or names the first thing
// wrong with them: a field chosen for two columns, no commission column, or neither a
// paid-on column nor a statement date.
//
// statementDate comes back EMPTY when a paid_on column was chosen: the column wins, and
// sending both would leave the function to guess which the advisor meant.
func validateMap(values mapValues) (columnMap map[string]int, statementDate string, errs mapErrors) {
	columnMap = map[string]int{}
	for idx, field := range values.Selections {
		if field == "" || !isStatementField(field) {
			continue
		}
		if _, twice := columnMap[field]; twice {
			label, _ := statementFieldLabel(field)
			return nil, "", mapErrors{Map: statementFieldTwice(label)}
		}
		columnMap[field] = idx
	}
	if _, ok := columnMap["received"]; !ok {
		return nil, "", mapErrors{Map: copyMapNeedsReceived}
	}
	date := strings.TrimSpace(values.StatementDate)
	if _, ok := columnMap["paid_on"]; !ok {
		if !isISODate(date) {
			return nil, "", mapErrors{StatementDate: copyMapNeedsDate}
		}
		return columnMap, date, mapErrors{}
	}
	return columnMap, "", mapErrors{}
}

// mapValuesFromForm reads the map form's fields: col-0, col-1, … and statementDate.
func mapValuesFromForm(f form, headerCount int) mapValues {
	out := mapValues{Selections: make([]string, headerCount), StatementDate: f.Get("statementDate")}
	for i := range out.Selections {
		out.Selections[i] = f.Get("col-" + itoa(i))
	}
	return out
}

// clampHeaderCount reads a posted header count. It sizes an array and a hidden field can be
// edited, so it is bounded on both sides rather than trusted.
func clampHeaderCount(raw string) (int, bool) {
	n, ok := parseIntJS(raw)
	if !ok || n < 1 || n > 60 {
		return 0, false
	}
	return n, true
}

// maxStatementBytes is half a megabyte: the Edge Function's cap, and well under what a form
// post can carry.
const maxStatementBytes = 512 * 1024

// notCSVName is the extensions an advisor most often uploads by mistake. The function reads
// the bytes and decides for itself; this is so the answer is instant and names the fix.
func notCSVName(filename string) bool {
	lower := strings.ToLower(filename)
	for _, ext := range []string{".xlsx", ".xls", ".numbers", ".pdf"} {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// columnOptionSlots pairs each column-select option with the slot that marks it in the page.
// The list is FIXED — "ignore" plus statementFields — so the options live in the HTML and
// only the chosen one is touched; a repeat cannot nest inside the per-column repeat.
var columnOptionSlots = func() []struct{ value, slot string } {
	opts := columnOptions()
	slots := []string{
		"opt-ignore", "opt-reference", "opt-supplier", "opt-traveler",
		"opt-gross", "opt-received", "opt-fee", "opt-paid-on",
	}
	out := make([]struct{ value, slot string }, len(opts))
	for i, o := range opts {
		out[i] = struct{ value, slot string }{o.Value, slots[i]}
	}
	return out
}()

// columnOptionSlotNames are those slots, for the page's repeat declaration.
func columnOptionSlotNames() []string {
	out := make([]string, 0, len(columnOptionSlots))
	for _, o := range columnOptionSlots {
		out = append(out, o.slot)
	}
	return out
}
