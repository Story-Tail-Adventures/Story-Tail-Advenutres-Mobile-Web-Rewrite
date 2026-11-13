//go:build difftest && difftest_commission

package difftest

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/commissionimport"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/statement"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["commission-import"] = api.Port{Gate: api.GateUser, Fn: commissionimport.Func}
}

const ciBucket = "commission-statements"

// ciCSV is the statement every upload case sends: a confirmed match (ITV-100), one nobody
// has, and one that cannot be read.
const ciCSV = "Booking Ref,Supplier,Traveler,Gross,Commission Paid,Fee,Paid On\r\n" +
	"ITV-100,Sandals,Hayes,\"1,000.00\",115.00,5.00,2026-10-01\r\n" +
	"ITV-999,Unknown Co,Someone,500.00,60.00,,2026-10-02\r\n" +
	"ITV-777,X,Y,abc,zz,,2026-10-03\r\n"

var ciHeaders = []string{"Booking Ref", "Supplier", "Traveler", "Gross", "Commission Paid", "Fee", "Paid On"}

const ciFullMap = `{"reference":0,"supplier":1,"traveler":2,"gross":3,"received":4,"fee":5,"paid_on":6}`

func ciB64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func ciChecksum(s string) string {
	sum := sha256.Sum256([]byte(s))
	return `\x` + hex.EncodeToString(sum[:])
}

// ciRows are a fixture statement's cells in world w: the three of ciCSV, and a fourth that
// the matcher can only SUGGEST (supplier and traveler and amount agree with line2).
func ciRows(w *World, owner *World) [][]string {
	return [][]string{
		{"ITV-100", "Sandals", "Hayes", "1,000.00", "115.00", "5.00", "2026-10-01"},
		{"ITV-999", "Unknown Co", "Someone", "500.00", "60.00", "", "2026-10-02"},
		{"ITV-777", "X", "Y", "abc", "zz", "", "2026-10-03"},
		{"", "Diff Supplier " + owner.Tag, "Diff Traveler " + owner.Tag, "500.00", "58.00", "2.00", "2026-10-04"},
	}
}

func ciMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// ciListObjects lists the statement files stored under an advisor's folder: name, type and
// size of each.
func ciListObjects(agentID string) ([]string, error) {
	body := `{"prefix":"` + agentID + `","limit":100,"offset":0,"sortBy":{"column":"name","order":"asc"}}`
	req, _ := http.NewRequest("POST", S.URL+"/storage/v1/object/list/"+ciBucket, strings.NewReader(body))
	req.Header.Set("apikey", S.Service)
	req.Header.Set("Authorization", "Bearer "+S.Service)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var objs []struct {
		Name     string `json:"name"`
		Metadata *struct {
			Size     int64  `json:"size"`
			Mimetype string `json:"mimetype"`
		} `json:"metadata"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&objs); err != nil {
		return nil, fmt.Errorf("storage list %d: %w", resp.StatusCode, err)
	}
	out := []string{}
	for _, o := range objs {
		s := o.Name
		if o.Metadata != nil {
			s += " " + o.Metadata.Mimetype + " " + js.NumberString(float64(o.Metadata.Size))
		}
		out = append(out, s)
	}
	return out, nil
}

func ciObjects(t *testing.T, agentID string) []string {
	t.Helper()
	out, err := ciListObjects(agentID)
	if err != nil {
		t.Fatalf("storage list: %v", err)
	}
	return out
}

// ciDrop removes everything an advisor's statements left: rows, the lines (all of a fixture
// advisor's lines are this test's), the statements, their documents and files. Registered
// AFTER the case's trips and suppliers, so it runs before them.
func ciDrop(a *Actor) {
	ctx := context.Background()
	var imps []struct {
		ID string `json:"id"`
	}
	_ = S.DB.From("commission_import").Select("id").Eq("agent_id", a.AgentID).Rows(ctx, &imps)
	for _, i := range imps {
		_ = S.DB.From("commission_import_row").Eq("import_id", i.ID).Delete(ctx, nil)
	}
	_ = S.DB.From("commission").Eq("agent_id", a.AgentID).Delete(ctx, nil)
	_ = S.DB.From("commission_import").Eq("agent_id", a.AgentID).Delete(ctx, nil)
	_ = S.DB.From("document").Eq("owner_user_id", a.PlatformUserID).Eq("kind", "csv_import").Delete(ctx, nil)
	var keys []string
	for _, name := range ciObjectNames(a.AgentID) {
		keys = append(keys, a.AgentID+"/"+name)
	}
	if len(keys) > 0 {
		_ = S.DB.Remove(ctx, ciBucket, keys)
	}
}

func ciObjectNames(agentID string) []string {
	var names []string
	objs, _ := ciListObjects(agentID)
	for _, o := range objs {
		names = append(names, strings.Fields(o)[0])
	}
	return names
}

// ciBook gives owner's advisor (labelled in w) a supplier, an archived one, a trip and three
// lines: line1 carries ITV-100, line2 has no reference (the suggestion's target), paidline
// was already received.
func ciBook(t *testing.T, w, owner *World, prefix string) {
	t.Helper()
	ctx := context.Background()
	sup := func(label string, archived bool) string {
		id := uuid.New()
		row := js.O("id", id, "name", "Diff Supplier "+owner.Tag, "kind", "resort", "default_commission_pct", 12)
		if archived {
			row = row.Set("name", "Diff Old Supplier "+owner.Tag).Set("archived_at", "2026-01-01T00:00:00Z")
		}
		ciMust(t, S.DB.From("supplier").Insert(ctx, row, nil))
		w.ID(prefix+label, id)
		w.Vars[prefix+label] = id
		t.Cleanup(func() { _ = S.DB.From("supplier").Eq("id", id).Delete(context.Background(), nil) })
		return id
	}
	supplier := sup("supplier", false)
	sup("oldsupplier", true)

	trip := uuid.New()
	ciMust(t, S.DB.From("trip").Insert(ctx, js.O("id", trip, "client_id", owner.Traveler.ClientID, "agent_id", owner.Agent.AgentID,
		"title", "Difftest trip", "trip_type", "custom", "status", "booked", "start_date", "2026-09-01",
		"end_date", "2026-09-08", "currency", "USD"), nil))
	w.ID(prefix+"trip", trip)
	w.Vars[prefix+"trip"] = trip
	t.Cleanup(func() {
		ctx := context.Background()
		_ = S.DB.From("commission").Eq("trip_id", trip).Delete(ctx, nil)
		_ = S.DB.From("trip_status_history").Eq("trip_id", trip).Delete(ctx, nil)
		_ = S.DB.From("trip").Eq("id", trip).Delete(ctx, nil)
	})
	line := func(label string, cols js.Ordered) {
		id := uuid.New()
		row := js.O("id", id, "trip_id", trip, "agent_id", owner.Agent.AgentID, "supplier_id", supplier,
			"gross_booking_cents", 100000, "commission_pct", 12, "expected_commission_cents", 12000,
			"processing_fee_cents", 0, "received_commission_cents", 0, "currency", "USD",
			"payment_terms", "after_travel", "payment_lag_days", 60, "status", "invoiced")
		ciMust(t, S.DB.From("commission").Insert(ctx, row.Spread(cols), nil))
		w.ID(prefix+label, id)
		w.Vars[prefix+label] = id
	}
	line("line1", js.O("inteletravel_reference", "ITV-100"))
	line("line2", js.O("status", "expected", "gross_booking_cents", 50000, "expected_commission_cents", 6000))
	line("paidline", js.O("status", "received", "received_commission_cents", 12000, "received_at", "2026-09-30",
		"inteletravel_reference", "ITV-PAID-1"))
	t.Cleanup(func() { ciDrop(owner.Agent) })
}

// ciImportOpts shape a fixture statement.
type ciImportOpts struct {
	Status   string     // mapping when empty
	Headers  []string   // ciHeaders when nil
	Rows     [][]string // ciRows when nil
	Map      string     // the stored column_map, {} when empty
	Checksum string     // a unique one when empty
	Store    bool       // put a file in the bucket too
}

// ciImport inserts a statement for owner's advisor, labelled in w as label (its rows as
// label+"row1"...), the way agent_upload_commission_statement stores one, without its audit
// row. The case's ciDrop removes it.
func ciImport(t *testing.T, w, owner *World, label string, o ciImportOpts) string {
	t.Helper()
	ctx := context.Background()
	id, doc := uuid.New(), uuid.New()
	if o.Status == "" {
		o.Status = "mapping"
	}
	if o.Headers == nil {
		o.Headers = ciHeaders
	}
	if o.Rows == nil {
		o.Rows = ciRows(w, owner)
	}
	if o.Map == "" {
		o.Map = "{}"
	}
	if o.Checksum == "" {
		o.Checksum = ciChecksum("fixture " + label) // the same in both worlds
	}
	key := owner.Agent.AgentID + "/" + id + ".csv"
	ciMust(t, S.DB.From("document").Insert(ctx, js.O("id", doc, "owner_user_id", owner.Agent.PlatformUserID,
		"kind", "csv_import", "filename", "statement.csv", "mime_type", "text/csv", "size_bytes", 321,
		"storage_bucket", ciBucket, "storage_key", key, "checksum_sha256", o.Checksum, "is_sensitive", true), nil))
	row := js.O("id", id, "agent_id", owner.Agent.AgentID, "imported_by_user_id", owner.Agent.PlatformUserID,
		"source", "inteletravel_csv", "original_filename", "statement.csv", "document_id", doc,
		"checksum_sha256", o.Checksum, "headers", o.Headers, "column_map", json.RawMessage(o.Map), "status", o.Status,
		"total_rows", len(o.Rows), "matched_rows", 0, "unmatched_rows", len(o.Rows))
	if o.Status == "reconciled" {
		row = row.Set("reconciled_at", "2026-10-20T12:00:00Z")
	}
	ciMust(t, S.DB.From("commission_import").Insert(ctx, row, nil))
	w.ID(label, id)
	w.ID(label+"doc", doc)
	w.Vars[label] = id
	for i, cells := range o.Rows {
		rid := uuid.New()
		ciMust(t, S.DB.From("commission_import_row").Insert(ctx, js.O("id", rid, "import_id", id,
			"row_number", i+1, "cells", cells), nil))
		n := label + "row" + js.NumberString(float64(i+1))
		w.ID(n, rid)
		w.Vars[n] = rid
	}
	if o.Store {
		ciMust(t, S.DB.Upload(ctx, ciBucket, key, []byte(ciCSV), service.UploadOptions{ContentType: "text/csv"}))
	}
	return id
}

// ciMap moves a fixture statement to review under the full map, as the map op would.
func ciMap(t *testing.T, w *World, owner *World, label string) {
	t.Helper()
	ctx := context.Background()
	full, err := js.Parse([]byte(ciFullMap))
	ciMust(t, err)
	m, err := statement.ReadColumnMap(full, len(ciHeaders))
	ciMust(t, err)
	var rows []struct {
		ID    string   `json:"id"`
		Cells []string `json:"cells"`
	}
	ciMust(t, S.DB.From("commission_import_row").Select("id, cells").Eq("import_id", w.Vars[label]).
		Order("row_number", true).Rows(ctx, &rows))
	cells := make([][]string, len(rows))
	for i, r := range rows {
		cells[i] = r.Cells
	}
	type mapRow struct {
		ID string `json:"id"`
		statement.ParsedRow
	}
	var out []mapRow
	for i, p := range statement.ParseRows(cells, m, nil) {
		out = append(out, mapRow{ID: rows[i].ID, ParsedRow: p})
	}
	var res struct {
		Outcome string `json:"outcome"`
	}
	_, err = S.DB.RPCRow(ctx, "agent_map_commission_import", js.O("p_agent_id", owner.Agent.AgentID,
		"p_import_id", w.Vars[label], "p_expected_version", 1, "p_column_map", m, "p_statement_date", nil,
		"p_rows", out), &res)
	ciMust(t, err)
	if res.Outcome != "mapped" {
		t.Fatalf("fixture map: %s", res.Outcome)
	}
}

// ciResolve applies a decision to a fixture row in review, as the resolve op would.
func ciResolve(t *testing.T, w, owner *World, label string, version int, args js.Ordered) {
	t.Helper()
	var res struct {
		Outcome string `json:"outcome"`
	}
	_, err := S.DB.RPCRow(context.Background(), "agent_resolve_commission_import_row", js.O("p_agent_id", owner.Agent.AgentID,
		"p_import_id", w.Vars[label], "p_expected_version", version).Spread(args), &res)
	ciMust(t, err)
	if res.Outcome != "resolved" {
		t.Fatalf("fixture resolve: %s", res.Outcome)
	}
}

// ciSnap is everything the import ops write for world w's advisor.
func ciSnap(t *testing.T, w *World) string {
	a := w.Agent
	var imps []struct {
		ID string `json:"id"`
	}
	ciMust(t, S.DB.From("commission_import").Select("id").Eq("agent_id", a.AgentID).Order("created_at", true).Rows(context.Background(), &imps))
	ids := []string{}
	for _, i := range imps {
		ids = append(ids, i.ID)
	}
	rows := "[]"
	if len(ids) > 0 {
		rows = S.Rows(t, S.DB.From("commission_import_row").Select("import_id,row_number,cells,reference,supplier_text,"+
			"traveler_text,gross_cents,received_cents,fee_cents,paid_on,currency,parse_error,state,match_basis,"+
			"suggested_commission_id,commission_id,new_trip_id,new_supplier_id,new_gross_cents,new_commission_pct,"+
			"new_commission_id").In("import_id", ids).Order("import_id", true).Order("row_number", true))
	}
	objs, _ := json.Marshal(ciObjects(t, a.AgentID))
	return "imports " + S.Rows(t, S.DB.From("commission_import").Select("id,agent_id,imported_by_user_id,source,"+
		"original_filename,document_id,checksum_sha256,headers,column_map,statement_date,status,total_rows,"+
		"matched_rows,unmatched_rows,period_start,period_end,version,reconciled_at").Eq("agent_id", a.AgentID).
		Order("created_at", true)) +
		"\nrows " + rows +
		"\ndocuments " + S.Rows(t, S.DB.From("document").Select("id,owner_user_id,kind,filename,mime_type,size_bytes,"+
		"storage_bucket,storage_key,checksum_sha256,is_sensitive,archived_at").Eq("owner_user_id", a.PlatformUserID).
		Eq("kind", "csv_import").Order("created_at", true)) +
		"\nlines " + S.Rows(t, S.DB.From("commission").Select("id,trip_id,supplier_id,gross_booking_cents,commission_pct,"+
		"expected_commission_cents,processing_fee_cents,received_commission_cents,status,received_at,"+
		"inteletravel_reference,import_id,version,on_record_at").Eq("agent_id", a.AgentID).Order("created_at", true).Order("id", true)) +
		"\nfiles " + string(objs)
}

func TestCommissionImport(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := commOther(deno, goW)

	book := func(t *testing.T, w *World) { ciBook(t, w, w, "") }
	mapping := func(o ciImportOpts) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { book(t, w); ciImport(t, w, w, "import", o) }
	}
	review := func(t *testing.T, w *World) {
		mapping(ciImportOpts{Store: true})(t, w)
		ciMap(t, w, w, "import")
	}
	// Ready to reconcile: row1 confirmed by its reference, row2 set to create a line, rows 3
	// and 4 set aside. One line paid and one created, so each audit event type appears once.
	ready := func(t *testing.T, w *World) {
		review(t, w)
		ciResolve(t, w, w, "import", 2, js.O("p_row_id", w.Vars["importrow2"], "p_action", "create",
			"p_trip_id", w.Vars["trip"], "p_supplier_id", w.Vars["supplier"], "p_gross_cents", 50000,
			"p_commission_pct", 12, "p_new_commission_id", w.ID("newline", uuid.New())))
		ciResolve(t, w, w, "import", 3, js.O("p_row_id", w.Vars["importrow3"], "p_action", "ignore"))
		ciResolve(t, w, w, "import", 4, js.O("p_row_id", w.Vars["importrow4"], "p_action", "ignore"))
	}
	theirs := func(t *testing.T, w *World) {
		o := other(w)
		ciBook(t, w, o, "other")
		ciImport(t, w, o, "otherimport", ciImportOpts{Store: true})
		ciMap(t, w, o, "otherimport")
	}
	// The same file is already here: a statement with ciCSV's checksum.
	already := func(status string) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			mapping(ciImportOpts{Status: status, Checksum: ciChecksum(ciCSV)})(t, w)
		}
	}

	tpl := func(s string) func(w *World) string {
		return func(w *World) string {
			r := []string{"{new}", uuid.New(), "{file}", ciB64(ciCSV)}
			for _, k := range []string{"import", "otherimport", "importrow1", "importrow2", "importrow3", "importrow4",
				"otherimportrow2", "trip", "othertrip", "supplier", "oldsupplier", "line1", "line2", "paidline"} {
				r = append(r, "{"+k+"}", w.Vars[k])
			}
			return strings.NewReplacer(r...).Replace(s)
		}
	}
	c := func(name string, setup func(*testing.T, *World), body string, expect int) Case {
		cs := Case{Name: name, Fn: "commission-import", Setup: setup, Body: tpl(body), Expect: expect}
		if setup != nil {
			cs.Snap = ciSnap
		}
		return cs
	}
	// Another world's statement: nothing of this world's changes, and the other world's own
	// rows are not compared (each world's are written by the other's setup, at a different
	// moment).
	noSnap := func(cs Case) Case { cs.Snap = nil; return cs }
	upload := func(file string) string {
		return `{"op":"upload","filename":"Statements/oct.csv","fileBase64":"` + file + `"}`
	}
	const v2 = `"importId":"{import}","expectedVersion":2`
	const v5 = `"importId":"{import}","expectedVersion":5`

	Run(t, deno, goW, []Case{
		// ---- the door ----
		{Name: "GET", Fn: "commission-import", Method: "GET", Expect: 400},
		{Name: "traveler", Fn: "commission-import", Token: func(w *World) string { return w.Traveler.Token },
			Body: tpl(`{"op":"discard"}`), Expect: 403},
		c("not json", nil, `op=upload`, 400),
		c("no op", nil, `{}`, 400),
		c("unknown op", nil, `{"op":"import"}`, 400),

		// ---- upload ----
		c("upload: no name", nil, `{"op":"upload","fileBase64":"{file}"}`, 400),
		c("upload: a folder for a name", nil, `{"op":"upload","filename":"a/b/","fileBase64":"{file}"}`, 400),
		c("upload: no file", nil, `{"op":"upload","filename":"s.csv","fileBase64":""}`, 400),
		c("upload: not base64", nil, `{"op":"upload","filename":"s.csv","fileBase64":"%%%"}`, 400),
		c("upload: an Excel file", nil, upload(ciB64("PK\x03\x04 not really a workbook")), 400),
		c("upload: a NUL byte", nil, upload(ciB64("A,B\n1,\x002\n")), 400),
		c("upload: a header and nothing under it", nil, upload(ciB64("Title\n\nBooking Ref,Commission Paid\n")), 400),
		c("upload: an unclosed quote", nil, upload(ciB64("A,B\n\"1,2\n")), 400),
		c("upload: uploaded", book, upload(`{file}`), 200),
		c("upload: windows-1252 and a title line", book,
			upload(ciB64("Commission Statement\r\nRef,Supplier,Paid To Agent,Paid Date\r\nITV-5,Pe\xf1a Tours,10.00,2026-10-01\r\n,,,\r\n")), 200),
		c("upload: a byte-order mark", book, upload(ciB64("\xef\xbb\xbfREF,Commission\nITV-6,9.99\n")), 200),
		c("upload: the same file again", already("mapping"), upload(`{file}`), 200),
		c("upload: the same file, discarded before", already("discarded"), upload(`{file}`), 200),
		c("upload: guessed from the last statement", func(t *testing.T, w *World) {
			mapping(ciImportOpts{Status: "review", Headers: []string{"Zed", "Amt", "When"},
				Rows: [][]string{{"ITV-1", "1.00", "2026-10-01"}}, Map: `{"reference":0,"received":1,"paid_on":2}`})(t, w)
		}, upload(ciB64("When,Zed,Amt,Notes\n2026-10-02,ITV-2,3.00,x\n")), 200),

		// ---- the statement ops need an id and a version first ----
		c("map: bad statement id", nil, `{"op":"map","importId":"x","expectedVersion":1}`, 400),
		c("resolve: no version", nil, `{"op":"resolve","importId":"{new}","action":"nope"}`, 400),
		c("reconcile: version zero", nil, `{"op":"reconcile","importId":"{new}","expectedVersion":0}`, 400),
		c("discard: version as text", nil, `{"op":"discard","importId":"{new}","expectedVersion":"1"}`, 400),

		// ---- map ----
		c("map: no such statement", nil, `{"op":"map","importId":"{new}","expectedVersion":1,"columnMap":{"received":4}}`, 404),
		noSnap(c("map: the other world's statement", theirs, `{"op":"map","importId":"{otherimport}","expectedVersion":2,"columnMap":`+ciFullMap+`}`, 404)),
		c("map: a discarded statement", mapping(ciImportOpts{Status: "discarded"}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":`+ciFullMap+`}`, 404),
		c("map: no map", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1}`, 400),
		c("map: an unknown field", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"received":4,"amount":1}}`, 400),
		c("map: a column the file lacks", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"received":7}}`, 400),
		c("map: a column used twice", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"received":4,"fee":4}}`, 400),
		c("map: no received column", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"reference":0}}`, 400),
		c("map: an impossible statement date", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"received":4},"statementDate":"2026-02-29"}`, 400),
		c("map: no paid-on date at all", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"received":4,"paid_on":null},"statementDate":""}`, 400),
		c("map: stale", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":2,"columnMap":`+ciFullMap+`}`, 409),
		c("map: mapped", mapping(ciImportOpts{}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":`+ciFullMap+`}`, 200),
		c("map: a statement date for every row", mapping(ciImportOpts{}),
			`{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"reference":0,"received":4,"fee":5},"statementDate":"2026-10-15"}`, 200),
		c("map: a date after today", mapping(ciImportOpts{}),
			`{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":{"reference":0,"received":4},"statementDate":"2099-01-01"}`, 200),
		c("map: again, in review", review, `{"op":"map",`+v2+`,"columnMap":{"traveler":2,"received":4,"paid_on":6}}`, 200),
		c("map: a reconciled statement", mapping(ciImportOpts{Status: "reconciled"}), `{"op":"map","importId":"{import}","expectedVersion":1,"columnMap":`+ciFullMap+`}`, 200),

		// ---- resolve ----
		c("resolve: no action", review, `{"op":"resolve",`+v2+`,"rowId":"x"}`, 400),
		c("resolve: bad row id", review, `{"op":"resolve",`+v2+`,"action":"ignore","rowId":"x"}`, 400),
		c("resolve: match without a line", review, `{"op":"resolve",`+v2+`,"action":"match","rowId":"{importrow2}"}`, 400),
		c("resolve: create without a trip", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","supplierId":"{supplier}"}`, 400),
		c("resolve: create without a gross", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","tripId":"{trip}","supplierId":"{supplier}"}`, 400),
		c("resolve: create with a bad rate", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","tripId":"{trip}","supplierId":"{supplier}","grossCents":1,"commissionPct":"lots"}`, 400),
		c("resolve: no such row", review, `{"op":"resolve",`+v2+`,"action":"ignore","rowId":"{new}"}`, 404),
		noSnap(c("resolve: the other world's statement", theirs, `{"op":"resolve","importId":"{otherimport}","expectedVersion":2,"action":"ignore","rowId":"{otherimportrow2}"}`, 404)),
		c("resolve: stale", review, `{"op":"resolve","importId":"{import}","expectedVersion":1,"action":"ignore","rowId":"{importrow2}"}`, 409),
		c("resolve: still mapping", mapping(ciImportOpts{}), `{"op":"resolve","importId":"{import}","expectedVersion":1,"action":"ignore","rowId":"{importrow2}"}`, 200),
		c("resolve: ignore", review, `{"op":"resolve",`+v2+`,"action":"ignore","rowId":"{importrow2}"}`, 200),
		c("resolve: confirm a suggestion", review, `{"op":"resolve",`+v2+`,"action":"confirm","rowId":"{importrow4}"}`, 200),
		c("resolve: confirm with nothing suggested", review, `{"op":"resolve",`+v2+`,"action":"confirm","rowId":"{importrow2}"}`, 200),
		c("resolve: an unreadable row", review, `{"op":"resolve",`+v2+`,"action":"match","rowId":"{importrow3}","commissionId":"{line2}"}`, 200),
		c("resolve: match", review, `{"op":"resolve",`+v2+`,"action":"match","rowId":"{importrow2}","commissionId":"{line2}"}`, 200),
		c("resolve: match a paid line", review, `{"op":"resolve",`+v2+`,"action":"match","rowId":"{importrow2}","commissionId":"{paidline}"}`, 200),
		c("resolve: match the seed advisor's line", review, `{"op":"resolve",`+v2+`,"action":"match","rowId":"{importrow2}","commissionId":"`+commSeedLine+`"}`, 200),
		c("resolve: create on another's trip", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","tripId":"`+commSeedTrip+`","supplierId":"{supplier}","grossCents":"50000","commissionPct":12}`, 200),
		c("resolve: create with an archived supplier", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","tripId":"{trip}","supplierId":"{oldsupplier}","grossCents":"50000","commissionPct":12}`, 200),
		c("resolve: create", review, `{"op":"resolve",`+v2+`,"action":"create","rowId":"{importrow2}","tripId":"{trip}","supplierId":"{supplier}","grossCents":"50000","commissionPct":"12.345"}`, 200),

		// ---- reconcile ----
		c("reconcile: no such statement", nil, `{"op":"reconcile","importId":"{new}","expectedVersion":1}`, 404),
		noSnap(c("reconcile: the other world's statement", theirs, `{"op":"reconcile","importId":"{otherimport}","expectedVersion":2}`, 404)),
		c("reconcile: stale", ready, `{"op":"reconcile","importId":"{import}","expectedVersion":4}`, 409),
		c("reconcile: still mapping", mapping(ciImportOpts{}), `{"op":"reconcile","importId":"{import}","expectedVersion":1}`, 200),
		c("reconcile: decisions owed", review, `{"op":"reconcile",`+v2+`}`, 200),
		c("reconcile: reconciled", ready, `{"op":"reconcile",`+v5+`}`, 200),

		// ---- discard ----
		c("discard: no such statement", nil, `{"op":"discard","importId":"{new}","expectedVersion":1}`, 404),
		noSnap(c("discard: the other world's statement", theirs, `{"op":"discard","importId":"{otherimport}","expectedVersion":2}`, 404)),
		c("discard: already discarded", mapping(ciImportOpts{Status: "discarded", Store: true}), `{"op":"discard","importId":"{import}","expectedVersion":1}`, 404),
		c("discard: stale", review, `{"op":"discard","importId":"{import}","expectedVersion":1}`, 409),
		c("discard: reconciled", mapping(ciImportOpts{Status: "reconciled", Store: true}), `{"op":"discard","importId":"{import}","expectedVersion":1}`, 200),
		c("discard: discarded", review, `{"op":"discard",`+v2+`}`, 200),
		c("discard: while mapping", mapping(ciImportOpts{Store: true}), `{"op":"discard","importId":"{import}","expectedVersion":1}`, 200),
	})
}
