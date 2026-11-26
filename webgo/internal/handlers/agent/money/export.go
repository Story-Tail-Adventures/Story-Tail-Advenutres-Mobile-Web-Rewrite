package money

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.7.2's Export — the ledger as a CSV, filtered exactly as the screen was. A port of
// app/(agent)/agent/commission/ledger/export/route.ts.
//
// DEFERRED FROM STAGE 1 UNTIL IT COULD BE AUDITED. A ledger download carries every client's
// name, and Data-Model §18.3 audits "any bulk client list export". agent_export_commission
// writes that audit row in the same database call that returns the rows, so no file leaves
// without its record. This handler only shapes the response; it builds no CSV of its own,
// so the formula-injection guard in _shared/commission.ts toCsv still writes every cell.
//
// A GET THAT WRITES AN AUDIT ROW is deliberate, and it is why the buttons that point here
// are plain links the browser downloads rather than prefetched ones.

// exportReply is the function's 200 body. Only `csv` is read.
type exportReply struct {
	Outcome  string  `json:"outcome"`
	RowCount int     `json:"rowCount"`
	CSV      *string `json:"csv"`
}

// exportSignIn is where a signed-out caller lands: the ledger they came from, not the file.
const exportSignIn = "/login?next=%2Fagent%2Fcommission%2Fledger"

func (a *app) serveLedgerExport(w http.ResponseWriter, r *http.Request) {
	// A GET that writes an audit row must not be triggerable from another site: SameSite=Lax
	// cookies ride along on a cross-site top-level navigation, so a link elsewhere could make
	// a signed-in advisor's browser "export". Browsers say where a request came from.
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		w.Header().Set("Cache-Control", web.NoStore)
		w.WriteHeader(http.StatusForbidden)
		return
	}
	st, _ := session.From(r.Context())
	q := ledgerQueryFrom(r.URL.Query())
	// Every page of the current filters: the export URL carries no `page`, and a stray one
	// is dropped here too.
	statuses := q.Statuses
	if statuses == nil {
		statuses = []string{}
	}
	res := a.d.API.Call(r.Context(), "agent-commission", st.AccessToken, api.Input{
		Method: http.MethodPost,
		Body: map[string]any{
			"op": "export",
			"filters": map[string]any{
				"statuses":   statuses,
				"supplierId": nilable(q.SupplierID),
				"tripId":     nilable(q.TripID),
				"travelFrom": nilable(q.TravelFrom),
				"travelTo":   nilable(q.TravelTo),
			},
		},
	})
	if !res.OK {
		if res.Kind == api.Unauthenticated {
			web.SeeOther(w, r, exportSignIn)
			return
		}
		exportFailed(w)
		return
	}
	var reply exportReply
	if err := json.Unmarshal(res.Data, &reply); err != nil || reply.CSV == nil {
		// No CSV in a 200 is a function that changed shape, not an empty ledger (an empty
		// ledger still has a header row). It is a failure, not a blank file.
		exportFailed(w)
		return
	}

	// The date in the file name is just a label for the advisor's downloads folder, and it
	// is the UTC day, as `new Date().toISOString().slice(0, 10)` was.
	stamp := clock().UTC().Format(time.DateOnly)
	h := w.Header()
	h.Set("Content-Type", "text/csv; charset=utf-8")
	h.Set("Content-Disposition", `attachment; filename="commission-ledger-`+stamp+`.csv"`)
	h.Set("Cache-Control", web.NoStore)
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	// A byte-order mark first: without it Excel reads UTF-8 as Windows-1252 and "Roatán"
	// arrives as "RoatÃ¡n". Sheets and Numbers ignore it.
	_, _ = w.Write([]byte("\ufeff" + *reply.CSV))
}

// exportFailed says so in words: this is a navigation, so the advisor is looking at the
// answer rather than at the page they left.
func exportFailed(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Type", "text/plain; charset=utf-8")
	h.Set("Cache-Control", web.NoStore)
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(copyExportFailed))
}

// serveExportHead answers HEAD. Without it the mux would answer a HEAD by running the GET —
// an audited export with the body thrown away. Nothing needs to HEAD this.
func serveExportHead(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", http.MethodGet)
	w.Header().Set("Cache-Control", web.NoStore)
	w.WriteHeader(http.StatusMethodNotAllowed)
}
