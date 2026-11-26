package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

type seen struct {
	method, path, query, body string
	header                    http.Header
}

func fake(t *testing.T, status int, reply string, h map[string]string) (*Client, *seen) {
	t.Helper()
	s := &seen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		*s = seen{r.Method, r.URL.Path, r.URL.RawQuery, string(b), r.Header.Clone()}
		for k, v := range h {
			w.Header().Set(k, v)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(reply))
	}))
	t.Cleanup(srv.Close)
	return New(srv.URL, "service-key", nil), s
}

func q(raw string) url.Values { v, _ := url.ParseQuery(raw); return v }

// The filters reach PostgREST in the order and spelling supabase-js used.
func TestQueryMatchesSupabaseJS(t *testing.T) {
	c, s := fake(t, 200, `[]`, nil)
	var rows []struct{ ID string }
	err := c.From("trip").
		Select("id, client_id,\n  account:account_id(locked_at)").
		Eq("client_id", "c-1").Is("archived_at", nil).Neq("status", "cancelled").
		In("status", []string{"lead", "a,b"}).Gte("start_date", "2026-01-01").
		Order("start_date", true).OrderNulls("id", false, true).Limit(5).
		Rows(context.Background(), &rows)
	if err != nil {
		t.Fatal(err)
	}
	if s.method != "GET" || s.path != "/rest/v1/trip" {
		t.Fatalf("%s %s", s.method, s.path)
	}
	got := q(s.query)
	want := map[string]string{
		"select": "id,client_id,account:account_id(locked_at)", "client_id": "eq.c-1", "archived_at": "is.null",
		"status": "neq.cancelled", "start_date": "gte.2026-01-01", "order": "start_date.asc,id.desc.nullsfirst", "limit": "5",
	}
	for k, v := range want {
		if got.Get(k) != v {
			t.Errorf("%s = %q, want %q", k, got.Get(k), v)
		}
	}
	if st := got["status"]; len(st) != 2 || st[1] != `in.(lead,"a,b")` {
		t.Errorf("status filters = %v", st)
	}
	if s.header.Get("apikey") != "service-key" || s.header.Get("Authorization") != "Bearer service-key" {
		t.Errorf("auth headers = %v", s.header)
	}
}

func TestMaybeSingle(t *testing.T) {
	c, _ := fake(t, 200, `[]`, nil)
	var row struct{ ID string }
	if found, err := c.From("t").Select("id").Eq("id", "x").MaybeSingle(context.Background(), &row); found || err != nil {
		t.Errorf("empty = %v %v", found, err)
	}
	c, _ = fake(t, 200, `[{"id":"a"}]`, nil)
	if found, err := c.From("t").MaybeSingle(context.Background(), &row); !found || err != nil || row.ID != "a" {
		t.Errorf("one = %v %v %+v", found, err, row)
	}
	c, _ = fake(t, 200, `[{"id":"a"},{"id":"b"}]`, nil)
	_, err := c.From("t").MaybeSingle(context.Background(), &row)
	if se, ok := err.(*Error); !ok || se.Code != "PGRST116" {
		t.Errorf("two = %v", err)
	}
}

// Cents decode into int64 exactly, past float64's 2^53.
func TestCentsStayInt64(t *testing.T) {
	c, _ := fake(t, 200, `[{"amount_cents":9007199254740993}]`, nil)
	var rows []struct {
		AmountCents int64 `json:"amount_cents"`
	}
	if err := c.From("payment_milestone").Rows(context.Background(), &rows); err != nil || rows[0].AmountCents != 9007199254740993 {
		t.Errorf("cents = %v %v", rows, err)
	}
}

func TestErrorsKeepCodeAndHideDetails(t *testing.T) {
	c, _ := fake(t, 409, `{"code":"23505","message":"duplicate key value violates unique constraint \"x\"","details":"Key (email)=(a@b.c) already exists.","hint":null}`, nil)
	err := c.From("client").Insert(context.Background(), js.O("email", "a@b.c"), nil)
	se, ok := err.(*Error)
	if !ok || se.Code != "23505" || se.Status != 409 || strings.Contains(err.Error(), "a@b.c") {
		t.Errorf("err = %#v", err)
	}
	c, _ = fake(t, 400, `{"code":400,"error_code":"validation_failed","msg":"Unable to validate email address"}`, nil)
	_, err = c.UpdateUserByID(context.Background(), "u", js.O("email_confirm", true))
	if se, ok := err.(*Error); !ok || se.Code != "validation_failed" || se.Message != "Unable to validate email address" {
		t.Errorf("gotrue err = %#v", err)
	}
}

func TestWritesAskForMinimalOrRepresentation(t *testing.T) {
	c, s := fake(t, 201, ``, nil)
	if err := c.From("audit_event").Insert(context.Background(), []any{js.O("a", 1), js.O("b", 2, "a", 3)}, nil); err != nil {
		t.Fatal(err)
	}
	if s.header.Get("Prefer") != "return=minimal" || q(s.query).Get("columns") != `"a","b"` {
		t.Errorf("insert prefer=%q query=%q", s.header.Get("Prefer"), s.query)
	}
	c, s = fake(t, 200, `[{"id":"x"}]`, nil)
	var rows []struct{ ID string }
	if err := c.From("trip").Eq("id", "x").Update(context.Background(), js.O("notes", "n"), &rows); err != nil || len(rows) != 1 {
		t.Fatal(err)
	}
	if s.method != "PATCH" || s.header.Get("Prefer") != "return=representation" || q(s.query).Get("select") != "*" || s.body != `{"notes":"n"}` {
		t.Errorf("update %s prefer=%q q=%q body=%s", s.method, s.header.Get("Prefer"), s.query, s.body)
	}
	c, s = fake(t, 201, ``, nil)
	_ = c.From("cruise_line").Upsert(context.Background(), []any{js.O("name", "x")}, UpsertOptions{OnConflict: "name"}, nil)
	if s.header.Get("Prefer") != "resolution=merge-duplicates,return=minimal" || q(s.query).Get("on_conflict") != "name" {
		t.Errorf("upsert prefer=%q q=%q", s.header.Get("Prefer"), s.query)
	}
}

func TestRPC(t *testing.T) {
	c, s := fake(t, 200, `[{"outcome":"changed","version":4}]`, nil)
	var r struct {
		Outcome string
		Version int
	}
	found, err := c.RPCRow(context.Background(), "agent_set_trip_notes", js.O("p_trip_id", "t", "p_skip", js.Undef, "p_null", nil), &r)
	if err != nil || !found || r.Outcome != "changed" || r.Version != 4 {
		t.Errorf("rpc = %v %v %+v", found, err, r)
	}
	if s.path != "/rest/v1/rpc/agent_set_trip_notes" || s.body != `{"p_trip_id":"t","p_null":null}` {
		t.Errorf("rpc %s %s", s.path, s.body)
	}
	for _, empty := range []string{`[]`, `null`, ``} {
		c, _ = fake(t, 200, empty, nil)
		if found, err := c.RPCRow(context.Background(), "f", nil, &r); found || err != nil {
			t.Errorf("%q = %v %v", empty, found, err)
		}
	}
	c, _ = fake(t, 200, `"changed"`, nil)
	var scalar string
	if err := c.RPC(context.Background(), "f", nil, &scalar); err != nil || scalar != "changed" {
		t.Errorf("scalar = %q %v", scalar, err)
	}
}

func TestCount(t *testing.T) {
	c, s := fake(t, 200, ``, map[string]string{"Content-Range": "0-0/42"})
	n, err := c.From("message").Eq("conversation_id", "c").Count(context.Background())
	if err != nil || n != 42 || s.method != "HEAD" || s.header.Get("Prefer") != "count=exact" {
		t.Errorf("count = %d %v %s %q", n, err, s.method, s.header.Get("Prefer"))
	}
}

func TestStorage(t *testing.T) {
	c, s := fake(t, 200, `{"signedURL":"/object/sign/trip-documents/a b/x.pdf?token=t1"}`, nil)
	u, err := c.CreateSignedURL(context.Background(), "trip-documents", "/a b/x.pdf", 300)
	if err != nil || !strings.HasSuffix(u, "/storage/v1/object/sign/trip-documents/a%20b/x.pdf?token=t1") {
		t.Errorf("signed = %q %v", u, err)
	}
	if s.path != "/storage/v1/object/sign/trip-documents/a b/x.pdf" || s.body != `{"expiresIn":300}` {
		t.Errorf("sign call %s %s", s.path, s.body)
	}
	c, s = fake(t, 200, `{"url":"/object/upload/sign/trip-documents/k.pdf?token=tok"}`, nil)
	up, err := c.CreateSignedUploadURL(context.Background(), "trip-documents", "k.pdf", true)
	if err != nil || up.Token != "tok" || up.Path != "k.pdf" || s.header.Get("X-Upsert") != "true" {
		t.Errorf("upload sign = %+v %v %v", up, err, s.header)
	}
	c, s = fake(t, 200, `{"Key":"avatars/a.png"}`, nil)
	if err := c.Upload(context.Background(), "avatars", "/a//b.png/", []byte("png"), UploadOptions{ContentType: "image/png", CacheControl: "31536000"}); err != nil {
		t.Fatal(err)
	}
	if s.path != "/storage/v1/object/avatars/a/b.png" || s.header.Get("Cache-Control") != "max-age=31536000" ||
		s.header.Get("Content-Type") != "image/png" || s.header.Get("X-Upsert") != "false" || s.body != "png" {
		t.Errorf("upload %s %v", s.path, s.header)
	}
	c, s = fake(t, 200, `[]`, nil)
	_ = c.Remove(context.Background(), "avatars", []string{"a.png"})
	if s.method != "DELETE" || s.path != "/storage/v1/object/avatars" || s.body != `{"prefixes":["a.png"]}` {
		t.Errorf("remove %s %s %s", s.method, s.path, s.body)
	}
}

// The service key must never follow a redirect to another host.
func TestNoRedirects(t *testing.T) {
	hit := false
	evil := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit = true }))
	t.Cleanup(evil.Close)
	c, _ := fake(t, 307, ``, map[string]string{"Location": evil.URL})
	_ = c.From("trip").Rows(context.Background(), &[]struct{}{})
	if hit {
		t.Fatal("followed a redirect with the service key")
	}
}

func TestGenerateLinkSplitsProperties(t *testing.T) {
	c, s := fake(t, 200, `{"id":"u1","email":"a@b.c","action_link":"https://x/verify","hashed_token":"h","verification_type":"magiclink","email_otp":"123456","redirect_to":"https://x"}`, nil)
	l, err := c.GenerateLink(context.Background(), GenerateLinkParams{Type: "magiclink", Email: "a@b.c"})
	if err != nil || l.User.ID != "u1" || l.Properties.HashedToken != "h" || l.Properties.VerificationType != "magiclink" {
		t.Errorf("link = %+v %v", l, err)
	}
	if s.path != "/auth/v1/admin/generate_link" || !strings.Contains(s.body, `"type":"magiclink"`) {
		t.Errorf("call %s %s", s.path, s.body)
	}
}

func TestRPCQuery(t *testing.T) {
	c, s := fake(t, 200, `[{"id":"s1"}]`, nil)
	var rows []struct{ ID string }
	err := c.RPCQuery("cruise_sailing_search", js.O("needle", js.Undef, "max_rows", 24)).
		Select("id, title").Order("departure_date", true).Order("id", true).Limit(24).Rows(context.Background(), &rows)
	if err != nil || len(rows) != 1 {
		t.Fatal(err)
	}
	if s.method != "POST" || s.path != "/rest/v1/rpc/cruise_sailing_search" || s.body != `{"max_rows":24}` {
		t.Errorf("%s %s %s", s.method, s.path, s.body)
	}
	if got := q(s.query); got.Get("select") != "id,title" || got.Get("order") != "departure_date.asc,id.asc" || got.Get("limit") != "24" {
		t.Errorf("query %s", s.query)
	}
}

// GoTrue admin calls carry the API version auth-js sends, so errors come back in the shape
// that does not quote an address in its message.
func TestAdminCallsSendTheAPIVersion(t *testing.T) {
	c, s := fake(t, 200, `{"id":"u"}`, nil)
	_, _ = c.UpdateUserByID(context.Background(), "u", js.O("ban_duration", "none"))
	if s.header.Get("X-Supabase-Api-Version") != "2024-01-01" {
		t.Errorf("update: %v", s.header)
	}
	_, _ = c.GenerateLink(context.Background(), GenerateLinkParams{Type: "magiclink", Email: "a@b.c"})
	if s.header.Get("X-Supabase-Api-Version") != "2024-01-01" {
		t.Errorf("generate_link: %v", s.header)
	}
}
