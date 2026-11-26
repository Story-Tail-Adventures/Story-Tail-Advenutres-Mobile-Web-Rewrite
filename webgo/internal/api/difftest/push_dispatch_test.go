//go:build difftest && difftest_background

package difftest

import (
	"context"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/pushdispatch"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["push-dispatch"] = api.Port{Gate: api.GateCron, Fn: pushdispatch.Func}
}

// push-dispatch is a pg_cron function: Deno takes the service-role key as its bearer, Go the
// cron secret (GateCron; the gate's own sentences are pinned by TestCruiseSyncGate's twin in the
// registry, not here). NOTHING IS EVER SENT: neither side has VAPID_* or
// FCM_SERVICE_ACCOUNT_JSON in this stack, and real endpoints are allow-listed to the real push
// services. So both sides refuse every POST with a bare 500 BEFORE claiming anything, and that
// is what these cases prove: a due row stays pending with no try spent, its device stays, and
// nothing is claimed, finished or dismissed. The sends themselves, the claim and finish calls,
// the crypto and the token cache are proven by the Go unit tests in
// internal/api/fn/pushdispatch and internal/domain/webpush (fakes for PostgREST, FCM and a push
// service).

// pushDispatchFixture gives a world its own advisor (no sign-in needed: the dispatcher has no
// caller), a lead of theirs, a lead_message notification due a minute ago, and, when withDevice,
// an Android device of theirs.
func pushDispatchFixture(t *testing.T, w *World, withDevice bool) {
	t.Helper()
	ctx := context.Background()
	agentID, leadID, outboxID := uuid.New(), uuid.New(), uuid.New()
	w.ID("dispatch.agent", agentID)
	w.ID("dispatch.lead", leadID)
	w.ID("dispatch.outbox", outboxID)
	w.Vars["dispatch.agent"] = agentID
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(S.DB.From("agent").Insert(ctx, js.O("id", agentID, "display_name", "Diff Dispatch "+w.Tag,
		"email", "difftest-dispatch-"+w.Tag+"-"+agentID[24:]+"@example.com", "status", "inactive"), nil))
	t.Cleanup(func() {
		ctx := context.Background()
		_ = S.DB.From("push_outbox").Eq("agent_id", agentID).Delete(ctx, nil)
		_ = S.DB.From("lead").Eq("id", leadID).Delete(ctx, nil)
		_ = S.DB.From("agent").Eq("id", agentID).Update(ctx, js.O("status", "archived"), nil)
	})
	must(S.DB.From("lead").Insert(ctx, js.O("id", leadID, "agent_id", agentID,
		"email", "difftest-lead-"+w.Tag+"@example.com", "first_name", "Sam", "source", "website"), nil))
	must(S.DB.From("push_outbox").Insert(ctx, js.O("id", outboxID, "agent_id", agentID, "kind", "lead_message",
		"lead_id", leadID, "message_count", 1, "due_at", js.ISOString(time.Now().Add(-time.Minute)), "held", false), nil))
	if withDevice {
		// A device belongs to a platform user; the world's own advisor lends theirs, and the
		// row is pointed at by agent through push_devices_for_agent only if that user is this
		// agent's. Here it only has to exist and survive.
		deviceID := w.ID("dispatch.device", uuid.New())
		token := w.ID("dispatch.token", "difftest-"+w.Tag+"-dispatch-phone:APA91b")
		must(S.DB.From("push_device").Insert(ctx, js.O("id", deviceID, "platform_user_id", w.Agent.PlatformUserID,
			"platform", "android", "fcm_token", token), nil))
		t.Cleanup(func() { _ = S.DB.From("push_device").Eq("id", deviceID).Delete(context.Background(), nil) })
	}
}

// pushDispatchSnap is the world's notification and device rows: state, tries, claim and send
// times (a claim would set claimed_at), and whether a dismiss is owed.
func pushDispatchSnap(t *testing.T, w *World) string {
	agentID := w.Vars["dispatch.agent"]
	if agentID == "" {
		return "no fixture"
	}
	outbox := S.Rows(t, S.DB.From("push_outbox").
		Select("id,agent_id,kind,lead_id,message_count,held,hold_reason,state,attempts,claimed_at,sent_at,needs_dismiss").
		Eq("agent_id", agentID).Order("id", true))
	devices := S.Rows(t, S.DB.From("push_device").Select("id,platform,fcm_token").
		Like("fcm_token", "*"+w.Tag+"-dispatch-*").Order("id", true))
	return "outbox " + outbox + " devices " + devices
}

func TestPushDispatch(t *testing.T) {
	deno, goW := NewWorlds(t) // the agents lend a platform user for the device case
	cron := func(w *World) string {
		if w.Name == "deno" {
			return S.Service
		}
		return CronSecret
	}
	c := func(name, method, body string, expect int, setup func(*testing.T, *World)) Case {
		return Case{Name: name, Fn: "push-dispatch", Method: method, Token: cron, SkipAudit: true, Expect: expect,
			Setup: setup, Body: func(*World) string { return body }, Snap: pushDispatchSnap}
	}
	fixture := func(withDevice bool) func(*testing.T, *World) {
		return func(t *testing.T, w *World) { pushDispatchFixture(t, w, withDevice) }
	}
	Run(t, deno, goW, []Case{
		// The method comes first.
		c("GET is refused", "GET", "", 403, nil),
		// No keys on either side: a bare 500, before any claim.
		c("the tick's own body, nothing of ours due", "POST", `{"trigger":"cron"}`, 500, nil),
		c("a due row waits as pending, no try spent", "POST", `{"trigger":"cron"}`, 500, fixture(false)),
		c("a due row and a device: both left as they were", "POST", `{"trigger":"cron"}`, 500, fixture(true)),
		c("no body", "POST", "", 500, nil),
		c("a body that is not JSON is never read", "POST", `{"trigger":`, 500, nil),
	})
}
