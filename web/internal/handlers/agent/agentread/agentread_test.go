package agentread

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
)

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)) }

type row struct {
	ID         string `json:"id"`
	TotalCents int64  `json:"total_cents"`
}

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
