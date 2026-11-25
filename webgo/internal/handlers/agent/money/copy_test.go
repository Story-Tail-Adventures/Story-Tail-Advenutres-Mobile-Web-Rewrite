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

	// §3.7.5 Import and §3.7.6 Reconciliation (STATEMENT_COPY)
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "importTitle", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "importSubtitle", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "whereFileLabel", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "whereFileBody", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "step1Title", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "step2Title", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "step2Waiting", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "dropTitle", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "dropHint", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "uploadButton", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "duplicateOpen", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "pastTitle", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "pastEmpty", page: "agent/money/import.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "pastTableLabel", page: "agent/money/import.html"},

	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "mapIntro", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "mapTableLabel", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "remapWarning", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "useDifferentFile", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "backToStatement", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "statementDateLabel", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "statementDateHint", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "changeColumns", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "discardLabel", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "markReconciled", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "colStatementRow", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "colMatch", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "colConfidence", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "colAmount", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "colAction", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "rowsTableLabel", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "resolve", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "notFoundTitle", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "notFoundBody", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "backToImport", page: "agent/money/statement.html"},

	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "useSuggestionTitle", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "useSuggestion", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "matchTitle", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "matchHint", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "matchButton", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "candidatesEmpty", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createTitle", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createHint", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createTripSearch", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createTripPlaceholder", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createTripNone", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createTripChange", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createSupplierLabel", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createGrossLabel", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createRateLabel", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createButton", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "ignoreTitle", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "ignoreHint", page: "agent/money/resolve.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "ignoreButton", page: "agent/money/resolve.html"},

	// What Go chooses between.
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "noFile", goValue: copyNoFile},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "tooBig", goValue: copyTooBig},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "notCsv", goValue: copyNotCsv},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "duplicate", goValue: copyDuplicate},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "uploadFailed", goValue: copyUploadFailed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "mapFailed", goValue: copyMapFailed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "mapNeedsReceived", goValue: copyMapNeedsReceived},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "mapNeedsDate", goValue: copyMapNeedsDate},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "statusMapping", goValue: copyStatusMapping},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "statusReview", goValue: copyStatusReview},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "statusReconciled", goValue: copyStatusReconciled},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "confidenceHigh", goValue: copyConfidenceHigh},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "confidenceMedium", goValue: copyConfidenceMedium},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "confidenceLow", goValue: copyConfidenceLow},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "auto", goValue: copyAuto},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "matched", goValue: copyMatched},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "newLine", goValue: copyNewLine},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "setAside", goValue: copySetAside},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "alreadyRecorded", goValue: copyAlreadyRecorded},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "noMatch", goValue: copyNoMatch},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "possibleNew", goValue: copyPossibleNew},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "duplicateRow", goValue: copyDuplicateRow},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "checkSuggestion", goValue: copyCheckSuggestion},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "stale", goValue: copyStatementStale},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "notOpen", goValue: copyNotOpen},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "reconcileFailed", goValue: copyReconcileFailed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "reconcileUnsure", goValue: copyReconcileUnsure},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "rowNeedsYouAgain", goValue: copyRowNeedsYouAgain},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "discardFailed", goValue: copyDiscardFailed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "lineUnavailable", goValue: copyLineUnavailable},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "tripGone", goValue: copyTripGone},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "supplierGone", goValue: copyStatementSupplierGone},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "notAllowed", goValue: copyNotAllowed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "resolveFailed", goValue: copyResolveFailed},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createNeedsTrip", goValue: copyCreateNeedsTrip},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createNeedsGross", goValue: copyCreateNeedsGross},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "createNeedsRate", goValue: copyCreateNeedsRate},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "resolveTitle", goValue: copyResolveTitle},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "tripNotAvailable", goValue: copyTripNotAvailable},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "ignoreColumn", goValue: copyIgnoreColumn},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldReference", goValue: copyFieldReference},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldSupplier", goValue: copyFieldSupplier},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldTraveler", goValue: copyFieldTraveler},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldGross", goValue: copyFieldGross},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldReceived", goValue: copyFieldReceived},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldFee", goValue: copyFieldFee},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "fieldPaidOn", goValue: copyFieldPaidOn},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "autoChip", goValue: copyAutoChip},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "manualChip", goValue: copyManualChip},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "working", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "discardTitle", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "discardBody", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "discardConfirm", page: "agent/money/statement.html"},
	{file: "lib/agent/content.ts", obj: "STATEMENT_COPY", key: "reconcileConfirmTitle", page: "agent/money/statement.html"},

	// ── §3.11 Reporting (REPORTS_COPY, LEAD_SOURCES_COPY) ──────────────────────
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hubTitle", page: "agent/money/reports.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hubSubtitle", page: "agent/money/reports.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "backToHub", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "periodLabel", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "exportLabel", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "total", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "trackingSince", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsTracking", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "funnelTracking", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueTitle", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueSubtitle", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "basisLabel", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueTableCaption", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colMonth", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colLastYear", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "thisYear", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "lastYear", page: "agent/money/reports-revenue.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "suppliersTitle", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "suppliersSubtitle", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "suppliersNote", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "suppliersEmpty", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "suppliersTableCaption", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colSupplier", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colOwed", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colShare", page: "agent/money/reports-suppliers.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "destinationsTitle", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "destinationsSubtitle", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "destinationsNote", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "destinationsEmpty", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "destinationsTableCaption", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colDestination", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colValue", page: "agent/money/reports-destinations.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsTitle", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsSubtitle", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsNote", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsTableCaption", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "cohortLabel", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colRank", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colClient", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colLifetime", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colCommission", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colCohort", page: "agent/money/reports-clients.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "funnelTitle", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "funnelNote", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "funnelEmpty", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "funnelTableCaption", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colStage", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colReached", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colPctOfInquiries", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colStillOpen", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colCancelled", page: "agent/money/reports-funnel.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "pipelineTitle", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "pipelineSubtitle", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "tileOpen", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "tileWeighted", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "tileWeightedSub", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "byStage", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "weightsShared", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "weightsHint", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "byMonth", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "byMonthSub", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "byMonthTableCaption", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "monthNow", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colMonth2", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colWeightedValue", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "pipelineEmpty", page: "agent/money/reports-pipeline.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "exportTitle", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "exportSubtitle", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "generateTitle", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "typeLabel", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "fromLabel", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "toLabel", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hintLedger", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hintTrips", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hintMilestones", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "hintClients", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "contactLabel", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "contactHint", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "downloadLabel", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "csvNote", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "recentTitle", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "recentEmpty", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "recentNote", page: "agent/money/reports-export.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "periodYtd", goValue: copyPeriodYtd},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "period12mo", goValue: copyPeriod12mo},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "periodQtd", goValue: copyPeriodQtd},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "exportFailed", goValue: copyExportFailed},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "basisBooked", goValue: copyBasisBooked},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "basisReceived", goValue: copyBasisReceived},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueBookedNote", goValue: copyRevenueBookedNote},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueReceivedNote", goValue: copyRevenueReceivedNote},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueEmptyBooked", goValue: copyRevenueEmptyBooked},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "revenueEmptyReceived", goValue: copyRevenueEmptyRecvd},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "compareShow", goValue: copyCompareShow},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "compareHide", goValue: copyCompareHide},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colBooked", goValue: copyColBooked},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colReceived", goValue: copyColReceived},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colTrips", goValue: copyColTrips},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "colPayments", goValue: copyColPayments},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "noPrior", goValue: noFigure},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "noDestination", goValue: copyNoDestination},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsEmpty", goValue: copyClientsEmpty},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "clientsCohortEmpty", goValue: copyClientsCohortEmpty},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "cohortAll", goValue: copyCohortAll},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "noCohort", goValue: copyNoCohort},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "bookDaysNone", goValue: copyBookDaysNone},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "pastStart", goValue: copyPastStart},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "later", goValue: copyRptLater},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "undated", goValue: copyRptUndated},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "typeLedger", goValue: copyTypeLedger},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "typeTrips", goValue: copyTypeTrips},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "typeMilestones", goValue: copyTypeMilestones},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "typeClients", goValue: copyTypeClients},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "runAgain", goValue: copyRunAgain},
	{file: "lib/agent/reportsCopy.ts", obj: "REPORTS_COPY", key: "withContact", goValue: copyWithContact},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "title", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "empty", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "chartLabel", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colSource", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colLeads", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colClients", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colOpen", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colClosed", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "campaignsTitle", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "colCampaign", page: "agent/money/reports-leads.html"},
	{file: "lib/agent/reportsCopy.ts", obj: "LEAD_SOURCES_COPY", key: "note", page: "agent/money/reports-leads.html"},

	// ── §3.12 Agent Profile & Settings (SETTINGS_COPY) ─────────────────────────
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "pageTitle", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "tabsLabel", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "loadFailed", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "saved", goValue: copySettingsSaved},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "nothingChanged", goValue: copyNothingChanged},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY", key: "saveFailed", goValue: copySettingsFailed},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "title", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "sub", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "photo", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "photoHint", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "upload", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "remove", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "name", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "pronouns", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "pronounsHint", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "email", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "emailHint", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "phone", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "bio", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "bioHint", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "links", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "linksHint", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "preview", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "save", page: "agent/money/settings-profile.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "nameRequired", goValue: copyNameRequired},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "photoSaved", goValue: copyPhotoSaved},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "photoRemoved", goValue: copyPhotoRemoved},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "previewRole", goValue: copyPreviewRole},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.profile", key: "photoUnreadable", goValue: copyPhotoNeedsBrowser},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "title", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "sub", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "hoursTitle", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "hoursSub", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "timeZone", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "from", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "to", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "replyTime", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "replyTimeHint", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "weekPicture", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "save", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "awayTitle", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "awaySub", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "awayEmpty", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "schedule", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "edit", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "firstDay", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "lastDay", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "label", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "labelHint", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "autoReply", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "autoReplyHint", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "autoReplyText", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "cancel", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "saveAway", page: "agent/money/settings-availability.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "dayOff", goValue: copyDayOff},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "now", goValue: copyAwayNow},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "back", goValue: copyAwayBack},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "delete", goValue: copyAwayRemove},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "dialogNew", goValue: copyDialogNew},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "dialogEdit", goValue: copyDialogEdit},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "confirmDelete", goValue: copyConfirmDelete},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "confirmBack", goValue: copyConfirmBack},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.availability", key: "autoReplyOn", goValue: copyAutoReplyOn},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "title", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "sub", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "trigger", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "email", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "push", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "restTitle", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "restBody", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "restLink", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "emailNote", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "pushNote", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "save", page: "agent/money/settings-notifications.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "clientMessages", goValue: copyClientMessages},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "clientMessagesHint", goValue: copyClientMessagesHint},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "quoteRequests", goValue: copyQuoteRequests},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.notifications", key: "quoteRequestsHint", goValue: copyQuoteRequestsHint},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "title", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "sub", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "edit", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "hint", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "insert", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "preview", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "sampleBody", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "locked", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "reset", page: "agent/money/settings-signature.html"},
	{file: "lib/agent/settingsCopy.ts", obj: "SETTINGS_COPY.signature", key: "save", page: "agent/money/settings-signature.html"},

	// The §5 states and the pagination both pages carry.
	{file: "lib/agent/content.ts", obj: "CLIENT_COPY", key: "paginationPrev", page: "agent/money/ledger.html"},
	{file: "lib/agent/content.ts", obj: "CLIENT_COPY", key: "paginationNext", page: "agent/money/ledger.html"},
}

// tsObject slices out `export const OBJ = { ... } as const;` — content.ts holds several copy
// objects with the same keys (every list has an emptyTitle), so a bare key search would read
// another screen's words.
func tsObject(t *testing.T, src, obj string) string {
	t.Helper()
	// A dotted path names a nested object: SETTINGS_COPY.profile is the `profile: { … }`
	// inside SETTINGS_COPY, and a bare key search would otherwise read another tab's words
	// (every one of the four has a `title`).
	if top, sub, nested := strings.Cut(obj, "."); nested {
		return tsNested(t, tsObject(t, src, top), sub)
	}
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

// tsNested slices `  key: { … }` out of an object, by matching braces.
func tsNested(t *testing.T, src, key string) string {
	t.Helper()
	open := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(key) + `:\s*\{`).FindStringIndex(src)
	if open == nil {
		t.Fatalf("no nested object %q", key)
	}
	depth := 1
	for i := open[1]; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return src[open[1]:i]
			}
		}
	}
	t.Fatalf("nested object %q does not end", key)
	return ""
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
