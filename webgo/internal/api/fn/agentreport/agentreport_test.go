package agentreport

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// fakeDB answers one RPC with a canned reply and records what it was asked.
type fakeDB struct {
	reply string
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

const agentID = "0195a2c0-1a00-7000-8000-0000000000aa"

var now = time.Date(2026, 11, 6, 23, 30, 0, 0, time.UTC)

func send(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	payload, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	ip := "203.0.113.7"
	c := &caller.Context{PlatformUserID: "pu-1", Role: caller.RoleAgent, IP: &ip}
	reply, err := run(context.Background(), db, c, agentID, payload, "audit-1", now)
	if err != nil {
		return "", err
	}
	b, err := js.Marshal(reply.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b), nil
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

const audit = `"p_actor_user_id":"pu-1","p_audit_id":"audit-1","p_ip":"203.0.113.7","p_user_agent":null`

func TestOp(t *testing.T) {
	for _, body := range []string{`{}`, `{"op":"csv"}`, `{"op":["export"]}`, `{"op":null,"report":"revenue"}`} {
		db := &fakeDB{}
		_, err := send(t, db, body)
		wantProblem(t, err, 400, "op must be: export, center.")
		if db.calls != 0 {
			t.Errorf("%s reached the database", body)
		}
	}
}

func TestCenterValidation(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{"op":"center"}`, "Pick what to export: commission ledger, trips, payment milestones or clients."},
		{`{"op":"center","type":"ledger"}`, "Pick a From date."},
		{`{"op":"center","type":"trips","from":"2026-01-01"}`, "Pick a To date."},
		{`{"op":"center","type":"trips","from":"2026-02-30","to":"x"}`, "That From date isn't a real date."},
		{`{"op":"center","type":"trips","from":"2026-03-01","to":"2026-02-01"}`, "The From date needs to be on or before the To date."},
		{`{"op":"center","type":"clients","from":"2026-01-01"}`, "The Clients export covers everyone on your book, so it doesn't use dates."},
		{`{"op":"center","type":"clients","includeContact":"yes"}`, "Something went wrong with the contact details box. Reload the page and try again."},
		{`{"op":"center","type":"trips","from":"2026-01-01","to":"2026-01-01","includeContact":true}`, "Contact details can only go in the Clients export. Switch the type, or uncheck the box."},
	} {
		db := &fakeDB{}
		_, err := send(t, db, c.body)
		wantProblem(t, err, 400, c.detail)
		if db.calls != 0 {
			t.Errorf("%s reached the database", c.body)
		}
	}
}

const ledgerHeader = "Trip,Client,Supplier,Travel start,Travel end,Status,Gross,Rate %,Expected,Fee,Received,Received on,Payment terms,Payment days,Inteletravel reference,Currency\\r\\n"

func TestCenterLedger(t *testing.T) {
	db := &fakeDB{reply: `[]`}
	got, err := send(t, db, `{"op":"center","type":"ledger","from":"2026-01-01","to":"2026-10-21","includeContact":false}`)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"outcome":"exported","rowCount":0,"csv":"` + ledgerHeader + `","fileName":"commission-ledger-2026-01-01-to-2026-10-21.csv"}`
	if got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_status":null,"p_supplier_id":null,"p_trip_id":null,` +
		`"p_travel_from":"2026-01-01","p_travel_to":"2026-10-21",` + audit + `}`
	if db.fn != "agent_export_commission" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}
	_, err = send(t, &fakeDB{reply: `null`}, `{"op":"center","type":"ledger","from":"2026-01-01","to":"2026-10-21"}`)
	wantProblem(t, err, 404, "That advisor cannot export.")
	_, err = send(t, &fakeDB{reply: `{"rows":[]}`}, `{"op":"center","type":"ledger","from":"2026-01-01","to":"2026-10-21"}`)
	wantProblem(t, err, 500, "")
}

func TestCenterTripsAndClients(t *testing.T) {
	db := &fakeDB{reply: `{"from":"2026-01-01","to":"2026-10-21","today":"2026-11-06","rows":[{"trip_title":"@Lake","client_name":"Jo Hayes",` +
		`"status":"in_progress","start_date":"2026-05-01","end_date":null,"destinations":"Como, Italy","value_cents":"100000",` +
		`"commission_cents":"12000","paid_cents":"0","first_booked_on":"2026-02-01","created_on":"2026-01-15"}]}`}
	got, err := send(t, db, `{"op":"center","type":"trips","from":"2026-01-01","to":"2026-10-21","includeContact":null}`)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"outcome":"exported","rowCount":1,"csv":"Trip,Client,Stage,Travel start,Travel end,Destinations,Trip value,Commission,Amount paid,First booked,Created on\r\n` +
		`'@Lake,Jo Hayes,Traveling,2026-05-01,,\"Como, Italy\",1000.00,120.00,0.00,2026-02-01,2026-01-15\r\n","fileName":"trips-2026-01-01-to-2026-10-21.csv"}`
	if got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_type":"trips","p_from":"2026-01-01","p_to":"2026-10-21","p_include_contact":false,` + audit + `}`
	if db.fn != "agent_export_center" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}

	db = &fakeDB{reply: `{"from":null,"to":null,"today":"2026-11-06","rows":[]}`}
	got, err = send(t, db, `{"op":"center","type":"clients","from":null,"includeContact":true}`)
	if err != nil {
		t.Fatal(err)
	}
	want = `{"outcome":"exported","rowCount":0,"csv":"Client,Status,Added,Booked trips,Lifetime value,Email,Phone,Address line 1,Address line 2,City,State or region,Postal code,Country\r\n",` +
		`"fileName":"clients-with-contact-details-2026-11-06.csv"}`
	if got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	wantArgs = `{"p_agent_id":"` + agentID + `","p_type":"clients","p_from":null,"p_to":null,"p_include_contact":true,` + audit + `}`
	if db.args != wantArgs {
		t.Errorf("args %s", db.args)
	}

	for _, reply := range []string{`{"rows":[]}`, `{"rows":{},"today":"2026-11-06"}`, `false`, `{"rows":[{"client_name":"A","status":"gone"}],"today":"2026-11-06"}`} {
		_, err = send(t, &fakeDB{reply: reply}, `{"op":"center","type":"clients"}`)
		wantProblem(t, err, 500, "")
	}
	_, err = send(t, &fakeDB{reply: `null`}, `{"op":"center","type":"milestones","from":"2026-01-01","to":"2026-01-02"}`)
	wantProblem(t, err, 404, "That advisor cannot export.")
	_, err = send(t, &fakeDB{err: errors.New("boom")}, `{"op":"center","type":"milestones","from":"2026-01-01","to":"2026-01-02"}`)
	wantProblem(t, err, 500, "")
}

func TestExportValidation(t *testing.T) {
	for _, c := range []struct{ body, detail string }{
		{`{"op":"export"}`, "report must be one of: revenue, suppliers, destinations, clients, funnel, pipeline."},
		{`{"op":"export","report":"revenue"}`, "period must be one of: ytd, 12mo, qtd."},
		{`{"op":"export","report":"revenue","period":"ytd"}`, "basis must be one of: booked, received."},
		{`{"op":"export","report":"suppliers","period":"qtd","basis":"booked"}`, "basis is only for revenue."},
		{`{"op":"export","report":"clients","period":"ytd"}`, "This report takes no period."},
		{`{"op":"export","report":"pipeline","basis":"booked"}`, "basis is only for revenue."},
	} {
		db := &fakeDB{}
		_, err := send(t, db, c.body)
		wantProblem(t, err, 400, c.detail)
		if db.calls != 0 {
			t.Errorf("%s reached the database", c.body)
		}
	}
}

func TestExport(t *testing.T) {
	db := &fakeDB{reply: `{"from":"2026-01-01","to":"2026-11-06","today":"2026-11-06","rows":[` +
		`{"month_start":"2026-01-01","cents":"123456","item_count":2,"prior_cents":null},` +
		`{"month_start":"2026-02-01","cents":"0","item_count":0,"prior_cents":"5"}]}`}
	got, err := send(t, db, `{"op":"export","report":"revenue","period":"ytd","basis":"booked"}`)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"outcome":"exported","rowCount":2,"csv":"Month,Booked value,Trips,Same month last year\r\n2026-01,1234.56,2,\r\n2026-02,0.00,0,0.05\r\n",` +
		`"fileName":"revenue-booked-2026-01-01-to-2026-11-06.csv"}`
	if got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	wantArgs := `{"p_agent_id":"` + agentID + `","p_report":"revenue","p_period":"ytd","p_basis":"booked",` + audit + `}`
	if db.fn != "agent_report_export" || db.args != wantArgs {
		t.Errorf("rpc %s %s", db.fn, db.args)
	}

	// No today from SQL: the server's UTC day, as Deno's default parameter did.
	db = &fakeDB{reply: `{"from":null,"to":null,"rows":[]}`}
	got, err = send(t, db, `{"op":"export","report":"clients","period":null,"basis":null}`)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"outcome":"exported","rowCount":0,"csv":"Rank,Client,Trips,Lifetime value,Commission,Cohort\r\n","fileName":"clients-lifetime-value-2026-11-06.csv"}`; got != want {
		t.Errorf("got  %s\nwant %s", got, want)
	}
	if want := `{"p_agent_id":"` + agentID + `","p_report":"clients","p_period":null,"p_basis":null,` + audit + `}`; db.args != want {
		t.Errorf("args %s", db.args)
	}
	got, err = send(t, &fakeDB{reply: `{"from":null,"to":null,"today":"2026-11-07","rows":[]}`}, `{"op":"export","report":"pipeline"}`)
	if err != nil || got != `{"outcome":"exported","rowCount":0,"csv":"Stage,Trips,Full value,Weight %,Weighted\r\n\r\nTravel month,Trips,Weighted\r\n","fileName":"pipeline-2026-11-07.csv"}` {
		t.Errorf("pipeline %s %v", got, err)
	}

	for _, reply := range []string{
		`false`,
		`{"from":"2026-01-01","to":"2026-11-06","rows":{}}`,
		`{"from":null,"to":"2026-11-06","rows":[]}`,                                                   // a period report with no period
		`{"from":"2026-01-01","to":"2026-11-06","rows":[{"supplier_name":"S","received_cents":1.5}]}`, // money as a float
	} {
		_, err = send(t, &fakeDB{reply: reply}, `{"op":"export","report":"suppliers","period":"12mo"}`)
		wantProblem(t, err, 500, "")
	}
	_, err = send(t, &fakeDB{reply: `{"from":null,"to":null,"today":7,"rows":[]}`}, `{"op":"export","report":"clients"}`)
	wantProblem(t, err, 500, "")
	_, err = send(t, &fakeDB{reply: `null`}, `{"op":"export","report":"funnel","period":"qtd"}`)
	wantProblem(t, err, 404, "That advisor cannot export.")
}
