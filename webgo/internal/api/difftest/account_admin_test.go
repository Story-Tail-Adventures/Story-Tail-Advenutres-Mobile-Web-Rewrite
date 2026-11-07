//go:build difftest && difftest_account

package difftest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/accountadmin"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["account-admin"] = api.Port{Gate: api.GateUser, Fn: accountadmin.Func}
}

// account-admin (§3.9 Login Support). Every fixture is fresh per case and per world; the seed
// advisor's client is only ever read (every op answers 404 before writing anything for it).
// Locks and bans land only on sign-ins this test made, and those users are deleted at cleanup.
//
// The Deno side sends real email to the stack's Mailpit (inbucket:1025), the Go side to the
// same Mailpit through the forwarder on 127.0.0.1:57425. Each case's Snap reads the mail sent
// to its own fixture addresses, compares it, and deletes it.
//
// Not reachable here, so pinned by the unit tests in package accountadmin instead: a stale
// second factor (the world's advisor verified theirs seconds ago), a Google-only sign-in (no
// way to give an auth user a social identity through the Admin API), an SMTP refusal
// (Mailpit takes everything), "Email isn't set up yet" (the Deno env is fixed), and an
// invite that binds a new sign-in (handle_new_user refuses an inactive advisor, and making a
// fixture advisor active would break every concurrent sign-up).

const acctSeedClient = "0195a2c0-1a00-7000-8000-000000000100" // the seed advisor's: read only

func acctMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func acctJSON(kv ...any) string {
	b, err := js.Marshal(js.O(kv...))
	if err != nil {
		panic(err)
	}
	return string(b)
}

// acctDropClient removes a fixture client and what hangs off it, best effort (a client that
// still has a sign-in keeps its row, as the harness's own travelers do).
func acctDropClient(id string) {
	ctx := context.Background()
	_ = S.DB.From("client").Eq("merged_into_client_id", id).Update(ctx, js.O("merged_into_client_id", nil), nil)
	_ = S.DB.From("client").Eq("id", id).Update(ctx, js.O("merged_into_client_id", nil), nil)
	_ = S.DB.From("companion").Eq("client_id", id).Delete(ctx, nil)
	_ = S.DB.From("travel_preference").Eq("client_id", id).Delete(ctx, nil)
	_ = S.DB.From("client").Eq("id", id).Delete(ctx, nil)
}

// acctClient makes a client of w's advisor with no sign-in, kept in w.Vars[key] (and its
// email in w.Vars[key+".email"]). cols override or add columns.
func acctClient(t *testing.T, w *World, key string, cols ...any) string {
	t.Helper()
	id, tag := uuid.New(), Unique()
	addr := "difftest-acct-" + tag + "@example.com"
	row := js.O("id", id, "agent_id", w.Agent.AgentID, "first_name", "Fix", "last_name", "Ture", "email", addr)
	for i := 0; i+1 < len(cols); i += 2 {
		row = row.Set(cols[i].(string), cols[i+1])
		if e, ok := cols[i+1].(string); ok && cols[i] == "email" {
			addr = e
		}
	}
	acctMust(t, S.DB.From("client").Insert(context.Background(), row, nil))
	w.ID(key, id)
	w.ID(key+".tag", tag)
	w.Vars[key] = id
	w.Vars[key+".email"] = addr
	t.Cleanup(func() { acctDropClient(id) })
	return id
}

// acctLabel labels a sign-in made by the harness or by acctSignUp.
func acctLabel(w *World, key, tag string, a *Actor) {
	w.ID(key+".tag", tag)
	w.ID(key, a.ClientID)
	w.ID(key+".user", a.UserID)
	w.ID(key+".pu", a.PlatformUserID)
	w.ID(key+".email", a.Email)
	w.Vars[key] = a.ClientID
	w.Vars[key+".user"] = a.UserID
	w.Vars[key+".email"] = a.Email
}

// acctSignedIn is a confirmed email-and-password sign-in, its client moved to w's advisor,
// signed in once (one session, one login_success auth_event).
func acctSignedIn(t *testing.T, w *World, key string) *Actor {
	t.Helper()
	var clientID string
	t.Cleanup(func() { // runs after the user is deleted
		if clientID != "" {
			acctDropClient(clientID)
		}
	})
	tag := Unique()
	a := S.NewTraveler(t, tag, w.Agent)
	clientID = a.ClientID
	acctLabel(w, key, tag, a)
	return a
}

// acctSignUp is an auth user made through the Admin API: unconfirmed unless confirm, with a
// password unless password is "". handle_new_user() gives it a client of the seed advisor (the
// one active advisor), which is then moved to w's advisor.
func acctSignUp(t *testing.T, w *World, key string, confirm bool, password string) *Actor {
	t.Helper()
	tag := Unique()
	addr := "difftest-acct-" + tag + "@example.com"
	body := map[string]any{"email": addr, "email_confirm": confirm,
		"user_metadata": map[string]any{"first_name": "Una", "last_name": "Verified " + tag}}
	if password != "" {
		body["password"] = password
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", S.URL+"/auth/v1/admin/users", bytes.NewReader(b))
	req.Header.Set("apikey", S.Service)
	req.Header.Set("Authorization", "Bearer "+S.Service)
	req.Header.Set("Content-Type", "application/json")
	resp, err := S.hc.Do(req)
	acctMust(t, err)
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var u struct {
		ID string `json:"id"`
	}
	if resp.StatusCode >= 300 || json.Unmarshal(raw, &u) != nil {
		t.Fatalf("create user = %d %s", resp.StatusCode, raw)
	}
	return acctAdopt(t, w, key, tag, addr, u.ID)
}

// acctInvited is a sign-in made by an invite nobody accepted yet (generate_link, so no mail).
func acctInvited(t *testing.T, w *World, key string) *Actor {
	t.Helper()
	tag := Unique()
	addr := "difftest-acct-" + tag + "@example.com"
	link, err := S.DB.GenerateLink(context.Background(), service.GenerateLinkParams{Type: "invite", Email: addr})
	acctMust(t, err)
	return acctAdopt(t, w, key, tag, addr, link.User.ID)
}

func acctAdopt(t *testing.T, w *World, key, tag, addr, userID string) *Actor {
	t.Helper()
	a := &Actor{Email: addr, UserID: userID}
	t.Cleanup(func() {
		if a.ClientID != "" {
			acctDropClient(a.ClientID)
		}
	})
	t.Cleanup(func() { S.deleteUser(userID) }) // first
	var pu []struct {
		ID       string  `json:"id"`
		ClientID *string `json:"client_id"`
	}
	acctMust(t, S.DB.From("platform_user").Select("id, client_id").Eq("account_id", userID).Rows(context.Background(), &pu))
	if len(pu) != 1 || pu[0].ClientID == nil {
		t.Fatalf("platform_user for %s: %v", userID, pu)
	}
	a.PlatformUserID, a.ClientID = pu[0].ID, *pu[0].ClientID
	acctMust(t, S.DB.From("client").Eq("id", a.ClientID).Update(context.Background(), js.O("agent_id", w.Agent.AgentID), nil))
	acctLabel(w, key, tag, a)
	return a
}

// acctLock sets the row half of a lock on a fixture sign-in, and the ban when ban is true.
func acctLock(t *testing.T, w *World, key string, row, ban bool) {
	t.Helper()
	ctx := context.Background()
	if row {
		acctMust(t, S.DB.From("account").Eq("id", w.Vars[key+".user"]).Update(ctx,
			js.O("locked_at", "2026-11-01T10:00:00Z", "locked_reason", "fixture lock"), nil))
	}
	if ban {
		_, err := S.DB.UpdateUserByID(ctx, w.Vars[key+".user"], js.O("ban_duration", "876000h"))
		acctMust(t, err)
	}
}

// acctLoginEvent is the login_success auth_event the fixture's one sign-in recorded.
func acctLoginEvent(t *testing.T, w *World, key string) string {
	t.Helper()
	var rows []struct {
		ID string `json:"id"`
	}
	acctMust(t, S.DB.From("auth_event").Select("id").Eq("account_id", w.Vars[key+".user"]).
		Eq("event_type", "login_success").Order("created_at", false).Limit(1).Rows(context.Background(), &rows))
	if len(rows) != 1 {
		t.Fatalf("no login_success for %s", key)
	}
	w.ID(key+".event", rows[0].ID)
	w.Vars[key+".event"] = rows[0].ID
	t.Cleanup(func() {
		_ = S.DB.From("auth_event_flag").Eq("auth_event_id", rows[0].ID).Delete(context.Background(), nil)
	})
	return rows[0].ID
}

// acctCap writes three sign-in-email claims for the client in the last hour, as system rows
// (no actor), so the claim is capped.
func acctCap(t *testing.T, clientID string) {
	t.Helper()
	rows := make([]js.Ordered, 3)
	for i := range rows {
		rows[i] = js.O("id", uuid.New(), "actor_user_id", nil, "actor_role", nil,
			"event_type", "client.signin_email_requested", "target_entity", "client", "target_id", clientID,
			"metadata", js.O("kind", "reset"))
	}
	acctMust(t, S.DB.From("audit_event").Insert(context.Background(), rows, nil))
}

// ---- reading state back ----

// acctAuth is the GoTrue and account halves of a sign-in.
func acctAuth(t *testing.T, w *World, key string) string {
	t.Helper()
	u, err := S.DB.GetUserByID(context.Background(), w.Vars[key+".user"])
	acctMust(t, err)
	b, _ := json.Marshal(map[string]any{"confirmed": u.EmailConfirmedAt, "bannedUntil": u.BannedUntil})
	acct := S.Rows(t, S.DB.From("account").Select("locked_at,locked_reason").Eq("id", w.Vars[key+".user"]))
	return key + ":auth" + string(b) + "account" + acct
}

const acctClientCols = "id,first_name,last_name,email,phone,status,merged_into_client_id,version,archived_at"

func acctClients(t *testing.T, w *World, keys ...string) string {
	t.Helper()
	ids := make([]string, len(keys))
	for i, k := range keys {
		ids[i] = w.Vars[k]
	}
	return "clients" + S.Rows(t, S.DB.From("client").Select(acctClientCols).In("id", ids).Order("created_at", true).Order("id", true))
}

func acctSignIns(t *testing.T, w *World, keys ...string) string {
	t.Helper()
	out := "signIns"
	for _, k := range keys { // one by one: the ids sort differently in each world
		out += S.Rows(t, S.DB.From("platform_user").Select("account_id,client_id,display_name").Eq("account_id", w.Vars[k+".user"]))
	}
	return out
}

// ---- Mailpit ----

const acctMailpit = "http://127.0.0.1:57424/api/v1"

type acctAddr struct {
	Name    string `json:"Name"`
	Address string `json:"Address"`
}

type acctMessage struct {
	ID        string     `json:"ID"`
	MessageID string     `json:"MessageID"`
	From      acctAddr   `json:"From"`
	To        []acctAddr `json:"To"`
	ReplyTo   []acctAddr `json:"ReplyTo"`
	Subject   string     `json:"Subject"`
	Text      string     `json:"Text"`
	HTML      string     `json:"HTML"`
}

var acctTokenHash = regexp.MustCompile(`token_hash=[0-9a-f]+`)

func acctGet(t *testing.T, u string, out any) {
	t.Helper()
	resp, err := S.hc.Get(u)
	acctMust(t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("mailpit %s = %d %s", u, resp.StatusCode, raw)
	}
	acctMust(t, json.Unmarshal(raw, out))
}

// acctMail is every message Mailpit holds for the fixture address w.Vars[key+".email"], read
// field by field (the token hash in the link replaced), then deleted. want is how many the
// case expects, so a send has time to land.
func acctMail(t *testing.T, w *World, key string, want int) string {
	t.Helper()
	addr := w.Vars[key+".email"]
	var ids []string
	deadline := time.Now().Add(3 * time.Second)
	for {
		var list struct {
			Messages []struct {
				ID string `json:"ID"`
				To []acctAddr
			} `json:"messages"`
		}
		acctGet(t, acctMailpit+"/search?query="+url.QueryEscape(`to:"`+addr+`"`), &list)
		ids = ids[:0]
		for _, m := range list.Messages {
			for _, to := range m.To {
				if strings.EqualFold(to.Address, addr) {
					ids = append(ids, m.ID)
				}
			}
		}
		if len(ids) >= want || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	lines := make([]string, 0, len(ids))
	for _, id := range ids {
		var m acctMessage
		acctGet(t, acctMailpit+"/message/"+id, &m)
		var h map[string][]string
		acctGet(t, acctMailpit+"/message/"+id+"/headers", &h)
		clean := func(s string) string {
			return acctTokenHash.ReplaceAllString(strings.ReplaceAll(s, "\r\n", "\n"), "token_hash=<hash>")
		}
		lines = append(lines, fmt.Sprintf("{to:%v from:%v replyTo:%v subject:%q messageId:%s autoSubmitted:%v\ntext:%q\nhtml:%q}",
			m.To, m.From, m.ReplyTo, m.Subject, m.MessageID, h["Auto-Submitted"], clean(m.Text), clean(m.HTML)))
	}
	if len(ids) > 0 {
		b, _ := json.Marshal(map[string]any{"IDs": ids})
		req, _ := http.NewRequest(http.MethodDelete, acctMailpit+"/messages", bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if resp, err := S.hc.Do(req); err == nil {
			resp.Body.Close()
		}
	}
	sort.Strings(lines)
	out := "mail" + fmt.Sprint(len(lines)) + "[" + strings.Join(lines, ",") + "]"
	if os.Getenv("STA_DIFF_ACCT_SHOW") != "" {
		t.Logf("%s mail: %s", w.Name, w.Normalize(out))
	}
	return out
}

// ---- the cases ----

func TestAccountAdmin(t *testing.T) {
	deno, goW := NewWorlds(t)
	Run(t, deno, goW, acctCases(deno, goW))
}

// acctCases are the cases, for the two worlds.
func acctCases(deno, goW *World) []Case {
	other := func(w *World) *World {
		if w == deno {
			return goW
		}
		return deno
	}
	const fn = "account-admin"
	body := func(f func(w *World) string) func(*World) string { return f }
	fixed := func(s string) func(*World) string { return func(*World) string { return s } }
	op := func(o, key string, kv ...any) func(*World) string {
		return func(w *World) string {
			id := w.Vars[key]
			switch key {
			case "traveler":
				id = w.Traveler.ClientID
			case "seed":
				id = acctSeedClient
			case "other":
				id = other(w).Traveler.ClientID
			case "random":
				id = "0195a2c0-1a00-7000-8000-00000000dead"
			}
			return acctJSON(append([]any{"op", o, "clientId", id}, kv...)...)
		}
	}
	const longNote = "Called her on the phone number we have had on file since 2025"
	nul := "\"a\\u0000b\"" // a NUL inside the JSON string: PostgREST cannot store it as text

	cases := []Case{
		// ── the preamble ──
		{Name: "GET", Method: "GET", Body: fixed(`{}`), Expect: 400},
		{Name: "no token", Token: func(*World) string { return "" }, Body: fixed(`{}`), Expect: 401},
		{Name: "the anon key", Token: func(*World) string { return S.Anon }, Body: fixed(`{}`), Expect: 401},
		{Name: "a traveler", Token: func(w *World) string { return w.Traveler.Token }, Body: op("reset", "traveler"), Expect: 403},
		{Name: "an advisor at aal1", Setup: func(t *testing.T, w *World) { w.Vars["aal1"] = S.signIn(t, w.Agent.Email) },
			Token: func(w *World) string { return w.Vars["aal1"] }, Body: op("reset", "traveler"), Expect: 403},
		{Name: "not JSON", Body: fixed(`{"op":`), Expect: 400},
		{Name: "an array", Body: fixed(`[1]`), Expect: 400},
		{Name: "no op", Body: fixed(`{"clientId":"` + acctSeedClient + `"}`), Expect: 400},
		{Name: "an unknown op", Body: fixed(`{"op":"delete","clientId":"` + acctSeedClient + `"}`), Expect: 400},
		{Name: "the op is checked first", Body: fixed(`{"op":5,"clientId":"x"}`), Expect: 400},
		{Name: "no client", Body: fixed(`{"op":"reset"}`), Expect: 400},
		{Name: "not a client id", Body: fixed(`{"op":"lock","clientId":"banana","reason":"x"}`), Expect: 400},

		// ── reset and magic link ──
		{Name: "reset: sent", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: op("reset", "s"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 1) + acctAuth(t, w, "s") }},
		{Name: "magic_link: sent", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: op("magic_link", "s"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 1) }},
		{Name: "reset: no sign-in", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c") },
			Body: op("reset", "c"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "c", 0) }},
		{Name: "magic_link: locked", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", true, true) },
			Body: op("magic_link", "s"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 0) }},
		{Name: "reset: banned with no row", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", false, true) },
			Body: op("reset", "s"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 0) }},
		{Name: "reset: an email sign-in with no password", Setup: func(t *testing.T, w *World) { acctInvited(t, w, "s") },
			Body: op("reset", "s"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 1) }},
		{Name: "reset: capped", Setup: func(t *testing.T, w *World) { acctCap(t, acctSignedIn(t, w, "s").ClientID) },
			Body: op("reset", "s"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "s", 0) }},
		{Name: "reset: no such client", Body: op("reset", "random"), Expect: 404},
		{Name: "reset: another advisor's client", Body: op("reset", "other"), Expect: 404},
		{Name: "magic_link: the seed advisor's client", Body: op("magic_link", "seed"), Expect: 404},

		// ── invite ──
		{Name: "invite: already signed in", Body: op("invite", "traveler"), Expect: 200},
		{Name: "invite: archived", Setup: func(t *testing.T, w *World) {
			acctClient(t, w, "c", "status", "archived", "archived_at", "2026-11-01T10:00:00Z")
		}, Body: op("invite", "c"), Expect: 200},
		{Name: "invite: a duplicate record", Setup: func(t *testing.T, w *World) {
			acctClient(t, w, "c")
			acctClient(t, w, "dup", "email", w.Vars["c.email"])
		}, Body: op("invite", "c"), Expect: 200},
		{Name: "invite: no email", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c", "email", nil) },
			Body: op("invite", "c"), Expect: 200},
		// handle_new_user refuses the fixture advisor (inactive), so GoTrue cannot make the link.
		{Name: "invite: the link fails", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c") },
			Body: op("invite", "c"), Expect: 200, Snap: func(t *testing.T, w *World) string { return acctMail(t, w, "c", 0) }},
		{Name: "invite: resent to a pending invite", Setup: func(t *testing.T, w *World) { acctInvited(t, w, "s") },
			Body: op("invite", "s"), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return acctMail(t, w, "s", 1) + acctAuth(t, w, "s") + acctSignIns(t, w, "s")
			}},
		// Someone signed up first with the client's address and their own password: the
		// pre-hijack guard refuses to bind it, and nothing is sent.
		{Name: "invite: someone else's sign-up", Setup: func(t *testing.T, w *World) {
			a := acctSignUp(t, w, "squatter", false, Password)
			acctMust(t, S.DB.From("client").Eq("id", a.ClientID).Update(context.Background(),
				js.O("email", "difftest-acct-moved-"+w.Tag+"@example.com"), nil))
			acctClient(t, w, "c", "email", a.Email)
		}, Body: op("invite", "c"), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return acctMail(t, w, "c", 0) + acctSignIns(t, w, "squatter") + acctAuth(t, w, "squatter")
			}},
		{Name: "invite: capped", Setup: func(t *testing.T, w *World) { acctCap(t, acctClient(t, w, "c")) },
			Body: op("invite", "c"), Expect: 200},

		// ── verify email ──
		{Name: "verify: no note", Body: op("verify_email", "traveler"), Expect: 400},
		{Name: "verify: a short note", Body: op("verify_email", "traveler", "note", "   I called them    "), Expect: 400},
		{Name: "verify: a long note", Body: op("verify_email", "traveler", "note", strings.Repeat("n", 501)), Expect: 400},
		{Name: "verify: no such client", Body: op("verify_email", "random", "note", longNote), Expect: 404},
		{Name: "verify: another advisor's client", Body: op("verify_email", "other", "note", longNote), Expect: 404},
		{Name: "verify: no sign-in", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c") },
			Body: op("verify_email", "c", "note", longNote), Expect: 200},
		{Name: "verify: already verified", Body: op("verify_email", "traveler", "note", longNote), Expect: 200},
		{Name: "verify: the record's address differs", Setup: func(t *testing.T, w *World) {
			a := acctSignUp(t, w, "s", false, Password)
			acctMust(t, S.DB.From("client").Eq("id", a.ClientID).Update(context.Background(),
				js.O("email", "difftest-acct-edited-"+w.Tag+"@example.com"), nil))
		}, Body: op("verify_email", "s", "note", longNote), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "verify: a duplicate in the book", Setup: func(t *testing.T, w *World) {
			acctSignUp(t, w, "s", false, Password)
			acctClient(t, w, "dup", "email", strings.ToUpper(w.Vars["s.email"]))
		}, Body: op("verify_email", "s", "note", longNote), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "verify: changed", Setup: func(t *testing.T, w *World) { acctSignUp(t, w, "s", false, Password) },
			Body: op("verify_email", "s", "note", "  "+longNote+"  "), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") + acctSignIns(t, w, "s") }},

		// ── lock and unlock ──
		{Name: "lock: no reason", Body: op("lock", "traveler"), Expect: 400},
		{Name: "lock: a blank reason", Body: op("lock", "traveler", "reason", " \t "), Expect: 400},
		{Name: "lock: a long reason", Body: op("lock", "traveler", "reason", strings.Repeat("r", 501)), Expect: 400},
		{Name: "lock: no such client", Body: op("lock", "random", "reason", "x"), Expect: 404},
		{Name: "lock: another advisor's client", Body: op("lock", "other", "reason", "x"), Expect: 404},
		{Name: "unlock: the seed advisor's client", Body: op("unlock", "seed", "reason", "x"), Expect: 404},
		{Name: "lock: no sign-in", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c") },
			Body: op("lock", "c", "reason", "x"), Expect: 200},
		{Name: "lock: changed", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: op("lock", "s", "reason", "  Lost their phone  "), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "lock: already locked", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", true, true) },
			Body: op("lock", "s", "reason", "again"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "unlock: not locked", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: op("unlock", "s", "reason", "fine"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "unlock: changed", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", true, true) },
			Body: op("unlock", "s", "reason", "Found the phone"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "unlock: a ban with no row", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", false, true) },
			Body: op("unlock", "s", "reason", "Half a lock"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		// The row half fails after the ban: the ban is lifted again and the answer is a 500.
		{Name: "lock: the row fails", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: body(func(w *World) string {
				return `{"op":"lock","clientId":"` + w.Vars["s"] + `","reason":` + nul + `}`
			}), Expect: 500,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "unlock: the row fails", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLock(t, w, "s", true, true) },
			Body: body(func(w *World) string {
				return `{"op":"unlock","clientId":"` + w.Vars["s"] + `","reason":` + nul + `}`
			}), Expect: 500,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},

		// ── sign out everywhere ──
		{Name: "sign out: changed", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s") },
			Body: op("sign_out_everywhere", "s"), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "s") }},
		{Name: "sign out: no sign-in", Setup: func(t *testing.T, w *World) { acctClient(t, w, "c") },
			Body: op("sign_out_everywhere", "c"), Expect: 404},
		{Name: "sign out: the seed advisor's client", Body: op("sign_out_everywhere", "seed"), Expect: 404},

		// ── flag and unflag ──
		{Name: "flag: not a uuid", Body: op("flag", "traveler", "authEventId", "x"), Expect: 400},
		{Name: "flag: no event", Body: op("flag", "traveler"), Expect: 400},
		{Name: "flag: no such sign-in", Body: op("flag", "traveler", "authEventId", "0195a2c0-1a00-7000-8000-00000000beef"), Expect: 404},
		{Name: "flag: changed", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLoginEvent(t, w, "s") },
			Body: body(func(w *World) string { return op("flag", "s", "authEventId", w.Vars["s.event"])(w) }), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return S.Rows(t, S.DB.From("auth_event_flag").Select("auth_event_id,flagged_by_agent_id").Eq("auth_event_id", w.Vars["s.event"]))
			}},
		{Name: "flag: already flagged", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "s")
			acctMust(t, S.DB.From("auth_event_flag").Insert(context.Background(),
				js.O("auth_event_id", acctLoginEvent(t, w, "s"), "flagged_by_agent_id", w.Agent.AgentID), nil))
		}, Body: body(func(w *World) string { return op("flag", "s", "authEventId", w.Vars["s.event"])(w) }), Expect: 200},
		{Name: "unflag: changed", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "s")
			acctMust(t, S.DB.From("auth_event_flag").Insert(context.Background(),
				js.O("auth_event_id", acctLoginEvent(t, w, "s"), "flagged_by_agent_id", w.Agent.AgentID), nil))
		}, Body: body(func(w *World) string { return op("unflag", "s", "authEventId", w.Vars["s.event"])(w) }), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return S.Rows(t, S.DB.From("auth_event_flag").Select("auth_event_id").Eq("auth_event_id", w.Vars["s.event"]))
			}},
		{Name: "unflag: not flagged", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLoginEvent(t, w, "s") },
			Body: body(func(w *World) string { return op("unflag", "s", "authEventId", w.Vars["s.event"])(w) }), Expect: 200},
		// Another client's sign-in, even this advisor's own, is not this client's.
		{Name: "flag: another client's sign-in", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "s")
			acctLoginEvent(t, w, "s")
			acctClient(t, w, "c")
		}, Body: body(func(w *World) string { return op("flag", "c", "authEventId", w.Vars["s.event"])(w) }), Expect: 404},
		{Name: "flag: another advisor's client", Setup: func(t *testing.T, w *World) { acctSignedIn(t, w, "s"); acctLoginEvent(t, w, "s") },
			Body: body(func(w *World) string { return op("flag", "other", "authEventId", w.Vars["s.event"])(w) }), Expect: 404},
	}

	// ── merge ──
	two := func(keepCols, retireCols []any) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			acctClient(t, w, "keep", keepCols...)
			acctClient(t, w, "retire", retireCols...)
		}
	}
	merge := func(kv ...any) func(*World) string {
		return func(w *World) string {
			return acctJSON(append([]any{"op", "merge", "clientId", w.Vars["keep"], "otherClientId", w.Vars["retire"],
				"keepVersion", 1, "otherVersion", 1}, kv...)...)
		}
	}
	mergeRaw := func(tail string) func(*World) string {
		return func(w *World) string {
			return `{"op":"merge","clientId":"` + w.Vars["keep"] + `","otherClientId":"` + w.Vars["retire"] + `"` + tail + `}`
		}
	}
	clients := func(t *testing.T, w *World) string { return acctClients(t, w, "keep", "retire") }
	cases = append(cases, []Case{
		{Name: "merge: no other client", Setup: two(nil, nil), Body: body(func(w *World) string {
			return acctJSON("op", "merge", "clientId", w.Vars["keep"], "keepVersion", 1, "otherVersion", 1)
		}), Expect: 400},
		{Name: "merge: other is not a uuid", Setup: two(nil, nil), Body: body(func(w *World) string {
			return acctJSON("op", "merge", "clientId", w.Vars["keep"], "otherClientId", 7, "keepVersion", 1, "otherVersion", 1)
		}), Expect: 400},
		{Name: "merge: keepVersion as text", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":"1","otherVersion":1`), Expect: 400},
		{Name: "merge: keepVersion a fraction", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1.5,"otherVersion":1`), Expect: 400},
		{Name: "merge: no otherVersion", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1`), Expect: 400},
		{Name: "merge: otherVersion zero", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1,"otherVersion":0`), Expect: 400},
		{Name: "merge: choices an array", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1,"otherVersion":1,"choices":[]`), Expect: 400},
		{Name: "merge: choices null", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1,"otherVersion":1,"choices":null`), Expect: 400},
		{Name: "merge: a choice with capitals", Setup: two(nil, nil), Body: merge("choices", js.O("Email", "keep")), Expect: 400},
		{Name: "merge: a choice of both", Setup: two(nil, nil), Body: merge("choices", js.O("email", "both")), Expect: 400},
		{Name: "merge: the same record", Setup: two(nil, nil), Body: body(func(w *World) string {
			return acctJSON("op", "merge", "clientId", w.Vars["keep"], "otherClientId", w.Vars["keep"], "keepVersion", 1, "otherVersion", 1)
		}), Expect: 404},
		{Name: "merge: another advisor's record", Setup: two(nil, nil), Body: body(func(w *World) string {
			return acctJSON("op", "merge", "clientId", w.Vars["keep"], "otherClientId", other(w).Traveler.ClientID, "keepVersion", 1, "otherVersion", 1)
		}), Expect: 404},
		{Name: "merge: into the seed advisor's record", Setup: two(nil, nil), Body: body(func(w *World) string {
			return acctJSON("op", "merge", "clientId", acctSeedClient, "otherClientId", w.Vars["retire"], "keepVersion", 1, "otherVersion", 1)
		}), Expect: 404},
		{Name: "merge: keeping an archived record", Setup: two([]any{"status", "archived", "archived_at", "2026-11-01T10:00:00Z"}, nil),
			Body: merge(), Expect: 200, Snap: clients},
		{Name: "merge: too many companions", Setup: func(t *testing.T, w *World) {
			two(nil, nil)(t, w)
			for i := 0; i < 13; i++ {
				owner := w.Vars["keep"]
				if i%2 == 1 {
					owner = w.Vars["retire"]
				}
				acctMust(t, S.DB.From("companion").Insert(context.Background(),
					js.O("id", uuid.New(), "client_id", owner, "first_name", "Com", "last_name", fmt.Sprint("Panion ", i)), nil))
			}
		}, Body: merge(), Expect: 200, Snap: clients},
		{Name: "merge: stale", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":2,"otherVersion":1`), Expect: 200, Snap: clients},
		{Name: "merge: neither signs in", Setup: two([]any{"phone", nil}, []any{"phone", "+1 555 0100", "preferred_name", "Fixy"}),
			Body: merge("choices", js.O("preferred_name", "keep")), Expect: 200, Snap: clients},
		// "__proto__" passes the shape check and is then dropped by the object it is assigned to.
		{Name: "merge: a __proto__ choice", Setup: two(nil, nil), Body: mergeRaw(`,"keepVersion":1,"otherVersion":1,"choices":{"__proto__":"retire"}`),
			Expect: 200, Snap: clients},
		{Name: "merge: a field the merge does not offer", Setup: two(nil, nil), Body: merge("choices", js.O("bogus_field", "keep")),
			Expect: 400, Snap: clients},
		{Name: "merge: no name to keep", Setup: two([]any{"first_name", ""}, []any{"first_name", " "}),
			Body: merge(), Expect: 200, Snap: clients},
		{Name: "merge: the retired record signs in", Setup: func(t *testing.T, w *World) {
			acctClient(t, w, "keep")
			acctSignedIn(t, w, "retire")
		}, Body: merge(), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return clients(t, w) + acctSignIns(t, w, "retire") + acctAuth(t, w, "retire")
			}},
		{Name: "merge: both sign in", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "keep")
			acctSignedIn(t, w, "retire")
		}, Body: merge(), Expect: 200,
			Snap: func(t *testing.T, w *World) string {
				return clients(t, w) + acctSignIns(t, w, "keep", "retire") + acctAuth(t, w, "retire") + acctAuth(t, w, "keep")
			}},
		// Both sign in, and the write refuses a choice: the retired sign-in's ban is lifted again.
		{Name: "merge: both sign in, a bad choice", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "keep")
			acctSignedIn(t, w, "retire")
		}, Body: merge("choices", js.O("bogus_field", "retire")), Expect: 400,
			Snap: func(t *testing.T, w *World) string { return clients(t, w) + acctAuth(t, w, "retire") }},
		// ...unless it was locked before: then the ban stays.
		{Name: "merge: both sign in, retired already locked, a bad choice", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "keep")
			acctSignedIn(t, w, "retire")
			acctLock(t, w, "retire", true, false)
		}, Body: merge("choices", js.O("bogus_field", "retire")), Expect: 400,
			Snap: func(t *testing.T, w *World) string { return clients(t, w) + acctAuth(t, w, "retire") }},
		// Both sign in, a stale version: refused before anyone is banned.
		{Name: "merge: both sign in, stale", Setup: func(t *testing.T, w *World) {
			acctSignedIn(t, w, "keep")
			acctSignedIn(t, w, "retire")
		}, Body: mergeRaw(`,"keepVersion":1,"otherVersion":3`), Expect: 200,
			Snap: func(t *testing.T, w *World) string { return acctAuth(t, w, "retire") }},
	}...)

	for i := range cases {
		cases[i].Fn = fn
	}
	return cases
}
