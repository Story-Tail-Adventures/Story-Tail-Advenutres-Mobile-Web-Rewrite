package emaildispatch

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

var cfg = email.Config{
	Host: "localhost", Port: 1025, FromAddress: "gyasi.messages@adventures.story-tail.com",
	SiteURL: "http://localhost:3000", UnsubscribeURL: "http://127.0.0.1:54321/functions/v1/email-unsubscribe",
}

func ptr2(s string) *string { return &s }

func row(id string) email.ClaimedEmail {
	return email.ClaimedEmail{
		OutboxID: id, ConversationID: "0195a2c0-0000-7000-8000-00000000c0c0", Recipient: "jordan@example.com",
		AgentFirstName: ptr2("Gyasi"), TripTitle: ptr2("Lisbon"),
		Messages: []email.ClaimedMessage{{MessageID: "m1", Body: "See you soon.", Attachments: []string{}}},
	}
}

type finishCall struct {
	id            string
	ok, permanent bool
	err           *string
}

// fakeStore records every call and answers from its fields.
type fakeStore struct {
	released      []string
	claimed       []email.ClaimedEmail
	claimErr      error
	tokens        [][3]string
	tokenErr      error
	sig           *email.SignatureSource
	sigErr        error
	finishes      []finishCall
	finishErrs    []error // consumed one per finish call
	finishState   func(finishCall) *string
	alerts        []email.ClaimedAlert
	alertErr      error
	alertClaimed  bool
	alertFinishes []finishCall
	alertState    *string
	alertReleased []string
}

func (f *fakeStore) claimDue(_ context.Context, limit int) ([]email.ClaimedEmail, error) {
	if limit != batch {
		panic("limit")
	}
	return f.claimed, f.claimErr
}

func (f *fakeStore) recordTokens(_ context.Context, id, r, u string) error {
	f.tokens = append(f.tokens, [3]string{id, r, u})
	return f.tokenErr
}

func (f *fakeStore) signature(context.Context, string) (*email.SignatureSource, error) {
	return f.sig, f.sigErr
}

func (f *fakeStore) finish(_ context.Context, id string, ok, permanent bool, e *string) (*string, error) {
	c := finishCall{id, ok, permanent, e}
	f.finishes = append(f.finishes, c)
	if len(f.finishErrs) > 0 {
		err := f.finishErrs[0]
		f.finishErrs = f.finishErrs[1:]
		if err != nil {
			return nil, err
		}
	}
	if f.finishState != nil {
		return f.finishState(c), nil
	}
	if ok {
		return ptr2("sent"), nil
	}
	if permanent {
		return ptr2("failed"), nil
	}
	return ptr2("pending"), nil
}

func (f *fakeStore) release(_ context.Context, id string) error {
	f.released = append(f.released, id)
	return nil
}

func (f *fakeStore) claimAlerts(_ context.Context, limit int) ([]email.ClaimedAlert, error) {
	f.alertClaimed = true
	return f.alerts, f.alertErr
}

func (f *fakeStore) finishAlert(_ context.Context, id string, ok, permanent bool, e *string) (*string, error) {
	f.alertFinishes = append(f.alertFinishes, finishCall{id, ok, permanent, e})
	if f.alertState != nil {
		return f.alertState, nil
	}
	if ok {
		return ptr2("sent"), nil
	}
	return ptr2("failed"), nil
}

func (f *fakeStore) releaseAlert(_ context.Context, id string) error {
	f.alertReleased = append(f.alertReleased, id)
	return nil
}

// fakeSend records messages and answers errs in order (nil when they run out).
type fakeSend struct {
	sent []mail.Message
	errs []error
}

func (s *fakeSend) send(_ context.Context, m mail.Message) error {
	s.sent = append(s.sent, m)
	if len(s.errs) > 0 {
		err := s.errs[0]
		s.errs = s.errs[1:]
		return err
	}
	return nil
}

func fixedClock() func() time.Time {
	at := time.Date(2026, 11, 7, 15, 0, 0, 0, time.UTC)
	return func() time.Time { return at }
}

func run(t *testing.T, st *fakeStore, sn *fakeSend, now func() time.Time) counts {
	t.Helper()
	if now == nil {
		now = fixedClock()
	}
	c, err := dispatch(context.Background(), st, sn.send, cfg, now, quiet)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestGetIsRefusedFirst(t *testing.T) {
	d := &edge.Deps{Env: func(string) string { return "" }, Log: quiet, Now: time.Now}
	_, err := Func(d, httptest.NewRequest(http.MethodGet, "/", nil))
	p, ok := problem.As(err)
	if !ok || p.Status != 403 || p.Detail != "Use POST to run the email dispatcher." {
		t.Fatalf("%v", err)
	}
}

func TestUnconfiguredOrRefusedSettingsAreA500BeforeAnyClaim(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"nothing set": {},
		"port 587 to a real server": {"EMAIL_SMTP_HOST": "smtp.ionos.com", "EMAIL_SMTP_PORT": "587",
			"EMAIL_FROM_ADDRESS": "a@b.com", "EMAIL_SMTP_USER": "u", "EMAIL_SMTP_PASSWORD": "p"},
	} {
		// DB is nil: reaching the claim would panic, so a clean error proves nothing was claimed.
		d := &edge.Deps{Env: func(k string) string { return env[k] }, Log: quiet, Now: time.Now}
		_, err := Func(d, httptest.NewRequest(http.MethodPost, "/", nil))
		if err == nil {
			t.Fatalf("%s: no error", name)
		}
		if _, isProblem := problem.As(err); isProblem {
			t.Errorf("%s: %v is a problem, Deno answered a bare 500", name, err)
		}
	}
}

func TestReplyKeysInDenoOrder(t *testing.T) {
	b, _ := js.Marshal(counts{1, 2, 3, 4, 5}.reply())
	if string(b) != `{"sent":1,"alertsSent":2,"retried":3,"failed":4,"released":5}` {
		t.Error(string(b))
	}
}

func TestDueEmailIsSentWithItsTokensSavedFirst(t *testing.T) {
	prev := "0195a2c0-0000-7000-8000-0000000000aa"
	r := row("0195a2c0-0000-7000-8000-0000000000bb")
	r.PreviousOutboxID = &prev
	st := &fakeStore{claimed: []email.ClaimedEmail{r}}
	sn := &fakeSend{}
	c := run(t, st, sn, nil)
	if c != (counts{sent: 1}) || !st.alertClaimed {
		t.Fatalf("counts %+v, alerts claimed %v", c, st.alertClaimed)
	}
	if len(st.tokens) != 1 || len(sn.sent) != 1 {
		t.Fatalf("tokens %v sent %d", st.tokens, len(sn.sent))
	}
	m := sn.sent[0]
	// The Reply-To token is the one whose hash was saved.
	local := strings.TrimPrefix(strings.Split(m.ReplyTo, "@")[0], "gyasi.messages+")
	if email.TokenHashParam(local) != st.tokens[0][1] || st.tokens[0][0] != r.OutboxID {
		t.Errorf("reply token %q not the saved one", m.ReplyTo)
	}
	if m.To != "jordan@example.com" || m.FromName != "Gyasi at Story-Tail Adventures" ||
		m.FromAddress != cfg.FromAddress || m.Subject != "Gyasi wrote about Lisbon" ||
		m.MessageID != "<"+r.OutboxID+"@adventures.story-tail.com>" ||
		m.InReplyTo != "<"+prev+"@adventures.story-tail.com>" || m.References != m.InReplyTo {
		t.Errorf("message %+v", m)
	}
	var names []string
	for _, h := range m.Headers {
		names = append(names, h.Name)
	}
	if !reflect.DeepEqual(names, []string{"List-Unsubscribe", "List-Unsubscribe-Post", "Auto-Submitted"}) {
		t.Errorf("headers %v", names)
	}
	if len(st.finishes) != 1 || !st.finishes[0].ok || st.finishes[0].err != nil {
		t.Errorf("finishes %+v", st.finishes)
	}
}

func TestNothingHonestToSendFailsForGoodWithoutSending(t *testing.T) {
	r := row("o1")
	r.Messages = nil
	st := &fakeStore{claimed: []email.ClaimedEmail{r}}
	sn := &fakeSend{}
	c := run(t, st, sn, nil)
	if c != (counts{failed: 1}) || len(sn.sent) != 0 {
		t.Fatalf("%+v %d", c, len(sn.sent))
	}
	f := st.finishes[0]
	if f.ok || !f.permanent || *f.err != "no replies left to send" {
		t.Errorf("%+v %q", f, *f.err)
	}
}

func TestSMTPOutcomes(t *testing.T) {
	for _, tc := range []struct {
		name      string
		err       error
		permanent bool
		text      string
	}{
		// nodemailer's response is the whole reply, code included, so the code shows twice.
		{"5xx", &mail.Error{Code: 550, Kind: "EENVELOPE", Text: "5.1.1 <jordan@example.com>: no such user"}, true,
			"550 550 5.1.1 <[address]>: no such user"},
		{"4xx", &mail.Error{Code: 451, Kind: "EMESSAGE", Text: "4.3.0 try later"}, false, "451 451 4.3.0 try later"},
		{"multi-line", &mail.Error{Code: 554, Kind: "EMESSAGE", Text: "5.7.1 one\nsecond"}, true, "554 554-5.7.1 one 554 second"},
		{"no reply at all", &mail.Error{Kind: "ECONNECTION", Text: "could not connect"}, false, "ECONNECTION could not connect"},
		{"timeout", &mail.Error{Kind: "ETIMEDOUT", Text: "timed out"}, false, "ETIMEDOUT timed out"},
	} {
		st := &fakeStore{claimed: []email.ClaimedEmail{row("o1")}}
		c := run(t, st, &fakeSend{errs: []error{tc.err}}, nil)
		f := st.finishes[0]
		if f.ok || f.permanent != tc.permanent || f.err == nil || *f.err != tc.text {
			t.Errorf("%s: %+v %v", tc.name, f, f.err)
		}
		if tc.permanent && c.failed != 1 || !tc.permanent && c.retried != 1 {
			t.Errorf("%s: counts %+v", tc.name, c)
		}
	}
}

func TestTokenSaveFailureIsAnInternalErrorRetryAndNothingGoes(t *testing.T) {
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1"), row("o2")}, tokenErr: errors.New("boom")}
	sn := &fakeSend{}
	c := run(t, st, sn, nil)
	if len(sn.sent) != 0 || c != (counts{retried: 2}) {
		t.Fatalf("%+v %d", c, len(sn.sent))
	}
	for _, f := range st.finishes {
		if f.ok || f.permanent || *f.err != "internal error" {
			t.Errorf("%+v", f)
		}
	}
}

func TestSignatureReadFailureStillSendsWithTheLockedLine(t *testing.T) {
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1")}, sigErr: &service.Error{Code: "XX000"}}
	sn := &fakeSend{}
	if c := run(t, st, sn, nil); c.sent != 1 {
		t.Fatalf("%+v", c)
	}
	if !strings.Contains(sn.sent[0].Text, "-- \n\n"+email.LockedSignatureLine) {
		t.Errorf("%q", sn.sent[0].Text)
	}
}

func TestSignatureIsUnderTheWords(t *testing.T) {
	sig := "{{agent.name}} \U000000b7 {{agent.phone}}"
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1")}, sig: &email.SignatureSource{Signature: &sig, DisplayName: ptr2("Gyasi Story")}}
	sn := &fakeSend{}
	run(t, st, sn, nil)
	if !strings.Contains(sn.sent[0].Text, "See you soon.\n\n-- \nGyasi Story\n\n"+email.LockedSignatureLine) {
		t.Errorf("%q", sn.sent[0].Text)
	}
}

// The send and the success finish share one catch in the Deno code: a finish that fails after a
// good send is classified like a send error and finished again as a retry.
func TestFailedSuccessFinishIsFinishedAgainAsARetry(t *testing.T) {
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1")}, finishErrs: []error{&service.Error{Message: "deadlock detected"}, nil}}
	c := run(t, st, &fakeSend{}, nil)
	if len(st.finishes) != 2 || !st.finishes[0].ok || st.finishes[1].ok || st.finishes[1].permanent ||
		*st.finishes[1].err != "finish failed: deadlock detected" || c != (counts{retried: 1}) {
		t.Errorf("%+v %+v", st.finishes, c)
	}
}

// When that second finish fails too, the row's outer catch finishes it as "internal error".
func TestEveryFinishFailingEndsInAnInternalErrorAttempt(t *testing.T) {
	boom := &service.Error{Message: "down"}
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1")}, finishErrs: []error{boom, boom, boom}}
	c := run(t, st, &fakeSend{}, nil)
	if len(st.finishes) != 3 || *st.finishes[2].err != "internal error" || c != (counts{}) {
		t.Errorf("%+v %+v", st.finishes, c)
	}
}

func TestFinishAnswersAreCounted(t *testing.T) {
	states := map[string]string{"o1": "sent", "o2": "cleared", "o3": "not_claimed"}
	st := &fakeStore{claimed: []email.ClaimedEmail{row("o1"), row("o2"), row("o3")},
		finishState: func(f finishCall) *string { s := states[f.id]; return &s }}
	if c := run(t, st, &fakeSend{}, nil); c != (counts{sent: 1, retried: 2}) {
		t.Errorf("%+v", c)
	}
}

// The budget: a row reached after 90 s is released, uncounted; alerts are claimed only while
// time is strictly left, and exactly 90 s is neither over nor left.
func TestTimeBudgetReleasesAndSkipsAlerts(t *testing.T) {
	for _, tc := range []struct {
		after       time.Duration
		released    int
		alertsClaim bool
	}{
		{89999 * time.Millisecond, 0, true},
		{90000 * time.Millisecond, 0, false},
		{90001 * time.Millisecond, 1, false},
	} {
		at := time.Date(2026, 11, 7, 15, 0, 0, 0, time.UTC)
		calls := 0
		now := func() time.Time {
			calls++
			if calls <= 2 { // the start, and the first row's check
				return at
			}
			return at.Add(tc.after)
		}
		st := &fakeStore{claimed: []email.ClaimedEmail{row("o1"), row("o2")}}
		c := run(t, st, &fakeSend{}, now)
		if c.released != tc.released || len(st.released) != tc.released || st.alertClaimed != tc.alertsClaim {
			t.Errorf("%v: %+v released %v alerts %v", tc.after, c, st.released, st.alertClaimed)
		}
	}
}

func TestAlertsAreSentAndCounted(t *testing.T) {
	conv, trip := "c1", "t1"
	st := &fakeStore{alerts: []email.ClaimedAlert{
		{AlertID: "a1", Kind: email.AlertClientMessage, Recipient: "gyasi@example.com", ConversationID: &conv, ClientName: ptr2("Jordan Hayes")},
		{AlertID: "a2", Kind: email.AlertQuoteRequest, Recipient: "gyasi@example.com"}, // no trip: fails for good
		{AlertID: "a3", Kind: email.AlertQuoteRequest, Recipient: "gyasi@example.com", TripID: &trip},
	}}
	sn := &fakeSend{errs: []error{nil, &mail.Error{Code: 421, Kind: "ECONNECTION", Text: "busy"}}}
	c := run(t, st, sn, nil)
	if c != (counts{alertsSent: 1, failed: 2}) {
		// a3's 4xx finish answers "failed" from this fake's alert finish.
		t.Errorf("%+v", c)
	}
	if len(sn.sent) != 2 || sn.sent[0].Subject != "New message from Jordan Hayes" || sn.sent[0].ReplyTo != "" ||
		sn.sent[0].MessageID != "<a1@adventures.story-tail.com>" {
		t.Errorf("%+v", sn.sent)
	}
	if f := st.alertFinishes[1]; f.ok || !f.permanent || *f.err != "no trip to open" {
		t.Errorf("%+v", f)
	}
	if f := st.alertFinishes[2]; f.ok || f.permanent || *f.err != "421 421 busy" {
		t.Errorf("%+v %v", f, *f.err)
	}
}

func TestAlertFinishAnsweringNullIsARetry(t *testing.T) {
	conv := "c1"
	st := &fakeStore{alerts: []email.ClaimedAlert{{AlertID: "a1", Kind: email.AlertClientMessage, Recipient: "g@example.com",
		ConversationID: &conv}}}
	sn := &fakeSend{}
	// agent_alert_email_finish answers null when the row was no longer 'sending'.
	c, err := dispatch(context.Background(), nullAlerts{st}, sn.send, cfg, fixedClock(), quiet)
	if err != nil || c != (counts{retried: 1}) {
		t.Errorf("%+v %v", c, err)
	}
}

type nullAlerts struct{ *fakeStore }

func (n nullAlerts) finishAlert(ctx context.Context, id string, ok, permanent bool, e *string) (*string, error) {
	_, err := n.fakeStore.finishAlert(ctx, id, ok, permanent, e)
	return nil, err
}

func TestClaimErrorsAreA500(t *testing.T) {
	_, err := dispatch(context.Background(), &fakeStore{claimErr: errors.New("x")}, (&fakeSend{}).send, cfg, fixedClock(), quiet)
	if err == nil || !strings.HasPrefix(err.Error(), "claim failed: ") {
		t.Errorf("%v", err)
	}
	_, err = dispatch(context.Background(), &fakeStore{alertErr: errors.New("x")}, (&fakeSend{}).send, cfg, fixedClock(), quiet)
	if err == nil || !strings.HasPrefix(err.Error(), "alert claim failed: ") {
		t.Errorf("%v", err)
	}
}

// The RPC arguments, as supabase-js sent them: p_error left out when there is none.
func TestRPCArguments(t *testing.T) {
	var got []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got = append(got, strings.TrimPrefix(r.URL.Path, "/rest/v1/rpc/")+" "+string(b))
		switch {
		case strings.HasSuffix(r.URL.Path, "agent_signature_for_conversation"):
			_, _ = w.Write([]byte(`[]`))
		case strings.HasSuffix(r.URL.Path, "_finish"):
			_, _ = w.Write([]byte(`"sent"`))
		default:
			_, _ = w.Write([]byte(`null`))
		}
	}))
	defer srv.Close()
	s := dbStore{service.New(srv.URL, "k", nil)}
	ctx := context.Background()
	_, _ = s.claimDue(ctx, 10)
	_ = s.recordTokens(ctx, "o1", `\xaa`, `\xbb`)
	sig, err := s.signature(ctx, "c1")
	if sig != nil || err != nil {
		t.Errorf("an empty signature reply is null: %v %v", sig, err)
	}
	_, _ = s.finish(ctx, "o1", true, false, nil)
	_, _ = s.finish(ctx, "o1", false, true, ptr2("550 x"))
	_ = s.release(ctx, "o1")
	_, _ = s.claimAlerts(ctx, 10)
	_, _ = s.finishAlert(ctx, "a1", false, false, nil)
	_ = s.releaseAlert(ctx, "a1")
	want := []string{
		`email_claim_due {"p_limit":10}`,
		`email_record_tokens {"p_outbox_id":"o1","p_reply_hash":"\\xaa","p_unsub_hash":"\\xbb"}`,
		`agent_signature_for_conversation {"p_conversation_id":"c1"}`,
		`email_finish {"p_outbox_id":"o1","p_ok":true,"p_permanent":false}`,
		`email_finish {"p_outbox_id":"o1","p_ok":false,"p_permanent":true,"p_error":"550 x"}`,
		`email_release {"p_outbox_id":"o1"}`,
		`agent_alert_email_claim {"p_limit":10}`,
		`agent_alert_email_finish {"p_alert_id":"a1","p_ok":false,"p_permanent":false}`,
		`agent_alert_email_release {"p_alert_id":"a1"}`,
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

// A real send through the standard-library sender to a fake SMTP server: the mapping of a built
// email onto mail.Message reaches the wire.
func TestMessageMappingKeepsEveryHeader(t *testing.T) {
	built, err := email.BuildEmail(row("0195a2c0-0000-7000-8000-0000000000bb"),
		email.Tokens{Reply: email.NewToken(), Unsubscribe: email.NewToken()}, cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	m := message(built.Outgoing, time.Now())
	data, err := mail.Build(m)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"List-Unsubscribe: <http://127.0.0.1:54321/functions/v1/email-unsubscribe?t=",
		"List-Unsubscribe-Post: List-Unsubscribe=One-Click", "Auto-Submitted: auto-generated", "To: jordan@example.com"} {
		if !strings.Contains(string(data), want) {
			t.Errorf("missing %q", want)
		}
	}
}
