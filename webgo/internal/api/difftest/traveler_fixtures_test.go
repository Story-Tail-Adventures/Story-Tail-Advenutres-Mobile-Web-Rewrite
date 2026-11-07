//go:build difftest && difftest_traveler

package difftest

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// Fixtures shared by the traveler-trip tests (trip-message, trip-document, trip-document-url,
// testimonial). Each world gets a second traveler of the same advisor ("other"), whose rows
// are the "not yours" targets. Every row is fresh and swept at cleanup; seed rows are never
// touched.

const travBucket = "trip-documents"

func travMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// travWorlds makes the two worlds, each with an "other" traveler, and sweeps every row both
// travelers own at cleanup (before the harness deletes the users).
func travWorlds(t *testing.T) (deno, goW *World) {
	t.Helper()
	deno, goW = NewWorlds(t)
	for _, w := range []*World{deno, goW} {
		other := S.NewTraveler(t, w.Tag+"o", w.Agent)
		w.ID("other.user", other.UserID)
		w.ID("other.pu", other.PlatformUserID)
		w.ID("other.client", other.ClientID)
		w.ID("other.email", other.Email)
		w.Vars["other.client"] = other.ClientID
		w.Vars["other.pu"] = other.PlatformUserID
		clients := []string{w.Traveler.ClientID, other.ClientID}
		t.Cleanup(func() { travSweep(clients) })
	}
	return deno, goW
}

// travSweep removes everything the tests may have written for these clients, leaves first.
func travSweep(clients []string) {
	ctx := context.Background()
	ids := func(q *service.Query) []string {
		var rows []struct {
			ID string `json:"id"`
		}
		_ = q.Rows(ctx, &rows)
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = r.ID
		}
		return out
	}
	trips := ids(S.DB.From("trip").Select("id").In("client_id", clients))
	convs := ids(S.DB.From("conversation").Select("id").In("client_id", clients))
	if len(convs) > 0 {
		if msgs := ids(S.DB.From("message").Select("id").In("conversation_id", convs)); len(msgs) > 0 {
			_ = S.DB.From("message_attachment").In("message_id", msgs).Delete(ctx, nil)
			_ = S.DB.From("message").In("id", msgs).Delete(ctx, nil)
		}
		_ = S.DB.From("conversation").In("id", convs).Delete(ctx, nil)
	}
	var docs []struct {
		ID         string `json:"id"`
		StorageKey string `json:"storage_key"`
	}
	_ = S.DB.From("document").Select("id, storage_key").In("client_id", clients).Rows(ctx, &docs)
	if len(trips) > 0 {
		var more []struct {
			ID         string `json:"id"`
			StorageKey string `json:"storage_key"`
		}
		_ = S.DB.From("document").Select("id, storage_key").In("trip_id", trips).Rows(ctx, &more)
		docs = append(docs, more...)
	}
	if len(docs) > 0 {
		docIDs, keys := make([]string, len(docs)), make([]string, len(docs))
		for i, d := range docs {
			docIDs[i], keys[i] = d.ID, d.StorageKey
		}
		_ = S.DB.From("message_attachment").In("document_id", docIDs).Delete(ctx, nil)
		_ = S.DB.From("document").In("id", docIDs).Delete(ctx, nil)
		_ = S.DB.Remove(ctx, travBucket, keys)
	}
	_ = S.DB.From("testimonial").In("client_id", clients).Delete(ctx, nil)
	if len(trips) > 0 {
		_ = S.DB.From("trip_component").In("trip_id", trips).Delete(ctx, nil) // quote-request writes one
		_ = S.DB.From("trip").In("id", trips).Delete(ctx, nil)
	}
}

// travOther is the client id of world w's other traveler.
func travOther(w *World) string { return w.Vars["other.client"] }

// travTrip makes a trip for clientID under w's advisor, labelled in w. cols add or override.
func travTrip(t *testing.T, w *World, clientID, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	row := js.O("id", id, "client_id", clientID, "agent_id", w.Agent.AgentID,
		"title", "Slow Week in Lisbon", "trip_type", "custom", "status", "booked")
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	travMust(t, S.DB.From("trip").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// travConversation makes a thread for clientID (tripID "" for none), labelled in w.
func travConversation(t *testing.T, w *World, clientID, tripID, label string, cols js.Ordered) string {
	t.Helper()
	id := uuid.New()
	var trip any
	if tripID != "" {
		trip = tripID
	}
	row := js.O("id", id, "client_id", clientID, "agent_id", w.Agent.AgentID, "trip_id", trip,
		"subject", "Fixture thread", "last_message_preview", "Fixture preview", "client_unread_count", 1,
		"agent_unread_count", 2)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	travMust(t, S.DB.From("conversation").Insert(context.Background(), row, nil))
	w.ID(label, id)
	return id
}

// travDocument registers a document row for clientID (or none) on tripID (or none), labelled
// in w. With an object, it also uploads bytes at its key, which a signed READ url needs.
func travDocument(t *testing.T, w *World, ownerPU string, clientID, tripID any, label string, object bool, cols js.Ordered) string {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	prefix := "loose"
	if s, ok := tripID.(string); ok {
		prefix = s
	}
	key := "trips/" + prefix + "/" + id + ".pdf"
	row := js.O("id", id, "owner_user_id", ownerPU, "client_id", clientID, "trip_id", tripID,
		"kind", "passport", "filename", "Passport <scan> & copy.pdf", "mime_type", "application/pdf",
		"size_bytes", 2048, "storage_bucket", travBucket, "storage_key", key,
		"checksum_sha256", `\x`+strings.Repeat("00", 32), "is_sensitive", true)
	for _, f := range cols {
		row = row.Set(f.Key, f.Value)
	}
	travMust(t, S.DB.From("document").Insert(ctx, row, nil))
	if object {
		travMust(t, S.DB.Upload(ctx, travBucket, key, []byte("%PDF-1.4 difftest "+id), service.UploadOptions{ContentType: "application/pdf"}))
		key := key
		t.Cleanup(func() { _ = S.DB.Remove(context.Background(), travBucket, []string{key}) })
	}
	w.ID(label, id)
	return id
}

// travJSON is a request body.
func travJSON(kv ...any) string {
	b, err := js.Marshal(js.O(kv...))
	if err != nil {
		panic(err)
	}
	return string(b)
}

func travFixed(s string) func(*World) string { return func(*World) string { return s } }

func travTraveler(w *World) string { return w.Traveler.Token }

// travSorted reads rows and returns them normalized and sorted, for rows whose order neither
// function fixed.
func travSorted(t *testing.T, w *World, q *service.Query) string {
	t.Helper()
	var rows []json.RawMessage
	if err := json.Unmarshal([]byte(S.Rows(t, q)), &rows); err != nil {
		t.Fatalf("rows: %v", err)
	}
	norm := make([]string, len(rows))
	for i, r := range rows {
		norm[i] = w.Normalize(string(r))
	}
	sort.Strings(norm)
	return "[" + strings.Join(norm, ",") + "]"
}

// travWithAudit sends every case to fn, as the traveler unless a case says otherwise, and
// makes each compare the audit rows ITS request wrote, and nothing else: every request carries its own User-Agent, which every audit row records, and the rows are
// read by it. (The harness's own read starts a second before the request and, on a run of
// fast cases, also picks up the previous case's rows.)
func travWithAudit(fn string, cases []Case) []Case {
	out := make([]Case, len(cases))
	for i, cs := range cases {
		hdr, snap := cs.Header, cs.Snap
		cs.Header = func(w *World) http.Header {
			h := http.Header{}
			if hdr != nil {
				for k, v := range hdr(w) {
					h[k] = v
				}
			}
			ua := "difftest-ua-" + Unique()
			w.Vars["ua"] = w.ID("ua", ua)
			h.Set("User-Agent", ua)
			return h
		}
		cs.Snap = func(t *testing.T, w *World) string {
			s := ""
			if snap != nil {
				s = snap(t, w)
			}
			return s + "\naudit:" + travSorted(t, w, S.DB.From("audit_event").
				Select("actor_role,event_type,target_entity,target_id,metadata,user_agent").
				In("actor_user_id", []string{w.Agent.PlatformUserID, w.Traveler.PlatformUserID}).
				Eq("user_agent", w.Vars["ua"]))
		}
		if cs.Fn == "" {
			cs.Fn = fn
		}
		cs.SkipAudit = true
		if cs.Token == nil {
			cs.Token = travTraveler
		}
		out[i] = cs
	}
	return out
}
