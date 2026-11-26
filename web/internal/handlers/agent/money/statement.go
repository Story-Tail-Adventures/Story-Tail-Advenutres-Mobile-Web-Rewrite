package money

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screens 3.7.5 (Inteletravel CSV Import) and 3.7.6 (Reconciliation), ported from
// app/(agent)/agent/commission/import/ and lib/agent/statements.ts.
//
// ONE URL PER STATEMENT, whatever stage it is at, so the list and a bookmark always land in
// the right place: /import/{id} draws the column map while the statement has none, and the
// reconciliation table once it does. ?step=map reopens the map on a statement in review.
//
// ONLY `reconcile` CHANGES THE LEDGER. Upload stores the file and its rows; map, resolve and
// discard move the statement and nothing else. The one action that touches money says what
// it will do before it runs, and is refused while any row still needs the advisor.
//
// STALENESS IS READ OFF `conflict`, never off the function's English.

const importPath = "/agent/commission/import"

// ── The list (3.7.5 step 1) ─────────────────────────────────────────────────────────────

var importSpec = page.Spec{
	File:   "agent/money/import.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"upload-form", "upload-error", "upload-error-text", "upload-duplicate",
		"past-empty", "past-failed", "past-list",
	),
	Repeats: map[string][]string{
		"past": {"past-link", "past-label", "past-meta", "past-status"},
	},
}

// importRender is what one answer to the list page draws.
type importRender struct {
	items []statementListItem
	// ok is false when the list read failed; the upload card still works.
	ok bool
	// message and duplicateHref are the upload form's answer to the last POST.
	message       string
	duplicateHref string
}

func (a *app) serveImport(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	a.renderImport(w, r, v, importRender{}, http.StatusOK)
}

func (a *app) loadStatements(ctx context.Context, v visit) ([]statementListItem, bool) {
	var rows []statementListRow
	rs := a.reads(ctx, v)
	read(rs, "agent_commission_imports", map[string]any{}, &rows)
	if rs.wait() != nil {
		return nil, false
	}
	return statementListView(rows), true
}

func (a *app) renderImport(w http.ResponseWriter, r *http.Request, v visit, rend importRender, status int) {
	if v.canRead() {
		rend.items, rend.ok = a.loadStatements(r.Context(), v)
	}
	st := stateBody
	if v.noAccess {
		st = stateNoAccess
	}
	// A failed LIST read is not an outage for this page: the upload card is the point of it,
	// and it works. Only the past-statements card says it could not load.
	if st != stateBody {
		status = statusFor(st)
	} else if status == 0 {
		status = http.StatusOK
	}
	doc := a.importPage.New()
	if fillFrame(doc, r, v, st) {
		fillImport(doc, rend)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillImport(doc *page.Doc, rend importRender) {
	doc.URL("upload-form", "action", importPath)
	message(doc, "upload-error", "upload-error-text", rend.message)
	// The duplicate link sits inside the error block; removing the block takes it along, so
	// it is only touched when the block is still there.
	if rend.message != "" {
		if rend.duplicateHref != "" {
			doc.Keep("upload-duplicate")
			doc.URL("upload-duplicate", "href", rend.duplicateHref)
		} else {
			doc.Remove("upload-duplicate")
		}
	}

	// Three states for the card below: the read failed, there is nothing yet, or the list.
	// A failed LIST read is not an outage for this page — the upload card is the point of
	// it, and that still works — so only this card says it could not load.
	switch {
	case !rend.ok:
		doc.Remove("past-empty")
		doc.Keep("past-failed")
		doc.Remove("past-list")
		return
	case len(rend.items) == 0:
		doc.Keep("past-empty")
		doc.Remove("past-failed")
		doc.Remove("past-list")
		return
	}
	// Only once the list is kept: removing it marks the repeat inside it done, and a Repeat
	// after that is "already filled or removed", which renders nothing and answers 500.
	doc.Remove("past-empty")
	doc.Remove("past-failed")
	doc.Keep("past-list")
	doc.Repeat("past", len(rend.items), func(i int, row *page.Row) {
		s := rend.items[i]
		row.URL("past-link", "href", s.Href)
		row.Text("past-label", s.Label)
		meta := []string{}
		// The filename only when it is not already the label.
		if s.Label != s.Filename {
			meta = append(meta, s.Filename)
		}
		meta = append(meta, s.RowsLabel, s.UploadedLabel)
		row.Text("past-meta", joinDot(meta))
		row.Text("past-status", s.StatusLabel)
		chipClassRow(row, "past-status", s.StatusChip)
	})
}

// uploadStatement is 3.7.5 step 1. The file goes to the function as base64; the function
// reads it, stores it and makes the rows.
func (a *app) uploadStatement(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	refuse := func(msg, dup string) {
		a.renderImport(w, r, v, importRender{message: msg, duplicateHref: dup}, http.StatusUnprocessableEntity)
	}
	// One byte over the cap is refused by ParseMultipart before anything is read into
	// memory. Only a SIZE failure says so: a malformed body or the wrong content type is
	// not the advisor sending too large a file.
	form, err := web.ParseMultipart(w, r, maxStatementBytes+multipartSlack)
	if err != nil {
		var formErr *web.FormError
		if errors.As(err, &formErr) && formErr.Status == http.StatusRequestEntityTooLarge {
			refuse(copyTooBig, "")
			return
		}
		refuse(copyUploadFailed, "")
		return
	}
	defer func() { _ = form.RemoveAll() }()
	files := form.File["file"]
	if len(files) == 0 || files[0].Size == 0 {
		refuse(copyNoFile, "")
		return
	}
	header := files[0]
	if header.Size > maxStatementBytes {
		refuse(copyTooBig, "")
		return
	}
	// Named before it is read: an .xlsx answers instantly and names the fix, rather than
	// going to the function to be told it is not a CSV.
	if notCSVName(header.Filename) {
		refuse(copyNotCsv, "")
		return
	}
	f, err := header.Open()
	if err != nil {
		refuse(copyUploadFailed, "")
		return
	}
	defer f.Close()
	bytes, err := io.ReadAll(io.LimitReader(f, maxStatementBytes+1))
	if err != nil || len(bytes) == 0 {
		refuse(copyUploadFailed, "")
		return
	}
	if len(bytes) > maxStatementBytes {
		refuse(copyTooBig, "")
		return
	}

	res := a.call(r, v, "commission-import", map[string]any{
		"op":         "upload",
		"filename":   header.Filename,
		"fileBase64": base64.StdEncoding.EncodeToString(bytes),
	})
	out := web.FromResult(res, copyUploadFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, importPath)
			return
		}
		refuse(out.Message, "")
		return
	}
	answer := decodeImportOutcome(res.Data)
	if answer.Outcome == "duplicate_file" {
		dup := ""
		if answer.ImportID != "" {
			dup = statementPath(answer.ImportID)
		}
		refuse(copyDuplicate, dup)
		return
	}
	if answer.Outcome != "uploaded" || answer.ImportID == "" {
		refuse(copyUploadFailed, "")
		return
	}
	web.SeeOther(w, r, statementPath(answer.ImportID))
}

// multipartSlack is the part headers and boundaries a 512 KB file arrives wrapped in. The
// file itself is checked against maxStatementBytes; this only keeps the parser from
// refusing a legal upload because of its envelope.
const multipartSlack = 64 * 1024

// importOutcome is what commission-import answers with. Typed, never a map.
type importOutcome struct {
	Outcome  string `json:"outcome"`
	ImportID string `json:"importId"`
}

func decodeImportOutcome(raw json.RawMessage) importOutcome {
	var out importOutcome
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}

// ── One statement (3.7.5 step 2 and 3.7.6) ──────────────────────────────────────────────

var statementSpec = page.Spec{
	File:   "agent/money/statement.html",
	Layout: shell.Agent,
	Slots: withFrame(
		"not-found",
		"mapping", "uploaded-line", "map-start-over", "start-over-form", "discard-id", "discard-version",
		"map-back", "map-form",
		"map-import-id", "map-version", "map-header-count",
		"map-error", "map-error-text", "map-submit",
		"map-date-field", "map-date", "map-date-error",
		"remap-warning",
		"review", "review-title", "review-subtitle",
		"review-actions", "change-columns",
		"discard-details", "discard-form", "statement-discard-id", "statement-discard-version",
		"reconcile-details",
		"reconcile-form", "reconcile-id", "reconcile-version", "reconcile-button",
		"reconcile-body", "reconcile-reason",
		"reconciled-note", "reconciled-note-text",
		"statement-error", "statement-error-text",
		"rows-empty", "rows-table",
	),
	Repeats: map[string][]string{
		"column":    append([]string{"column-name", "column-sample", "column-chip", "column-select"}, columnOptionSlotNames()...),
		"statement": {"row-line", "row-match", "row-match-link", "row-match-plain", "row-note", "row-confidence", "row-amount", "row-paid-on", "row-action", "row-resolve", "row-done"},
	},
}

// statementRender is one answer's own state, beyond what the reads give.
type statementRender struct {
	// version is the version the page carried, echoed back on a refusal so the retry cannot
	// overwrite the change it was warned about (the §3.7.3 lesson).
	version    int
	hasVersion bool
	// mapErrs and mapVals survive a refused map so nothing chosen is lost.
	mapErrs mapErrors
	mapVals *mapValues
	// message is the statement-level sentence: a stale save, a refused reconcile.
	message string
}

func (a *app) serveStatement(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	a.renderStatement(w, r, v, r.PathValue("importId"), statementRender{}, http.StatusOK)
}

// statementLoad is what one render of the statement page needs.
type statementLoad struct {
	s     statement
	found bool
	rows  []statementRowItem
}

func (a *app) loadStatement(ctx context.Context, v visit, importID string) (statementLoad, bool) {
	// Two groups rather than one, because they fail differently: the statement IS the page,
	// where the rows are only the reconciliation table. Both start at once (read launches
	// its goroutine), so this still costs one round trip. The status is not known until the
	// statement has been read, and asking afterwards would cost a second.
	var (
		rows  []statementRow
		lines []statementLineRow
	)
	rsStatement := a.reads(ctx, v)
	read(rsStatement, "agent_commission_import", map[string]any{"p_import_id": importID}, &rows)
	rsRows := a.reads(ctx, v)
	read(rsRows, "agent_commission_import_rows", map[string]any{"p_import_id": importID}, &lines)
	statementErr, rowsErr := rsStatement.wait(), rsRows.wait()

	if statementErr != nil {
		return statementLoad{}, false
	}
	if len(rows) == 0 {
		return statementLoad{}, true
	}
	out := statementLoad{s: statementView(rows[0]), found: true}
	// A statement still being mapped draws no table, so a rows failure is not its outage.
	if rowsErr != nil {
		return out, out.s.Status == "mapping"
	}
	out.rows = statementRowsView(lines, importID, out.s.Status == "reconciled")
	return out, true
}

func (a *app) renderStatement(w http.ResponseWriter, r *http.Request, v visit, importID string, rend statementRender, status int) {
	var (
		load statementLoad
		ok   = true
	)
	if v.canRead() && isUUID(importID) {
		load, ok = a.loadStatement(r.Context(), v, importID)
	}
	st := stateBody
	switch {
	case v.noAccess:
		st = stateNoAccess
	case !ok:
		st = stateRetry
	}
	switch {
	case st != stateBody:
		status = statusFor(st)
	case !load.found:
		status = http.StatusNotFound
	case status == 0:
		status = http.StatusOK
	}
	doc := a.statementPage.New()
	if fillFrame(doc, r, v, st) {
		fillStatement(doc, r, load, rend)
	}
	web.Render(w, a.d.Log, doc, status, web.Private)
}

func fillStatement(doc *page.Doc, r *http.Request, load statementLoad, rend statementRender) {
	if !load.found {
		doc.Keep("not-found")
		doc.Remove("mapping")
		doc.Remove("review")
		return
	}
	doc.Remove("not-found")
	s := load.s
	version := s.Version
	if rend.hasVersion {
		version = rend.version
	}
	// ?step=map reopens the map on a statement in review ("Change columns"), with a warning
	// that it clears the decisions made.
	remap := s.Status == "review" && r.URL.Query().Get("step") == "map"

	if s.Status == "mapping" || remap {
		doc.Remove("review")
		doc.Keep("mapping")
		fillMapping(doc, s, version, remap, rend)
		return
	}
	doc.Remove("mapping")
	doc.Keep("review")
	fillReview(doc, s, version, load.rows, rend)
}

func fillMapping(doc *page.Doc, s statement, version int, remap bool, rend statementRender) {
	doc.Text("uploaded-line", statementUploadedLine(s.Filename, s.TotalRows))
	// Starting over discards the statement; on a REMAP there is nothing to start over from,
	// so the link goes back to the statement instead.
	if remap {
		doc.Remove("map-start-over")
		// The start-over form goes with it, and its two hidden fields with that.
		doc.Keep("map-back")
		doc.URL("map-back", "href", statementPath(s.ImportID))
		doc.Keep("remap-warning")
	} else {
		doc.Keep("map-start-over")
		doc.URL("start-over-form", "action", statementPath(s.ImportID))
		doc.Attr("discard-id", "value", s.ImportID)
		doc.Attr("discard-version", "value", itoa(version))
		doc.Remove("map-back")
		doc.Remove("remap-warning")
	}

	// WITH ?step=map WHEN REMAPPING. A form posts to its action, and the mode is read off
	// the query, so dropping it sent a refused remap to the reconciliation table with the
	// advisor's choices gone and no sentence — React never had this, because its map form
	// was a client component and the URL never moved.
	mapAction := statementPath(s.ImportID)
	if remap {
		mapAction += "?step=map"
	}
	doc.URL("map-form", "action", mapAction)
	doc.Attr("map-import-id", "value", s.ImportID)
	doc.Attr("map-version", "value", itoa(version))
	doc.Attr("map-header-count", "value", itoa(len(s.Headers)))
	doc.Text("map-submit", statementImportRows(s.TotalRows))
	// The advisor's own today, from the accessor: a paid-on date cannot be in the future.
	doc.Attr("map-date", "max", s.Today)
	// One sentence, chosen once: calling message twice would Keep a block the first call
	// had already removed, which renders nothing and answers 500.
	mapMessage := rend.mapErrs.Map
	if mapMessage == "" {
		mapMessage = rend.message
	}
	message(doc, "map-error", "map-error-text", mapMessage)

	selections := s.Selections
	date := s.StatementDate
	if rend.mapVals != nil {
		selections, date = rend.mapVals.Selections, rend.mapVals.StatementDate
	}
	doc.Repeat("column", len(s.Headers), func(i int, row *page.Row) {
		row.Text("column-name", s.Headers[i])
		sample := ""
		if i < len(s.Samples) {
			sample = s.Samples[i]
		}
		if sample == "" {
			row.Remove("column-sample")
		} else {
			row.Text("column-sample", statementSample(sample))
		}
		row.Attr("column-select", "name", "col-"+itoa(i))
		row.Attr("column-select", "aria-label", s.Headers[i])
		row.Keep("column-select")
		chosen := ""
		if i < len(selections) {
			chosen = selections[i]
		}
		// The marker the intro promises. Auto is the stored guess still in place; Manual is
		// a column the advisor has moved since, which on the server means the posted
		// selection differs from the stored one. A remap starts from nothing, so neither.
		stored := ""
		if i < len(s.Selections) {
			stored = s.Selections[i]
		}
		switch {
		case !remap && chosen != "" && chosen == stored:
			row.Keep("column-chip")
			row.Text("column-chip", copyAutoChip)
			row.Class("column-chip", "status-booked", true)
		case chosen != stored:
			row.Keep("column-chip")
			row.Text("column-chip", copyManualChip)
			row.Class("column-chip", "status-due", true)
		default:
			row.Remove("column-chip")
		}
		// The options are the same eight on every row and a repeat cannot nest inside
		// another repeat, so they are written out in the page and one is marked here.
		for _, o := range columnOptionSlots {
			row.Keep(o.slot)
			row.Bool(o.slot, "selected", o.value == chosen)
		}
	})

	// The fallback date is only asked for when no column holds it.
	hasPaidOn := false
	for _, f := range selections {
		if f == "paid_on" {
			hasPaidOn = true
		}
	}
	if hasPaidOn {
		doc.Remove("map-date-field")
	} else {
		doc.Keep("map-date-field")
		doc.Attr("map-date", "value", date)
		errorOrHint(doc, "map-date", "map-date-error", "", rend.mapErrs.StatementDate)
	}
}

func fillReview(doc *page.Doc, s statement, version int, rows []statementRowItem, rend statementRender) {
	doc.Text("review-title", s.Title)
	doc.Text("review-subtitle", s.Subtitle)
	message(doc, "statement-error", "statement-error-text", rend.message)

	open := s.Status == "review"
	if open {
		doc.Keep("review-actions")
		doc.URL("change-columns", "href", statementPath(s.ImportID)+"?step=map")
		doc.Keep("discard-details")
		doc.Keep("reconcile-details")
		doc.URL("discard-form", "action", statementPath(s.ImportID))
		doc.Attr("statement-discard-id", "value", s.ImportID)
		doc.Attr("statement-discard-version", "value", itoa(version))
		doc.URL("reconcile-form", "action", statementPath(s.ImportID))
		doc.Attr("reconcile-id", "value", s.ImportID)
		doc.Attr("reconcile-version", "value", itoa(version))
		doc.Text("reconcile-body", statementReconcileBody(s.WillPay, s.WillCreate))
		// DISABLED WITH ITS REASON while any row needs the advisor (§3.2.1's rule):
		// reconciling is the moment every row is accounted for, and the SQL refuses it anyway.
		doc.Bool("reconcile-button", "disabled", s.NeedYou > 0)
		doc.Keep("reconcile-button")
		if s.NeedYou > 0 {
			doc.Keep("reconcile-reason")
			doc.Text("reconcile-reason", statementStillNeedYou(s.NeedYou))
			doc.Attr("reconcile-button", "aria-describedby", "reconcile-reason")
		} else {
			doc.Remove("reconcile-reason")
			doc.Attr("reconcile-button", "aria-describedby", "")
		}
	} else {
		// A statement no longer in review has nothing to act on, so the actions and the two
		// lines that explain them go together.
		doc.Remove("review-actions")
		doc.Remove("reconcile-body")
		doc.Remove("reconcile-reason")
	}

	if s.Status == "reconciled" && s.ReconciledOn != "" {
		doc.Keep("reconciled-note")
		doc.Text("reconciled-note-text", statementReconciledLine(s.ReconciledOn, s.WillPay, s.WillCreate))
	} else {
		doc.Remove("reconciled-note")
	}

	if len(rows) == 0 {
		doc.Keep("rows-empty")
		doc.Remove("rows-table")
		return
	}
	doc.Remove("rows-empty")
	doc.Keep("rows-table")
	doc.Repeat("statement", len(rows), func(i int, row *page.Row) {
		x := rows[i]
		row.Text("row-line", x.StatementLine)
		// An <a> cannot be grown around the cell, so the label is written twice and one of
		// the two is taken away.
		if x.MatchHref != "" {
			row.Keep("row-match-link")
			row.URL("row-match-link", "href", x.MatchHref)
			row.Text("row-match-link", x.MatchLabel)
			row.Remove("row-match-plain")
		} else {
			row.Remove("row-match-link")
			row.Keep("row-match-plain")
			row.Text("row-match-plain", x.MatchLabel)
		}
		row.Keep("row-match")
		textOrRemove(row, "row-note", x.Note)
		if x.ConfidenceLabel == "" {
			row.Remove("row-confidence")
		} else {
			row.Keep("row-confidence")
			row.Text("row-confidence", x.ConfidenceLabel)
			chipClassRow(row, "row-confidence", x.ConfidenceChip)
		}
		textOrRemove(row, "row-amount", x.AmountLabel)
		textOrRemove(row, "row-paid-on", x.PaidOnLabel)
		row.Keep("row-action")
		// Resolve while the statement is open and the row still needs a decision; the label
		// it was given otherwise.
		if open && x.NeedsYou {
			row.Keep("row-resolve")
			row.URL("row-resolve", "href", x.ResolveHref)
			row.Remove("row-done")
		} else {
			row.Remove("row-resolve")
			textOrRemove(row, "row-done", x.DoneLabel)
		}
	})
}

// saveStatement is the statement page's one POST: map, reconcile or discard.
func (a *app) saveStatement(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	importID := r.PathValue("importId")
	f, ok := web.Form(w, r)
	if !ok {
		return
	}
	version, hasVersion := parseIntJS(f.Get("version"))
	echo := statementRender{version: version, hasVersion: hasVersion}

	switch f.Get("op") {
	case "reconcile":
		a.reconcileStatement(w, r, v, importID, echo)
	case "discard":
		a.discardStatement(w, r, v, importID, echo)
	default:
		a.mapStatement(w, r, v, importID, f, echo)
	}
}

func (a *app) mapStatement(w http.ResponseWriter, r *http.Request, v visit, importID string, f form, echo statementRender) {
	headerCount, okCount := clampHeaderCount(f.Get("headerCount"))
	values := mapValuesFromForm(f, headerCount)
	echo.mapVals = &values
	if importID == "" || !echo.hasVersion || !okCount {
		echo.message = copyMapFailed
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
		return
	}
	columnMap, statementDate, errs := validateMap(values)
	if errs.any() {
		echo.mapErrs = errs
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
		return
	}
	body := map[string]any{
		"op": "map", "importId": importID, "expectedVersion": echo.version,
		"columnMap": columnMap,
	}
	// Null, not "": the column wins when there is one, and the function stores no date.
	if statementDate == "" {
		body["statementDate"] = nil
	} else {
		body["statementDate"] = statementDate
	}

	res := a.call(r, v, "commission-import", body)
	out := web.FromResult(res, copyMapFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, statementPath(importID))
			return
		}
		echo.message = out.Message
		if out.Conflict {
			echo.message = copyStatementStale
		}
		a.renderStatement(w, r, v, importID, echo, out.Status)
		return
	}
	if decodeImportOutcome(res.Data).Outcome == "not_open" {
		echo.message = copyNotOpen
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
		return
	}
	web.SeeOther(w, r, statementPath(importID))
}

// reconcileStatement is 3.7.6's Mark as reconciled — the one action that changes the ledger.
func (a *app) reconcileStatement(w http.ResponseWriter, r *http.Request, v visit, importID string, echo statementRender) {
	if importID == "" || !echo.hasVersion {
		echo.message = copyReconcileFailed
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
		return
	}
	res := a.call(r, v, "commission-import", map[string]any{
		"op": "reconcile", "importId": importID, "expectedVersion": echo.version,
	})
	out := web.FromResult(res, copyReconcileFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, statementPath(importID))
			return
		}
		switch {
		case out.Conflict:
			echo.message = copyStatementStale
		case out.Status != http.StatusServiceUnavailable:
			// A refusal is certain: nothing was written.
			echo.message = copyReconcileFailed
		default:
			// A call that never answered MAY have committed before it was lost. Say only
			// what is known.
			echo.message = copyReconcileUnsure
		}
		a.renderStatement(w, r, v, importID, echo, out.Status)
		return
	}
	switch decodeImportOutcome(res.Data).Outcome {
	case "reconciled":
		web.SeeOther(w, r, statementPath(importID))
	case "needs_decisions":
		// A row changed under the advisor (a line removed by hand, say). The page redraws
		// with that row back at the top of the table.
		echo.message = copyRowNeedsYouAgain
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
	case "not_open":
		echo.message = copyNotOpen
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
	default:
		echo.message = copyReconcileFailed
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
	}
}

// discardStatement throws a statement away before reconciling it. Nothing in the ledger
// changes, and the file can be uploaded again afterwards.
func (a *app) discardStatement(w http.ResponseWriter, r *http.Request, v visit, importID string, echo statementRender) {
	if importID == "" || !echo.hasVersion {
		echo.message = copyDiscardFailed
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
		return
	}
	res := a.call(r, v, "commission-import", map[string]any{
		"op": "discard", "importId": importID, "expectedVersion": echo.version,
	})
	out := web.FromResult(res, copyDiscardFailed)
	if !out.OK {
		if out.SignIn {
			a.signedOutTo(w, r, statementPath(importID))
			return
		}
		echo.message = copyDiscardFailed
		if out.Conflict {
			echo.message = copyStatementStale
		}
		a.renderStatement(w, r, v, importID, echo, out.Status)
		return
	}
	switch decodeImportOutcome(res.Data).Outcome {
	case "discarded":
		web.SeeOther(w, r, importPath)
	case "not_open":
		echo.message = copyNotOpen
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
	default:
		echo.message = copyDiscardFailed
		a.renderStatement(w, r, v, importID, echo, http.StatusUnprocessableEntity)
	}
}

// chipClassRow is chipClass for a repeat's row.
func chipClassRow(row *page.Row, slot, kind string) {
	switch kind {
	case "inquiry":
		row.Class(slot, "status-inquiry", true)
	case "proposal":
		row.Class(slot, "status-proposal", true)
	case "booked":
		row.Class(slot, "status-booked", true)
	case "due":
		row.Class(slot, "status-due", true)
	case "past":
		row.Class(slot, "status-past", true)
	}
}
