package guard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

func db(t *testing.T, reply string) *service.Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(reply)) }))
	t.Cleanup(srv.Close)
	return service.New(srv.URL, "k", nil)
}

const trip = "0190a0a0-0000-7000-8000-000000000001"

func status(t *testing.T, err error) (int, string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		return 500, ""
	}
	return p.Status, p.Detail
}

// "No such trip" and "not yours" are one answer, and archived is not found.
func TestRequireOwnedTrip(t *testing.T) {
	ctx := context.Background()
	if s, d := status(t, func() error { _, e := RequireOwnedTrip(ctx, db(t, `[]`), "c", "banana"); return e }()); s != 400 || d != "That is not a trip id." {
		t.Errorf("bad id: %d %q", s, d)
	}
	for name, reply := range map[string]string{
		"missing":  `[]`,
		"not mine": `[{"id":"` + trip + `","client_id":"other","agent_id":"a","title":"T","archived_at":null}]`,
		"archived": `[{"id":"` + trip + `","client_id":"c","agent_id":"a","title":"T","archived_at":"2026-01-01T00:00:00Z"}]`,
	} {
		_, err := RequireOwnedTrip(ctx, db(t, reply), "c", trip)
		if s, d := status(t, err); s != 404 || d != "No such trip." {
			t.Errorf("%s: %d %q", name, s, d)
		}
	}
	got, err := RequireOwnedTrip(ctx, db(t, `[{"id":"`+trip+`","client_id":"c","agent_id":"a","title":"T","archived_at":null}]`), "c", trip)
	if err != nil || got.AgentID != "a" || got.Title != "T" {
		t.Errorf("mine: %+v %v", got, err)
	}
}

func TestRequireAgentIDReadsTheAdvisorRecord(t *testing.T) {
	id := "a-1"
	c := &caller.Context{Role: "agent", AgentID: &id, AAL: "aal2"}
	if _, err := RequireAgentID(context.Background(), db(t, `[{"status":"archived"}]`), c); err == nil {
		t.Error("archived advisor let through")
	}
	if got, err := RequireAgentID(context.Background(), db(t, `[{"status":"inactive"}]`), c); err != nil || got != id {
		t.Errorf("inactive advisor refused: %v", err)
	}
	if _, err := RequireAgentID(context.Background(), db(t, `{"code":"500","message":"down"}`), c); err == nil {
		t.Error("a failed lookup must fail closed")
	}
}

func TestRequireOwnedConversation(t *testing.T) {
	conv := trip
	reply := `[{"id":"` + conv + `","client_id":"c","agent_id":"a","trip_id":null,"agent_unread_count":null,"archived_at":null}]`
	got, err := RequireOwnedConversation(context.Background(), db(t, reply), "c", conv)
	if err != nil || got.TripID != nil || got.AgentUnread != 0 {
		t.Errorf("%+v %v", got, err)
	}
	if _, err := RequireOwnedConversation(context.Background(), db(t, reply), "other", conv); err == nil {
		t.Error("someone else's conversation")
	}
}
