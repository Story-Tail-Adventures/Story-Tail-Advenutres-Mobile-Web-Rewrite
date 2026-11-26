package agentcommission

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// fakeDB answers one RPC with a canned reply and records what it was asked.
type fakeDB struct {
	reply string // the raw JSON PostgREST would answer
	err   error
	fn    string
	args  string
	calls int
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	f.calls++
	f.fn = fn
	b, err := json.Marshal(args)
	if err != nil {
		return err
	}
	f.args = string(b)
	if f.err != nil {
		return f.err
	}
	if out == nil || f.reply == "" {
		return nil
	}
	return json.Unmarshal([]byte(f.reply), out)
}

// RPCRow is service.Client.RPCRow's contract: an array reply gives its first element, an
// empty array or null is not found.
func (f *fakeDB) RPCRow(ctx context.Context, fn string, args any, out any) (bool, error) {
	var raw json.RawMessage
	if err := f.RPC(ctx, fn, args, &raw); err != nil {
		return false, err
	}
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || string(t) == "null" || string(t) == "[]" {
		return false, nil
	}
	if t[0] == '[' {
		var rows []json.RawMessage
		if err := json.Unmarshal(t, &rows); err != nil {
			return false, err
		}
		t = rows[0]
	}
	return true, json.Unmarshal(t, out)
}

const (
	agentID = "0195a2c0-1a00-7000-8000-0000000000aa"
	lineID  = "0195a2c0-1a00-7000-8000-0000000000bb"
	tripID  = "0195a2c0-1a00-7000-8000-0000000000cc"
	supID   = "0195a2c0-1a00-7000-8000-0000000000dd"
)

func testCaller() *caller.Context {
	ua := "test/1"
	return &caller.Context{PlatformUserID: "pu-1", Role: caller.RoleAgent, UserAgent: &ua}
}

// ids hands out audit-1, line-1 ... in the order the route mints them.
func ids() func() string {
	n := 0
	names := []string{"audit-1", "line-1"}
	return func() string { n++; return names[n-1] }
}

func call(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	payload, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := run(context.Background(), db, testCaller(), agentID, payload, ids())
	if err != nil {
		return "", err
	}
	if reply.Status != 200 {
		t.Fatalf("status %d", reply.Status)
	}
	b, err := js.Marshal(reply.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b), nil
}

// wantProblem checks a refusal's status and detail; status 500 means a plain error.
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

const line = `"supplierId":"` + supID + `","grossCents":"100000","commissionPct":"12.345","paymentTerms":"after_travel","paymentLagDays":60`

func TestOpIsCheckedFirst(t *testing.T) {
	for _, body := range []string{`{}`, `{"op":"delete"}`, `{"op":["create"]}`, `{"op":"Create"}`} {
		db := &fakeDB{}
		_, err := call(t, db, body)
		wantProblem(t, err, 400, "op must be one of: create, update, payment, remove, export, weights.")
		if db.calls != 0 {
			t.Errorf("%s reached the database", body)
		}
	}
}

func TestCreateValidationOrder(t *testing.T) {
	cases := []struct{ body, detail string }{
		{`{"op":"create"}`, "That is not a trip id."},
		{`{"op":"create","tripId":"x","status":"lost"}`, "That is not a trip id."},
		{`{"op":"create","tripId":"` + tripID + `","status":"received"}`, "Status must be one of: expected, invoiced."},
		{`{"op":"create","tripId":"` + tripID + `"}`, "That is not a supplier id."},
		{`{"op":"create","tripId":"` + tripID + `","status":null,"supplierId":"` + supID + `"}`, "Gross is required."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":""}`, "Gross is required."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":-1}`, "Gross cannot be negative."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1}`, "Commission rate is required."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1,"commissionPct":"x"}`, "Commission rate must be a number."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1,"commissionPct":101}`, "Commission rate must be between 0 and 100."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1,"commissionPct":5}`, "Payment terms must be one of: at_booking, after_travel."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking"}`, "Payment days must be a whole number."},
		{`{"op":"create","tripId":"` + tripID + `","supplierId":"` + supID + `","grossCents":1,"commissionPct":5,"paymentTerms":"at_booking","paymentLagDays":366}`, "Payment days must be between 0 and 365."},
		{`{"op":"create","tripId":"` + tripID + `",` + line + `,"inteletravelReference":7}`, "Inteletravel reference must be text."},
		{`{"op":"create","tripId":"` + tripID + `",` + line + `,"notes":false}`, "Notes must be text."},
	}
	for _, c := range cases {
		db := &fakeDB{}
		_, err := call(t, db, c.body)
		wantProblem(t, err, 400, c.detail)
		if db.calls != 0 {
			t.Errorf("%s reached the database", c.body)
		}
	}
}

func TestCreateArgsAndOutcomes(t *testing.T) {
	body := `{"op":"create","tripId":"` + tripID + `",` + line + `,"inteletravelReference":"  ITV-1 ","notes":"  "}`
	db := &fakeDB{reply: `[{"outcome":"created","commission_id":"line-1","version":1}]`}
	got, err := call(t, db, body)
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"outcome":"created","commissionId":"line-1","version":1}` {
		t.Errorf("reply %s", got)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_commission_id":"line-1","p_trip_id":"` + tripID + `","p_status":"expected",` +
		`"p_supplier_id":"` + supID + `","p_gross_cents":100000,"p_commission_pct":12.35,"p_payment_terms":"after_travel",` +
		`"p_payment_lag_days":60,"p_inteletravel_reference":"ITV-1","p_notes":null,` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_create_commission" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}

	for _, c := range []struct {
		reply, want string
		status      int
		detail      string
	}{
		{`[]`, "", 404, "That advisor cannot add commission lines."},
		{`null`, "", 404, "That advisor cannot add commission lines."},
		{`[{"outcome":"trip_not_found","commission_id":null,"version":null}]`, "", 404, "No such trip on your book."},
		{`[{"outcome":"duplicate_reference","commission_id":null,"version":null}]`, `{"outcome":"duplicate_reference"}`, 200, ""},
		{`[{"outcome":"supplier_not_found","commission_id":null,"version":null}]`, `{"outcome":"supplier_not_found"}`, 200, ""},
		{`[{"outcome":"weird","commission_id":null,"version":null}]`, "", 500, ""},
	} {
		got, err := call(t, &fakeDB{reply: c.reply}, body)
		if c.status == 200 {
			if err != nil || got != c.want {
				t.Errorf("%s: %s %v", c.reply, got, err)
			}
			continue
		}
		wantProblem(t, err, c.status, c.detail)
	}

	// The status defaults to expected only when absent or null; invoiced is kept.
	db = &fakeDB{reply: `[{"outcome":"created","commission_id":"line-1","version":1}]`}
	if _, err := call(t, db, `{"op":"create","tripId":"`+tripID+`","status":"invoiced",`+line+`}`); err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains([]byte(db.args), []byte(`"p_status":"invoiced"`)) {
		t.Errorf("args %s", db.args)
	}

	// A database failure is a plain error (a 500), never a problem.
	_, err = call(t, &fakeDB{err: errors.New("boom")}, body)
	wantProblem(t, err, 500, "")
}

func TestLineOpsNeedIDAndVersionFirst(t *testing.T) {
	for _, op := range []string{"update", "payment", "remove"} {
		_, err := call(t, &fakeDB{}, `{"op":"`+op+`","status":"nope"}`)
		wantProblem(t, err, 400, "That is not a commission line id.")
		_, err = call(t, &fakeDB{}, `{"op":"`+op+`","commissionId":"`+lineID+`","status":"nope"}`)
		wantProblem(t, err, 400, "Send the expectedVersion the board was rendered from.")
		_, err = call(t, &fakeDB{}, `{"op":"`+op+`","commissionId":"`+lineID+`","expectedVersion":2147483648}`)
		wantProblem(t, err, 400, "Send the expectedVersion the board was rendered from.")
	}
}

func TestUpdate(t *testing.T) {
	head := `{"op":"update","commissionId":"` + lineID + `","expectedVersion":2`
	_, err := call(t, &fakeDB{}, head+`}`)
	wantProblem(t, err, 400, "Status must be one of: expected, invoiced, received, disputed, lost.")
	_, err = call(t, &fakeDB{}, head+`,"status":"lost"}`)
	wantProblem(t, err, 400, "That is not a supplier id.")

	db := &fakeDB{reply: `[{"outcome":"changed","version":3}]`}
	got, err := call(t, db, head+`,"status":"lost","clearPayment":"true",`+line+`}`)
	if err != nil || got != `{"outcome":"changed","commissionId":"`+lineID+`","version":3}` {
		t.Fatalf("%s %v", got, err)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_commission_id":"` + lineID + `","p_expected_version":2,"p_status":"lost",` +
		`"p_clear_payment":false,"p_supplier_id":"` + supID + `","p_gross_cents":100000,"p_commission_pct":12.35,` +
		`"p_payment_terms":"after_travel","p_payment_lag_days":60,"p_inteletravel_reference":null,"p_notes":null,` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_update_commission" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}
	db = &fakeDB{reply: `[{"outcome":"changed","version":3}]`}
	if _, err := call(t, db, head+`,"status":"lost","clearPayment":true,`+line+`}`); err != nil ||
		!bytes.Contains([]byte(db.args), []byte(`"p_clear_payment":true`)) {
		t.Errorf("clearPayment true: %s %v", db.args, err)
	}

	body := head + `,"status":"expected",` + line + `}`
	for _, c := range []struct {
		reply, want string
		status      int
		detail      string
	}{
		{`[]`, "", 404, "No such commission line."},
		{`[{"outcome":"not_found","version":null}]`, "", 404, "No such commission line."},
		{`[{"outcome":"stale","version":4}]`, "", 409, "This line changed since you opened it. Reload and try again."},
		{`[{"outcome":"needs_payment","version":2}]`, "", 400, "Use Mark received to record money against a line."},
		{`[{"outcome":"noop","version":2}]`, `{"outcome":"noop","commissionId":"` + lineID + `","version":2}`, 200, ""},
		{`[{"outcome":"payment_would_clear","version":2}]`, `{"outcome":"payment_would_clear","commissionId":"` + lineID + `","version":2}`, 200, ""},
		{`[{"outcome":"duplicate_reference","version":2}]`, `{"outcome":"duplicate_reference","commissionId":"` + lineID + `","version":2}`, 200, ""},
		{`[{"outcome":"supplier_not_found","version":2}]`, `{"outcome":"supplier_not_found","commissionId":"` + lineID + `","version":2}`, 200, ""},
		{`[{"outcome":"removed","version":2}]`, "", 500, ""},
	} {
		got, err := call(t, &fakeDB{reply: c.reply}, body)
		if c.status == 200 {
			if err != nil || got != c.want {
				t.Errorf("%s: %s %v", c.reply, got, err)
			}
			continue
		}
		wantProblem(t, err, c.status, c.detail)
	}
}

func TestPayment(t *testing.T) {
	head := `{"op":"payment","commissionId":"` + lineID + `","expectedVersion":2`
	for _, c := range []struct{ rest, detail string }{
		{`}`, "Status must be one of: received, disputed."},
		{`,"status":"expected"}`, "Status must be one of: received, disputed."},
		{`,"status":"received"}`, "Amount received is required."},
		{`,"status":"received","receivedCents":"1.5"}`, "Amount received must be a number."},
		{`,"status":"received","receivedCents":0}`, "A line marked received needs the amount that arrived. Nothing arrived? Record it as disputed."},
		{`,"status":"received","receivedCents":"0","feeCents":"x"}`, "A line marked received needs the amount that arrived. Nothing arrived? Record it as disputed."},
		{`,"status":"disputed","receivedCents":0,"feeCents":"x"}`, "Processing fee must be a number."},
		{`,"status":"disputed","receivedCents":0}`, "Received on must be a date."},
		{`,"status":"disputed","receivedCents":0,"receivedAt":"2026-02-30"}`, "Received on must be a date."},
	} {
		db := &fakeDB{}
		_, err := call(t, db, head+c.rest)
		wantProblem(t, err, 400, c.detail)
		if db.calls != 0 {
			t.Errorf("%s reached the database", c.rest)
		}
	}

	body := head + `,"status":"received","receivedCents":"81794","feeCents":1246,"receivedAt":"2026-10-01"}`
	db := &fakeDB{reply: `[{"outcome":"recorded","version":3,"gap_cents":"0"}]`}
	got, err := call(t, db, body)
	if err != nil || got != `{"outcome":"recorded","commissionId":"`+lineID+`","version":3,"gapCents":"0"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_commission_id":"` + lineID + `","p_expected_version":2,"p_status":"received",` +
		`"p_received_cents":81794,"p_fee_cents":1246,"p_received_at":"2026-10-01",` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_record_commission_payment" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}
	for _, c := range []struct {
		reply, want string
		status      int
		detail      string
	}{
		{`[]`, "", 404, "No such commission line."},
		{`[{"outcome":"not_found","version":null,"gap_cents":null}]`, "", 404, "No such commission line."},
		{`[{"outcome":"stale","version":5,"gap_cents":null}]`, "", 409, "This line changed since you opened it. Reload and try again."},
		{`[{"outcome":"bad_date","version":2,"gap_cents":null}]`, `{"outcome":"bad_date","commissionId":"` + lineID + `","version":2,"gapCents":null}`, 200, ""},
		{`[{"outcome":"noop","version":2,"gap_cents":"-12"}]`, `{"outcome":"noop","commissionId":"` + lineID + `","version":2,"gapCents":"-12"}`, 200, ""},
		{`[{"outcome":"changed","version":2,"gap_cents":null}]`, "", 500, ""},
	} {
		got, err := call(t, &fakeDB{reply: c.reply}, body)
		if c.status == 200 {
			if err != nil || got != c.want {
				t.Errorf("%s: %s %v", c.reply, got, err)
			}
			continue
		}
		wantProblem(t, err, c.status, c.detail)
	}
}

func TestRemove(t *testing.T) {
	body := `{"op":"remove","commissionId":"` + lineID + `","expectedVersion":1}`
	db := &fakeDB{reply: `[{"outcome":"removed","version":2}]`}
	got, err := call(t, db, body)
	if err != nil || got != `{"outcome":"removed","commissionId":"`+lineID+`","version":2}` {
		t.Fatalf("%s %v", got, err)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_commission_id":"` + lineID + `","p_expected_version":1,` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_remove_commission" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}
	for _, c := range []struct {
		reply, want string
		status      int
		detail      string
	}{
		{`null`, "", 404, "No such commission line."},
		{`[{"outcome":"not_found","version":null}]`, "", 404, "No such commission line."},
		{`[{"outcome":"stale","version":3}]`, "", 409, "This line changed since you opened it. Reload and try again."},
		{`[{"outcome":"not_removable","version":1}]`, `{"outcome":"not_removable","commissionId":"` + lineID + `","version":1}`, 200, ""},
		{`[{"outcome":"noop","version":1}]`, "", 500, ""},
	} {
		got, err := call(t, &fakeDB{reply: c.reply}, body)
		if c.status == 200 {
			if err != nil || got != c.want {
				t.Errorf("%s: %s %v", c.reply, got, err)
			}
			continue
		}
		wantProblem(t, err, c.status, c.detail)
	}
}

func TestWeights(t *testing.T) {
	ok := `{"inquiry":20,"proposal":50,"booked":100,"in_progress":100}`
	_, err := call(t, &fakeDB{}, `{"op":"weights","weights":7}`)
	wantProblem(t, err, 400, "Expected weights must be an object.")
	_, err = call(t, &fakeDB{}, `{"op":"weights","expected":`+ok+`}`)
	wantProblem(t, err, 400, "Weights must be an object.")
	_, err = call(t, &fakeDB{}, `{"op":"weights","expected":`+ok+`,"weights":{"inquiry":20}}`)
	wantProblem(t, err, 400, "Weights must cover Inquiry, Proposal, Booked and Traveling.")
	_, err = call(t, &fakeDB{}, `{"op":"weights","expected":`+ok+`,"weights":{"inquiry":20.5,"proposal":50,"booked":100,"in_progress":100}}`)
	wantProblem(t, err, 400, "Each weight must be a whole number from 0 to 100.")

	body := `{"op":"weights","expected":` + ok + `,"weights":{"in_progress":90,"booked":80,"proposal":40,"inquiry":10}}`
	db := &fakeDB{reply: `[{"outcome":"saved"}]`}
	got, err := call(t, db, body)
	if err != nil || got != `{"outcome":"saved"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_expected":{"inquiry":20,"proposal":50,"booked":100,"in_progress":100},` +
		`"p_weights":{"inquiry":10,"proposal":40,"booked":80,"in_progress":90},` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_set_pipeline_weights" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}
	got, err = call(t, &fakeDB{reply: `[{"outcome":"noop"}]`}, body)
	if err != nil || got != `{"outcome":"noop"}` {
		t.Errorf("noop: %s %v", got, err)
	}
	_, err = call(t, &fakeDB{reply: `[]`}, body)
	wantProblem(t, err, 404, "Your forecast weights couldn't be found.")
	_, err = call(t, &fakeDB{reply: `[{"outcome":"stale"}]`}, body)
	wantProblem(t, err, 409, "These weights were changed somewhere else, so yours weren't saved. Reload the page and try again.")
	_, err = call(t, &fakeDB{reply: `[{"outcome":"changed"}]`}, body)
	wantProblem(t, err, 500, "")
}

func TestExport(t *testing.T) {
	_, err := call(t, &fakeDB{}, `{"op":"export","filters":{"statuses":"lost"}}`)
	wantProblem(t, err, 400, "statuses must be a list.")
	_, err = call(t, &fakeDB{}, `{"op":"export","filters":{"statuses":["lost","won"]}}`)
	wantProblem(t, err, 400, "Status must be one of: expected, invoiced, received, disputed, lost.")
	_, err = call(t, &fakeDB{}, `{"op":"export","filters":{"travelFrom":"2026-13-01"}}`)
	wantProblem(t, err, 400, "Travel from must be a date.")

	db := &fakeDB{reply: `[]`}
	got, err := call(t, db, `{"op":"export"}`)
	if err != nil {
		t.Fatal(err)
	}
	header := "Trip,Client,Supplier,Travel start,Travel end,Status,Gross,Rate %,Expected,Fee,Received,Received on,Payment terms,Payment days,Inteletravel reference,Currency\\r\\n"
	if got != `{"outcome":"exported","rowCount":0,"csv":"`+header+`"}` {
		t.Errorf("empty export %s", got)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_status":null,"p_supplier_id":null,"p_trip_id":null,"p_travel_from":null,"p_travel_to":null,` +
		`"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":null,"p_user_agent":"test/1"}`
	if db.fn != "agent_export_commission" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}

	db = &fakeDB{reply: `[{"trip_title":"=Sum","client_display_name":"Jo, Hayes","supplier_name":"Sandals","travel_start":"2026-12-01",` +
		`"travel_end":null,"status":"received","gross_booking_cents":"692000","commission_pct":12.00,"expected_commission_cents":"83040",` +
		`"processing_fee_cents":"1246","received_commission_cents":"81794","received_at":"2026-10-01","payment_terms":"after_travel",` +
		`"payment_lag_days":60,"inteletravel_reference":null,"currency":"USD"}]`}
	got, err = call(t, db, `{"op":"export","filters":{"statuses":["received","received"],"supplierId":"","tripId":null}}`)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"outcome":"exported","rowCount":1,"csv":"` + header +
		`'=Sum,\"Jo, Hayes\",Sandals,2026-12-01,,received,6920.00,12,830.40,12.46,817.94,2026-10-01,After travel,60,,USD\r\n"}`
	if got != want {
		t.Errorf("export\n got %s\nwant %s", got, want)
	}
	if !bytes.Contains([]byte(db.args), []byte(`"p_status":["received"]`)) {
		t.Errorf("args %s", db.args)
	}

	_, err = call(t, &fakeDB{reply: `null`}, `{"op":"export"}`)
	wantProblem(t, err, 404, "That advisor cannot export.")
	_, err = call(t, &fakeDB{reply: `{"rows":[]}`}, `{"op":"export"}`)
	wantProblem(t, err, 500, "")
	_, err = call(t, &fakeDB{err: errors.New("boom")}, `{"op":"export"}`)
	wantProblem(t, err, 500, "")
}
