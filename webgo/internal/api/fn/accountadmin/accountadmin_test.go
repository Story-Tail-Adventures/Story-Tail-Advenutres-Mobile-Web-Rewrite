package accountadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/signinemail"
)

// ---- the pure parts ----

func parse(t *testing.T, body string) js.Value {
	t.Helper()
	v, err := js.Parse([]byte(body))
	if err != nil {
		t.Fatalf("parse %s: %v", body, err)
	}
	return v
}

// wantProblem checks err is a problem with this status and detail.
func wantProblem(t *testing.T, err error, status int, detail string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("err = %v, want a %d problem", err, status)
	}
	if p.Status != status || p.Detail != detail {
		t.Errorf("problem = %d %q, want %d %q", p.Status, p.Detail, status, detail)
	}
}

// want500 checks err is NOT a problem: the frame answers a bare 500.
func want500(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("err = nil, want a 500")
	}
	if p, ok := problem.As(err); ok {
		t.Fatalf("err = problem %d %q, want a bare 500", p.Status, p.Detail)
	}
}

const opsSentence = "op must be one of: reset, magic_link, invite, verify_email, lock, unlock, sign_out_everywhere, flag, unflag, merge."

func TestParseRequest(t *testing.T) {
	const id = "0195a2c0-1a00-7000-8000-000000000100"
	cases := []struct {
		body, op, detail string
	}{
		{`{}`, "", opsSentence},
		{`{"op":"Reset","clientId":"` + id + `"}`, "", opsSentence},
		{`{"op":3,"clientId":"` + id + `"}`, "", opsSentence},
		{`{"op":"reset"}`, "", "clientId must be a uuid."},
		{`{"op":"reset","clientId":"banana"}`, "", "clientId must be a uuid."},
		{`{"op":"reset","clientId":42}`, "", "clientId must be a uuid."},
		// The op is checked before the client.
		{`{"op":"nope","clientId":"banana"}`, "", opsSentence},
		{`{"op":"merge","clientId":"` + strings.ToUpper(id) + `"}`, "merge", ""},
	}
	for _, c := range cases {
		op, _, err := parseRequest(parse(t, c.body))
		if c.detail != "" {
			wantProblem(t, err, 400, c.detail)
			continue
		}
		if err != nil || op != c.op {
			t.Errorf("%s: op %q err %v", c.body, op, err)
		}
	}
	for _, op := range ops {
		if got, err := requireOp(js.StringValue(op)); err != nil || got != op {
			t.Errorf("requireOp(%q) = %q, %v", op, got, err)
		}
	}
}

func TestText(t *testing.T) {
	const field = "How you confirmed it"
	long := strings.Repeat("x", 501)
	cases := []struct {
		v           js.Value
		min         int
		want, error string
	}{
		{js.UndefinedValue(), 20, "", field + " is required."},
		{js.NumberValue(5), 20, "", field + " is required."},
		{js.StringValue("   short   "), 20, "", field + " needs at least 20 characters."},
		// JavaScript's trim takes the no-break space too.
		{js.StringValue("\U000000a0" + strings.Repeat("a", 19) + "\U000000a0"), 20, "", field + " needs at least 20 characters."},
		{js.StringValue("  " + strings.Repeat("a", 20) + "  "), 20, strings.Repeat("a", 20), ""},
		{js.StringValue(long), 20, "", field + " is too long."},
		// Length is UTF-16 units: 250 emoji are 500 units, 251 are too many.
		{js.StringValue(strings.Repeat("\U0001F600", 251)), 1, "", field + " is too long."},
		{js.StringValue(strings.Repeat("\U0001F600", 250)), 1, strings.Repeat("\U0001F600", 250), ""},
		{js.StringValue("   "), 1, "", field + " is required."},
	}
	for i, c := range cases {
		got, err := text(c.v, field, c.min, maxNote)
		if c.error != "" {
			wantProblem(t, err, 400, c.error)
			continue
		}
		if err != nil || got != c.want {
			t.Errorf("case %d: %q, %v", i, got, err)
		}
	}
}

func TestRequireAal2(t *testing.T) {
	wantProblem(t, requireAal2(&caller.Context{AAL: "aal1"}), 403, "Set up two-step sign-in first.")
	if err := requireAal2(&caller.Context{AAL: "aal2"}); err != nil {
		t.Error(err)
	}
}

func str(s string) *string { return &s }

func TestEmailRefusal(t *testing.T) {
	now := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	signIn := func(edit func(*snapshot)) *snapshot {
		s := &snapshot{
			HasSignIn: true, AccountID: str("a"), SignInEmail: str("n@example.com"), ClientEmail: str("n@example.com"),
			EmailVerifiedAt: str("2026-01-01T00:00:00+00:00"), HasPassword: true, Providers: []string{"email"},
		}
		if edit != nil {
			edit(s)
		}
		return s
	}
	none := func(edit func(*snapshot)) *snapshot {
		s := &snapshot{ClientEmail: str("n@example.com")}
		if edit != nil {
			edit(s)
		}
		return s
	}
	cases := []struct {
		name string
		kind signinemail.Kind
		s    *snapshot
		want string
	}{
		{"invite, verified sign-in", signinemail.Invite, signIn(nil), "They already have a sign-in."},
		{"invite, sign-in never invited", signinemail.Invite, signIn(func(s *snapshot) { s.EmailVerifiedAt = nil }), "They already have a sign-in."},
		{"invite, pending invite resends", signinemail.Invite, signIn(func(s *snapshot) { s.EmailVerifiedAt, s.InvitedAt = nil, str("2026-11-07T11:00:00+00:00") }), ""},
		{"invite, archived", signinemail.Invite, none(func(s *snapshot) { s.ClientArchived = true }), "Restore this client before inviting them."},
		{"invite, duplicate", signinemail.Invite, none(func(s *snapshot) { s.DuplicateEmail = true }), "Another client record has this email. Merge them first."},
		{"invite, no email", signinemail.Invite, none(func(s *snapshot) { s.ClientEmail = nil }), "Add an email address first."},
		{"invite, empty email", signinemail.Invite, none(func(s *snapshot) { s.ClientEmail = str("") }), "Add an email address first."},
		{"invite, fine", signinemail.Invite, none(nil), ""},
		{"reset, no sign-in", signinemail.Reset, none(nil), "They haven't signed in yet. Send an invite instead."},
		{"magic, no sign-in", signinemail.MagicLink, none(nil), "They haven't signed in yet. Send an invite instead."},
		{"reset, locked", signinemail.Reset, signIn(func(s *snapshot) { s.LockedAt = str("2026-11-07T11:00:00+00:00") }), "Their account is locked. Unlock it first."},
		{"magic, banned only", signinemail.MagicLink, signIn(func(s *snapshot) { s.BannedUntil = str("2126-10-14T12:00:00.123456+00:00") }), "Their account is locked. Unlock it first."},
		{"magic, ban expired", signinemail.MagicLink, signIn(func(s *snapshot) { s.BannedUntil = str("2026-11-07T11:59:59+00:00") }), ""},
		{"reset, google only", signinemail.Reset, signIn(func(s *snapshot) { s.HasPassword, s.Providers = false, []string{"google"} }), "They sign in with Google or Apple, so there's no password to reset."},
		{"reset, email with no password", signinemail.Reset, signIn(func(s *snapshot) { s.HasPassword = false }), ""},
		{"magic, google only", signinemail.MagicLink, signIn(func(s *snapshot) { s.HasPassword, s.Providers = false, []string{"apple", "email"} }), ""},
		{"reset, fine", signinemail.Reset, signIn(nil), ""},
	}
	for _, c := range cases {
		if got := emailRefusal(c.kind, c.s, now); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
}

func TestBannedIsMilliseconds(t *testing.T) {
	now := time.Date(2026, 11, 7, 12, 0, 0, 900_000, time.UTC) // 0.9 ms past the second
	if banned(&snapshot{BannedUntil: str("2026-11-07T12:00:00.000999+00:00")}, now) {
		t.Error("the same millisecond is not in the future")
	}
	if !banned(&snapshot{BannedUntil: str("2026-11-07T12:00:00.001+00:00")}, now) {
		t.Error("the next millisecond is")
	}
	if banned(&snapshot{BannedUntil: str("not a date")}, now) {
		t.Error("NaN > now is false")
	}
}

func TestVersionAndChoices(t *testing.T) {
	for _, bad := range []string{`"1"`, `1.5`, `0`, `-1`, `null`, `true`} {
		_, err := version(parse(t, bad), "keepVersion")
		wantProblem(t, err, 400, "keepVersion must be a positive integer.")
	}
	if n, err := version(parse(t, `3`), "keepVersion"); err != nil || n != 3 {
		t.Errorf("version 3 = %v, %v", n, err)
	}

	for _, bad := range []string{`null`, `[]`, `"keep"`, `1`} {
		_, err := choices(parse(t, bad))
		wantProblem(t, err, 400, "choices must be an object.")
	}
	const each = `Each choice is a field name and "keep" or "retire".`
	for _, bad := range []string{`{"First_name":"keep"}`, `{"email":"both"}`, `{"email":true}`, `{"":"keep"}`,
		`{"` + strings.Repeat("a", 41) + `":"keep"}`, `{"first-name":"keep"}`, `{"phone":"keep","1":"keep"}`} {
		_, err := choices(parse(t, bad))
		wantProblem(t, err, 400, each)
	}
	got, err := choices(js.UndefinedValue())
	if b, _ := js.Marshal(got); err != nil || string(b) != `{}` {
		t.Errorf("absent choices = %s, %v", b, err)
	}
	// Key order is kept; a duplicate keeps its first place and its last value; "__proto__"
	// passes the check and is then dropped, as the prototype setter dropped it.
	got, err = choices(parse(t, `{"phone":"retire","__proto__":"keep","email":"keep","phone":"keep"}`))
	if b, _ := js.Marshal(got); err != nil || string(b) != `{"phone":"keep","email":"keep"}` {
		t.Errorf("choices = %s, %v", b, err)
	}
}

// ---- the flows, against a fake store ----

type fakeStore struct {
	calls  []string
	rpc    map[string]func(args js.Ordered) (string, error)
	admin  func(id string, attrs string) error
	link   service.GeneratedLink
	linkFn func(p service.GenerateLinkParams) (service.GeneratedLink, error)
	locked bool
	rows   []string // audit rows as JSON
}

func (f *fakeStore) RPC(_ context.Context, fn string, args any, out any) error {
	f.calls = append(f.calls, "rpc "+fn)
	h, ok := f.rpc[fn]
	if !ok {
		return errors.New("unexpected rpc " + fn)
	}
	raw, err := h(args.(js.Ordered))
	if err != nil {
		return err
	}
	*(out.(*json.RawMessage)) = json.RawMessage(raw)
	return nil
}

func (f *fakeStore) UpdateUserByID(_ context.Context, id string, attributes any) (service.AdminUser, error) {
	b, _ := js.Marshal(attributes)
	f.calls = append(f.calls, "admin "+id+" "+string(b))
	if f.admin != nil {
		return service.AdminUser{}, f.admin(id, string(b))
	}
	return service.AdminUser{ID: id}, nil
}

func (f *fakeStore) GenerateLink(_ context.Context, p service.GenerateLinkParams) (service.GeneratedLink, error) {
	f.calls = append(f.calls, "link "+p.Type)
	if f.linkFn != nil {
		return f.linkFn(p)
	}
	return f.link, nil
}

func (f *fakeStore) InsertRows(_ context.Context, table string, rows any) error {
	b, _ := js.Marshal(rows)
	var r struct {
		EventType string `json:"event_type"`
	}
	_ = json.Unmarshal(b, &r)
	f.calls = append(f.calls, "audit "+r.EventType)
	f.rows = append(f.rows, string(b))
	return nil
}

func (f *fakeStore) agentDisplayName(context.Context, string) *string { return str("Gyasi Story") }

func (f *fakeStore) accountLocked(context.Context, string) bool {
	f.calls = append(f.calls, "read account")
	return f.locked
}

func arg(args js.Ordered, key string) any {
	for _, f := range args {
		if f.Key == key {
			return f.Value
		}
	}
	return nil
}

const (
	clientID  = "0195a2c0-1a00-7000-8000-000000000100"
	accountID = "0195a2c0-1a00-7000-8000-0000000000aa"
	otherID   = "0195a2c0-1a00-7000-8000-000000000101"
	tokenHash = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
)

var now = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

var mailEnv = map[string]string{
	"EMAIL_SMTP_HOST":       "127.0.0.1",
	"EMAIL_SMTP_PORT":       "1025",
	"EMAIL_FROM_ADDRESS":    "gyasi.messages@adventures.story-tail.com",
	"EMAIL_SITE_URL":        "http://localhost:3000",
	"EMAIL_UNSUBSCRIBE_URL": "http://127.0.0.1:54321/functions/v1/email-unsubscribe",
}

type harness struct {
	h    *handler
	f    *fakeStore
	logs *bytes.Buffer
	sent []mail.Message
}

func newHarness(mfaAge time.Duration) *harness {
	at := now.Add(-mfaAge)
	ua := "test/1"
	logs := &bytes.Buffer{}
	hs := &harness{f: &fakeStore{rpc: map[string]func(js.Ordered) (string, error){}}, logs: logs}
	hs.h = &handler{
		db: hs.f,
		send: func(_ context.Context, _ mail.Config, m mail.Message) (string, error) {
			hs.sent = append(hs.sent, m)
			return "250 ok", nil
		},
		env:     func(k string) string { return mailEnv[k] },
		now:     func() time.Time { return now },
		log:     slog.New(slog.NewTextHandler(logs, nil)),
		c:       &caller.Context{PlatformUserID: "pu-1", Role: "agent", AAL: "aal2", SecondFactorAt: &at, UserAgent: &ua},
		agentID: "agent-1",
	}
	return hs
}

func (hs *harness) snapshotIs(s string) {
	hs.f.rpc["account_admin_target"] = func(js.Ordered) (string, error) { return s, nil }
}

func (hs *harness) do(t *testing.T, body string) (string, error) {
	t.Helper()
	payload := parse(t, body)
	op, id, err := parseRequest(payload)
	if err != nil {
		return "", err
	}
	r, err := hs.h.run(context.Background(), op, id, payload)
	if err != nil {
		return "", err
	}
	if r.Status != http.StatusOK {
		t.Errorf("status %d", r.Status)
	}
	b, _ := js.Marshal(r.Body)
	return string(b), nil
}

func wantCalls(t *testing.T, got []string, want ...string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("calls:\n got  %q\n want %q", got, want)
	}
}

const signedIn = `{"clientId":"` + clientID + `","firstName":"Nora","lastName":"Vale","clientEmail":"nora@example.com",` +
	`"clientArchived":false,"duplicateEmail":false,"duplicateEmailClientId":null,"signInEmailsLastHour":0,"hasSignIn":true,` +
	`"accountId":"` + accountID + `","signInEmail":"nora@example.com","emailVerifiedAt":"2026-01-01T00:00:00+00:00",` +
	`"invitedAt":null,"hasPassword":true,"providers":["email"],"lockedAt":null,"bannedUntil":null,"duplicateSignInEmail":false}`

func edit(snap string, from, to string) string { return strings.Replace(snap, from, to, 1) }

// THE LOCK ORDER: GoTrue's ban first, then the row; a failed row undoes the ban.
func TestLockBansFirstThenWritesTheRow(t *testing.T) {
	hs := newHarness(time.Hour) // a stale factor: lock needs none
	hs.snapshotIs(signedIn)
	hs.f.rpc["account_admin_set_lock"] = func(a js.Ordered) (string, error) {
		if arg(a, "p_lock") != true || arg(a, "p_reason") != "lost phone" || arg(a, "p_actor_user_id") != "pu-1" {
			t.Errorf("set_lock args %v", a)
		}
		if arg(a, "p_ip") != js.Undef {
			t.Errorf("p_ip should be left out, got %v", arg(a, "p_ip"))
		}
		return `{"accountId":"` + accountID + `","sessionsEnded":2}`, nil
	}
	got, err := hs.do(t, `{"op":"lock","clientId":"`+clientID+`","reason":"  lost phone "}`)
	if err != nil || got != `{"outcome":"changed","sessionsEnded":2}` {
		t.Fatalf("%s %v", got, err)
	}
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "admin "+accountID+` {"ban_duration":"876000h"}`, "rpc account_admin_set_lock")
}

func TestLockRowFailureLiftsTheBan(t *testing.T) {
	for _, fail := range []func(js.Ordered) (string, error){
		func(js.Ordered) (string, error) {
			return "", &service.Error{Status: 400, Code: "22P05", Message: "unsupported Unicode escape sequence"}
		},
		func(js.Ordered) (string, error) { return "null", nil },
	} {
		hs := newHarness(0)
		hs.snapshotIs(signedIn)
		hs.f.rpc["account_admin_set_lock"] = fail
		_, err := hs.do(t, `{"op":"lock","clientId":"`+clientID+`","reason":"r"}`)
		want500(t, err)
		wantCalls(t, hs.f.calls, "rpc account_admin_target",
			"admin "+accountID+` {"ban_duration":"876000h"}`, "rpc account_admin_set_lock",
			"admin "+accountID+` {"ban_duration":"none"}`)
	}
}

func TestUnlockRowFailureRestoresTheBan(t *testing.T) {
	hs := newHarness(0)
	hs.snapshotIs(edit(signedIn, `"lockedAt":null`, `"lockedAt":"2026-11-07T11:00:00+00:00"`))
	hs.f.rpc["account_admin_set_lock"] = func(js.Ordered) (string, error) { return "", &service.Error{Status: 500} }
	_, err := hs.do(t, `{"op":"unlock","clientId":"`+clientID+`","reason":"found it"}`)
	want500(t, err)
	wantCalls(t, hs.f.calls, "rpc account_admin_target",
		"admin "+accountID+` {"ban_duration":"none"}`, "rpc account_admin_set_lock",
		"admin "+accountID+` {"ban_duration":"876000h"}`)
}

func TestBanFailureWritesNoRow(t *testing.T) {
	hs := newHarness(0)
	hs.snapshotIs(signedIn)
	hs.f.admin = func(string, string) error { return &service.Error{Status: 500, Code: "unexpected_failure"} }
	_, err := hs.do(t, `{"op":"lock","clientId":"`+clientID+`","reason":"r"}`)
	want500(t, err)
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "admin "+accountID+` {"ban_duration":"876000h"}`)
}

func TestLockNoops(t *testing.T) {
	locked := edit(signedIn, `"lockedAt":null`, `"lockedAt":"2026-11-07T11:00:00+00:00"`)
	bannedOnly := edit(signedIn, `"bannedUntil":null`, `"bannedUntil":"2126-10-14T12:00:00+00:00"`)
	cases := []struct{ op, snap, want string }{
		{"lock", locked, `{"outcome":"noop"}`},
		{"unlock", signedIn, `{"outcome":"noop"}`},
		// A ban with no row still blocks sign-in, so Unlock is not a no-op.
		{"unlock", bannedOnly, `{"outcome":"changed","sessionsEnded":0}`},
		{"lock", edit(signedIn, `"hasSignIn":true`, `"hasSignIn":false`), `{"outcome":"refused","reason":"They haven't signed in yet."}`},
	}
	for _, c := range cases {
		hs := newHarness(0)
		hs.snapshotIs(c.snap)
		hs.f.rpc["account_admin_set_lock"] = func(js.Ordered) (string, error) { return `{"sessionsEnded":0}`, nil }
		got, err := hs.do(t, `{"op":"`+c.op+`","clientId":"`+clientID+`","reason":"r"}`)
		if err != nil || got != c.want {
			t.Errorf("%s: %s %v", c.op, got, err)
		}
	}
	hs := newHarness(0)
	_, err := hs.do(t, `{"op":"lock","clientId":"`+clientID+`","reason":" "}`)
	wantProblem(t, err, 400, "Reason is required.")
	if len(hs.f.calls) != 0 {
		t.Errorf("the reason is checked before the snapshot: %q", hs.f.calls)
	}
}

// THE RECENT-FACTOR GATE: verify_email and merge, before anything else; lock and the rest
// need only aal2.
func TestRecentMfaGate(t *testing.T) {
	for _, body := range []string{
		`{"op":"verify_email","clientId":"` + clientID + `"}`,
		`{"op":"merge","clientId":"` + clientID + `"}`,
	} {
		hs := newHarness(20 * time.Minute)
		_, err := hs.do(t, body)
		wantProblem(t, err, 403, "MFA was verified 1200s ago; this action requires it within 900s.")
		if len(hs.f.calls) != 0 {
			t.Errorf("the gate comes first: %q", hs.f.calls)
		}
		hs.h.c.SecondFactorAt = nil
		_, err = hs.do(t, body)
		wantProblem(t, err, 403, "Could not determine when MFA was last verified.")
	}
	hs := newHarness(20 * time.Minute)
	hs.f.rpc["account_admin_sign_out_everywhere"] = func(js.Ordered) (string, error) { return `3`, nil }
	if got, err := hs.do(t, `{"op":"sign_out_everywhere","clientId":"`+clientID+`"}`); err != nil || got != `{"outcome":"changed","sessionsEnded":3}` {
		t.Errorf("sign out with a stale factor: %s %v", got, err)
	}
}

const unverified = `{"clientId":"` + clientID + `","firstName":"Nora","lastName":"Vale","clientEmail":"Nora@Example.com",` +
	`"clientArchived":false,"duplicateEmail":false,"duplicateEmailClientId":null,"hasSignIn":true,` +
	`"accountId":"` + accountID + `","signInEmail":"nora@example.com","emailVerifiedAt":null,` +
	`"invitedAt":null,"hasPassword":true,"providers":["email"],"lockedAt":null,"bannedUntil":null,"duplicateSignInEmail":false}`

const note = `{"op":"verify_email","clientId":"` + clientID + `","note":"Called her on the number we have on file"}`

// Audited BEFORE GoTrue is called; a failed confirm writes a second row and answers 500.
func TestVerifyEmailAuditsFirst(t *testing.T) {
	hs := newHarness(time.Minute)
	hs.snapshotIs(unverified)
	got, err := hs.do(t, note)
	if err != nil || got != `{"outcome":"changed"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "audit client.email_verified_manually",
		"admin "+accountID+` {"email_confirm":true}`)
	if !strings.Contains(hs.f.rows[0], `"metadata":{"accountId":"`+accountID+`","note":"Called her on the number we have on file"}`) {
		t.Errorf("row %s", hs.f.rows[0])
	}

	hs = newHarness(time.Minute)
	hs.snapshotIs(unverified)
	hs.f.admin = func(string, string) error { return &service.Error{Status: 404, Code: "user_not_found"} }
	_, err = hs.do(t, note)
	want500(t, err)
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "audit client.email_verified_manually",
		"admin "+accountID+` {"email_confirm":true}`, "audit client.email_verify_failed")
	if !strings.Contains(hs.f.rows[1], `"metadata":{"accountId":"`+accountID+`","status":404,"code":"user_not_found"}`) {
		t.Errorf("row %s", hs.f.rows[1])
	}
}

func TestVerifyEmailAnswers(t *testing.T) {
	cases := []struct{ snap, want string }{
		{edit(unverified, `"hasSignIn":true`, `"hasSignIn":false`), `{"outcome":"refused","reason":"They haven't signed in yet."}`},
		{signedIn, `{"outcome":"noop"}`},
		{edit(unverified, `"clientEmail":"Nora@Example.com"`, `"clientEmail":"nora.v@example.com"`),
			`{"outcome":"refused","reason":"Their sign-in address and the one on their record are different. Fix the record first."}`},
		{edit(unverified, `"duplicateEmail":false,"duplicateEmailClientId":null`, `"duplicateEmail":true,"duplicateEmailClientId":"`+otherID+`"`),
			`{"outcome":"duplicate","duplicateClientId":"` + otherID + `"}`},
		{edit(unverified, `"duplicateSignInEmail":false`, `"duplicateSignInEmail":true`), `{"outcome":"duplicate","duplicateClientId":null}`},
	}
	for _, c := range cases {
		hs := newHarness(time.Minute)
		hs.snapshotIs(c.snap)
		got, err := hs.do(t, note)
		if err != nil || got != c.want {
			t.Errorf("%s %v, want %s", got, err, c.want)
		}
		if len(hs.f.rows) != 0 {
			t.Errorf("no write on %s", c.want)
		}
	}
	hs := newHarness(time.Minute)
	_, err := hs.do(t, `{"op":"verify_email","clientId":"`+clientID+`","note":"too short"}`)
	wantProblem(t, err, 400, "How you confirmed it needs at least 20 characters.")
	hs.f.rpc["account_admin_target"] = func(js.Ordered) (string, error) { return "null", nil }
	_, err = hs.do(t, note)
	wantProblem(t, err, 404, "No such client.")
}

// ---- sign-in emails ----

func (hs *harness) emailHappy(kind string) {
	hs.f.rpc["account_admin_claim_signin_email"] = func(a js.Ordered) (string, error) {
		if arg(a, "p_kind") != kind {
			return "", errors.New("wrong kind")
		}
		return `"claimed"`, nil
	}
	hs.f.rpc["account_admin_bind_invite"] = func(js.Ordered) (string, error) { return `"bound"`, nil }
	hs.f.link = service.GeneratedLink{
		Properties: service.LinkProperties{HashedToken: tokenHash, VerificationType: signinemail.VerifyType[signinemail.Kind(kind)],
			ActionLink: "http://127.0.0.1:54321/auth/v1/verify?token=" + tokenHash, EmailOTP: "123456"},
		User: service.AdminUser{ID: accountID},
	}
}

// NOTHING A CLIENT CAN SIGN IN WITH LEAVES EXCEPT BY EMAIL: the token hash and OTP are in the
// email body and in nothing else this function produces.
func (hs *harness) noSecrets(t *testing.T, reply string) {
	t.Helper()
	for _, secret := range []string{tokenHash, "123456", "auth/v1/verify"} {
		for what, s := range map[string]string{"reply": reply, "log": hs.logs.String(), "audit": strings.Join(hs.f.rows, "\n")} {
			if strings.Contains(s, secret) {
				t.Errorf("%q reached the %s: %s", secret, what, s)
			}
		}
	}
}

func TestResetSendsTheLinkOnlyByEmail(t *testing.T) {
	hs := newHarness(time.Hour)
	hs.snapshotIs(signedIn)
	hs.emailHappy("reset")
	got, err := hs.do(t, `{"op":"reset","clientId":"`+clientID+`"}`)
	if err != nil || got != `{"outcome":"sent","kind":"reset"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "rpc account_admin_claim_signin_email", "link recovery",
		"audit client.signin_email_sent")
	if len(hs.sent) != 1 {
		t.Fatalf("sent %d", len(hs.sent))
	}
	m := hs.sent[0]
	if m.To != "nora@example.com" || m.FromName != "Gyasi at Story-Tail Adventures" || m.ReplyTo != "" ||
		m.Subject != "Gyasi sent you a link to reset your password" ||
		!strings.Contains(m.Text, "token_hash="+tokenHash+"&type=recovery&next=%2Freset-password") ||
		len(m.Headers) != 1 || m.Headers[0] != (mail.Header{Name: "Auto-Submitted", Value: "auto-generated"}) {
		t.Errorf("message %+v", m)
	}
	hs.noSecrets(t, got)
}

func TestInviteBindsThenSends(t *testing.T) {
	hs := newHarness(0)
	hs.snapshotIs(edit(edit(signedIn, `"hasSignIn":true`, `"hasSignIn":false`), `"clientEmail":"nora@example.com"`, `"clientEmail":"nora.v@example.com"`))
	hs.emailHappy("invite")
	var params service.GenerateLinkParams
	hs.f.linkFn = func(p service.GenerateLinkParams) (service.GeneratedLink, error) { params = p; return hs.f.link, nil }
	got, err := hs.do(t, `{"op":"invite","clientId":"`+clientID+`"}`)
	if err != nil || got != `{"outcome":"sent","kind":"invite"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "rpc account_admin_claim_signin_email", "link invite",
		"rpc account_admin_bind_invite", "audit client.signin_email_sent")
	if b, _ := js.Marshal(params.Data); params.Email != "nora.v@example.com" || string(b) != `{"agent_id":"agent-1","first_name":"Nora","last_name":"Vale"}` {
		t.Errorf("params %+v %s", params, b)
	}
	if hs.sent[0].To != "nora.v@example.com" {
		t.Errorf("to %s", hs.sent[0].To)
	}

	// Bound to someone else's sign-in: refused, nothing sent.
	for _, answer := range []string{`"conflict"`, `"not_found"`, `null`} {
		hs = newHarness(0)
		hs.snapshotIs(edit(signedIn, `"hasSignIn":true`, `"hasSignIn":false`))
		hs.emailHappy("invite")
		hs.f.rpc["account_admin_bind_invite"] = func(js.Ordered) (string, error) { return answer, nil }
		got, err = hs.do(t, `{"op":"invite","clientId":"`+clientID+`"}`)
		if err != nil || got != `{"outcome":"refused","reason":"That email already has a different sign-in."}` || len(hs.sent) != 0 {
			t.Errorf("%s: %s %v (sent %d)", answer, got, err, len(hs.sent))
		}
	}
}

func TestSendFailureAnswersFailed(t *testing.T) {
	hs := newHarness(0)
	hs.snapshotIs(signedIn)
	hs.emailHappy("magic_link")
	hs.h.send = func(context.Context, mail.Config, mail.Message) (string, error) {
		return "", &mail.Error{Code: 550, Kind: "EENVELOPE", Text: "5.1.1 <nora@example.com>: Recipient address rejected"}
	}
	got, err := hs.do(t, `{"op":"magic_link","clientId":"`+clientID+`"}`)
	if err != nil || got != `{"outcome":"failed"}` {
		t.Fatalf("%s %v", got, err)
	}
	wantCalls(t, hs.f.calls, "rpc account_admin_target", "rpc account_admin_claim_signin_email", "link magiclink",
		"audit client.signin_email_failed")
	if !strings.Contains(hs.f.rows[0], `"metadata":{"kind":"magic_link","stage":"send","permanent":true}`) {
		t.Errorf("row %s", hs.f.rows[0])
	}
	if strings.Contains(hs.logs.String(), "nora@example.com") || !strings.Contains(hs.logs.String(), "[address]") {
		t.Errorf("the address must be scrubbed from the log: %s", hs.logs.String())
	}
	hs.noSecrets(t, got)

	// A dropped connection is not permanent.
	if perm, why := email.ClassifySMTPError(smtpError(&mail.Error{Kind: "ECONNECTION", Text: "could not connect"})); perm || why != "ECONNECTION could not connect" {
		t.Errorf("%v %q", perm, why)
	}
}

func TestGenerateLinkFailureAnswersFailed(t *testing.T) {
	for _, c := range []struct {
		err  error
		code string
	}{
		{&service.Error{Status: 422, Code: "email_exists", Message: "A user with this email address has already been registered"}, `"email_exists"`},
		// auth-js answered a 5xx with a retryable error that has no code, whatever GoTrue said.
		{&service.Error{Status: 500, Code: "P0001", Message: "Cannot provision client nora@example.com"}, `null`},
		{nil, `null`}, // no error, but no token hash either
	} {
		hs := newHarness(0)
		hs.snapshotIs(edit(signedIn, `"hasSignIn":true`, `"hasSignIn":false`))
		hs.emailHappy("invite")
		e := c.err
		hs.f.linkFn = func(service.GenerateLinkParams) (service.GeneratedLink, error) { return service.GeneratedLink{}, e }
		got, err := hs.do(t, `{"op":"invite","clientId":"`+clientID+`"}`)
		if err != nil || got != `{"outcome":"failed"}` || len(hs.sent) != 0 {
			t.Fatalf("%s %v", got, err)
		}
		if !strings.Contains(hs.f.rows[0], `"metadata":{"kind":"invite","stage":"link","code":`+c.code+`}`) {
			t.Errorf("row %s", hs.f.rows[0])
		}
	}
}

func TestEmailGates(t *testing.T) {
	// The wrong link type is our failure: a 500, nothing sent.
	hs := newHarness(0)
	hs.snapshotIs(signedIn)
	hs.emailHappy("reset")
	hs.f.link.Properties.VerificationType = "magiclink"
	_, err := hs.do(t, `{"op":"reset","clientId":"`+clientID+`"}`)
	want500(t, err)
	if len(hs.sent) != 0 || len(hs.f.rows) != 0 {
		t.Error("nothing is sent or audited")
	}

	// Email not set up: 503 before the claim.
	hs = newHarness(0)
	hs.snapshotIs(signedIn)
	hs.h.env = func(string) string { return "" }
	_, err = hs.do(t, `{"op":"reset","clientId":"`+clientID+`"}`)
	wantProblem(t, err, 503, "Email isn't set up yet, so nothing was sent.")
	wantCalls(t, hs.f.calls, "rpc account_admin_target")

	// A setting that would send a password in the clear: a 500, before the claim.
	hs = newHarness(0)
	hs.snapshotIs(signedIn)
	hs.h.env = func(k string) string {
		if k == "EMAIL_SMTP_HOST" {
			return "smtp.example.com"
		}
		return mailEnv[k]
	}
	_, err = hs.do(t, `{"op":"reset","clientId":"`+clientID+`"}`)
	want500(t, err)
	wantCalls(t, hs.f.calls, "rpc account_admin_target")

	// Capped and not found, from the claim.
	for answer, want := range map[string]string{`"capped"`: `{"outcome":"capped"}`, `"not_found"`: ""} {
		hs = newHarness(0)
		hs.snapshotIs(signedIn)
		hs.f.rpc["account_admin_claim_signin_email"] = func(js.Ordered) (string, error) { return answer, nil }
		got, err := hs.do(t, `{"op":"reset","clientId":"`+clientID+`"}`)
		if want == "" {
			wantProblem(t, err, 404, "No such client.")
		} else if err != nil || got != want {
			t.Errorf("%s: %s %v", answer, got, err)
		}
		wantCalls(t, hs.f.calls, "rpc account_admin_target", "rpc account_admin_claim_signin_email")
	}
}

// ---- merge ----

func preview(plan string, retireSignIn string, blocked string) string {
	return `{"keep":{"version":1,"signIn":null},"retire":{"version":2,"signIn":` + retireSignIn + `},` +
		`"signInPlan":"` + plan + `","blocked":` + blocked + `,"fields":[]}`
}

const mergeBody = `{"op":"merge","clientId":"` + clientID + `","otherClientId":"` + otherID + `","keepVersion":1,"otherVersion":2}`

// THE MERGE'S BAN DANCE: ban the retired sign-in first, and lift it again when the merge does
// not land, unless the account was locked before or the row now says it is locked.
func TestMergeBanDance(t *testing.T) {
	retired := `{"accountId":"` + accountID + `","email":"x@example.com","locked":false}`
	ban := "admin " + accountID + ` {"ban_duration":"876000h"}`
	unban := "admin " + accountID + ` {"ban_duration":"none"}`
	cases := []struct {
		name      string
		signIn    string
		locked    bool
		result    func(js.Ordered) (string, error)
		reply     string
		status    int
		wantCalls []string
	}{
		{"merged", retired, false, func(a js.Ordered) (string, error) {
			if arg(a, "p_expect_lock_account") != accountID {
				return "", errors.New("expect")
			}
			return `{"outcome": "merged", "counts": {"notes": 0, "trips": 2, "companions": 1}}`, nil
		}, `{"outcome":"merged","keptClientId":"` + clientID + `","counts":{"notes":0,"trips":2,"companions":1}}`, 200,
			[]string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients"}},
		{"bad choice", retired, false, func(js.Ordered) (string, error) {
			return "", &service.Error{Status: 400, Code: "22023", Message: "unknown merge choice: bogus"}
		}, "One of those choices isn't a field the merge offers.", 400,
			[]string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients", "read account", unban}},
		{"stale in SQL", retired, false, func(js.Ordered) (string, error) { return `{"outcome":"stale"}`, nil },
			`{"outcome":"stale"}`, 200,
			[]string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients", "read account", unban}},
		{"lost answer, row locked", retired, true, func(js.Ordered) (string, error) { return "", &service.Error{Message: "fetch failed"} },
			"", 500, []string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients", "read account"}},
		{"already locked", strings.Replace(retired, `"locked":false`, `"locked":true`, 1), false,
			func(js.Ordered) (string, error) { return `{"outcome":"refused","reason":"name_required"}`, nil },
			`{"outcome":"refused","reason":"The record you keep needs a first and last name."}`, 200,
			[]string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients"}},
		{"not found in SQL", retired, false, func(js.Ordered) (string, error) { return `{"outcome":"not_found"}`, nil },
			"No such client.", 404, []string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients", "read account", unban}},
		{"unknown refusal", retired, false, func(js.Ordered) (string, error) { return `{"outcome":"refused","reason":"new"}`, nil },
			`{"outcome":"refused","reason":null}`, 200,
			[]string{"rpc client_merge_preview", ban, "rpc account_admin_merge_clients", "read account", unban}},
	}
	for _, c := range cases {
		hs := newHarness(time.Minute)
		hs.f.locked = c.locked
		hs.f.rpc["client_merge_preview"] = func(js.Ordered) (string, error) { return preview("lock_retired", c.signIn, "null"), nil }
		hs.f.rpc["account_admin_merge_clients"] = c.result
		got, err := hs.do(t, mergeBody)
		switch c.status {
		case 200:
			if err != nil || got != c.reply {
				t.Errorf("%s: %s %v", c.name, got, err)
			}
		case 500:
			want500(t, err)
		default:
			wantProblem(t, err, c.status, c.reply)
		}
		wantCalls(t, hs.f.calls, c.wantCalls...)
	}
}

func TestMergeWithoutTwoSignInsBansNobody(t *testing.T) {
	for _, plan := range []string{"none", "move", "keep"} {
		hs := newHarness(time.Minute)
		hs.f.rpc["client_merge_preview"] = func(js.Ordered) (string, error) {
			return preview(plan, `{"accountId":"`+accountID+`","locked":false}`, "null"), nil
		}
		hs.f.rpc["account_admin_merge_clients"] = func(a js.Ordered) (string, error) {
			if v := arg(a, "p_expect_lock_account"); v != nil {
				t.Errorf("%s: expect %v, want null", plan, v)
			}
			if b, _ := js.Marshal(arg(a, "p_choices")); string(b) != `{}` {
				t.Errorf("choices %s", b)
			}
			return `{"outcome":"stale"}`, nil
		}
		got, err := hs.do(t, mergeBody)
		if err != nil || got != `{"outcome":"stale"}` {
			t.Errorf("%s: %s %v", plan, got, err)
		}
		wantCalls(t, hs.f.calls, "rpc client_merge_preview", "rpc account_admin_merge_clients")
	}
}

func TestMergeBeforeTheWrite(t *testing.T) {
	cases := []struct{ preview, body, want string }{
		{preview("none", "null", `"kept_archived"`), mergeBody, `{"outcome":"refused","reason":"Restore the record you're keeping before merging into it."}`},
		{preview("none", "null", `"companion_cap"`), mergeBody, `{"outcome":"refused","reason":"Together they'd have more than 12 companions. Archive a few first."}`},
		{preview("none", "null", `"something_new"`), mergeBody, `{"outcome":"refused"}`},
		{preview("lock_retired", `{"accountId":"`+accountID+`","locked":false}`, "null"), strings.Replace(mergeBody, `"keepVersion":1`, `"keepVersion":2`, 1), `{"outcome":"stale"}`},
	}
	for _, c := range cases {
		hs := newHarness(time.Minute)
		hs.f.rpc["client_merge_preview"] = func(js.Ordered) (string, error) { return c.preview, nil }
		got, err := hs.do(t, c.body)
		if err != nil || got != c.want {
			t.Errorf("%s %v, want %s", got, err, c.want)
		}
		wantCalls(t, hs.f.calls, "rpc client_merge_preview")
	}

	hs := newHarness(time.Minute)
	hs.f.rpc["client_merge_preview"] = func(js.Ordered) (string, error) { return "null", nil }
	_, err := hs.do(t, mergeBody)
	wantProblem(t, err, 404, "No such client.")

	for body, detail := range map[string]string{
		`{"op":"merge","clientId":"` + clientID + `","keepVersion":1,"otherVersion":1}`:                                                "otherClientId must be a uuid.",
		`{"op":"merge","clientId":"` + clientID + `","otherClientId":"` + otherID + `","otherVersion":1}`:                              "keepVersion must be a positive integer.",
		`{"op":"merge","clientId":"` + clientID + `","otherClientId":"` + otherID + `","keepVersion":1}`:                               "otherVersion must be a positive integer.",
		`{"op":"merge","clientId":"` + clientID + `","otherClientId":"` + otherID + `","keepVersion":1,"otherVersion":1,"choices":[]}`: "choices must be an object.",
	} {
		hs := newHarness(time.Minute)
		_, err := hs.do(t, body)
		wantProblem(t, err, 400, detail)
		if len(hs.f.calls) != 0 {
			t.Errorf("validation comes before the preview: %q", hs.f.calls)
		}
	}
}

// ---- flag ----

func TestFlag(t *testing.T) {
	hs := newHarness(0)
	_, err := hs.do(t, `{"op":"flag","clientId":"`+clientID+`","authEventId":"x"}`)
	wantProblem(t, err, 400, "authEventId must be a uuid.")
	for answer, want := range map[string]string{`"changed"`: `{"outcome":"changed"}`, `"noop"`: `{"outcome":"noop"}`, `null`: `{"outcome":null}`} {
		hs := newHarness(0)
		hs.f.rpc["account_admin_set_flag"] = func(a js.Ordered) (string, error) {
			if arg(a, "p_flag") != false {
				t.Error("unflag sends p_flag false")
			}
			return answer, nil
		}
		got, err := hs.do(t, `{"op":"unflag","clientId":"`+clientID+`","authEventId":"`+otherID+`"}`)
		if err != nil || got != want {
			t.Errorf("%s: %s %v", answer, got, err)
		}
	}
	hs = newHarness(0)
	hs.f.rpc["account_admin_set_flag"] = func(js.Ordered) (string, error) { return `"not_found"`, nil }
	_, err = hs.do(t, `{"op":"flag","clientId":"`+clientID+`","authEventId":"`+otherID+`"}`)
	wantProblem(t, err, 404, "No such sign-in.")
	hs = newHarness(0)
	hs.f.rpc["account_admin_sign_out_everywhere"] = func(js.Ordered) (string, error) { return `null`, nil }
	_, err = hs.do(t, `{"op":"sign_out_everywhere","clientId":"`+clientID+`"}`)
	wantProblem(t, err, 404, "No such client, or they haven't signed in yet.")
}

// Func refuses anything but POST before it looks at the caller.
func TestFuncUsePost(t *testing.T) {
	r, _ := http.NewRequest(http.MethodGet, "/functions/v1/account-admin", nil)
	_, err := Func(&edge.Deps{}, r)
	wantProblem(t, err, 400, "Use POST.")
}
