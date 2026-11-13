// Package pushdispatch ports supabase/functions/push-dispatch: §3.10 Stage 3b, send what the
// queue says is due (Screen Inventory §3.10.7, Data-Model §12.7).
//
// NO HUMAN CALLER. pg_cron runs `push_dispatch_tick()` every minute; when there is work it posts
// here. The registry's cron gate checks STA_CRON_SECRET before this code runs (ruling 13), which
// is the job requireServiceRole did in Deno; any other caller never gets here.
//
// One pass:
//  1. Claim what is due (`push_claim_due`, SKIP LOCKED, so two overlapping ticks never send the
//     same row twice). The SQL already cleared any thread read in the meantime.
//  2. Per advisor: each live row is its own notification; everything that waited through rest
//     hours goes out as ONE summary (ruling 6).
//  3. Each row is finished: sent, or back to pending for a retry (three tries, then failed).
//  4. Devices the push service reports gone are forgotten.
//  5. Threads read after their notification went get a silent dismiss on every PHONE. Not
//     browsers: a push that shows nothing makes Chrome draw its own "updated in the background"
//     notice, and Safari can revoke a subscription that does it repeatedly.
//
// A pass answers 200 with what it did, and logs one line of counts (never a token, an endpoint
// or a word of a message), so a run that went wrong shows up somewhere a person looks. No keys
// at all is a 500 BEFORE anything is claimed, so a misconfigured service leaves rows pending
// rather than burning their retries. Android goes through FCM HTTP v1 with no words in the
// payload; browsers through Web Push (RFC 8291 and 8292, package webpush); iOS is skipped.
package pushdispatch

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/push"
)

// batch is how many rows one pass claims (BATCH).
const batch = 50

// sendTimeout bounds each request to Google, Mozilla, Apple or Microsoft, as
// AbortSignal.timeout(10_000) did.
const sendTimeout = 10 * time.Second

// httpClient is the client every send and token exchange uses. It never follows a redirect:
// the endpoint allowlist was checked on THIS url, not wherever it points, and a token must not
// be copied to another host.
var httpClient = &http.Client{
	Timeout:       sendTimeout,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// tokens caches the FCM access token across passes, as the Deno module's `cached` did across
// warm invocations.
var tokens = &tokenCache{}

// backend is what a pass needs from the service client (*service.Client).
type backend interface {
	RPC(ctx context.Context, fn string, args any, out any) error
}

// errNoKeys is the 500 a pass with neither platform's keys answers.
var errNoKeys = errors.New("push keys unset: set VAPID_* (web) and/or FCM_SERVICE_ACCOUNT_JSON (Android)")

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	return serve(d, r, d.DB, httpClient, tokens)
}

// Options are what a test may replace. The zero value is Func.
type Options struct {
	// HTTP carries every send and token exchange. Nil is the production client (10 s, never
	// following a redirect). A test's client gets a token cache of its own.
	HTTP *http.Client
}

// New is the function with o: the differential test runs it against the local stack with a
// transport that answers for Google, Mozilla and Apple, so nothing is ever really sent.
func New(o Options) edge.Func {
	if o.HTTP == nil {
		return Func
	}
	cache := &tokenCache{}
	return func(d *edge.Deps, r *http.Request) (*edge.Reply, error) { return serve(d, r, d.DB, o.HTTP, cache) }
}

func serve(d *edge.Deps, r *http.Request, db backend, hc *http.Client, cache *tokenCache) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.Forbidden("Use POST to run the dispatcher.")
	}
	// A pass finishes what it claimed even if the tick stops waiting (pg_net gives up after 20
	// s): the Deno function ran on after its caller left, and a pass cut short would leave
	// claimed rows 'sending' until the five-minute reclaim counts them as a failed try.
	ctx := context.WithoutCancel(r.Context())

	// One sender per platform, each only if its keys are set. With neither there is nothing to
	// do, and this refuses BEFORE claiming, so rows wait as pending rather than burning tries.
	// A platform without keys answers "error" for its devices: a row whose advisor has only
	// that kind of device retries and then fails, visibly, rather than being marked sent.
	vapid := vapidFromEnv(d.Env)
	sa := serviceAccountFromEnv(d.Env, d.Log)
	if vapid == nil && sa == nil {
		return nil, errNoKeys
	}
	var s senders
	if vapid != nil {
		s.web = newWebSender(ctx, *vapid, hc, d.Now).send
	}
	if sa != nil {
		s.android = newFCMSender(ctx, *sa, hc, cache, d.Now, d.Log).send
	}

	p := &pass{db: db, send: s.send, now: d.Now(), log: d.Log, devicesOf: map[string][]push.Device{}, isGone: map[string]bool{}}
	err := p.run(ctx)
	// One line per run, counts only.
	attrs := []any{"claimed", p.claimed, "sent", p.sent, "retried", p.retried, "dismissed", p.dismissed, "gone", len(p.gone)}
	if err != nil {
		d.Log.Warn("push-dispatch run failed", append(attrs, "error", label(err))...)
		return nil, err
	}
	d.Log.Info("push-dispatch run", attrs...)
	return edge.OK(js.O("sent", p.sent, "retried", p.retried, "dismissed", p.dismissed, "gone", len(p.gone)))
}

// senders are this pass's per-platform senders; nil when that platform's keys are unset.
type senders struct {
	web, android push.DeviceSender
}

func (s senders) send(d push.Device, p push.Payload) (push.DeviceOutcome, error) {
	// §3.12.3: Android shows a trip request since §3.12 PR 4; iOS is not built yet. Skipped, not
	// failed, so an iPhone-only advisor's row is not retried for it. A lead's message (§3.8)
	// likewise.
	if k := p.PayloadKind(); (k == push.KindQuoteRequest || k == push.KindLeadMessage) && d.Platform == "ios" {
		return push.OutcomeSkipped, nil
	}
	var sender push.DeviceSender
	switch d.Platform {
	case "web":
		sender = s.web
	case "android":
		sender = s.android
	}
	if sender != nil {
		return sender(d, p)
	}
	// iOS is not built yet; a missing key is a misconfiguration worth seeing.
	if d.Platform == "ios" {
		return push.OutcomeSkipped, nil
	}
	return push.OutcomeError, nil
}

// owedDismiss is a row `push_claim_dismissals` hands out.
type owedDismiss struct {
	AgentID        string  `json:"agent_id"`
	ConversationID string  `json:"conversation_id"`
	ReadUpTo       *string `json:"read_up_to"`
}

// pass is one run.
type pass struct {
	db   backend
	send push.DeviceSender
	now  time.Time
	log  *slog.Logger

	devicesOf map[string][]push.Device
	gone      []string // in the order first reported, as a Set iterates
	isGone    map[string]bool

	claimed, sent, retried, dismissed int
}

func (p *pass) loadDevices(ctx context.Context, agentID string) ([]push.Device, error) {
	if known, ok := p.devicesOf[agentID]; ok {
		return known, nil
	}
	var list []push.Device
	if err := p.db.RPC(ctx, "push_devices_for_agent", js.O("p_agent_id", agentID), &list); err != nil {
		return nil, fmt.Errorf("device lookup failed: %w", err)
	}
	if list == nil {
		list = []push.Device{} // data ?? []
	}
	p.devicesOf[agentID] = list
	return list, nil
}

func (p *pass) markGone(ids []string) {
	for _, id := range ids {
		if !p.isGone[id] {
			p.isGone[id] = true
			p.gone = append(p.gone, id)
		}
	}
}

// live is the devices not yet reported gone this pass, that keep accepts.
func (p *pass) live(devices []push.Device, keep func(push.Device) bool) []push.Device {
	out := make([]push.Device, 0, len(devices))
	for _, d := range devices {
		if !p.isGone[d.DeviceID] && keep(d) {
			out = append(out, d)
		}
	}
	return out
}

func allDevices(push.Device) bool { return true }

func (p *pass) finish(ctx context.Context, outboxID string, ok bool) error {
	if err := p.db.RPC(ctx, "push_finish", js.O("p_outbox_id", outboxID, "p_ok", ok), nil); err != nil {
		return fmt.Errorf("finish failed: %w", err)
	}
	if ok {
		p.sent++
	} else {
		p.retried++
	}
	return nil
}

func (p *pass) run(ctx context.Context) error {
	// 5 (run FIRST). Dismissals, phones only. Before the new messages, so a dismiss for a thread
	// can never follow, and cancel, a fresh notification for it in the same pass. Best effort:
	// a missed one is a notification to swipe.
	var owed []owedDismiss
	if err := p.db.RPC(ctx, "push_claim_dismissals", js.O("p_limit", batch), &owed); err != nil {
		return fmt.Errorf("dismiss claim failed: %w", err)
	}
	for _, d := range owed {
		devices, err := p.loadDevices(ctx, d.AgentID)
		if err != nil {
			return err
		}
		phones := p.live(devices, func(x push.Device) bool { return x.Platform != "web" })
		result := push.Deliver(phones, push.DismissPayload(d.ConversationID, d.ReadUpTo), p.send)
		p.markGone(result.GoneDeviceIDs)
		p.dismissed++
	}

	// 1 to 3. Due notifications.
	var claimed []push.ClaimedRow
	if err := p.db.RPC(ctx, "push_claim_due", js.O("p_limit", batch), &claimed); err != nil {
		return fmt.Errorf("claim failed: %w", err)
	}
	p.claimed = len(claimed)
	// One advisor's trouble (a device lookup that fails, say) is theirs alone: their unfinished
	// rows go back for a retry and the next advisor is still served, rather than the whole pass
	// dying with every claimed row stuck 'sending'.
	for _, g := range push.GroupByAgent(claimed) {
		p.serveAgent(ctx, g)
	}

	// 4. Forget dead devices.
	for _, id := range p.gone {
		if err := p.db.RPC(ctx, "push_device_gone", js.O("p_device_id", id), nil); err != nil {
			return fmt.Errorf("device cleanup failed: %w", err)
		}
	}
	return nil
}

func (p *pass) serveAgent(ctx context.Context, g push.AgentRows) {
	done := map[string]bool{}
	err := func() error {
		devices, err := p.loadDevices(ctx, g.AgentID)
		if err != nil {
			return err
		}
		for _, s := range push.PlanForAgent(g.Rows, p.now) {
			result := push.Deliver(p.live(devices, allDevices), s.Payload, p.send)
			p.markGone(result.GoneDeviceIDs)
			for _, id := range s.OutboxIDs {
				if err := p.finish(ctx, id, result.OK); err != nil {
					return err
				}
				done[id] = true
			}
		}
		return nil
	}()
	if err == nil {
		return
	}
	p.log.Error("push-dispatch: advisor batch failed", "error", label(err))
	seen := map[string]bool{}
	for _, r := range g.Rows {
		if done[r.OutboxID] || seen[r.OutboxID] {
			continue
		}
		seen[r.OutboxID] = true
		_ = p.finish(ctx, r.OutboxID, false) // best effort, as `.catch(() => undefined)`
	}
}

// label is what a log line may carry of an error: our own prefix, the text before the first
// ": " (the rest can quote a database message, and so a value).
func label(err error) string {
	l, _, _ := strings.Cut(err.Error(), ": ")
	return l
}
