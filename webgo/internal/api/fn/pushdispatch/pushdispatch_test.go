package pushdispatch

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// fakeDB answers each RPC from replies[fn] (a JSON text, or an error for errs[fn]), and keeps
// the calls in order as "fn args".
type fakeDB struct {
	mu      sync.Mutex
	calls   []string
	replies map[string]string
	errs    map[string]error
	// errOn fails one call by its exact "fn args" text.
	errOn map[string]error
}

func (f *fakeDB) RPC(_ context.Context, fn string, args any, out any) error {
	b, err := js.Marshal(args)
	if err != nil {
		return err
	}
	call := fn + " " + string(b)
	f.mu.Lock()
	f.calls = append(f.calls, call)
	f.mu.Unlock()
	if e := f.errOn[call]; e != nil {
		return e
	}
	if e := f.errs[fn]; e != nil {
		return e
	}
	reply, ok := f.replies[call]
	if !ok {
		reply = f.replies[fn]
	}
	if out == nil || reply == "" {
		return nil
	}
	return json.Unmarshal([]byte(reply), out)
}

var now = time.Date(2026, 11, 9, 15, 0, 0, 0, time.UTC) // a Monday afternoon

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)) }

func deps(env map[string]string, logTo *bytes.Buffer) *edge.Deps {
	if logTo == nil {
		logTo = &bytes.Buffer{}
	}
	return &edge.Deps{
		Log: slog.New(slog.NewTextHandler(logTo, nil)),
		Now: func() time.Time { return now },
		Env: func(k string) string { return env[k] },
	}
}

func post() *http.Request {
	return httptest.NewRequest(http.MethodPost, "/functions/v1/push-dispatch", nil)
}

func TestRefusesGET(t *testing.T) {
	db := &fakeDB{}
	_, err := serve(deps(nil, nil), httptest.NewRequest(http.MethodGet, "/", nil), db, nil, &tokenCache{})
	p, ok := problem.As(err)
	if !ok || p.Status != 403 || p.Detail != "Use POST to run the dispatcher." {
		t.Fatalf("got %v", err)
	}
	if len(db.calls) != 0 {
		t.Fatalf("touched the database: %v", db.calls)
	}
}

// No keys at all: a bare 500 BEFORE anything is claimed, so rows wait as pending.
func TestNoKeysIsA500BeforeClaiming(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"nothing set":            nil,
		"VAPID incomplete":       {"VAPID_PUBLIC_KEY": "x", "VAPID_PRIVATE_KEY": "y"},
		"FCM JSON unusable":      {"FCM_SERVICE_ACCOUNT_JSON": "{not json"},
		"FCM JSON missing a key": {"FCM_SERVICE_ACCOUNT_JSON": `{"project_id":"p","client_email":"e"}`},
		"FCM JSON null":          {"FCM_SERVICE_ACCOUNT_JSON": "null"},
	} {
		t.Run(name, func(t *testing.T) {
			db := &fakeDB{}
			var logs bytes.Buffer
			_, err := serve(deps(env, &logs), post(), db, nil, &tokenCache{})
			if err == nil {
				t.Fatal("no error")
			}
			if _, isProblem := problem.As(err); isProblem {
				t.Fatalf("a problem, not a bare 500: %v", err)
			}
			if len(db.calls) != 0 {
				t.Fatalf("claimed anyway: %v", db.calls)
			}
			if env["FCM_SERVICE_ACCOUNT_JSON"] != "" && !strings.Contains(logs.String(), "is set but is not a usable service-account key") {
				t.Errorf("set-but-unusable was not logged: %s", logs.String())
			}
		})
	}
}

func TestServiceAccountFromEnv(t *testing.T) {
	env := func(v string) func(string) string { return func(string) string { return v } }
	sa := serviceAccountFromEnv(env(`{"type":"service_account","project_id":"sta-1","client_email":"push@sta-1.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n"}`), quietLog())
	if sa == nil || !sa.usable || sa.ProjectID != "sta-1" || sa.ClientEmail != "push@sta-1.iam.gserviceaccount.com" {
		t.Fatalf("got %+v", sa)
	}
	// Truthy but not text: kept, as Deno kept it, and every Android send fails with it.
	sa = serviceAccountFromEnv(env(`{"project_id":123,"client_email":"e","private_key":"k"}`), quietLog())
	if sa == nil || sa.usable {
		t.Fatalf("got %+v", sa)
	}
	if serviceAccountFromEnv(env(""), quietLog()) != nil {
		t.Error("unset")
	}
	if serviceAccountFromEnv(env(`{"project_id":"","client_email":"e","private_key":"k"}`), quietLog()) != nil {
		t.Error("an empty project_id")
	}
}

func TestVapidFromEnv(t *testing.T) {
	full := map[string]string{"VAPID_PUBLIC_KEY": "a", "VAPID_PRIVATE_KEY": "b", "VAPID_SUBJECT": "mailto:x@example.com"}
	if c := vapidFromEnv(func(k string) string { return full[k] }); c == nil || c.subject != "mailto:x@example.com" {
		t.Fatalf("got %+v", c)
	}
	for k := range full {
		part := map[string]string{}
		for kk, v := range full {
			if kk != k {
				part[kk] = v
			}
		}
		if vapidFromEnv(func(k string) string { return part[k] }) != nil {
			t.Errorf("%s unset still built a config", k)
		}
	}
}

func TestRouting(t *testing.T) {
	ok := func(push.Device, push.Payload) (push.DeviceOutcome, error) { return push.OutcomeOK, nil }
	msg := push.MessagePayload(push.ClaimedRow{Kind: push.KindMessage})
	quote := push.QuoteRequestPayload(push.ClaimedRow{Kind: push.KindQuoteRequest})
	lead := push.LeadMessagePayload(push.ClaimedRow{Kind: push.KindLeadMessage})
	for _, c := range []struct {
		name     string
		s        senders
		platform string
		payload  push.Payload
		want     push.DeviceOutcome
	}{
		{"web with a web sender", senders{web: ok}, "web", msg, push.OutcomeOK},
		{"web without one is an error", senders{android: ok}, "web", msg, push.OutcomeError},
		{"android without one is an error", senders{web: ok}, "android", msg, push.OutcomeError},
		{"ios is skipped", senders{web: ok, android: ok}, "ios", msg, push.OutcomeSkipped},
		{"ios trip request is skipped", senders{}, "ios", quote, push.OutcomeSkipped},
		{"ios lead note is skipped", senders{}, "ios", lead, push.OutcomeSkipped},
		{"an unknown platform is an error", senders{web: ok, android: ok}, "windows", msg, push.OutcomeError},
	} {
		got, err := c.s.send(push.Device{Platform: c.platform}, c.payload)
		if err != nil || got != c.want {
			t.Errorf("%s: %s %v", c.name, got, err)
		}
	}
}

// recorder is a fake sender: it answers per device id and keeps what it was sent.
type recorder struct {
	mu       sync.Mutex
	outcomes map[string]push.DeviceOutcome
	errs     map[string]error
	got      []string // "device kind tag"
}

func (r *recorder) send(d push.Device, p push.Payload) (push.DeviceOutcome, error) {
	r.mu.Lock()
	r.got = append(r.got, d.DeviceID+" "+p.PayloadKind()+" "+p.PayloadTag())
	r.mu.Unlock()
	if e := r.errs[d.DeviceID]; e != nil {
		return "", e
	}
	if o, ok := r.outcomes[d.DeviceID]; ok {
		return o, nil
	}
	return push.OutcomeOK, nil
}

func (r *recorder) sorted() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := append([]string{}, r.got...)
	// Deliver sends to one advisor's devices at once; sort within the whole list for a stable
	// comparison (each payload is distinct by kind and tag).
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func runPass(db backend, send push.DeviceSender) (*pass, error) {
	p := &pass{db: db, send: send, now: now, log: quietLog(), devicesOf: map[string][]push.Device{}, isGone: map[string]bool{}}
	return p, p.run(context.Background())
}

const devicesA = `[
 {"device_id":"web-1","platform":"web","fcm_token":null,"web_endpoint":"https://fcm.googleapis.com/fcm/send/x","web_p256dh":"k","web_auth":"a"},
 {"device_id":"phone-1","platform":"android","fcm_token":"t1","web_endpoint":null,"web_p256dh":null,"web_auth":null},
 {"device_id":"phone-dead","platform":"android","fcm_token":"t2","web_endpoint":null,"web_p256dh":null,"web_auth":null}
]`

func TestAPass(t *testing.T) {
	db := &fakeDB{
		replies: map[string]string{
			"push_claim_dismissals":                           `[{"agent_id":"agent-a","conversation_id":"conv-0","read_up_to":"2026-11-09T14:00:00.123456+00:00"}]`,
			`push_devices_for_agent {"p_agent_id":"agent-a"}`: devicesA,
			`push_devices_for_agent {"p_agent_id":"agent-c"}`: `null`,
			"push_claim_due": `[
			 {"outbox_id":"o-1","agent_id":"agent-a","kind":"message","conversation_id":"conv-1","trip_id":null,"held":false,"hold_reason":null,"message_count":2,"client_name":"Jordan Hayes","trip_title":"Negril","preview":"Hi","latest_created_at":"2026-11-09T14:59:00.1+00:00","destination":null,"start_date":null,"end_date":null,"lead_id":null},
			 {"outbox_id":"o-2","agent_id":"agent-b","kind":"lead_message","conversation_id":null,"trip_id":null,"held":false,"hold_reason":null,"message_count":1,"client_name":"Sam","trip_title":null,"preview":null,"latest_created_at":"2026-11-09T14:58:00+00:00","destination":null,"start_date":null,"end_date":null,"lead_id":"lead-1"},
			 {"outbox_id":"o-3","agent_id":"agent-a","kind":"quote_request","conversation_id":null,"trip_id":"trip-1","held":true,"hold_reason":"rest","message_count":1,"client_name":"Maya Carter","trip_title":"Dream","preview":null,"latest_created_at":"2026-11-09T06:00:00+00:00","destination":"Negril","start_date":"2027-02-10","end_date":"2027-02-14","lead_id":null},
			 {"outbox_id":"o-4","agent_id":"agent-c","kind":"message","conversation_id":"conv-4","trip_id":null,"held":true,"hold_reason":"away","message_count":1,"client_name":"Ana","trip_title":null,"preview":"x","latest_created_at":"2026-11-09T06:00:00+00:00","destination":null,"start_date":null,"end_date":null,"lead_id":null}
			]`,
		},
		// Advisor b's device lookup fails: their row goes back for a retry, the rest are served.
		errOn: map[string]error{`push_devices_for_agent {"p_agent_id":"agent-b"}`: errors.New("boom")},
	}
	rec := &recorder{outcomes: map[string]push.DeviceOutcome{"phone-dead": push.OutcomeGone, "web-1": push.OutcomeError}}
	p, err := runPass(db, rec.send)
	if err != nil {
		t.Fatal(err)
	}
	wantCalls := []string{
		`push_claim_dismissals {"p_limit":50}`,
		`push_devices_for_agent {"p_agent_id":"agent-a"}`,
		`push_claim_due {"p_limit":50}`,
		// agent-a: devices already loaded this pass (no second lookup).
		`push_finish {"p_outbox_id":"o-1","p_ok":true}`,
		`push_finish {"p_outbox_id":"o-3","p_ok":true}`,
		`push_devices_for_agent {"p_agent_id":"agent-b"}`,
		`push_finish {"p_outbox_id":"o-2","p_ok":false}`,
		// agent-c has no devices: nothing left to try counts as delivered.
		`push_devices_for_agent {"p_agent_id":"agent-c"}`,
		`push_finish {"p_outbox_id":"o-4","p_ok":true}`,
		`push_device_gone {"p_device_id":"phone-dead"}`,
	}
	if strings.Join(db.calls, "\n") != strings.Join(wantCalls, "\n") {
		t.Errorf("calls:\n%s\nwant:\n%s", strings.Join(db.calls, "\n"), strings.Join(wantCalls, "\n"))
	}
	// The dismiss went to the phones only; the dead phone was not tried again after it said so.
	wantSends := []string{
		"phone-1 dismiss conv-0",
		"phone-1 message conv-1",
		"phone-1 summary summary",
		"phone-dead dismiss conv-0",
		"web-1 message conv-1",
		"web-1 summary summary",
	}
	if got := rec.sorted(); strings.Join(got, "\n") != strings.Join(wantSends, "\n") {
		t.Errorf("sends:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(wantSends, "\n"))
	}
	if p.sent != 3 || p.retried != 1 || p.dismissed != 1 || len(p.gone) != 1 || p.claimed != 4 {
		t.Errorf("counts sent=%d retried=%d dismissed=%d gone=%d claimed=%d", p.sent, p.retried, p.dismissed, len(p.gone), p.claimed)
	}
}

// A row is retried only when a device errored and none took it.
func TestEveryDeviceErroredRetries(t *testing.T) {
	db := &fakeDB{replies: map[string]string{
		"push_claim_dismissals":  `[]`,
		"push_devices_for_agent": devicesA,
		"push_claim_due":         `[{"outbox_id":"o-1","agent_id":"agent-a","kind":"message","conversation_id":"c","held":false,"message_count":1,"latest_created_at":"2026-11-09T14:59:00+00:00"}]`,
	}}
	rec := &recorder{errs: map[string]error{"web-1": errors.New("x"), "phone-1": errors.New("y")}, outcomes: map[string]push.DeviceOutcome{"phone-dead": push.OutcomeSkipped}}
	p, err := runPass(db, rec.send)
	if err != nil || p.retried != 1 || p.sent != 0 {
		t.Fatalf("err=%v retried=%d sent=%d calls=%v", err, p.retried, p.sent, db.calls)
	}
}

// A finish that fails inside an advisor's batch sends every row not yet finished back,
// including the one whose finish failed, best effort.
func TestFinishFailureRetriesTheRest(t *testing.T) {
	db := &fakeDB{
		replies: map[string]string{
			"push_claim_dismissals":  `[]`,
			"push_devices_for_agent": `[]`,
			"push_claim_due": `[{"outbox_id":"o-1","agent_id":"a","kind":"message","conversation_id":"c1","held":false,"message_count":1,"latest_created_at":"2026-11-09T14:59:00+00:00"},
			 {"outbox_id":"o-2","agent_id":"a","kind":"message","conversation_id":"c2","held":false,"message_count":1,"latest_created_at":"2026-11-09T14:59:00+00:00"},
			 {"outbox_id":"o-3","agent_id":"a","kind":"message","conversation_id":"c3","held":false,"message_count":1,"latest_created_at":"2026-11-09T14:59:00+00:00"}]`,
		},
		errOn: map[string]error{`push_finish {"p_outbox_id":"o-2","p_ok":true}`: errors.New("lost")},
	}
	p, err := runPass(db, (&recorder{}).send)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		`push_finish {"p_outbox_id":"o-1","p_ok":true}`,
		`push_finish {"p_outbox_id":"o-2","p_ok":true}`,
		`push_finish {"p_outbox_id":"o-2","p_ok":false}`,
		`push_finish {"p_outbox_id":"o-3","p_ok":false}`,
	}
	got := db.calls[3:]
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("calls:\n%s", strings.Join(got, "\n"))
	}
	if p.sent != 1 || p.retried != 2 {
		t.Errorf("sent=%d retried=%d", p.sent, p.retried)
	}
}

// The pass-wide failures are 500s, with the claim already made where Deno had made it.
func TestPassWideFailures(t *testing.T) {
	for _, c := range []struct {
		name  string
		db    *fakeDB
		label string
	}{
		{"dismiss claim", &fakeDB{errs: map[string]error{"push_claim_dismissals": errors.New("x")}}, "dismiss claim failed"},
		{"a dismissal's device lookup", &fakeDB{replies: map[string]string{"push_claim_dismissals": `[{"agent_id":"a","conversation_id":"c","read_up_to":null}]`},
			errs: map[string]error{"push_devices_for_agent": errors.New("x")}}, "device lookup failed"},
		{"due claim", &fakeDB{replies: map[string]string{"push_claim_dismissals": `[]`}, errs: map[string]error{"push_claim_due": errors.New("x")}}, "claim failed"},
		{"device cleanup", &fakeDB{replies: map[string]string{"push_claim_dismissals": `[{"agent_id":"a","conversation_id":"c","read_up_to":null}]`,
			"push_devices_for_agent": devicesA, "push_claim_due": `[]`}, errs: map[string]error{"push_device_gone": errors.New("x")}}, "device cleanup failed"},
	} {
		_, err := runPass(c.db, (&recorder{outcomes: map[string]push.DeviceOutcome{"phone-dead": push.OutcomeGone}}).send)
		if err == nil || label(err) != c.label {
			t.Errorf("%s: %v", c.name, err)
		}
		if _, isProblem := problem.As(err); isProblem {
			t.Errorf("%s: a problem, not a bare 500", c.name)
		}
	}
}

// The whole function over a fake PostgREST, through the real service client: the URLs and
// bodies supabase-js sent, the reply, and the one log line of counts.
func TestServeOverPostgREST(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	rest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body := new(bytes.Buffer)
		body.ReadFrom(r.Body)
		mu.Lock()
		seen = append(seen, r.Method+" "+r.URL.Path+" "+body.String())
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/rest/v1/rpc/push_claim_dismissals":
			w.Write([]byte(`[]`))
		case "/rest/v1/rpc/push_claim_due":
			w.Write([]byte(`[{"outbox_id":"o-1","agent_id":"a","kind":"message","conversation_id":"c","held":false,"message_count":1,"latest_created_at":"2026-11-09T14:59:00+00:00"}]`))
		case "/rest/v1/rpc/push_devices_for_agent":
			w.Write([]byte(`[{"device_id":"d-ios","platform":"ios","fcm_token":"t","web_endpoint":null,"web_p256dh":null,"web_auth":null}]`))
		case "/rest/v1/rpc/push_finish":
			w.Write([]byte(`"sent"`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer rest.Close()
	var logs bytes.Buffer
	d := deps(map[string]string{"FCM_SERVICE_ACCOUNT_JSON": `{"project_id":"p","client_email":"e","private_key":"k"}`}, &logs)
	reply, err := serve(d, post(), service.New(rest.URL, "service-key", nil), nil, &tokenCache{})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := js.Marshal(reply.Body)
	if reply.Status != 200 || string(b) != `{"sent":1,"retried":0,"dismissed":0,"gone":0}` {
		t.Fatalf("reply %d %s", reply.Status, b)
	}
	want := []string{
		`POST /rest/v1/rpc/push_claim_dismissals {"p_limit":50}`,
		`POST /rest/v1/rpc/push_claim_due {"p_limit":50}`,
		`POST /rest/v1/rpc/push_devices_for_agent {"p_agent_id":"a"}`,
		`POST /rest/v1/rpc/push_finish {"p_outbox_id":"o-1","p_ok":true}`,
	}
	if strings.Join(seen, "\n") != strings.Join(want, "\n") {
		t.Errorf("requests:\n%s", strings.Join(seen, "\n"))
	}
	line := logs.String()
	if !strings.Contains(line, "msg=\"push-dispatch run\" claimed=1 sent=1 retried=0 dismissed=0 gone=0") {
		t.Errorf("log: %s", line)
	}
}
