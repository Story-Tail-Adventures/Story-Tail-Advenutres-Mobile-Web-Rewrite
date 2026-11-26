package money

import (
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	xhtml "golang.org/x/net/html"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// Copy moves byte for byte (CLAUDE.md; check_copy_parity.py's idea). While web/ exists, this
// reads the Next sources' copy objects and checks each string is in the Go page that shows it
// (or in a Go constant). Static copy lives in the page files; copy Go chooses between lives
// in Go. Either way it must equal the content.ts value exactly.

// copyCase: the TS object key in file must appear verbatim in page (or equal goValue).
type copyCase struct {
	file    string // under web/
	obj     string // the exported object the key belongs to, e.g. COMMISSION_COPY
	key     string // the key, written `key: "value"` in that object
	page    string // under pages/, "" when Go holds the string
	goValue string
}

var copyCases = []copyCase{
	// §3.7.1 Dashboard (COMMISSION_COPY)
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "title", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "subtitle", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "importLabel", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "exportLabel", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tileYtd", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tileUpcoming", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tileAtRisk", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tileRate", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "trendTitle", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "trendEmpty", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "trendTableCaption", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "trendMonth", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "trendAmount", page: "agent/money/commission.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "rateUnavailable", goValue: copyRateUnavailable},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "nothingDisputed", goValue: copyNothingDisputed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "nothingUpcoming", goValue: copyNothingUpcoming},

	// §3.7.2 Ledger
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "ledgerTitle", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "ledgerSubtitle", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "addLineLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterStatusLegend", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierAll", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "travelFromLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "travelToLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "applyFilters", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "clearFilters", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tripFilterRemove", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colTrip", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colSupplier", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colTravel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colGross", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colRate", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colCommission", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "colStatus", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "ledgerTableLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "ledgerPagesLabel", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tripFilterPrefix", goValue: copyTripFilterPrefix},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tripFilterUnnamed", goValue: copyTripFilterUnnamed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyTitle", goValue: copyEmptyTitle},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyBody", goValue: copyEmptyBody},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyFilteredTitle", goValue: copyEmptyFilteredTitle},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyFilteredBody", goValue: copyEmptyFilteredBody},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyTripTitle", goValue: copyEmptyTripTitle},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "emptyTripBody", goValue: copyEmptyTripBody},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "noDates", goValue: copyNoDates},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "archivedTrip", goValue: copyArchivedTrip},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "exportFailed", goValue: copyExportFailed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterExpected", goValue: copyFilterExpected},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterInvoiced", goValue: copyFilterInvoiced},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterReceived", goValue: copyFilterReceived},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterDisputed", goValue: copyFilterDisputed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "filterLost", goValue: copyFilterLost},

	// §3.7.3 Detail / Edit, and the line form §3.7.4 shares with it.
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "backToLedger", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "lineNotFoundTitle", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "lineNotFoundBody", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "markReceived", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "receivedAmountLabel", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "feeLabel", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "feeHint", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "receivedOnLabel", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "recordAsLabel", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "recordReceived", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "recordDisputed", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "savePayment", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "linkInteletravel", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "linkDeferred", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "expectationTitle", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "removeLine", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "removeBody", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "removeConfirm", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "removeNotAllowed", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "clearsPaymentConfirm", page: "agent/money/line.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "openTrip", goValue: copyOpenTrip},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "archivedTripNote", goValue: copyArchivedTripNote},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "expectationNoEnd", goValue: copyExpectationNoEnd},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "expectationNotBooked", goValue: copyExpectationNotBooked},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "removeRefused", goValue: copyRemoveRefused},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "clearsPayment", goValue: copyClearsPayment},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "stale", goValue: copyLineStale},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "failed", goValue: copySaveFailed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "duplicateReference", goValue: copyDuplicateReference},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierGone", goValue: copySupplierGone},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierRequired", goValue: copySupplierRequired},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "grossInvalid", goValue: copyGrossInvalid},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "rateInvalid", goValue: copyRateInvalid},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "lagInvalid", goValue: copyLagInvalid},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "amountInvalid", goValue: copyAmountInvalid},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "badDate", goValue: copyBadDate},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "receivedNeedsAmount", goValue: copyReceivedNeedsAmount},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierNoLongerListed", goValue: copySupplierNoLongerListed},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "termsAfterTravel", goValue: copyTermsAfterTravel},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "termsAtBooking", goValue: copyTermsAtBooking},

	// §3.7.4 Add
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "addTitle", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "addSubtitle", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "pickTripTitle", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "pickTripSearch", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "pickTripPlaceholder", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "pickTripNone", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "pickTripChange", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "noSuppliers", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tripNotAvailableTitle", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "tripNotAvailableBody", page: "agent/money/add.html"},
	// The form's own labels, drawn by both pages.
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "supplierPlaceholder", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "grossLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "grossHint", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "rateLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "rateHint", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "expectedLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "expectedHint", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "termsLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "lagLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "statusLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "statusHint", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "referenceLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "referenceHint", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "notesLabel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "saveLine", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "cancel", page: "agent/money/add.html"},
	{file: "lib/agent/content.ts", obj: "COMMISSION_COPY", key: "saving", page: "agent/money/add.html"},

	// The §5 states and the pagination both pages carry.
	{file: "lib/agent/content.ts", obj: "CLIENT_COPY", key: "paginationPrev", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "CLIENT_COPY", key: "paginationNext", page: "agent/money/ledger.html"},
}

// tsObject slices out `export const OBJ = { ... } as const;` — content.ts holds several copy
// objects with the same keys (every list has an emptyTitle), so a bare key search would read
// another screen's words.
func tsObject(t *testing.T, src, obj string) string {
	t.Helper()
	start := regexp.MustCompile(`(?m)^export const ` + regexp.QuoteMeta(obj) + `\s*=\s*\{`).FindStringIndex(src)
	if start == nil {
		t.Fatalf("no object %q", obj)
	}
	rest := src[start[1]:]
	end := regexp.MustCompile(`(?m)^\} as const;`).FindStringIndex(rest)
	if end == nil {
		t.Fatalf("object %q does not end", obj)
	}
	return rest[:end[0]]
}

// tsString finds `key: "value"` (the value may start on the next line) and unquotes it.
func tsString(t *testing.T, src, key string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(key) + `:\s*\n?\s*("(?:[^"\\]|\\.)*")`)
	m := re.FindStringSubmatch(src)
	if m == nil {
		t.Errorf("%s: no string key %q", "content", key)
		return ""
	}
	v, err := strconv.Unquote(m[1])
	if err != nil {
		t.Errorf("%s: %v", key, err)
	}
	return v
}

// visibleText is every text node and attribute value in a page file, one per line, so a
// string in a comment (which the loader strips anyway) does not count as shipped copy.
func visibleText(t *testing.T, b []byte) string {
	t.Helper()
	doc, err := xhtml.Parse(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	var out strings.Builder
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		switch n.Type {
		case xhtml.TextNode:
			out.WriteString(n.Data + "\n")
		case xhtml.ElementNode:
			for _, a := range n.Attr {
				out.WriteString(a.Val + "\n")
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return out.String()
}

func TestCopyMatchesTheNextSources(t *testing.T) {
	webDir := filepath.Join("..", "..", "..", "..", "..", "web")
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6); the Go pages are the source of truth now")
	}
	sources := map[string]string{}
	pageText := map[string]string{}
	for _, c := range copyCases {
		if _, ok := sources[c.file]; !ok {
			b, err := os.ReadFile(filepath.Join(webDir, c.file))
			if err != nil {
				t.Fatal(err)
			}
			sources[c.file] = string(b)
		}
		want := tsString(t, tsObject(t, sources[c.file], c.obj), c.key)
		if c.page == "" {
			if c.goValue != want {
				t.Errorf("%s %s: Go has %q, Next has %q", c.file, c.key, c.goValue, want)
			}
			continue
		}
		if _, ok := pageText[c.page]; !ok {
			b, err := fs.ReadFile(pages.FS, c.page)
			if err != nil {
				t.Fatal(err)
			}
			pageText[c.page] = visibleText(t, b)
		}
		if !strings.Contains(pageText[c.page], want) {
			t.Errorf("%s does not carry %s %q byte for byte", c.page, c.key, want)
		}
	}
}
