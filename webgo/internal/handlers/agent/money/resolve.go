package money

import (
	"context"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"unicode"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// 3.7.6's Resolve, for one statement row — a port of
// import/[importId]/rows/[rowId]/page.tsx and StatementRowResolve. The artboard draws a
// Resolve button and stops; this is where it goes. A PAGE rather than a dialog: four
// different decisions, one of which needs a trip search, deserve the room and a URL that
// survives a reload.
//
// "Create a new line" needs a trip first. As on 3.7.4 the trip is a GET search that lands on
// ?trip=; from there the supplier is guessed from the statement's own wording, the gross
// comes from the row, and the rate is the supplier's default — or what the row's payment
// works out to when the supplier has none.

// foldName lowercases and strips accents and punctuation, so "Sandals Resorts®" and
// "sandals resorts" are the same words.
func foldName(v string) string {
	var b strings.Builder
	lastSpace := false
	for _, r := range strings.ToLower(v) {
		switch {
		case unicode.Is(unicode.Mn, r):
			// A combining mark: part of an accent that is being dropped.
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastSpace = false
		default:
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

// guessSupplier is the supplier the statement names: the one whose name appears in the
// statement's supplier text (or the other way round), and when several do, the LONGEST —
// "Royal Caribbean" over a "Royal" that would also match. Two of the same length is no guess
// at all, because picking either would be a coin toss on somebody's money.
func guessSupplier(groups []supplierGroup, text string) string {
	t := foldName(text)
	if len(t) < 3 {
		return ""
	}
	type hit struct {
		id   string
		name string
	}
	var hits []hit
	for _, g := range groups {
		for _, s := range g.Suppliers {
			name := foldName(s.Name)
			if len(name) <= 2 {
				continue
			}
			if strings.Contains(" "+t+" ", " "+name+" ") || strings.Contains(" "+name+" ", " "+t+" ") {
				hits = append(hits, hit{s.SupplierID, name})
			}
		}
	}
	if len(hits) == 0 {
		return ""
	}
	sort.SliceStable(hits, func(i, j int) bool { return len(hits[i].name) > len(hits[j].name) })
	if len(hits) > 1 && len(hits[0].name) == len(hits[1].name) {
		return ""
	}
	return hits[0].id
}

// resolveLoad is everything the page needs.
type resolveLoad struct {
	s          statement
	row        statementRowItem
	raw        statementLineRow
	candidates []candidateItem
	suppliers  []supplierGroup
	found      bool
	// suggestion is the matcher's line, labelled as ITSELF. Labelling it with the row's
	// match label put "New line · Kyoto" on a button that pays the old suggestion.
	suggestionLabel string
	suggestionNote  string
}

func (a *app) loadResolve(ctx context.Context, v visit, importID, rowID string) (resolveLoad, bool) {
	var (
		stRows    []statementRow
		lines     []statementLineRow
		cands     []candidateRow
		suppliers []supplierCatalogRow
	)
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_import", map[string]any{"p_import_id": importID}, &stRows)
	read(rs, "agent_commission_import_rows", map[string]any{"p_import_id": importID}, &lines)
	read(rs, "agent_commission_import_candidates", map[string]any{"p_import_id": importID, "p_row_id": rowID}, &cands)
	read(rs, "agent_suppliers", map[string]any{}, &suppliers)
	if rs.wait() != nil {
		return resolveLoad{}, false
	}
	if len(stRows) == 0 {
		return resolveLoad{}, true
	}
	out := resolveLoad{
		s:          statementView(stRows[0]),
		candidates: candidatesView(cands),
		suppliers:  groupSuppliers(suppliers),
	}
	for _, l := range lines {
		if l.RowID == rowID {
			out.raw, out.found = l, true
			break
		}
	}
	if !out.found {
		return out, true
	}
	out.row = statementRowView(out.raw, importID, false)
	// Not offered for a row already settled, or for a duplicate: its suggestion is the line
	// an earlier row already pays.
	switch out.raw.State {
	case "confirmed", "already_recorded", "duplicate":
	default:
		if label := lineLabelOf(out.raw); label != "" {
			out.suggestionLabel, out.suggestionNote = label, paymentNote(out.raw, false)
		}
	}
	return out, true
}

var resolveSpec = page.Spec{
	File:   "agent/money/resolve.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"not-found",
		"resolve", "back-link", "resolve-heading",
		"row-line", "row-amounts", "row-note",
		"form-error", "form-error-text",
		"suggestion", "suggestion-form", "suggestion-version", "suggestion-label", "suggestion-note",
		"match", "match-empty", "match-list",
		"create-chosen", "create-trip-name",
		"create-form-card", "create-form", "create-version", "create-trip-id",
		"create-supplier", "create-gross", "create-rate", "create-change",
		"create-pick", "create-pick-form", "create-pick-q", "create-pick-none",
		"create-pick-list", "create-trip-unavailable",
		"ignore-form", "ignore-version",
	),
	Repeats: map[string][]string{
		"candidate":     {"candidate-form", "candidate-version", "candidate-id", "candidate-title", "candidate-meta", "candidate-travel"},
		"supplier-pick": {"supplier-pick"},
		"trip-pick":     {"trip-pick-link", "trip-pick-title", "trip-pick-meta"},
	},
}

type resolveRender struct {
	version    int
	hasVersion bool
	message    string
}

func (a *app) serveResolve(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	a.renderResolve(w, r, v, resolveRender{}, http.StatusOK)
}

func (a *app) renderResolve(w http.ResponseWriter, r *http.Request, v visit, rend resolveRender, status int) {
	importID, rowID := r.PathValue("importId"), r.PathValue("rowId")
	var (
		load resolveLoad
		ok   = true
	)
	if v.canRead() && isUUID(importID) && isUUID(rowID) {
		load, ok = a.loadResolve(r.Context(), v, importID, rowID)
	}
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case !ok:
		st = stateRetry
	}
	// Nothing to resolve: a statement no longer in review, or a row against a line already
	// paid (resolving never changes that line). Back to the statement, not a dead form.
	if st == stateBody && load.found && (load.s.Status != "review" || load.raw.State == "already_recorded") {
		web.SeeOther(w, r, statementPath(importID))
		return
	}
	switch {
	case st != stateBody:
		status = statusFor(st)
	case !load.found:
		status = http.StatusNotFound
	case status == 0:
		status = http.StatusOK
	}

	doc := a.resolvePage.New()
	if fillFrame(doc, r, v, st) {
		a.fillResolve(r, v, doc, importID, rowID, load, rend)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func (a *app) fillResolve(r *http.Request, v visit, doc *page.Doc, importID, rowID string, load resolveLoad, rend resolveRender) {
	if !load.found {
		doc.Keep("not-found")
		doc.Remove("resolve")
		return
	}
	doc.Remove("not-found")
	doc.Keep("resolve")

	self := statementPath(importID) + "/rows/" + rowID
	version := load.s.Version
	if rend.hasVersion {
		version = rend.version
	}
	doc.URL("back-link", "href", statementPath(importID))
	doc.Text("resolve-heading", copyResolveTitle+" · Row "+itoa(load.row.RowNumber))
	doc.Text("row-line", load.row.StatementLine)
	doc.Text("row-amounts", joinDot([]string{load.row.AmountLabel, load.row.PaidOnLabel}))
	// Not repeated when the suggestion card below already says it.
	note := load.row.Note
	if note == load.suggestionNote {
		note = ""
	}
	textOrRemove(doc, "row-note", note)
	message(doc, "form-error", "form-error-text", rend.message)

	// ── Use the suggested match ─────────────────────────────────────────────
	if load.suggestionLabel == "" {
		doc.Remove("suggestion")
	} else {
		doc.Keep("suggestion")
		doc.URL("suggestion-form", "action", self)
		doc.Attr("suggestion-version", "value", itoa(version))
		doc.Text("suggestion-label", load.suggestionLabel)
		textOrRemove(doc, "suggestion-note", load.suggestionNote)
	}

	// ── Match a different line ──────────────────────────────────────────────
	doc.Keep("match")
	if len(load.candidates) == 0 {
		doc.Keep("match-empty")
		doc.Remove("match-list")
	} else {
		doc.Remove("match-empty")
		doc.Keep("match-list")
		doc.Repeat("candidate", len(load.candidates), func(i int, row *page.Row) {
			cnd := load.candidates[i]
			row.URL("candidate-form", "action", self)
			row.Attr("candidate-version", "value", itoa(version))
			row.Attr("candidate-id", "value", cnd.CommissionID)
			row.Text("candidate-title", cnd.Title)
			row.Text("candidate-meta", cnd.Meta)
			textOrRemove(row, "candidate-travel", cnd.TravelLabel)
		})
	}

	// ── Create a new line ───────────────────────────────────────────────────
	// An unreadable row has no figures to create a line from, so the money decisions are
	// not offered at all.
	canDecideMoney := load.raw.State != "unreadable"
	q := r.URL.Query()
	tripID := q.Get("trip")
	if !isUUID(tripID) {
		tripID = ""
	}
	var chosen *tripOverviewRow
	if canDecideMoney && tripID != "" {
		chosen = a.loadTripPick(r.Context(), v, tripID)
	}
	switch {
	case !canDecideMoney:
		// An unreadable row has no figures to create a line from.
		doc.Remove("create-chosen")
		doc.Remove("create-form-card")
		doc.Remove("create-pick")
	case chosen != nil:
		doc.Keep("create-chosen")
		doc.Text("create-trip-name", joinDot([]string{chosen.Title, chosen.ClientDisplayName}))
		doc.Keep("create-form-card")
		doc.URL("create-form", "action", self)
		doc.Attr("create-version", "value", itoa(version))
		doc.Attr("create-trip-id", "value", chosen.TripID)
		doc.URL("create-change", "href", self)
		doc.Remove("create-pick")
		fillCreateFields(doc, load)
	default:
		doc.Remove("create-chosen")
		doc.Remove("create-form-card")
		doc.Keep("create-pick")
		doc.URL("create-pick-form", "action", self)
		search := strings.TrimSpace(q.Get("q"))
		doc.Attr("create-pick-q", "value", search)
		// A ?trip= that does not resolve (archived, not this advisor's) falls back to the
		// search, and says why the form is not open.
		keepIf(doc, "create-trip-unavailable", tripID != "")
		trips, ok := a.searchTripsForLine(r.Context(), v, search)
		if !ok || len(trips) == 0 {
			doc.Keep("create-pick-none")
			doc.Remove("create-pick-list")
		} else {
			doc.Remove("create-pick-none")
			doc.Keep("create-pick-list")
			doc.Repeat("trip-pick", len(trips), func(i int, row *page.Row) {
				row.URL("trip-pick-link", "href", self+"?trip="+url.QueryEscape(trips[i].TripID))
				row.Text("trip-pick-title", trips[i].Title)
				row.Text("trip-pick-meta", trips[i].Meta)
			})
		}
	}

	// ── Set it aside ────────────────────────────────────────────────────────
	doc.URL("ignore-form", "action", self)
	doc.Attr("ignore-version", "value", itoa(version))
}

// fillCreateFields pre-fills what the row and the statement already say: the supplier the
// statement names, the row's own gross, and the supplier's usual rate — or, when it has
// none, the rate this payment works out to.
func fillCreateFields(doc *page.Doc, load resolveLoad) {
	supplierID := guessSupplier(load.suppliers, str(load.raw.SupplierText))
	// The <select> itself is kept as written; only its options are filled.
	doc.Keep("create-supplier")
	fillSupplierPicker(doc, flattenSuppliers(load.suppliers), supplierID, nil)

	gross := centsOr(load.raw.GrossCents, 0)
	doc.Attr("create-gross", "value", centsToDollars(gross))

	rate := ""
	if s, ok := findSupplier(load.suppliers, supplierID); ok && s.DefaultCommissionPct.Set {
		rate = trimZeros(toFixed(s.DefaultCommissionPct.Value, 2))
	} else {
		rate = impliedRate(centsOr(load.raw.ReceivedCents, 0), centsOr(load.raw.FeeCents, 0), gross)
	}
	doc.Attr("create-rate", "value", rate)
}

// loadTripPick reads the trip a new line would go on, by id: live and this advisor's, or nil.
func (a *app) loadTripPick(ctx context.Context, v visit, tripID string) *tripOverviewRow {
	var trips []tripOverviewRow
	rs := a.reads(ctx, v)
	read(rs, "agent_trip_overview", map[string]any{"p_trip_id": tripID}, &trips)
	if rs.wait() != nil || len(trips) == 0 {
		return nil
	}
	return &trips[0]
}

// resolveRefusals maps the function's outcomes to the sentence each deserves.
var resolveRefusals = map[string]string{
	"line_unavailable":   copyLineUnavailable,
	"trip_not_found":     copyTripGone,
	"supplier_not_found": copyStatementSupplierGone,
	"not_allowed":        copyNotAllowed,
	"not_open":           copyNotOpen,
}

// resolveRow is 3.7.6's Resolve: confirm, match, create or ignore one row.
func (a *app) resolveRow(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	importID, rowID := r.PathValue("importId"), r.PathValue("rowId")
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	version, hasVersion := parseIntJS(f.Get("version"))
	echo := resolveRender{version: version, hasVersion: hasVersion}
	refuse := func(msg string) {
		echo.message = msg
		a.renderResolve(w, r, v, echo, http.StatusUnprocessableEntity)
	}
	action := f.Get("action")
	if importID == "" || rowID == "" || !hasVersion {
		refuse(copyResolveFailed)
		return
	}

	body := map[string]any{
		"op": "resolve", "importId": importID, "rowId": rowID,
		"action": action, "expectedVersion": version,
	}
	switch action {
	case "match":
		commissionID := f.Get("commissionId")
		if commissionID == "" {
			refuse(copyLineUnavailable)
			return
		}
		body["commissionId"] = commissionID
	case "create":
		tripID := f.Get("tripId")
		if tripID == "" {
			refuse(copyCreateNeedsTrip)
			return
		}
		gross, grossOK := dollarsToCents(f.Get("gross"))
		if !grossOK || strings.TrimSpace(f.Get("gross")) == "" {
			refuse(copyCreateNeedsGross)
			return
		}
		rate, rateOK := parseRate(f.Get("rate"))
		if !rateOK {
			refuse(copyCreateNeedsRate)
			return
		}
		body["tripId"] = tripID
		body["supplierId"] = f.Get("supplierId")
		body["grossCents"] = int64(gross)
		body["commissionPct"] = rate
	}

	res := a.call(r, v, "commission-import", body)
	out := web.FromResult(res, copyResolveFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, statementPath(importID))
			return
		}
		if out.Conflict {
			refuse(copyStatementStale)
			return
		}
		refuse(out.Message)
		return
	}
	outcome := decodeImportOutcome(res.Data).Outcome
	if outcome != "resolved" {
		if msg, known := resolveRefusals[outcome]; known {
			refuse(msg)
			return
		}
		refuse(copyResolveFailed)
		return
	}
	web.SeeOther(w, r, statementPath(importID))
}
