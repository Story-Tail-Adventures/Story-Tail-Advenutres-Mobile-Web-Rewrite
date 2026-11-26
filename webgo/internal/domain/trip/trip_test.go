package trip

import (
	"slices"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/trip_test.ts, one Go test per Deno.test.
//
// The refund vocabulary, pinned against the database that actually enforces it.
// trip_refund_status_vocabulary is the authority; SQL and Go cannot share one definition, so
// constraints_trip_totals.sql asserts the CHECK takes exactly these four and refuses a fifth,
// and this asserts the list the handler validates against is the same four. Drifting apart is
// a 500 on a write path.

// Deno.test("the refund vocabulary is exactly what the CHECK constrains")
func TestRefundVocabulary(t *testing.T) {
	if !slices.Equal(RefundStatuses, []string{"none_expected", "pending", "partial", "full"}) {
		t.Fatalf("RefundStatuses = %v", RefundStatuses)
	}
}

// Deno.test("isRefundStatus accepts the four and nothing else")
func TestIsRefundStatus(t *testing.T) {
	for _, v := range RefundStatuses {
		if !IsRefundStatus(js.StringValue(v)) {
			t.Errorf("%q refused", v)
		}
	}
	// The shapes a caller actually sends by mistake.
	for _, v := range []js.Value{
		js.StringValue("refunded"),
		js.StringValue("Partial"), // case matters: the CHECK is exact
		js.StringValue(""),
		js.StringValue("Refunded $1,640 on Feb 12"),
		js.NullValue(),
		js.UndefinedValue(),
		js.NumberValue(0),
	} {
		if IsRefundStatus(v) {
			t.Errorf("%v accepted", v)
		}
	}
}

// Deno.test("NULL is not a member, and that is the point")
func TestNullIsNotAMember(t *testing.T) {
	// The column allows NULL and the vocabulary does not contain it, deliberately. "Not
	// stated" is an advisor who has not checked; none_expected is one who has.
	if IsRefundStatus(js.NullValue()) {
		t.Error("null accepted")
	}
	if slices.Contains(RefundStatuses, "null") {
		t.Error(`"null" is in the list`)
	}
}

// Go-only (no Deno.test): toStoragePath and requireClientId, which trip_test.ts does not
// cover. Expected paths are what deno answered for trip.ts's toStoragePath.
func TestGoOnlyStoragePathAndClientID(t *testing.T) {
	for in, want := range map[string]string{
		"http://kong:8000/storage/v1/object/sign/trip-documents/a/b.pdf?token=abc.def-ghi":        "/storage/v1/object/sign/trip-documents/a/b.pdf?token=abc.def-ghi",
		"/storage/v1/object/sign/x.pdf?token=1":                                                   "/storage/v1/object/sign/x.pdf?token=1",
		"storage/v1/object/upload/sign/x.pdf?token=1":                                             "/storage/v1/object/upload/sign/x.pdf?token=1",
		"http://kong:8000/storage/v1/object/sign/a%20b.pdf?":                                      "/storage/v1/object/sign/a%20b.pdf",
		"http://kong:8000/storage/v1/object/sign/a/./b/../c.pdf?token=x#frag":                     "/storage/v1/object/sign/a/c.pdf?token=x",
		"https://abc.supabase.co/storage/v1/object/sign/trip-documents/caf\U000000e9.pdf?token=t": "/storage/v1/object/sign/trip-documents/caf%C3%A9.pdf?token=t",
		"http://kong:8000": "/",
	} {
		got, err := ToStoragePath(in)
		if err != nil || got != want {
			t.Errorf("ToStoragePath(%q) = %q, %v; want %q", in, got, err, want)
		}
	}

	id := "0195a2c0-1a00-7000-8000-000000000013"
	got, err := RequireClientID(&caller.Context{Role: caller.RoleClient, ClientID: &id})
	if err != nil || got != id {
		t.Errorf("client: %q, %v", got, err)
	}
	agentID := "0195a2c0-1a00-7000-8000-000000000001"
	for _, c := range []*caller.Context{
		{Role: caller.RoleAgent, AgentID: &agentID},
		{Role: caller.RoleClient},
		{Role: caller.RoleAdmin, ClientID: &id},
	} {
		_, err := RequireClientID(c)
		p, ok := problem.As(err)
		if !ok || p.Status != 403 || p.Detail != "This is the traveler's side of the platform." {
			t.Errorf("%+v: %v", c, err)
		}
	}
}
