package agent

import (
	"errors"
	"math"
	"slices"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// Ported from supabase/functions/_shared/agent_test.ts, one Go test per Deno.test.
//
// RequireAgentID is two refusals, tested for what each one guards against.
//
// THE ROLE REFUSAL. The obvious gate is requireRole(ctx, "agent"). It is equivalent TODAY and
// stops being equivalent the moment anyone widens it to ("agent", "admin"): platform_user's
// CHECK has a bare (role = 'admin') branch, so an admin row may carry no agent_id or someone
// else's. The admin cases below are therefore the point of the file.
//
// THE ARCHIVED REFUSAL. The context is built from platform_user, and archiving an advisor
// writes agent.status and nothing else, so the context cannot see it. The status cases pin
// the predicate to <> 'archived' rather than = 'active': an inactive advisor is paused, not
// gone.
//
// The Deno tests drove a fake Db; here the agent-status lookup is injected, and the fake
// records the agent id it was asked about. The table and column (agent.status by id) are the
// real lookup's job now, so the Go test asserts the id and the call count.

const agentID = "0195a2c0-1a00-7000-8000-000000000001"

func sp(s string) *string { return &s }

func ctx(edit func(c *caller.Context)) *caller.Context {
	c := &caller.Context{
		AccountID:      "0195a2c0-1a00-7000-8000-000000000010",
		PlatformUserID: "0195a2c0-1a00-7000-8000-000000000020",
		Role:           caller.RoleAgent,
		AgentID:        sp(agentID),
		ClientID:       nil,
		AAL:            "aal2",
	}
	if edit != nil {
		edit(c)
	}
	return c
}

// fakeLookup answers the one lookup the gate makes, and records the agent id asked about.
type fakeLookup struct {
	status string
	found  bool
	err    error
	calls  []string
}

func (f *fakeLookup) lookup(id string) (string, bool, error) {
	f.calls = append(f.calls, id)
	return f.status, f.found, f.err
}

func active() *fakeLookup { return &fakeLookup{status: "active", found: true} }

// unreachable is a lookup that fails the test if the gate touches it at all.
func unreachable(t *testing.T) StatusLookup {
	return func(string) (string, bool, error) {
		t.Fatal("the role refusal must come before any database read")
		return "", false, nil
	}
}

// rejection is the Deno helper: the call must fail with an HttpError; its status and detail.
func rejection(t *testing.T, err error) (int, string) {
	t.Helper()
	p, ok := problem.As(err)
	if !ok {
		t.Fatalf("want an HttpError, got %v", err)
	}
	return p.Status, p.Detail
}

// Deno.test("an agent gets their agent id back")
func TestAgentGetsTheirID(t *testing.T) {
	id, err := RequireAgentID(ctx(nil), active().lookup)
	if err != nil || id != agentID {
		t.Fatalf("got %q, %v", id, err)
	}
}

// Deno.test("the gate looks up the CALLER'S agent row, by id")
func TestGateLooksUpCallersRow(t *testing.T) {
	f := active()
	if _, err := RequireAgentID(ctx(nil), f.lookup); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(f.calls, []string{agentID}) {
		t.Fatalf("lookups = %v, want exactly [%s]", f.calls, agentID)
	}
}

// Deno.test("a client is refused")
func TestClientIsRefused(t *testing.T) {
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.ClientID = caller.RoleClient, nil, sp("0195a2c0-1a00-7000-8000-000000000013")
	}), unreachable(t))
	if status, _ := rejection(t, err); status != 403 {
		t.Fatalf("status %d", status)
	}
}

// Deno.test("a client carrying a stray agent_id is still refused")
func TestClientWithStrayAgentIDIsRefused(t *testing.T) {
	// The role decides, not the column.
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.ClientID = caller.RoleClient, sp(agentID), sp("0195a2c0-1a00-7000-8000-000000000013")
	}), unreachable(t))
	if status, _ := rejection(t, err); status != 403 {
		t.Fatalf("status %d", status)
	}
}

// Deno.test("an admin with no agent id is refused rather than passed through as undefined")
func TestAdminWithoutAgentIDIsRefused(t *testing.T) {
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.ClientID = caller.RoleAdmin, nil, nil
	}), unreachable(t))
	if status, _ := rejection(t, err); status != 403 {
		t.Fatalf("status %d", status)
	}
}

// Deno.test("an admin CARRYING an agent id is refused — this is the whole reason the helper exists")
func TestAdminCarryingAgentIDIsRefused(t *testing.T) {
	// platform_user's CHECK permits it. requireRole(ctx, "agent", "admin") would let this
	// caller act as whichever agent the row names.
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.ClientID = caller.RoleAdmin, sp(agentID), nil
	}), unreachable(t))
	if status, _ := rejection(t, err); status != 403 {
		t.Fatalf("status %d", status)
	}
}

// Deno.test("the refusal names the side of the platform, not the role check")
func TestRefusalNamesTheSide(t *testing.T) {
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.ClientID = caller.RoleClient, nil, sp("x")
	}), unreachable(t))
	if _, detail := rejection(t, err); detail != "This is the advisor's side of the platform." {
		t.Fatalf("detail %q", detail)
	}
}

// Deno.test("an ARCHIVED advisor is refused — the write path agrees with every read")
func TestArchivedAdvisorIsRefused(t *testing.T) {
	_, err := RequireAgentID(ctx(nil), (&fakeLookup{status: "archived", found: true}).lookup)
	status, detail := rejection(t, err)
	if status != 403 || detail != "This advisor account is closed." {
		t.Fatalf("got %d %q", status, detail)
	}
}

// Deno.test("an INACTIVE advisor is let through — paused is not offboarded")
func TestInactiveAdvisorIsLetThrough(t *testing.T) {
	// The predicate is <> 'archived', not = 'active', word for word what the read surface uses.
	id, err := RequireAgentID(ctx(nil), (&fakeLookup{status: "inactive", found: true}).lookup)
	if err != nil || id != agentID {
		t.Fatalf("got %q, %v", id, err)
	}
}

// Deno.test("an agent id with no agent row is refused, not assumed fine")
func TestNoAgentRowIsRefused(t *testing.T) {
	_, err := RequireAgentID(ctx(nil), (&fakeLookup{found: false}).lookup)
	if status, _ := rejection(t, err); status != 403 {
		t.Fatalf("status %d", status)
	}
}

// Deno.test("a failed lookup is a 500, never a quiet pass")
func TestFailedLookupIs500(t *testing.T) {
	// Fail-open here would restore the exact hole the read closes. A plain error becomes a
	// bodyless 500, which is the honest answer: the failure is ours.
	_, err := RequireAgentID(ctx(nil), (&fakeLookup{err: errors.New("boom")}).lookup)
	if err == nil {
		t.Fatal("want an error")
	}
	if _, isHTTP := problem.As(err); isHTTP {
		t.Fatalf("want a plain error, got an HttpError: %v", err)
	}
	if err.Error() != "Could not resolve the advisor record: boom" {
		t.Fatalf("message %q", err.Error())
	}
}

// versionRejection is the Deno helper: the value must be refused with an HttpError.
func versionRejection(t *testing.T, value js.Value) (int, string) {
	t.Helper()
	_, err := RequireExpectedVersion(value)
	if err == nil {
		t.Fatalf("expected %v to be refused", value)
	}
	return rejection(t, err)
}

// Deno.test("a version the board rendered comes straight back")
func TestVersionComesStraightBack(t *testing.T) {
	for _, v := range []float64{1, 7, 2147483647} {
		got, err := RequireExpectedVersion(js.NumberValue(v))
		if err != nil || got != int64(v) {
			t.Errorf("RequireExpectedVersion(%v) = %d, %v", v, got, err)
		}
	}
}

// Deno.test("a version too large for int4 is a 400, not a 500 from Postgres")
func TestVersionTooLargeForInt4(t *testing.T) {
	// 2147483648 and 1e20 are both integers by JavaScript's reckoning and both fail the cast
	// to integer (SQLSTATE 22003). Caught here, they are a malformed request with a sentence.
	for _, v := range []float64{2147483648, 1e20, js.MaxSafeInteger} {
		if status, _ := versionRejection(t, js.NumberValue(v)); status != 400 {
			t.Errorf("%v: status %d", v, status)
		}
	}
}

// Deno.test("zero and negatives are refused — no board ever rendered one")
func TestVersionZeroAndNegatives(t *testing.T) {
	for _, v := range []float64{0, -1} {
		if status, _ := versionRejection(t, js.NumberValue(v)); status != 400 {
			t.Errorf("%v: status %d", v, status)
		}
	}
}

// Deno.test("a STALE version still goes through to the 409 where it belongs")
func TestStaleVersionGoesThrough(t *testing.T) {
	for _, v := range []float64{1, 99} {
		got, err := RequireExpectedVersion(js.NumberValue(v))
		if err != nil || got != int64(v) {
			t.Errorf("RequireExpectedVersion(%v) = %d, %v", v, got, err)
		}
	}
}

// Deno.test("non-numbers, fractions and NaN are refused with the sentence the board needs")
func TestVersionNonNumbers(t *testing.T) {
	for _, v := range []js.Value{
		js.UndefinedValue(), js.NullValue(), js.StringValue("3"), js.NumberValue(1.5),
		js.NumberValue(math.NaN()), js.NumberValue(math.Inf(1)),
	} {
		if status, _ := versionRejection(t, v); status != 400 {
			t.Errorf("%v: status %d", v, status)
		}
	}
	if _, detail := versionRejection(t, js.StringValue("3")); detail != "Send the expectedVersion the board was rendered from." {
		t.Errorf("detail %q", detail)
	}
}

const trip = "0195a2c0-1a00-7000-8000-000000000042"

func body(t *testing.T, requested string, r StageWriteResult) string {
	t.Helper()
	o, err := StageWriteBody(trip, requested, r)
	if err != nil {
		t.Fatal(err)
	}
	b, err := js.Marshal(o)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// Deno.test("a real transition says what it moved from")
func TestRealTransition(t *testing.T) {
	got := body(t, "booked", StageWriteResult{Outcome: "changed", FromStatus: "proposal", ToStatus: "booked", Version: 2})
	if want := `{"tripId":"` + trip + `","status":"booked","previousStatus":"proposal","version":2,"changed":true}`; got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// Deno.test("a plain no-op reports no change and leaves previousStatus out")
func TestPlainNoop(t *testing.T) {
	got := body(t, "proposal", StageWriteResult{Outcome: "noop", FromStatus: "proposal", ToStatus: "proposal", Version: 1})
	if want := `{"tripId":"` + trip + `","status":"proposal","version":1,"changed":false}`; got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// Deno.test("a corrected cancellation reason is reported, not swallowed")
func TestCorrectedCancellationReason(t *testing.T) {
	// changed stays false (no stage moved, no history row), and the flag is what stops that
	// reading as "nothing happened".
	got := body(t, "cancelled", StageWriteResult{Outcome: "reason_changed", FromStatus: "cancelled", ToStatus: "cancelled", Version: 4})
	if want := `{"tripId":"` + trip + `","status":"cancelled","version":4,"changed":false,"cancellationReasonUpdated":true}`; got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// Deno.test("a cancel call that needed no write says so rather than staying silent")
func TestCancelNoopSaysSo(t *testing.T) {
	got := body(t, "cancelled", StageWriteResult{Outcome: "noop", FromStatus: "cancelled", ToStatus: "cancelled", Version: 4})
	if want := `{"tripId":"` + trip + `","status":"cancelled","version":4,"changed":false,"cancellationReasonUpdated":false}`; got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// Deno.test("the reason flag appears only where a reason was in play")
func TestReasonFlagOnlyWhereInPlay(t *testing.T) {
	o, err := StageWriteBody(trip, "in_progress", StageWriteResult{Outcome: "noop", FromStatus: "in_progress", ToStatus: "in_progress", Version: 6})
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range o {
		if f.Key == "cancellationReasonUpdated" {
			t.Fatal("cancellationReasonUpdated is in the body")
		}
	}
}

// Deno.test("a real cancellation reports its reason landed — the call where it definitely did")
func TestRealCancellationReportsReason(t *testing.T) {
	// CAN FAIL: change `outcome != "noop"` in StageWriteBody to == and this comes back false.
	got := body(t, "cancelled", StageWriteResult{Outcome: "changed", FromStatus: "proposal", ToStatus: "cancelled", Version: 3})
	if want := `{"tripId":"` + trip + `","status":"cancelled","previousStatus":"proposal","version":3,"changed":true,"cancellationReasonUpdated":true}`; got != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

// Deno.test("an outcome the helper does not know throws rather than reporting no change")
func TestUnknownOutcomeThrows(t *testing.T) {
	// A fourth outcome means the SQL moved and this layer did not: a deploy-order bug. A
	// plain error is a bodyless 500 with the outcome in the function log.
	_, err := StageWriteBody(trip, "booked", StageWriteResult{Outcome: "reopened", FromStatus: "cancelled", ToStatus: "booked", Version: 9})
	if err == nil {
		t.Fatal("want an error")
	}
	// Not an HttpError: the caller did nothing wrong, so this is a 500 and not a 4xx.
	if _, isHTTP := problem.As(err); isHTTP {
		t.Fatalf("want a plain error, got an HttpError: %v", err)
	}
	if err.Error() != "unhandled agent_set_trip_status outcome: reopened" {
		t.Fatalf("message %q", err.Error())
	}
}

// Deno.test("an aal1 agent is refused before any database read")
func TestAAL1IsRefusedBeforeLookup(t *testing.T) {
	_, err := RequireAgentID(ctx(func(c *caller.Context) { c.AAL = "aal1" }), unreachable(t))
	status, detail := rejection(t, err)
	if status != 403 || detail != MFARequired {
		t.Fatalf("got %d %q", status, detail)
	}
}

// Deno.test("an aal1 ARCHIVED agent hears about MFA, not about the archive")
func TestAAL1ArchivedHearsAboutMFA(t *testing.T) {
	// The status lookup is what reveals "closed"; an unverified session never gets that far.
	_, err := RequireAgentID(ctx(func(c *caller.Context) { c.AAL = "aal1" }),
		(&fakeLookup{status: "archived", found: true}).lookup)
	if _, detail := rejection(t, err); detail != MFARequired {
		t.Fatalf("detail %q", detail)
	}
}

// Deno.test("a client is refused on role, whatever their aal")
func TestClientRefusedOnRoleWhateverAAL(t *testing.T) {
	_, err := RequireAgentID(ctx(func(c *caller.Context) {
		c.Role, c.AgentID, c.AAL = caller.RoleClient, nil, "aal1"
	}), unreachable(t))
	if _, detail := rejection(t, err); detail != "This is the advisor's side of the platform." {
		t.Fatalf("detail %q", detail)
	}
}
