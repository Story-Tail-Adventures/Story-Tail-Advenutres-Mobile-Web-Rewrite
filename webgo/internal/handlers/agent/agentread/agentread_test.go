package agentread

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Names must match the AgentRead union in web/lib/agent/api.ts while that file exists
// (until GO-MIGRATION Phase 6 deletes web/).
func TestNamesMatchTheNextApp(t *testing.T) {
	src, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "web", "lib", "agent", "api.ts"))
	if os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6); Names is the source of truth now")
	}
	if err != nil {
		t.Fatal(err)
	}
	s := string(src)
	i := strings.Index(s, "export type AgentRead")
	if i < 0 {
		t.Fatal("AgentRead union not found")
	}
	block := s[i:]
	if j := strings.Index(block[10:], "\nexport "); j >= 0 {
		block = block[:j+10]
	}
	var want []string
	for _, m := range regexp.MustCompile(`(?m)^\s*\|\s*"([a-z_0-9]+)"`).FindAllStringSubmatch(block, -1) {
		want = append(want, m[1])
	}
	got := slices.Clone(Names)
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Errorf("Names drifted from AgentRead:\n go   %v\n next %v", got, want)
	}
}

type row struct {
	ID         string `json:"id"`
	TotalCents int64  `json:"total_cents"`
}

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)) }

func TestCallRunsTheNamedReadAsTheVisitor(t *testing.T) {
	var path, auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, auth = r.URL.Path, r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"t1","total_cents":9007199254740993}]`))
	}))
	t.Cleanup(srv.Close)

	rows, err := Call[row](context.Background(), supa.New(srv.URL, "anon", nil),
		session.State{SignedIn: true, AccessToken: "agent-token"}, "agent_trip_overview", map[string]string{"p_trip_id": "t1"}, quiet())
	if err != nil {
		t.Fatal(err)
	}
	if path != "/rest/v1/rpc/agent_trip_overview" || auth != "Bearer agent-token" {
		t.Errorf("request = %s auth=%q", path, auth)
	}
	if len(rows) != 1 || rows[0].TotalCents != 9007199254740993 {
		t.Errorf("rows = %+v (cents must stay exact)", rows)
	}
}

func TestCallRefusesUnknownNamesAndAnonymousVisitors(t *testing.T) {
	sb := supa.New("http://127.0.0.1:1", "anon", nil)
	if _, err := Call[row](context.Background(), sb, session.State{SignedIn: true, AccessToken: "t"}, "pg_sleep", nil, quiet()); err == nil {
		t.Error("an unknown read was called")
	}
	if _, err := Call[row](context.Background(), sb, session.State{}, "agent_kpis", nil, quiet()); !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("anonymous: err = %v", err)
	}
}

func TestFailuresLogTheCodeNeverTheMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"code":"42883","message":"function secret_statement(text) does not exist"}`))
	}))
	t.Cleanup(srv.Close)
	var logs bytes.Buffer
	_, err := Call[row](context.Background(), supa.New(srv.URL, "anon", nil),
		session.State{SignedIn: true, AccessToken: "t"}, "agent_kpis", nil, slog.New(slog.NewJSONHandler(&logs, nil)))
	if !errors.Is(err, ErrUnavailable) {
		t.Errorf("err = %v", err)
	}
	if strings.Contains(logs.String(), "secret_statement") || !strings.Contains(logs.String(), `"read":"agent_kpis"`) {
		t.Errorf("log: %s", logs.String())
	}
}
