package agentclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// fakeDB answers each RPC with a canned reply and records what was sent.
type fakeDB struct {
	replies map[string]string
	fail    error
	calls   []string // "fn args-json"
	audits  []string // metadata of each audit row, "event target metadata"
}

func (f *fakeDB) record(fn string, args any) {
	b, err := js.Marshal(args)
	if err != nil {
		panic(err)
	}
	f.calls = append(f.calls, fn+" "+string(b))
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	f.record(fn, args)
	if f.fail != nil {
		return f.fail
	}
	return json.Unmarshal([]byte(f.replies[fn]), out)
}

func (f *fakeDB) RPCRow(_ context.Context, fn string, args any, out any) (bool, error) {
	f.record(fn, args)
	if f.fail != nil {
		return false, f.fail
	}
	raw := []byte(f.replies[fn])
	var rows []json.RawMessage
	if json.Unmarshal(raw, &rows) == nil {
		if len(rows) == 0 {
			return false, nil
		}
		raw = rows[0]
	}
	if bytes.Equal(raw, []byte("null")) {
		return false, nil
	}
	return true, json.Unmarshal(raw, out)
}

func (f *fakeDB) InsertRows(_ context.Context, table string, rows any) error {
	b, _ := json.Marshal(rows)
	var list []struct {
		EventType string          `json:"event_type"`
		TargetID  string          `json:"target_id"`
		Metadata  json.RawMessage `json:"metadata"`
	}
	if b[0] != '[' {
		b = append(append([]byte("["), b...), ']')
	}
	if err := json.Unmarshal(b, &list); err != nil {
		return err
	}
	for _, r := range list {
		f.audits = append(f.audits, r.EventType+" "+r.TargetID+" "+string(r.Metadata))
	}
	return nil
}

var actor = &caller.Context{PlatformUserID: "pu-1", Role: "agent"}

const agentID = "a0000000-0000-7000-8000-000000000001"
const clientID = "c0000000-0000-7000-8000-000000000002"

func run(t *testing.T, db *fakeDB, body string) (string, error) {
	t.Helper()
	newID = func() string { return "new-client-id" }
	v, err := js.ParseObject([]byte(body))
	if err != nil {
		t.Fatalf("bad test body %s", body)
	}
	reply, err := handle(context.Background(), db, actor, agentID, v)
	if err != nil {
		return "", err
	}
	b, _ := js.Marshal(reply.Body)
	return string(b), nil
}

func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("want %d %q, got %v", status, detail, err)
	}
	if p.Status != status || p.Detail != detail {
		t.Errorf("got %d %q, want %d %q", p.Status, p.Detail, status, detail)
	}
}

const okClient = `"client":{"firstName":"Ann","lastName":"Lee","email":"ann@example.com"}`

func TestValidationSentences(t *testing.T) {
	cases := []struct{ body, detail string }{
		{`{}`, "op must be create, update, archive or bulk_tag."},
		{`{"op":"delete"}`, "op must be create, update, archive or bulk_tag."},
		{`{"op":1}`, "op must be create, update, archive or bulk_tag."},
		{`{"op":"create"}`, "Email is required."},
		{`{"op":"create","client":"ann"}`, "Email is required."},
		{`{"op":"create","client":{"email":""}}`, "Email is required."},
		{`{"op":"create","client":{"email":"   "}}`, "Email is required."},
		{`{"op":"create","client":{"email":5}}`, "Email must be text."},
		{`{"op":"create","client":{"email":"` + strings.Repeat("a", 195) + `@b.com"}}`, "Email is too long."},
		{`{"op":"create","client":{"email":"ann"}}`, "That does not look like an email address."},
		{`{"op":"create","client":{"email":"@ann"}}`, "That does not look like an email address."},
		{`{"op":"create","client":{"email":"ann@"}}`, "That does not look like an email address."},
		// The country is read before the names.
		{`{"op":"create","client":{"email":"a@b","address":{"country":"USA"}}}`, "Country is too long."},
		{`{"op":"create","client":{"email":"a@b"}}`, "First name is required."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A"}}`, "Last name is required."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","preferredName":[]}}`, "Preferred name must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","phone":"` + strings.Repeat("1", 41) + `"}}`, "Phone is too long."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","dateOfBirth":"1/2/1990"}}`, "Date of birth must be a date."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","tags":"vip"}}`, "Tags must be a list."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","tags":[` + strings.Repeat(`"x",`, 20) + `"y"]}}`, "That is too many tags."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","tags":["` + strings.Repeat("x", 41) + `"]}}`, "That tag is too long."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":{}}}`, "Important dates must be a list."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":[` + strings.Repeat(`{},`, 12) + `{}]}}`, "That is too many dates."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":[null]}}`, "That date is not readable."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":["x"]}}`, "That date is not readable."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":[[]]}}`, "Date label is required."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":" Anniv "}]}}`, `"Anniv" needs a date.`},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":"x","date":"2026-1-1"}]}}`, "Date must be a date."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","notes":true}}`, "Notes must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","address":{"line1":1}}}`, "Address must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","address":{"line2":1}}}`, "Address line 2 must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","address":{"city":1}}}`, "City must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","address":{"region":1}}}`, "Region must be text."},
		{`{"op":"create","client":{"email":"a@b","firstName":"A","lastName":"B","address":{"postalCode":"` + strings.Repeat("9", 21) + `"}}}`, "Postal code is too long."},
		{`{"op":"update"}`, "That is not a client id."},
		{`{"op":"update","clientId":"` + clientID + `"}`, "Send the expectedVersion the board was rendered from."},
		{`{"op":"update","clientId":"` + clientID + `","expectedVersion":1.5}`, "Send the expectedVersion the board was rendered from."},
		{`{"op":"update","clientId":"` + clientID + `","expectedVersion":1}`, "Email is required."},
		{`{"op":"bulk_tag"}`, "clientIds must be a list."},
		{`{"op":"bulk_tag","clientIds":[]}`, "Pick at least one client."},
		{`{"op":"bulk_tag","clientIds":[` + strings.Repeat(`"`+clientID+`",`, 100) + `"x"]}`, "That is too many clients."},
		{`{"op":"bulk_tag","clientIds":["x"]}`, "That is not a client id."},
		{`{"op":"bulk_tag","clientIds":["` + clientID + `"]}`, "Tag is required."},
		{`{"op":"bulk_tag","clientIds":["` + clientID + `"],"tag":"` + strings.Repeat("t", 41) + `"}`, "Tag is too long."},
		{`{"op":"bulk_tag","clientIds":["` + clientID + `"],"tag":"vip","add":"yes"}`, "add must be true or false."},
		{`{"op":"archive","clientId":"nope"}`, "That is not a client id."},
		{`{"op":"archive","clientId":"` + clientID + `","expectedVersion":0}`, "Send the expectedVersion the board was rendered from."},
		{`{"op":"archive","clientId":"` + clientID + `","expectedVersion":2}`, "archived must be true or false."},
		{`{"op":"archive","clientId":"` + clientID + `","expectedVersion":2,"archived":true,"reason":"` + strings.Repeat("r", 501) + `"}`, "Reason is too long."},
	}
	for _, c := range cases {
		db := &fakeDB{}
		_, err := run(t, db, c.body)
		wantProblem(t, err, 400, c.detail)
		if len(db.calls) != 0 {
			t.Errorf("%s reached the database", c.body)
		}
	}
}

func TestCreate(t *testing.T) {
	db := &fakeDB{replies: map[string]string{"agent_create_client": `[{"outcome":"created","client_id":"new-client-id"}]`}}
	got, err := run(t, db, `{"op":"create","client":{"firstName":" Ann ","lastName":"Lee","email":" Ann@Example.com ",
		"preferredName":"","phone":null,"dateOfBirth":"1990-02-03","notes":"  ",
		"tags":[" VIP ","vip",3,"","`+"\U0000039F\U00000394\U0000039F\U000003A3"+`","`+"\U00000130"+`"],
		"importantDates":[{"label":"Anniversary","date":"2020-06-01","recurring":true},{"label":"x","date":"2020-01-01","recurring":"yes"}],
		"address":{"line1":"1 Main","country":"us"}}}`)
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"outcome":"created","clientId":"new-client-id"}` {
		t.Errorf("reply %s", got)
	}
	want := `agent_create_client {"p_agent_id":"` + agentID + `","p_client_id":"new-client-id","p_first_name":"Ann","p_last_name":"Lee",` +
		`"p_preferred_name":null,"p_email":"Ann@Example.com","p_phone":null,"p_date_of_birth":"1990-02-03",` +
		`"p_tags":["vip","` + "\U000003BF\U000003B4\U000003BF\U000003C2" + `","i` + "\U00000307" + `"],"p_important_dates":[{"label":"Anniversary","date":"2020-06-01","recurring":true},` +
		`{"label":"x","date":"2020-01-01","recurring":false}],"p_notes":null,"p_line1":"1 Main","p_line2":null,"p_city":null,` +
		`"p_region":null,"p_postal_code":null,"p_country":"US"}`
	if len(db.calls) != 1 || db.calls[0] != want {
		t.Errorf("calls\n%v\nwant\n%s", db.calls, want)
	}
	if len(db.audits) != 1 || db.audits[0] != `client.created new-client-id {"has_address":true,"tag_count":3}` {
		t.Errorf("audits %v", db.audits)
	}
}

func TestCreateDuplicateAndRefusal(t *testing.T) {
	db := &fakeDB{replies: map[string]string{"agent_create_client": `[{"outcome":"duplicate_email","client_id":"old"}]`}}
	got, err := run(t, db, `{"op":"create",`+okClient+`}`)
	if err != nil || got != `{"outcome":"duplicate_email","existingClientId":"old"}` || len(db.audits) != 0 {
		t.Errorf("duplicate: %s %v %v", got, err, db.audits)
	}
	db = &fakeDB{replies: map[string]string{"agent_create_client": `[]`}}
	_, err = run(t, db, `{"op":"create",`+okClient+`}`)
	wantProblem(t, err, 404, "That advisor cannot create clients.")

	db = &fakeDB{fail: errors.New("boom")}
	_, err = run(t, db, `{"op":"create",`+okClient+`}`)
	if _, isProblem := problem.As(err); err == nil || isProblem || !strings.HasPrefix(err.Error(), "client create failed: ") {
		t.Errorf("a database failure must be a bare 500: %v", err)
	}
}

func TestCountryUpperCasesAsJavaScriptDoes(t *testing.T) {
	db := &fakeDB{replies: map[string]string{"agent_create_client": `[]`}}
	_, _ = run(t, db, `{"op":"create","client":{"firstName":"A","lastName":"B","email":"a@b","address":{"country":"`+"\U000000DF"+`"}}}`)
	if !strings.HasSuffix(db.calls[0], `"p_country":"SS"}`) {
		t.Errorf("call %s", db.calls[0])
	}
}

func TestUpdate(t *testing.T) {
	body := `{"op":"update","clientId":"` + clientID + `","expectedVersion":3,` + okClient + `}`
	cases := []struct {
		reply, want, audit string
		status             int
		detail             string
	}{
		{reply: `[{"outcome":"changed","version":4,"changed_fields":["phone","tags"]}]`,
			want:  `{"outcome":"changed","clientId":"` + clientID + `","version":4}`,
			audit: `client.updated ` + clientID + ` {"fields":["phone","tags"],"version":4}`},
		{reply: `[{"outcome":"changed","version":4,"changed_fields":null}]`,
			want:  `{"outcome":"changed","clientId":"` + clientID + `","version":4}`,
			audit: `client.updated ` + clientID + ` {"fields":[],"version":4}`},
		{reply: `[{"outcome":"noop","version":3,"changed_fields":[]}]`, want: `{"outcome":"noop","clientId":"` + clientID + `","version":3}`},
		{reply: `[{"outcome":"duplicate_email","version":3,"changed_fields":[]}]`, want: `{"outcome":"duplicate_email","version":3}`},
		{reply: `[{"outcome":"stale","version":5,"changed_fields":[]}]`, status: 409, detail: staleClient},
		{reply: `[]`, status: 404, detail: "No such client."},
	}
	for _, c := range cases {
		db := &fakeDB{replies: map[string]string{"agent_update_client": c.reply}}
		got, err := run(t, db, body)
		if c.status != 0 {
			wantProblem(t, err, c.status, c.detail)
		} else if err != nil || got != c.want {
			t.Errorf("%s: %s %v", c.reply, got, err)
		}
		if (c.audit == "" && len(db.audits) != 0) || (c.audit != "" && (len(db.audits) != 1 || db.audits[0] != c.audit)) {
			t.Errorf("%s: audits %v", c.reply, db.audits)
		}
		if !strings.HasPrefix(db.calls[0], `agent_update_client {"p_client_id":"`+clientID+`","p_agent_id":"`+agentID+`","p_first_name":"Ann",`) ||
			!strings.HasSuffix(db.calls[0], `"p_country":null,"p_expected_version":3}`) {
			t.Errorf("call %s", db.calls[0])
		}
	}
}

func TestBulkTag(t *testing.T) {
	other := "d0000000-0000-7000-8000-000000000003"
	db := &fakeDB{replies: map[string]string{"agent_bulk_tag_clients": `[{"client_id":"` + clientID + `","version":7}]`}}
	got, err := run(t, db, `{"op":"bulk_tag","clientIds":["`+clientID+`","`+other+`"],"tag":"  VIP ","add":true}`)
	if err != nil || got != `{"outcome":"tagged","tag":"vip","add":true,"changedCount":1,"requestedCount":2}` {
		t.Errorf("reply %s %v", got, err)
	}
	if db.calls[0] != `agent_bulk_tag_clients {"p_client_ids":["`+clientID+`","`+other+`"],"p_agent_id":"`+agentID+`","p_tag":"vip","p_add":true}` {
		t.Errorf("call %s", db.calls[0])
	}
	if len(db.audits) != 1 || db.audits[0] != `client.tag_added `+clientID+` {"tag":"vip","version":7,"bulk":true}` {
		t.Errorf("audits %v", db.audits)
	}

	db = &fakeDB{replies: map[string]string{"agent_bulk_tag_clients": `[]`}}
	got, err = run(t, db, `{"op":"bulk_tag","clientIds":["`+clientID+`"],"tag":"vip","add":false}`)
	if err != nil || got != `{"outcome":"tagged","tag":"vip","add":false,"changedCount":0,"requestedCount":1}` || len(db.audits) != 0 {
		t.Errorf("nothing changed: %s %v %v", got, err, db.audits)
	}
}

func TestArchive(t *testing.T) {
	base := `"op":"archive","clientId":"` + clientID + `","expectedVersion":2`
	cases := []struct {
		body, reply, want, audit string
		status                   int
	}{
		{body: `{` + base + `,"archived":true,"reason":" moved away "}`, reply: `[{"outcome":"archived","version":3}]`,
			want:  `{"outcome":"archived","clientId":"` + clientID + `","version":3}`,
			audit: `client.archived ` + clientID + ` {"reason":"moved away","version":3}`},
		{body: `{` + base + `,"archived":true,"reason":""}`, reply: `[{"outcome":"archived","version":3}]`,
			want:  `{"outcome":"archived","clientId":"` + clientID + `","version":3}`,
			audit: `client.archived ` + clientID + ` {"version":3}`},
		{body: `{` + base + `,"archived":false,"reason":"back"}`, reply: `[{"outcome":"restored","version":3}]`,
			want:  `{"outcome":"restored","clientId":"` + clientID + `","version":3}`,
			audit: `client.restored ` + clientID + ` {"version":3}`},
		{body: `{` + base + `,"archived":true}`, reply: `[{"outcome":"noop","version":2}]`,
			want: `{"outcome":"noop","clientId":"` + clientID + `","version":2}`},
		{body: `{` + base + `,"archived":true}`, reply: `[{"outcome":"stale","version":9}]`, status: 409},
		{body: `{` + base + `,"archived":true}`, reply: `[]`, status: 404},
	}
	for _, c := range cases {
		db := &fakeDB{replies: map[string]string{"agent_set_client_archived": c.reply}}
		got, err := run(t, db, c.body)
		switch c.status {
		case 409:
			wantProblem(t, err, 409, staleClient)
		case 404:
			wantProblem(t, err, 404, "No such client.")
		default:
			if err != nil || got != c.want {
				t.Errorf("%s: %s %v", c.body, got, err)
			}
		}
		if (c.audit == "" && len(db.audits) != 0) || (c.audit != "" && (len(db.audits) != 1 || db.audits[0] != c.audit)) {
			t.Errorf("%s: audits %v", c.body, db.audits)
		}
	}
}

func TestCaseMapping(t *testing.T) {
	for in, want := range map[string]string{
		"VIP": "vip",
		"\U0000039F\U00000394\U0000039F\U000003A3": "\U000003BF\U000003B4\U000003BF\U000003C2", // final sigma
		"\U000003A3":            "\U000003C3",
		"\U00000391\U000003A3.": "\U000003B1\U000003C2.",
		"\U00000130x":           "i\U00000307x",
	} {
		if got := lowerJS(in); got != want {
			t.Errorf("lowerJS(%q) = %q, want %q", in, got, want)
		}
	}
	for in, want := range map[string]string{"us": "US", "\U000000DF": "SS", "\U0000FB01": "FI", "\U000000E9": "\U000000C9"} {
		if got := upperJS(in); got != want {
			t.Errorf("upperJS(%q) = %q, want %q", in, got, want)
		}
	}
}
