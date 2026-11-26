// Package commissionimport ports supabase/functions/commission-import: importing and
// reconciling an Inteletravel statement. Screens 3.7.5 (upload, map) and 3.7.6 (resolve each
// row, mark as reconciled, or discard).
//
// THE LEDGER CHANGES IN ONE PLACE. upload, map, resolve and discard change only the
// statement and its rows. reconcile is the one op that writes commission, and it does every
// line in ONE SQL transaction with an audit row per line (agent_reconcile_commission_import).
// This route supplies 1,001 v7 audit ids for it, the row cap plus one for the statement,
// rather than counting first, which would be a second read racing the decisions it counted.
//
// THE FILE arrives as base64 in JSON, is checked and read HERE (domain/statement), and is
// stored in the private commission-statements bucket under a key this route derives from ids
// it trusts: the client never names a storage path. If the SQL write then refuses (a
// duplicate) or fails, the stored object is removed again, best effort.
//
// ONLY `stale` IS A 409: every outcome a screen should explain comes back 200 with an
// `outcome`, as in agent-commission.
package commissionimport

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/agent"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/commission"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/statement"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const bucket = "commission-statements"

var (
	ops     = []string{"upload", "map", "resolve", "reconcile", "discard"}
	actions = []string{"confirm", "match", "create", "ignore"}
)

// Outcomes each op may return as a 200, besides stale (409) and not_found (404).
var (
	mapOutcomes       = []string{"mapped", "not_open"}
	resolveOutcomes   = []string{"resolved", "not_open", "not_allowed", "line_unavailable", "trip_not_found", "supplier_not_found"}
	reconcileOutcomes = []string{"reconciled", "needs_decisions", "not_open"}
	discardOutcomes   = []string{"discarded", "not_open"}
)

const stale = "This statement changed since you opened it. Reload and try again."

func oneOf(value js.Value, allowed []string, what string) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(allowed, s) {
		return "", problem.BadRequest(what + " must be one of: " + strings.Join(allowed, ", ") + ".")
	}
	return s, nil
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	// Not cancelled when the caller disconnects (review of #190): an upload stores the file
	// and then writes the row, and the clean-up that removes the file when the row is refused
	// must still run. Each call keeps its own client timeout.
	ctx := context.WithoutCancel(r.Context())
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	// The service role, as every agent route runs: the import tables and the bucket have no
	// client-role grants, so every ownership test here is explicit.
	agentID, err := guard.RequireAgentID(ctx, d.DB, c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	op, err := oneOf(payload.Get("op"), ops, "op")
	if err != nil {
		return nil, err
	}
	audit := js.O("p_ip", c.IP, "p_user_agent", c.UserAgent)

	if op == "upload" {
		return upload(ctx, d.DB, d.Log, c, agentID, payload, audit)
	}

	// Everything below names one statement at the version the screen rendered.
	importID, err := commission.ReadID(payload.Get("importId"), "statement")
	if err != nil {
		return nil, err
	}
	version, err := agent.RequireExpectedVersion(payload.Get("expectedVersion"))
	if err != nil {
		return nil, err
	}
	switch op {
	case "map":
		return mapStatement(ctx, d.DB, agentID, importID, version, payload)
	case "resolve":
		args, err := resolveArgs(payload, agentID, importID, version, uuid.New)
		if err != nil {
			return nil, err
		}
		var res result
		found, err := d.DB.RPCRow(ctx, "agent_resolve_commission_import_row", args, &res)
		if err != nil {
			return nil, fmt.Errorf("statement row resolve failed: %w", err)
		}
		if err := check(found, res, "No such statement row.", resolveOutcomes, "unknown resolve outcome"); err != nil {
			return nil, err
		}
		return edge.OK(js.O("outcome", res.Outcome, "importId", importID, "version", res.Version))
	case "reconcile":
		return reconcile(ctx, d.DB, c, agentID, importID, version, audit)
	}
	return discard(ctx, d.DB, d.Log, c, agentID, importID, version, audit)
}

// result is one row of an import RPC. version is null on not_found; the counts only come
// from reconcile.
type result struct {
	Outcome       string  `json:"outcome"`
	Version       *int64  `json:"version"`
	PaidCount     *int64  `json:"paid_count"`
	CreatedCount  *int64  `json:"created_count"`
	AlreadyCount  *int64  `json:"already_count"`
	BlockingCount *int64  `json:"blocking_count"`
	ImportID      *string `json:"import_id"`
	UploadedAt    *string `json:"uploaded_at"`
}

// check maps the outcomes every non-upload op shares: no row or not_found is a 404 with the
// op's sentence, stale the 409, and anything outside allowed a 500.
func check(found bool, res result, notFound string, allowed []string, unknown string) error {
	if !found || res.Outcome == "not_found" {
		return problem.NotFound(notFound)
	}
	if res.Outcome == "stale" {
		return problem.Conflict(stale)
	}
	if !slices.Contains(allowed, res.Outcome) {
		return errors.New(unknown + ": " + res.Outcome)
	}
	return nil
}

// ── 3.7.5 Upload ───────────────────────────────────────────────────────────

// file is a checked upload.
type file struct {
	Filename  string
	Bytes     []byte
	Statement statement.StatementFile
	// Checksum is the SHA-256 of the bytes as PostgREST takes a bytea: \x and lowercase hex.
	Checksum string
}

// readUpload checks the upload in the order the Deno function did: name, base64, text, rows.
func readUpload(payload js.Value) (file, error) {
	name, err := statement.ReadFilename(payload.Get("filename"))
	if err != nil {
		return file{}, err
	}
	b, err := statement.ReadFileBase64(payload.Get("fileBase64"))
	if err != nil {
		return file{}, err
	}
	text, err := statement.DecodeStatement(b)
	if err != nil {
		return file{}, err
	}
	st, err := statement.ReadStatementFile(text)
	if err != nil {
		return file{}, err
	}
	sum := sha256.Sum256(b)
	return file{Filename: name, Bytes: b, Statement: st, Checksum: `\x` + statement.ToHex(sum[:])}, nil
}

// previousMap is guessColumnMap's `previous` from the advisor's last statement row:
// `{ headers: prev.headers ?? [], columnMap: prev.column_map ?? {} }`. The stored map's values
// are whole column numbers (the map screen's check wrote them); anything else is skipped, as
// headers[value] found nothing for it in the Deno code.
func previousMap(headers []string, columnMap json.RawMessage) (*statement.PreviousMap, error) {
	prev := &statement.PreviousMap{Headers: headers}
	if prev.Headers == nil {
		prev.Headers = []string{}
	}
	if len(columnMap) == 0 || string(columnMap) == "null" {
		return prev, nil
	}
	v, err := js.Parse(columnMap)
	if err != nil {
		return nil, fmt.Errorf("previous column map unreadable: %w", err)
	}
	if obj, ok := v.Object(); ok {
		for _, k := range obj.Keys() {
			if n, ok := obj.Get(k).Num(); ok && js.IsInteger(n) {
				prev.ColumnMap.Set(k, int(n))
			}
		}
	}
	return prev, nil
}

// uploadRow is one data line as agent_upload_commission_statement stores it.
type uploadRow struct {
	ID    string   `json:"id"`
	Cells []string `json:"cells"`
}

func upload(ctx context.Context, db *service.Client, log *slog.Logger, c *caller.Context, agentID string, payload js.Value, audit js.Ordered) (*edge.Reply, error) {
	f, err := readUpload(payload)
	if err != nil {
		return nil, err
	}

	// The same file again is answered before anything is stored. The SQL write checks again
	// (two uploads racing), and removes nothing it did not have to.
	var dup struct {
		ID        string `json:"id"`
		CreatedAt string `json:"created_at"`
	}
	found, err := db.From("commission_import").Select("id, created_at").Eq("agent_id", agentID).
		Eq("checksum_sha256", f.Checksum).Neq("status", "discarded").MaybeSingle(ctx, &dup)
	if err != nil {
		return nil, fmt.Errorf("duplicate check failed: %w", err)
	}
	if found {
		return edge.OK(js.O("outcome", "duplicate_file", "importId", dup.ID, "uploadedAt", dup.CreatedAt))
	}

	// The map guessed from the advisor's last statement first: next month's file, with the
	// same headers, maps itself.
	var prevRow struct {
		Headers   []string        `json:"headers"`
		ColumnMap json.RawMessage `json:"column_map"`
	}
	found, err = db.From("commission_import").Select("headers, column_map").Eq("agent_id", agentID).
		In("status", []string{"review", "reconciled"}).Order("created_at", false).Limit(1).MaybeSingle(ctx, &prevRow)
	if err != nil {
		return nil, fmt.Errorf("previous statement read failed: %w", err)
	}
	var prev *statement.PreviousMap
	if found {
		if prev, err = previousMap(prevRow.Headers, prevRow.ColumnMap); err != nil {
			return nil, err
		}
	}
	guess := statement.GuessColumnMap(f.Statement.Headers, prev)

	importID := uuid.New()
	documentID := uuid.New()
	key := agentID + "/" + importID + ".csv"

	if err := db.Upload(ctx, bucket, key, f.Bytes, service.UploadOptions{ContentType: "text/csv", Upsert: false}); err != nil {
		return nil, fmt.Errorf("statement store failed: %w", err)
	}
	removeStored := func() {
		if err := db.Remove(ctx, bucket, []string{key}); err != nil {
			log.Error("orphaned statement object", "key", key)
		}
	}

	rows := make([]uploadRow, len(f.Statement.Rows))
	for i, cells := range f.Statement.Rows {
		rows[i] = uploadRow{ID: uuid.New(), Cells: cells}
	}
	args := js.O(
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_import_id", importID,
		"p_document_id", documentID,
		"p_filename", f.Filename,
		"p_size_bytes", len(f.Bytes),
		"p_checksum", f.Checksum,
		"p_storage_key", key,
		"p_headers", f.Statement.Headers,
		"p_column_map", guess,
		"p_rows", rows,
		"p_audit_id", uuid.New(),
	).Spread(audit)

	var res result
	found, err = db.RPCRow(ctx, "agent_upload_commission_statement", args, &res)
	if err != nil {
		removeStored()
		return nil, fmt.Errorf("statement upload failed: %w", err)
	}
	if !found {
		removeStored()
		return nil, problem.NotFound("Your account isn't set up to import statements.")
	}
	if res.Outcome == "duplicate_file" {
		removeStored()
		return edge.OK(js.O("outcome", "duplicate_file", "importId", res.ImportID, "uploadedAt", res.UploadedAt))
	}
	if res.Outcome != "uploaded" {
		return nil, errors.New("unknown upload outcome: " + res.Outcome)
	}
	return edge.OK(js.O("outcome", "uploaded", "importId", importID, "rowCount", len(f.Statement.Rows)))
}

// ── 3.7.5 Map ──────────────────────────────────────────────────────────────

// readMap checks the confirmed map and the statement date against the statement's headers.
func readMap(payload js.Value, headerCount int) (statement.ColumnMap, *string, error) {
	m, err := statement.ReadColumnMap(payload.Get("columnMap"), headerCount)
	if err != nil {
		return statement.ColumnMap{}, nil, err
	}
	var date *string
	if v := payload.Get("statementDate"); !v.IsNullish() && !isEmptyString(v) {
		d, err := commission.ReadDate(v, "Statement date")
		if err != nil {
			return statement.ColumnMap{}, nil, err
		}
		date = &d
	}
	if _, ok := m.Get("paid_on"); !ok && date == nil {
		return statement.ColumnMap{}, nil, problem.BadRequest("Choose the paid-on column, or enter the date the statement paid.")
	}
	return m, date, nil
}

// mapRow is one parsed row as agent_map_commission_import takes it: `{ id, ...parsed }`.
type mapRow struct {
	ID string `json:"id"`
	statement.ParsedRow
}

func mapStatement(ctx context.Context, db *service.Client, agentID, importID string, version int64, payload js.Value) (*edge.Reply, error) {
	var imp struct {
		Headers   []string `json:"headers"`
		TotalRows int64    `json:"total_rows"`
	}
	found, err := db.From("commission_import").Select("headers, total_rows").Eq("id", importID).
		Eq("agent_id", agentID).Neq("status", "discarded").MaybeSingle(ctx, &imp)
	if err != nil {
		return nil, fmt.Errorf("statement read failed: %w", err)
	}
	if !found {
		return nil, problem.NotFound("No such statement.")
	}
	columnMap, date, err := readMap(payload, len(imp.Headers))
	if err != nil {
		return nil, err
	}

	// At most MaxRows (the table's CHECK), which is also PostgREST's max_rows: one page.
	var rows []struct {
		ID    string   `json:"id"`
		Cells []string `json:"cells"`
	}
	if err := db.From("commission_import_row").Select("id, cells").Eq("import_id", importID).
		Order("row_number", true).Range(0, statement.MaxRows-1).Rows(ctx, &rows); err != nil {
		return nil, fmt.Errorf("statement rows read failed: %w", err)
	}
	if int64(len(rows)) != imp.TotalRows {
		return nil, errors.New("statement rows did not all come back")
	}
	cells := make([][]string, len(rows))
	for i, r := range rows {
		cells[i] = r.Cells
		if cells[i] == nil {
			cells[i] = []string{}
		}
	}
	parsed := statement.ParseRows(cells, columnMap, date)
	out := make([]mapRow, len(parsed))
	for i, p := range parsed {
		out[i] = mapRow{ID: rows[i].ID, ParsedRow: p}
	}

	var res result
	found, err = db.RPCRow(ctx, "agent_map_commission_import", js.O(
		"p_agent_id", agentID,
		"p_import_id", importID,
		"p_expected_version", version,
		"p_column_map", columnMap,
		"p_statement_date", date,
		"p_rows", out,
	), &res)
	if err != nil {
		return nil, fmt.Errorf("statement map failed: %w", err)
	}
	if err := check(found, res, "No such statement.", mapOutcomes, "unknown map outcome"); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", res.Outcome, "importId", importID, "version", res.Version))
}

// ── 3.7.6 Resolve one row ──────────────────────────────────────────────────

// resolveArgs reads a resolve in the Deno order: the action, the row, then what the action
// needs. Arguments an action does not need are left out (the SQL defaults them to null).
func resolveArgs(payload js.Value, agentID, importID string, version int64, newID func() string) (js.Ordered, error) {
	action, err := oneOf(payload.Get("action"), actions, "action")
	if err != nil {
		return nil, err
	}
	rowID, err := commission.ReadID(payload.Get("rowId"), "statement row")
	if err != nil {
		return nil, err
	}
	args := js.O("p_agent_id", agentID, "p_import_id", importID, "p_expected_version", version,
		"p_row_id", rowID, "p_action", action)
	switch action {
	case "match":
		id, err := commission.ReadID(payload.Get("commissionId"), "commission line")
		if err != nil {
			return nil, err
		}
		args = args.Set("p_commission_id", id)
	case "create":
		trip, err := commission.ReadID(payload.Get("tripId"), "trip")
		if err != nil {
			return nil, err
		}
		supplier, err := commission.ReadID(payload.Get("supplierId"), "supplier")
		if err != nil {
			return nil, err
		}
		gross, err := commission.RequireCents(payload.Get("grossCents"), "Gross")
		if err != nil {
			return nil, err
		}
		pct, err := commission.ReadRate(payload.Get("commissionPct"))
		if err != nil {
			return nil, err
		}
		args = args.Set("p_trip_id", trip).Set("p_supplier_id", supplier).Set("p_gross_cents", gross).
			Set("p_commission_pct", pct).
			// v7, minted when the advisor decides, so the line's id is known before it exists.
			Set("p_new_commission_id", newID())
	}
	return args, nil
}

// ── 3.7.6 Mark as reconciled ───────────────────────────────────────────────

// auditIDs are the row cap plus one (the statement's own row).
func auditIDs() []string {
	ids := make([]string, statement.MaxRows+1)
	for i := range ids {
		ids[i] = uuid.New()
	}
	return ids
}

func reconcile(ctx context.Context, db *service.Client, c *caller.Context, agentID, importID string, version int64, audit js.Ordered) (*edge.Reply, error) {
	var res result
	found, err := db.RPCRow(ctx, "agent_reconcile_commission_import", js.O(
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_import_id", importID,
		"p_expected_version", version,
		"p_audit_ids", auditIDs(),
	).Spread(audit), &res)
	if err != nil {
		return nil, fmt.Errorf("statement reconcile failed: %w", err)
	}
	return reconcileReply(importID, found, res)
}

func reconcileReply(importID string, found bool, res result) (*edge.Reply, error) {
	if err := check(found, res, "No such statement.", reconcileOutcomes, "unknown reconcile outcome"); err != nil {
		return nil, err
	}
	return edge.OK(js.O(
		"outcome", res.Outcome,
		"importId", importID,
		"version", res.Version,
		"paid", res.PaidCount,
		"created", res.CreatedCount,
		"alreadyRecorded", res.AlreadyCount,
		"blocking", res.BlockingCount,
	))
}

// ── 3.7.6 Discard ──────────────────────────────────────────────────────────

func discard(ctx context.Context, db *service.Client, log *slog.Logger, c *caller.Context, agentID, importID string, version int64, audit js.Ordered) (*edge.Reply, error) {
	var res result
	found, err := db.RPCRow(ctx, "agent_discard_commission_import", js.O(
		"p_agent_id", agentID,
		"p_actor_user_id", c.PlatformUserID,
		"p_import_id", importID,
		"p_expected_version", version,
		"p_audit_id", uuid.New(),
	).Spread(audit), &res)
	if err != nil {
		return nil, fmt.Errorf("statement discard failed: %w", err)
	}
	if err := check(found, res, "No such statement.", discardOutcomes, "unknown discard outcome"); err != nil {
		return nil, err
	}
	// A discarded statement's file goes too: it names every traveler on it, and nothing reads
	// it again. The document row stays, archived, as the record that it existed. Best effort:
	// the discard has already happened, and a leftover object is logged, not shown. The key is
	// built from the id LOWER-CASED (review of #190): ids are matched in SQL whatever their
	// case, so an upper-case importId discarded the row and missed the object, leaving a file
	// that names every traveler in the bucket. The Deno function had the same gap.
	if res.Outcome == "discarded" {
		if err := db.Remove(ctx, bucket, []string{agentID + "/" + strings.ToLower(importID) + ".csv"}); err != nil {
			log.Error("discarded statement object not removed")
		}
	}
	return edge.OK(js.O("outcome", res.Outcome, "importId", importID, "version", res.Version))
}

func isEmptyString(v js.Value) bool {
	s, ok := v.Str()
	return ok && s == ""
}
