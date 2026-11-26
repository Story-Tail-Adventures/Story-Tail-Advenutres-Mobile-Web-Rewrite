package commissionimport

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/statement"
)

func parse(t *testing.T, body string) js.Value {
	t.Helper()
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	return v
}

func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	if err == nil {
		t.Fatalf("want %d %q, got success", status, detail)
	}
	p, ok := problem.As(err)
	if status == 500 {
		if ok {
			t.Fatalf("want a plain error (500), got %d %q", p.Status, p.Detail)
		}
		return
	}
	if !ok || p.Status != status || p.Detail != detail {
		t.Fatalf("want %d %q, got %v", status, detail, err)
	}
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func TestOneOf(t *testing.T) {
	for _, v := range []string{`{}`, `{"op":"delete"}`, `{"op":1}`} {
		_, err := oneOf(parse(t, v).Get("op"), ops, "op")
		wantProblem(t, err, 400, "op must be one of: upload, map, resolve, reconcile, discard.")
	}
	_, err := oneOf(parse(t, `{"action":"Confirm"}`).Get("action"), actions, "action")
	wantProblem(t, err, 400, "action must be one of: confirm, match, create, ignore.")
}

func TestReadUpload(t *testing.T) {
	csv := "Booking Ref,Commission Paid\r\nITV-1,115.00\r\n"
	f, err := readUpload(parse(t, `{"filename":"C:\\Users\\me\\statement.csv","fileBase64":"`+b64(csv)+`"}`))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(csv))
	if f.Filename != "statement.csv" || string(f.Bytes) != csv || f.Checksum != `\x`+hex.EncodeToString(sum[:]) {
		t.Errorf("upload %+v", f)
	}
	if !reflect.DeepEqual(f.Statement.Headers, []string{"Booking Ref", "Commission Paid"}) || len(f.Statement.Rows) != 1 {
		t.Errorf("statement %+v", f.Statement)
	}

	for _, c := range []struct{ body, detail string }{
		{`{"fileBase64":"x"}`, "The file needs a name."},
		{`{"filename":"  ","fileBase64":"x"}`, "The file needs a name."},
		{`{"filename":"s.csv"}`, "Choose a CSV file to upload."},
		{`{"filename":"s.csv","fileBase64":"***"}`, "That file didn't come through. Try uploading it again."},
		{`{"filename":"s.xlsx","fileBase64":"` + b64("PK\x03\x04rest") + `"}`, "That's an Excel file. Save it as CSV (File, Save As, CSV) and upload that."},
		{`{"filename":"s.csv","fileBase64":"` + b64("Only,a header\n") + `"}`, "The file needs a header row and at least one row under it."},
	} {
		_, err := readUpload(parse(t, c.body))
		wantProblem(t, err, 400, c.detail)
	}
}

func TestPreviousMap(t *testing.T) {
	prev, err := previousMap(nil, json.RawMessage(`{"received": 1, "reference": 0, "fee": 1.5, "paid_on": "2"}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(prev.Headers) != 0 || !reflect.DeepEqual(prev.ColumnMap.AsMap(), map[string]int{"received": 1, "reference": 0}) {
		t.Errorf("previous %+v", prev)
	}
	// Last month's headers, in a new order, map themselves.
	prev, _ = previousMap([]string{"Ref", "Paid To Agent"}, json.RawMessage(`{"reference":0,"received":1}`))
	got := statement.GuessColumnMap([]string{"Paid To Agent", "Ref"}, prev)
	if !reflect.DeepEqual(got.AsMap(), map[string]int{"reference": 1, "received": 0}) {
		t.Errorf("guess %v", got.AsMap())
	}
	if prev, _ := previousMap([]string{"A"}, nil); prev == nil || len(prev.ColumnMap.AsMap()) != 0 {
		t.Errorf("null map %+v", prev)
	}
}

func TestReadMap(t *testing.T) {
	m, date, err := readMap(parse(t, `{"columnMap":{"reference":0,"received":1,"paid_on":null},"statementDate":"2026-10-01"}`), 3)
	if err != nil || *date != "2026-10-01" || !reflect.DeepEqual(m.AsMap(), map[string]int{"reference": 0, "received": 1}) {
		t.Fatalf("%v %v %v", m.AsMap(), date, err)
	}
	if b, _ := json.Marshal(m); string(b) != `{"reference":0,"received":1}` {
		t.Errorf("map json %s", b)
	}
	_, date, err = readMap(parse(t, `{"columnMap":{"received":1,"paid_on":2},"statementDate":""}`), 3)
	if err != nil || date != nil {
		t.Fatalf("%v %v", date, err)
	}
	for _, c := range []struct{ body, detail string }{
		{`{}`, "Send the column map as an object."},
		{`{"columnMap":[1]}`, "Send the column map as an object."},
		{`{"columnMap":{"amount":1}}`, "Unknown field in the column map: amount."},
		{`{"columnMap":{"received":3}}`, "A column in the map is not one of this file's columns."},
		{`{"columnMap":{"received":1,"fee":1}}`, "Each column can be used for one thing only."},
		{`{"columnMap":{"reference":0}}`, "Choose the column that holds the commission paid."},
		{`{"columnMap":{"received":1},"statementDate":"2026-02-30"}`, "Statement date must be a date."},
		{`{"columnMap":{"received":1},"statementDate":7}`, "Statement date must be a date."},
		{`{"columnMap":{"received":1},"statementDate":null}`, "Choose the paid-on column, or enter the date the statement paid."},
	} {
		_, _, err := readMap(parse(t, c.body), 3)
		wantProblem(t, err, 400, c.detail)
	}
}

func TestMapRowJSON(t *testing.T) {
	ref, cents, date := "ITV-1", int64(11500), "2026-10-01"
	b, err := json.Marshal(mapRow{ID: "r1", ParsedRow: statement.ParsedRow{Reference: &ref, ReceivedCents: &cents, PaidOn: &date}})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"id":"r1","reference":"ITV-1","supplier":null,"traveler":null,"gross_cents":null,"received_cents":11500,"fee_cents":null,"paid_on":"2026-10-01","parse_error":null}`
	if string(b) != want {
		t.Errorf("got  %s\nwant %s", b, want)
	}
}

func TestResolveArgs(t *testing.T) {
	newID := func() string { return "new-line" }
	marshal := func(o js.Ordered) string { b, _ := json.Marshal(o); return string(b) }
	const row = "0195a2c0-1a00-7000-8000-0000000000aa"
	const line = "0195a2c0-1a00-7000-8000-0000000000bb"
	head := `"p_agent_id":"agent","p_import_id":"imp","p_expected_version":2,"p_row_id":"` + row + `"`

	args, err := resolveArgs(parse(t, `{"action":"ignore","rowId":"`+row+`","commissionId":"x"}`), "agent", "imp", 2, newID)
	if err != nil || marshal(args) != `{`+head+`,"p_action":"ignore"}` {
		t.Errorf("ignore %s %v", marshal(args), err)
	}
	args, err = resolveArgs(parse(t, `{"action":"match","rowId":"`+row+`","commissionId":"`+line+`"}`), "agent", "imp", 2, newID)
	if err != nil || marshal(args) != `{`+head+`,"p_action":"match","p_commission_id":"`+line+`"}` {
		t.Errorf("match %s %v", marshal(args), err)
	}
	args, err = resolveArgs(parse(t, `{"action":"create","rowId":"`+row+`","tripId":"`+line+`","supplierId":"`+row+`","grossCents":"100000","commissionPct":"12.5"}`), "agent", "imp", 2, newID)
	want := `{` + head + `,"p_action":"create","p_trip_id":"` + line + `","p_supplier_id":"` + row + `","p_gross_cents":100000,"p_commission_pct":12.5,"p_new_commission_id":"new-line"}`
	if err != nil || marshal(args) != want {
		t.Errorf("create %s %v", marshal(args), err)
	}

	for _, c := range []struct{ body, detail string }{
		{`{"rowId":"x"}`, "action must be one of: confirm, match, create, ignore."},
		{`{"action":"confirm","rowId":"x"}`, "That is not a statement row id."},
		{`{"action":"match","rowId":"` + row + `"}`, "That is not a commission line id."},
		{`{"action":"create","rowId":"` + row + `","supplierId":"x"}`, "That is not a trip id."},
		{`{"action":"create","rowId":"` + row + `","tripId":"` + line + `"}`, "That is not a supplier id."},
		{`{"action":"create","rowId":"` + row + `","tripId":"` + line + `","supplierId":"` + row + `"}`, "Gross is required."},
		{`{"action":"create","rowId":"` + row + `","tripId":"` + line + `","supplierId":"` + row + `","grossCents":1}`, "Commission rate is required."},
		{`{"action":"create","rowId":"` + row + `","tripId":"` + line + `","supplierId":"` + row + `","grossCents":1,"commissionPct":-1}`, "Commission rate must be between 0 and 100."},
	} {
		_, err := resolveArgs(parse(t, c.body), "agent", "imp", 2, newID)
		wantProblem(t, err, 400, c.detail)
	}
}

func TestCheckAndReconcileReply(t *testing.T) {
	v := int64(4)
	wantProblem(t, check(false, result{}, "No such statement.", mapOutcomes, "x"), 404, "No such statement.")
	wantProblem(t, check(true, result{Outcome: "not_found"}, "No such statement row.", resolveOutcomes, "x"), 404, "No such statement row.")
	wantProblem(t, check(true, result{Outcome: "stale", Version: &v}, "No such statement.", discardOutcomes, "x"),
		409, "This statement changed since you opened it. Reload and try again.")
	wantProblem(t, check(true, result{Outcome: "resolved"}, "No such statement.", mapOutcomes, "unknown map outcome"), 500, "")
	if err := check(true, result{Outcome: "line_unavailable"}, "", resolveOutcomes, "x"); err != nil {
		t.Error(err)
	}

	n := func(i int64) *int64 { return &i }
	reply, err := reconcileReply("imp", true, result{Outcome: "reconciled", Version: n(5), PaidCount: n(2), CreatedCount: n(1),
		AlreadyCount: n(0), BlockingCount: n(0)})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := js.Marshal(reply.Body)
	if string(b) != `{"outcome":"reconciled","importId":"imp","version":5,"paid":2,"created":1,"alreadyRecorded":0,"blocking":0}` {
		t.Errorf("reply %s", b)
	}
	_, err = reconcileReply("imp", true, result{Outcome: "mapped"})
	wantProblem(t, err, 500, "")
	if ids := auditIDs(); len(ids) != 1001 || ids[0] == ids[1000] || !strings.Contains(ids[0], "-7") {
		t.Errorf("audit ids %d %s", len(ids), ids[0])
	}
}
