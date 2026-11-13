package audit

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

type fakeDB struct {
	table string
	body  []byte
	err   error
	calls int
}

func (f *fakeDB) InsertRows(_ context.Context, table string, rows any) error {
	f.calls++
	f.table = table
	f.body, _ = js.Marshal(rows) // PostgREST reads \u003c and < alike; js.Marshal keeps the test readable
	return f.err
}

func actor() *caller.Context {
	ip, ua := "203.0.113.9", "okhttp/4"
	return &caller.Context{PlatformUserID: "pu-1", Role: "agent", IP: &ip, UserAgent: &ua}
}

// The row carries exactly the columns the Deno insert named, in that order, with a v7 id.
func TestWriteHasTheDenoColumns(t *testing.T) {
	db := &fakeDB{}
	err := Write(context.Background(), db, actor(), Spec{
		EventType: "trip.notes_changed", TargetEntity: "trip", TargetID: "t-1",
		Metadata: js.O("version", 3, "note", "<b>"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if db.table != "audit_event" {
		t.Errorf("table = %s", db.table)
	}
	var r Row
	_ = json.Unmarshal(db.body, &r)
	if !uuid.IsV7(r.ID) {
		t.Errorf("id %q is not v7", r.ID)
	}
	keys := []string{`"id"`, `"actor_user_id":"pu-1"`, `"actor_role":"agent"`, `"event_type":"trip.notes_changed"`,
		`"target_entity":"trip"`, `"target_id":"t-1"`, `"metadata":{"version":3,"note":"<b>"}`,
		`"ip_address":"203.0.113.9"`, `"user_agent":"okhttp/4"`}
	at := 0
	for _, k := range keys {
		i := strings.Index(string(db.body[at:]), k)
		if i < 0 {
			t.Fatalf("missing or out of order %s in %s", k, db.body)
		}
		at += i
	}
}

func TestNilMetadataIsAnEmptyObject(t *testing.T) {
	db := &fakeDB{}
	_ = Write(context.Background(), db, actor(), Spec{EventType: "x.y", TargetEntity: "x", TargetID: "1"})
	if !strings.Contains(string(db.body), `"metadata":{}`) {
		t.Errorf("metadata = %s", db.body)
	}
}

// A failed audit write is an error the caller must see, naming the event.
func TestWriteFailureIsReturned(t *testing.T) {
	db := &fakeDB{err: errors.New("boom")}
	err := Write(context.Background(), db, actor(), Spec{EventType: "client.updated", TargetEntity: "client", TargetID: "c"})
	if err == nil || !strings.Contains(err.Error(), "client.updated on client/c") {
		t.Fatalf("err = %v", err)
	}
}

func TestWriteManyIsOneInsert(t *testing.T) {
	db := &fakeDB{}
	specs := []Spec{{EventType: "client.tagged", TargetEntity: "client", TargetID: "a"}, {EventType: "client.tagged", TargetEntity: "client", TargetID: "b"}}
	if err := WriteMany(context.Background(), db, actor(), specs); err != nil {
		t.Fatal(err)
	}
	var rows []Row
	_ = json.Unmarshal(db.body, &rows)
	if db.calls != 1 || len(rows) != 2 || rows[0].TargetID != "a" || rows[1].TargetID != "b" || rows[0].ID == rows[1].ID {
		t.Errorf("calls=%d rows=%+v", db.calls, rows)
	}
	if err := WriteMany(context.Background(), db, actor(), nil); err != nil || db.calls != 1 {
		t.Error("no specs must not insert")
	}
}

func TestWriteSystemHasNoActor(t *testing.T) {
	db := &fakeDB{}
	_ = WriteSystem(context.Background(), db, Spec{EventType: "cruise_sync.run", TargetEntity: "cruise_sync_run", TargetID: "r"})
	for _, k := range []string{`"actor_user_id":null`, `"actor_role":null`, `"ip_address":null`, `"user_agent":null`} {
		if !strings.Contains(string(db.body), k) {
			t.Errorf("missing %s in %s", k, db.body)
		}
	}
}

func TestWithWritesAfterAndNotOnFailure(t *testing.T) {
	db := &fakeDB{}
	spec := Spec{EventType: "e.v", TargetEntity: "e", TargetID: "1"}
	if _, err := With(context.Background(), db, actor(), spec, func() (int, error) { return 0, errors.New("no") }); err == nil || db.calls != 0 {
		t.Error("a failed action must not be audited")
	}
	order := []string{}
	ran := func() (int, error) { order = append(order, "fn"); return 7, nil }
	v, err := With(context.Background(), &orderDB{&order}, actor(), spec, ran)
	if err != nil || v != 7 || strings.Join(order, ",") != "fn,audit" {
		t.Errorf("after: %v %v %v", v, err, order)
	}
	order = nil
	spec.Before = true
	_, _ = With(context.Background(), &orderDB{&order}, actor(), spec, ran)
	if strings.Join(order, ",") != "audit,fn" {
		t.Errorf("before: %v", order)
	}
}

type orderDB struct{ order *[]string }

func (o *orderDB) InsertRows(context.Context, string, any) error {
	*o.order = append(*o.order, "audit")
	return nil
}

func TestIDCarriesTheClock(t *testing.T) {
	defer func() { now = time.Now }()
	at := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	now = func() time.Time { return at }
	db := &fakeDB{}
	_ = Write(context.Background(), db, actor(), Spec{EventType: "a.b", TargetEntity: "a", TargetID: "1"})
	var r Row
	_ = json.Unmarshal(db.body, &r)
	if ts, _ := uuid.Timestamp(r.ID); !ts.Equal(at) {
		t.Errorf("ts = %v", ts)
	}
}
