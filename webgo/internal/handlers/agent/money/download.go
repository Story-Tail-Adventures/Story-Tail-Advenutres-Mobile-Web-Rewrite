package money

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.11's downloads — a port of app/(agent)/agent/reports/download/route.ts.
//
// `/download`, not `/export`: `/agent/reports/export` is the Export Center's own page.
//
// agent_report_export writes the audit row in the same database call that returns the rows,
// and runs the very SQL the screen read, so the file IS the screen. This handler only checks
// the request and shapes the response; it builds no CSV, so the formula-injection guard in
// the function's own toCsv still writes every cell.
//
// A GET THAT WRITES AN AUDIT ROW, reached by plain links (never prefetched ones), refused
// unless the browser says it came from here.

// exportableReports are the six with a per-report Export. An unknown one is a broken link,
// not a default: exporting a DIFFERENT report than the one asked for would be an audited
// file nobody wanted.
var exportableReports = []string{"revenue", "suppliers", "destinations", "clients", "funnel", "pipeline"}

// allowedFetchSites: this origin's own pages, or a link the advisor typed or bookmarked
// ("none"). Stricter than refusing "cross-site": a page on a sibling subdomain is
// "same-site", and an <img> there could otherwise run an audited export for a signed-in
// advisor. A browser too old to send the header is let through — the export still needs the
// session.
var allowedFetchSites = []string{"same-origin", "none"}

var csvFileName = regexp.MustCompile(`^[a-z0-9-]+\.csv$`)

// downloadReply is the function's 200 body.
type downloadReply struct {
	CSV      *string `json:"csv"`
	FileName *string `json:"fileName"`
}

func (a *app) serveReportDownload(w http.ResponseWriter, r *http.Request) {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && !slices.Contains(allowedFetchSites, site) {
		w.Header().Set("Cache-Control", web.NoStore)
		w.WriteHeader(http.StatusForbidden)
		return
	}
	st, _ := session.From(r.Context())
	q := r.URL.Query()

	// §3.11.8 Export Center: `type`, plus From/To, plus the contact switch for Clients. The
	// dates are passed through as typed; the function refuses a malformed or reversed range
	// in words, which is shown as it stands.
	if kind := q.Get("type"); kind != "" {
		if !slices.Contains(exportTypes, kind) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		body := map[string]any{"op": "center", "type": kind}
		if kind == "clients" {
			body["includeContact"] = q.Get("contact") == "1"
		} else {
			body["from"] = nilable(isoShape(q.Get("from")))
			body["to"] = nilable(isoShape(q.Get("to")))
		}
		a.sendExport(w, r, st, body, "/agent/reports/export")
		return
	}

	report := q.Get("report")
	if !slices.Contains(exportableReports, report) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	body := map[string]any{"op": "export", "report": report}
	// Lifetime value is lifetime and the pipeline is today: neither takes a period, and the
	// function refuses one.
	if !slices.Contains(noPeriodReports, report) {
		body["period"] = readPeriod(q.Get("period"))
	}
	if report == "revenue" {
		body["basis"] = readBasis(q.Get("basis"))
	}
	a.sendExport(w, r, st, body, reportHref(report))
}

// isoShape keeps a date SHAPED like one, as the Next route does: the function is the one
// that decides whether it is a real date, and its refusal says so in the advisor's words.
func isoShape(v string) string {
	if isoDateRE.MatchString(v) {
		return v
	}
	return ""
}

// sendExport is the one way a download leaves: an attachment named by the function, a
// byte-order mark for Excel, and no caching. A signed-out caller goes to sign in and back to
// the page they came from.
func (a *app) sendExport(w http.ResponseWriter, r *http.Request, st session.State, body map[string]any, back string) {
	res := a.d.API.Call(r.Context(), "agent-report", st.AccessToken,
		api.Input{Method: http.MethodPost, Body: body})
	if !res.OK {
		if res.Kind == api.Unauthenticated {
			web.SeeOther(w, r, "/login?next="+url.QueryEscape(back))
			return
		}
		// A refusal the function put in words (a reversed range, a missing date) is shown
		// as it stands: this is a navigation, so the advisor is looking at the answer.
		if res.Kind == api.Rejected && res.Detail != "" {
			h := w.Header()
			h.Set("Content-Type", "text/plain; charset=utf-8")
			h.Set("Cache-Control", web.NoStore)
			h.Set("X-Content-Type-Options", "nosniff")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(res.Detail))
			return
		}
		exportFailed(w)
		return
	}

	var reply downloadReply
	// No CSV or no file name in a 200 is a function that changed shape, not an empty report
	// (an empty report still has a header row). A failure, not a blank file.
	if err := json.Unmarshal(res.Data, &reply); err != nil || reply.CSV == nil || reply.FileName == nil ||
		!csvFileName.MatchString(*reply.FileName) {
		exportFailed(w)
		return
	}

	h := w.Header()
	h.Set("Content-Type", "text/csv; charset=utf-8")
	h.Set("Content-Disposition", `attachment; filename="`+*reply.FileName+`"`)
	h.Set("Cache-Control", web.NoStore)
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	// A byte-order mark first, so Excel reads UTF-8 ("Roatán", not "RoatÃ¡n").
	_, _ = w.Write([]byte("\ufeff" + *reply.CSV))
}
