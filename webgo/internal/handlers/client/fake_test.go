package client_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/config"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/server"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The traveler area's harness: the whole server over a fake Supabase, with the tables these
// screens read. Same shape as the auth and onboarding areas'.

const (
	jordan   = "jordan.hayes@example.com"
	jordanPW = "GreenPastures1"
)

// tokenAt mints a token at a given assurance level. A traveler who has verified a second factor
// this session is at aal2, and the gate sends anyone else with a factor to the challenge —
// so a 2.5.7 test that wants the "On" state has to sign in at aal2 to reach the page.
func tokenAt(sub, aal string) string {
	b, _ := json.Marshal(map[string]any{"sub": sub, "aal": aal, "exp": time.Now().Add(time.Hour).Unix()})
	return "h." + base64.RawURLEncoding.EncodeToString(b) + ".s"
}

type call struct {
	Method, Path string
	Query        url.Values
	Body         map[string]any
}

type fake struct {
	mu     sync.Mutex
	calls  []call
	tables map[string][]map[string]any
	// failing tables answer 500, so a test can tell an error from an empty result.
	failing map[string]bool
	// role and the wizard's state, for the shell's gate.
	role, step, completedAt string
	// factor is the status of the one enrolled MFA factor, or "" for none; aal is the
	// assurance the sign-in token claims.
	factor, aal string
	// fn answers one function with a status and a body; anything else answers {"ok":true}.
	fn map[string]struct {
		status int
		body   any
	}
	// base is the fake's own URL, which is also the Supabase URL the server is configured
	// with — so a storage redirect can be checked against it.
	base string
}

func newFake() *fake {
	return &fake{
		tables: map[string][]map[string]any{}, failing: map[string]bool{}, role: "client",
		aal: "aal1",
		fn: map[string]struct {
			status int
			body   any
		}{},
	}
}

// fnReply makes one function answer with this status and body.
func (f *fake) fnReply(name string, status int, body any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.fn[name] = struct {
		status int
		body   any
	}{status, body}
}

func (f *fake) rows(table string, rows ...map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tables[table] = rows
}

func (f *fake) failTable(table string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failing[table] = true
}

func (f *fake) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	var body map[string]any
	_ = json.Unmarshal(raw, &body)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, call{r.Method, r.URL.Path, r.URL.Query(), body})
	w.Header().Set("Content-Type", "application/json")
	send := func(status int, v any) {
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}
	bearer := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")

	switch {
	case r.URL.Path == "/auth/v1/user":
		if !strings.HasPrefix(bearer, "h.") {
			send(401, map[string]any{"code": "bad_jwt"})
			return
		}
		user := map[string]any{"id": "u-jordan", "email": jordan}
		if f.factor != "" {
			// GoTrue lists factors on the USER, which is where session.State.HasFactor
			// comes from. An "unverified" one is an enrolment somebody abandoned.
			user["factors"] = []any{map[string]any{
				"id": "fa-1", "factor_type": "totp", "status": f.factor}}
		}
		send(200, user)
		return
	case r.URL.Path == "/auth/v1/token":
		if body["password"] != jordanPW {
			send(400, map[string]any{"code": "invalid_credentials"})
			return
		}
		send(200, map[string]any{"access_token": tokenAt("u-jordan", f.aal), "refresh_token": "rt1",
			"expires_at": time.Now().Add(time.Hour).Unix()})
		return
	case r.URL.Path == "/auth/v1/logout":
		w.WriteHeader(204)
		return
	case r.URL.Path == "/rest/v1/platform_user":
		row := map[string]any{"role": f.role, "onboarding_step": nil,
			"onboarding_completed_at": "2026-01-01T00:00:00Z", "id": "pu-1", "time_zone": "America/New_York"}
		if f.step != "" {
			row["onboarding_step"] = f.step
			row["onboarding_completed_at"] = nil
		}
		if f.completedAt != "" {
			row["onboarding_completed_at"] = f.completedAt
		}
		send(200, []any{row})
		return
	case strings.HasPrefix(r.URL.Path, "/rest/v1/"):
		table := strings.TrimPrefix(r.URL.Path, "/rest/v1/")
		if f.failing[table] {
			send(500, map[string]any{"message": "boom"})
			return
		}
		rows := matching(f.tables[table], r.URL.Query())
		send(200, rows)
		return
	case strings.HasPrefix(r.URL.Path, "/functions/v1/"):
		if rep, ok := f.fn[strings.TrimPrefix(r.URL.Path, "/functions/v1/")]; ok {
			send(rep.status, rep.body)
			return
		}
		send(200, map[string]any{"ok": true})
		return
	}
	send(404, map[string]any{"code": "not_found"})
}

// matching applies the PostgREST filters these tests depend on: col=eq.value and
// col=neq.value, repeated params included. Without them
// the fake answers every single-row lookup with the whole table, so a MaybeOne over two
// seeded rows fails with "more than one row" — and, worse, a handler that forgot its filter
// would pass. Anything it does not understand (select, order, limit) is left alone.
func matching(rows []map[string]any, q url.Values) []map[string]any {
	out := []map[string]any{}
	for _, row := range rows {
		keep := true
		for key, values := range q {
			switch key {
			case "select", "order", "limit", "offset":
				continue
			}
			got, present := row[key]
			if !present {
				// A column the fixture does not carry is not modelled, so it does not
				// filter. Where it IS carried the filter bites, which is what stops a
				// single-row lookup coming back with the whole table.
				continue
			}
			// EVERY value for the key, not just the first: PostgREST takes repeated params
			// as an AND, which is how a query excludes both paid and waived milestones.
			for _, filter := range values {
				switch {
				case strings.HasPrefix(filter, "eq."):
					if fmt.Sprint(got) != strings.TrimPrefix(filter, "eq.") {
						keep = false
					}
				case strings.HasPrefix(filter, "neq."):
					if fmt.Sprint(got) == strings.TrimPrefix(filter, "neq.") {
						keep = false
					}
				}
			}
		}
		if keep {
			out = append(out, row)
		}
	}
	return out
}

func (f *fake) seen(route string) []call {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []call
	for _, c := range f.calls {
		if c.Method+" "+c.Path == route {
			out = append(out, c)
		}
	}
	return out
}

func (f *fake) one(t *testing.T, route string) call {
	t.Helper()
	calls := f.seen(route)
	if len(calls) != 1 {
		t.Fatalf("%s was called %d times, want once", route, len(calls))
	}
	return calls[0]
}

// wrotePostgREST reports whether anything was written over PostgREST. The traveler's screens
// only ever READ there; every write goes through a function, which is where the audit row
// and the service role live.
func (f *fake) wrotePostgREST() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, c := range f.calls {
		if strings.HasPrefix(c.Path, "/rest/v1/") && c.Method != http.MethodGet {
			return true
		}
	}
	return false
}

type harness struct {
	t *testing.T
	h http.Handler
	f *fake
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	f := newFake()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	f.base = srv.URL
	cfg := config.Config{
		Env: config.Development, Port: "8080", SiteURL: "http://localhost:8080",
		SupabaseURL: srv.URL, SupabaseAnonKey: "anon", InquiryEmail: "gyasi@example.com",
	}
	logs := &bytes.Buffer{}
	h, err := server.New(cfg, pages.FS, assets.FS, slog.New(slog.NewJSONHandler(logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if t.Failed() && strings.Contains(logs.String(), "page did not render") {
			t.Logf("server log:\n%s", logs.String())
		}
	})
	return &harness{t: t, h: h, f: f}
}

type client struct {
	hn      *harness
	cookies map[string]*http.Cookie
}

func (hn *harness) client() *client { return &client{hn: hn, cookies: map[string]*http.Cookie{}} }

func (hn *harness) signedIn() *client {
	hn.t.Helper()
	c := hn.client()
	rec := c.post("/login", url.Values{"email": {jordan}, "password": {jordanPW}, "next": {"/dashboard"}})
	if rec.Code != http.StatusSeeOther || c.cookies["sta-session"] == nil {
		hn.t.Fatalf("sign-in for the test = %d", rec.Code)
	}
	return c
}

func (c *client) do(method, target string, form url.Values) *httptest.ResponseRecorder {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req := httptest.NewRequest(method, target, body)
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Sec-Fetch-Site", "same-origin")
	}
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	rec := httptest.NewRecorder()
	c.hn.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		if ck.MaxAge < 0 {
			delete(c.cookies, ck.Name)
		} else {
			c.cookies[ck.Name] = ck
		}
	}
	return rec
}

func (c *client) get(target string) *httptest.ResponseRecorder { return c.do("GET", target, nil) }
func (c *client) post(target string, form url.Values) *httptest.ResponseRecorder {
	return c.do("POST", target, form)
}

// trip is one row of the trip table, with the columns every traveler screen reads.
func trip(id, title, status, start, end string, valueCents int64) map[string]any {
	return map[string]any{
		"id": id, "title": title, "trip_type": "all_inclusive", "status": status,
		"start_date": start, "end_date": end, "destinations": []string{"Aruba"},
		"traveler_count": 2, "total_value_cents": valueCents, "total_paid_cents": 0,
		"currency": "USD",
	}
}

func esc(s string) string { return html.EscapeString(s) }

func has(t *testing.T, rec *httptest.ResponseRecorder, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("the page does not contain %q (status %d)", want, rec.Code)
		}
	}
}

func hasNot(t *testing.T, rec *httptest.ResponseRecorder, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if strings.Contains(rec.Body.String(), want) {
			t.Errorf("the page contains %q and should not", want)
		}
	}
}

func where(t *testing.T, rec *httptest.ResponseRecorder, status int, location string) {
	t.Helper()
	if rec.Code != status || rec.Header().Get("Location") != location {
		t.Errorf("= %d %q, want %d %q", rec.Code, rec.Header().Get("Location"), status, location)
	}
}
