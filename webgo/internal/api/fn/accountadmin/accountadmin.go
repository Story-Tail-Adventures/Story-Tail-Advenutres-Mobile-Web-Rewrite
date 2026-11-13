// Package accountadmin ports supabase/functions/account-admin: §3.9 Login Support, every
// button on Client Detail's Account admin tab and the merge page (Screens 3.9.1 to 3.9.7,
// 3.9.7 is 3.3.11, and the invite). Rulings: docs/Screen-Inventory.md §3.9 (2026-10-16).
//
// ONE FUNCTION, TEN OPS, matching agent-client: each is requireUser, requireAgentId, the MFA
// gate, the snapshot, then one action. Ten copies of that preamble would be ten places to
// forget the gate.
//
// ── THE MFA GATE ─────────────────────────────────────────────────────────────────
//
// Every op needs an aal2 session. verify_email and merge also need the second factor within
// the last 15 minutes (RequireRecentMfa): marking an address verified that the advisor did
// not see verified, or folding one person's trips into another's, is where a stolen laptop
// does real harm. Lock does NOT need a fresh factor, because locking has to be fast.
//
// ── NOTHING A CLIENT CAN SIGN IN WITH LEAVES THIS FUNCTION EXCEPT BY EMAIL ──────
//
// GenerateLink returns a link and a token hash. They go into BuildSignInEmail and from there
// into the SMTP sender, and nowhere else: not the reply, not a log line, not an audit row,
// not an error. The generated link is never logged, and a send failure is logged through
// ClassifySMTPError, which keeps only the code and the server's words.
//
// ── ORDER OF THE TWO HALVES OF A LOCK ────────────────────────────────────────────
//
// GoTrue's ban (Admin API) and our row (account_admin_set_lock) cannot share a transaction.
// So the Admin API goes FIRST and the row second, and a failed row undoes the Admin API call:
// a ban with no row would leave the tab saying "Active" about a client who cannot sign in.
//
// ── MERGE ────────────────────────────────────────────────────────────────────────
//
// When both records have a sign-in, the retired one is locked, and its GoTrue ban is the same
// two halves as a lock: ban FIRST, then account_admin_merge_clients (which locks the row
// through account_admin_set_lock inside its own transaction), and a merge that does not land
// lifts the ban again, unless the account was already locked before. The SQL is told which
// account was banned and answers `stale` if that is no longer the sign-in it would lock.
//
// ── ANSWERS ──────────────────────────────────────────────────────────────────────
//
// 200 with an `outcome` for every answer the tab draws (sent, capped, duplicate, ...), as the
// house shape (agent-client) does. 4xx only for a malformed request, a missing client (404,
// never 403, so an id's existence is not confirmed) or the MFA gate (403).
package accountadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/signinemail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// ops in the order the "op must be one of" sentence lists them.
var ops = []string{
	"reset",
	"magic_link",
	"invite",
	"verify_email",
	"lock",
	"unlock",
	"sign_out_everywhere",
	"flag",
	"unflag",
	"merge",
}

const (
	// minVerifyNote is long enough that one letter is not a record of how the advisor checked.
	minVerifyNote = 20
	maxNote       = 500
	// banForever is GoTrue's "forever": a ban is lifted only by unlock.
	banForever = "876000h"
	// recentMfa is requireRecentMfa's default window, in seconds.
	recentMfa = 900
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	// Not cancelled when the caller disconnects (review of #192, proven): a lock is GoTrue's
	// ban then our row, and the step that undoes the ban if the row fails must run even after
	// the caller has gone, or the client signs in again while the row says locked. Each call
	// still has its own client timeout, so nothing waits forever. supabase-js calls were not
	// tied to the request either.
	ctx := context.WithoutCancel(r.Context())
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	agentID, err := guard.RequireAgentID(ctx, d.DB, c)
	if err != nil {
		return nil, err
	}
	if err := requireAal2(c); err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	op, clientID, err := parseRequest(payload)
	if err != nil {
		return nil, err
	}
	h := &handler{
		db: liveStore{d.DB}, send: mail.Send, env: d.Env, now: d.Now, log: d.Log,
		c: c, agentID: agentID,
	}
	return h.run(ctx, op, clientID, payload)
}

// parseRequest reads the op and the client, in that order.
func parseRequest(payload js.Value) (op, clientID string, err error) {
	op, err = requireOp(payload.Get("op"))
	if err != nil {
		return "", "", err
	}
	clientID, ok := payload.Get("clientId").Str()
	if !ok || !uuid.IsUUID(clientID) {
		return "", "", problem.BadRequest("clientId must be a uuid.")
	}
	return op, clientID, nil
}

func requireOp(v js.Value) (string, error) {
	if s, ok := v.Str(); ok && slices.Contains(ops, s) {
		return s, nil
	}
	return "", problem.BadRequest("op must be one of: " + strings.Join(ops, ", ") + ".")
}

// text is a required, trimmed string between min and max UTF-16 units.
func text(v js.Value, field string, min, max int) (string, error) {
	s, ok := v.Str()
	if !ok {
		return "", problem.BadRequest(field + " is required.")
	}
	trimmed := js.Trim(s)
	if js.Len(trimmed) < min {
		if min > 1 {
			return "", problem.BadRequest(field + " needs at least " + strconv.Itoa(min) + " characters.")
		}
		return "", problem.BadRequest(field + " is required.")
	}
	if js.Len(trimmed) > max {
		return "", problem.BadRequest(field + " is too long.")
	}
	return trimmed, nil
}

// requireAal2 is aal2 for every op. The message is what the tab shows under its gate.
// (requireAgentId already refuses aal1 with its own sentence, so this never answers today.)
func requireAal2(c *caller.Context) error {
	if c.AAL != "aal2" {
		return problem.Forbidden("Set up two-step sign-in first.")
	}
	return nil
}

// ---- the database and GoTrue, behind an interface the unit tests fake ----

// store is the service client's calls this function makes.
type store interface {
	audit.Inserter
	RPC(ctx context.Context, fn string, args any, out any) error
	UpdateUserByID(ctx context.Context, id string, attributes any) (service.AdminUser, error)
	GenerateLink(ctx context.Context, p service.GenerateLinkParams) (service.GeneratedLink, error)
	// agentDisplayName is `agent.display_name`, or nil (a failed read is nil, as
	// `data?.display_name ?? null` was).
	agentDisplayName(ctx context.Context, agentID string) *string
	// accountLocked is whether `account.locked_at` is set (a failed read is "not locked").
	accountLocked(ctx context.Context, accountID string) bool
}

type liveStore struct{ *service.Client }

func (s liveStore) agentDisplayName(ctx context.Context, agentID string) *string {
	var row struct {
		DisplayName *string `json:"display_name"`
	}
	found, err := s.From("agent").Select("display_name").Eq("id", agentID).MaybeSingle(ctx, &row)
	if err != nil || !found {
		return nil
	}
	return row.DisplayName
}

func (s liveStore) accountLocked(ctx context.Context, accountID string) bool {
	var row struct {
		LockedAt *string `json:"locked_at"`
	}
	found, err := s.From("account").Select("locked_at").Eq("id", accountID).MaybeSingle(ctx, &row)
	return err == nil && found && truthy(row.LockedAt)
}

// sender is mail.Send.
type sender func(ctx context.Context, cfg mail.Config, m mail.Message) (string, error)

type handler struct {
	db      store
	send    sender
	env     func(string) string
	now     func() time.Time
	log     *slog.Logger
	c       *caller.Context
	agentID string
}

func (h *handler) logger() *slog.Logger {
	if h.log == nil {
		return slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return h.log
}

func (h *handler) run(ctx context.Context, op, clientID string, payload js.Value) (*edge.Reply, error) {
	switch op {
	case "merge":
		return h.merge(ctx, clientID, payload)
	case "reset", "magic_link", "invite":
		return h.sendSignInEmail(ctx, clientID, signinemail.Kind(op))
	case "verify_email":
		return h.verifyEmail(ctx, clientID, payload)
	case "lock", "unlock":
		return h.setLock(ctx, op, clientID, payload)
	case "sign_out_everywhere":
		return h.signOutEverywhere(ctx, clientID)
	}
	return h.setFlag(ctx, op == "flag", clientID, payload)
}

// withAudit adds the actor arguments every account_admin_* write takes. A missing address or
// user agent is left out (`?? undefined`), so the SQL default (NULL) applies.
func (h *handler) withAudit(o js.Ordered) js.Ordered {
	return o.Spread(js.O(
		"p_actor_user_id", h.c.PlatformUserID,
		"p_ip", orUndef(h.c.IP),
		"p_user_agent", orUndef(h.c.UserAgent),
	))
}

// rpc calls fn and returns its raw reply, or nil for SQL NULL.
func (h *handler) rpc(ctx context.Context, fn string, args any) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := h.db.RPC(ctx, fn, args, &raw); err != nil {
		return nil, err
	}
	if t := bytes.TrimSpace(raw); len(t) == 0 || string(t) == "null" {
		return nil, nil
	}
	return raw, nil
}

// value reads a raw reply as JSON.parse would (nil is null).
func value(raw json.RawMessage) js.Value {
	if raw == nil {
		return js.NullValue()
	}
	v, err := js.Parse(raw)
	if err != nil {
		return js.NullValue()
	}
	return v
}

func (h *handler) write(ctx context.Context, eventType, clientID string, metadata js.Ordered) error {
	return audit.Write(ctx, h.db, h.c, audit.Spec{
		EventType: eventType, TargetEntity: "client", TargetID: clientID, Metadata: metadata,
	})
}

func refused(reason any) (*edge.Reply, error) {
	return edge.OK(js.O("outcome", "refused", "reason", reason))
}

func outcome(o string) (*edge.Reply, error) { return edge.OK(js.O("outcome", o)) }

// ---- the snapshot ----

// snapshot is account_admin_target(), as the SQL builds it. The sign-in half is absent when
// hasSignIn is false.
type snapshot struct {
	ClientID               string   `json:"clientId"`
	FirstName              *string  `json:"firstName"`
	LastName               *string  `json:"lastName"`
	ClientEmail            *string  `json:"clientEmail"`
	ClientArchived         bool     `json:"clientArchived"`
	DuplicateEmail         bool     `json:"duplicateEmail"`
	DuplicateEmailClientID *string  `json:"duplicateEmailClientId"`
	HasSignIn              bool     `json:"hasSignIn"`
	AccountID              *string  `json:"accountId"`
	SignInEmail            *string  `json:"signInEmail"`
	EmailVerifiedAt        *string  `json:"emailVerifiedAt"`
	InvitedAt              *string  `json:"invitedAt"`
	HasPassword            bool     `json:"hasPassword"`
	Providers              []string `json:"providers"`
	LockedAt               *string  `json:"lockedAt"`
	BannedUntil            *string  `json:"bannedUntil"`
	DuplicateSignInEmail   bool     `json:"duplicateSignInEmail"`
}

func (h *handler) snapshot(ctx context.Context, clientID string) (*snapshot, error) {
	raw, err := h.rpc(ctx, "account_admin_target", js.O("p_agent_id", h.agentID, "p_client_id", clientID))
	if err != nil {
		return nil, fmt.Errorf("account snapshot failed: %w", err)
	}
	if raw == nil {
		return nil, problem.NotFound("No such client.")
	}
	var s snapshot
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("account snapshot unreadable: %w", err)
	}
	return &s, nil
}

// banned is a GoTrue ban still in force. Normally only with lockedAt; alone, a lock's row
// half failed. `Date.parse(bannedUntil) > Date.now()`, in milliseconds.
func banned(s *snapshot, now time.Time) bool {
	if !truthy(s.BannedUntil) {
		return false
	}
	t, ok := js.ParseDate(*s.BannedUntil)
	return ok && t.UnixMilli() > now.UnixMilli()
}

// ---- sign-in emails ----

// emailRefusal is why this kind cannot go to this client, in the tab's words, or "" when it
// can.
func emailRefusal(kind signinemail.Kind, s *snapshot, now time.Time) string {
	if kind == signinemail.Invite {
		if s.HasSignIn && (truthy(s.EmailVerifiedAt) || !truthy(s.InvitedAt)) {
			return "They already have a sign-in."
		}
		if s.ClientArchived {
			return "Restore this client before inviting them."
		}
		if s.DuplicateEmail {
			return "Another client record has this email. Merge them first."
		}
		if !truthy(s.ClientEmail) {
			return "Add an email address first."
		}
		return ""
	}
	if !s.HasSignIn {
		return "They haven't signed in yet. Send an invite instead."
	}
	if truthy(s.LockedAt) || banned(s, now) {
		return "Their account is locked. Unlock it first."
	}
	// Reset is refused only for a Google- or Apple-only sign-in. An email sign-in with no
	// password yet (an accepted invite, or one verified by hand) is exactly who a recovery
	// link helps: it lets them choose one. Found clicking through 2026-10-16.
	if kind == signinemail.Reset && !s.HasPassword && slices.ContainsFunc(s.Providers, func(p string) bool { return p != "email" }) {
		return "They sign in with Google or Apple, so there's no password to reset."
	}
	return ""
}

// linkType is generateLink's type for each kind.
var linkType = map[signinemail.Kind]string{
	signinemail.Reset:     "recovery",
	signinemail.MagicLink: "magiclink",
	signinemail.Invite:    "invite",
}

func (h *handler) sendSignInEmail(ctx context.Context, clientID string, kind signinemail.Kind) (*edge.Reply, error) {
	s, err := h.snapshot(ctx, clientID)
	if err != nil {
		return nil, err
	}
	if r := emailRefusal(kind, s, h.now()); r != "" {
		return refused(r)
	}

	cfg, err := email.ConfigFromEnv(h.env)
	if err != nil {
		return nil, fmt.Errorf("email settings refused: %w", err)
	}
	if cfg == nil {
		return nil, problem.New(http.StatusServiceUnavailable, "Service Unavailable", "Email isn't set up yet, so nothing was sent.")
	}

	// Claim BEFORE making the link: a capped request never creates one.
	claimRaw, err := h.rpc(ctx, "account_admin_claim_signin_email", h.withAudit(js.O(
		"p_agent_id", h.agentID,
		"p_audit_id", uuid.New(),
		"p_client_id", clientID,
		"p_kind", string(kind),
	)))
	if err != nil {
		return nil, fmt.Errorf("claim failed: %w", err)
	}
	switch claim, _ := value(claimRaw).Str(); claim {
	case "not_found":
		return nil, problem.NotFound("No such client.")
	case "capped":
		return outcome("capped")
	}

	to := deref(s.SignInEmail)
	if kind == signinemail.Invite {
		to = deref(s.ClientEmail)
	}
	params := service.GenerateLinkParams{Type: linkType[kind], Email: to}
	if kind == signinemail.Invite {
		// handle_new_user() reads these: this advisor owns the sign-in's client, and the name is
		// the advisor's spelling. The bind below then points it at THIS record.
		params.Data = js.O("agent_id", h.agentID, "first_name", deref(s.FirstName), "last_name", deref(s.LastName))
	}
	link, err := h.db.GenerateLink(ctx, params)
	if err != nil || link.Properties.HashedToken == "" {
		// Status and code only; the error carries nothing secret, but its message is GoTrue's.
		status, code := adminError(err)
		h.logger().Warn("account-admin generateLink failed", "kind", string(kind), "status", status, "code", code)
		if err := h.write(ctx, "client.signin_email_failed", clientID, js.O(
			"kind", string(kind), "stage", "link", "code", code,
		)); err != nil {
			return nil, err
		}
		return outcome("failed")
	}
	if got := link.Properties.VerificationType; got != signinemail.VerifyType[kind] {
		return nil, fmt.Errorf("generateLink answered %s for %s", got, kind)
	}

	if kind == signinemail.Invite {
		boundRaw, err := h.rpc(ctx, "account_admin_bind_invite", h.withAudit(js.O(
			"p_agent_id", h.agentID,
			"p_audit_id", uuid.New(),
			"p_client_id", clientID,
			"p_account_id", link.User.ID,
		)))
		if err != nil {
			return nil, fmt.Errorf("invite bind failed: %w", err)
		}
		if bound, _ := value(boundRaw).Str(); bound != "bound" && bound != "already" {
			// An address that already belongs to someone else's sign-in, most likely. Nothing
			// is sent.
			return refused("That email already has a different sign-in.")
		}
	}

	built, err := signinemail.BuildSignInEmail(signinemail.Input{
		Kind:            kind,
		To:              to,
		ClientFirstName: s.FirstName,
		AgentFirstName:  h.db.agentDisplayName(ctx, h.agentID),
		TokenHash:       link.Properties.HashedToken,
		MessageKey:      uuid.New(),
	}, *cfg)
	if err != nil {
		return nil, err
	}

	if _, err := h.send(ctx, smtpConfig(*cfg), message(built)); err != nil {
		permanent, why := email.ClassifySMTPError(smtpError(err))
		h.logger().Warn("account-admin send failed", "kind", string(kind), "permanent", permanent, "error", why)
		if err := h.write(ctx, "client.signin_email_failed", clientID, js.O(
			"kind", string(kind), "stage", "send", "permanent", permanent,
		)); err != nil {
			return nil, err
		}
		return outcome("failed")
	}

	if err := h.write(ctx, "client.signin_email_sent", clientID, js.O("kind", string(kind))); err != nil {
		return nil, err
	}
	return edge.OK(js.O("outcome", "sent", "kind", string(kind)))
}

// smtpConfig is smtpTransport's connection: the login only when both halves are set.
func smtpConfig(cfg email.Config) mail.Config {
	t := email.SMTPTransport(cfg)
	return mail.Config{Host: t.Host, Port: t.Port, Secure: t.ImplicitTLS, User: t.User, Password: t.Password}
}

// message is the built email as the sender takes it. Every value was built by
// BuildSignInEmail; no Reply-To, as the Deno function set none.
func message(o email.Outgoing) mail.Message {
	headers := make([]mail.Header, len(o.Headers))
	for i, h := range o.Headers {
		headers[i] = mail.Header{Name: h.Name, Value: h.Value}
	}
	return mail.Message{
		FromName: o.From.Name, FromAddress: o.From.Address, To: o.To,
		Subject: o.Subject, Text: o.Text, HTML: o.HTML, MessageID: o.MessageID, Headers: headers,
	}
}

// smtpError is the sender's error shaped like nodemailer's, for ClassifySMTPError:
// responseCode (absent when there was no reply), response and code.
func smtpError(err error) js.Value {
	var me *mail.Error
	if !errors.As(err, &me) {
		return js.ObjectValue()
	}
	var kv []any
	if me.Code != 0 {
		kv = append(kv, "responseCode", js.NumberValue(float64(me.Code)))
	}
	kv = append(kv, "response", js.StringValue(me.Text), "code", js.StringValue(me.Kind))
	return js.ObjectValue(kv...)
}

// adminError is an Admin API error's `status` and `code` as auth-js 2.112 reported them
// (nil for a code there is none of). auth-js answered every 500-504 and 520-530 with an
// AuthRetryableFetchError, which has a status and NO code, whatever GoTrue's body said; a
// failed fetch had status 0 and no code; anything else was an AuthApiError carrying GoTrue's
// error code. service.Error keeps GoTrue's code either way, so the retryable statuses are
// mapped here.
//
// (auth-js also sent X-Supabase-Api-Version: 2024-01-01, which the service client does not.
// Without it GoTrue answers in its older shape, with the same error code in `error_code`, but
// a database error's `message` can then quote the address. Nothing here reads the message.)
func adminError(err error) (status, code any) {
	var se *service.Error
	if !errors.As(err, &se) {
		return nil, nil
	}
	if se.Status == 0 || retryableStatus(se.Status) || se.Code == "" {
		return se.Status, nil
	}
	return se.Status, se.Code
}

func retryableStatus(s int) bool { return (s >= 500 && s <= 504) || (s >= 520 && s <= 530) }

// ---- 3.9.4 verify email ----

func (h *handler) verifyEmail(ctx context.Context, clientID string, payload js.Value) (*edge.Reply, error) {
	if err := caller.RequireRecentMfa(h.c, recentMfa, h.now()); err != nil {
		return nil, err
	}
	note, err := text(payload.Get("note"), "How you confirmed it", minVerifyNote, maxNote)
	if err != nil {
		return nil, err
	}
	s, err := h.snapshot(ctx, clientID)
	if err != nil {
		return nil, err
	}
	if !s.HasSignIn || !truthy(s.AccountID) {
		return refused("They haven't signed in yet.")
	}
	if truthy(s.EmailVerifiedAt) {
		return outcome("noop")
	}
	// The adoption trigger matches the SIGN-IN address. If the record's address was edited away
	// from it, the duplicate check on the record proves nothing, so refuse outright.
	if js.ToLower(deref(s.SignInEmail)) != js.ToLower(deref(s.ClientEmail)) {
		return refused("Their sign-in address and the one on their record are different. Fix the record first.")
	}
	if s.DuplicateEmail || s.DuplicateSignInEmail {
		// Confirming fires the adoption trigger, which would bind this sign-in to that record.
		return edge.OK(js.O("outcome", "duplicate", "duplicateClientId", s.DuplicateEmailClientID))
	}
	account := *s.AccountID
	// Audited BEFORE GoTrue is called (review finding): this is the riskiest op on the tab, and
	// a confirmation that lands with no record of who made it is the gap rule 3 exists for.
	if err := h.write(ctx, "client.email_verified_manually", clientID, js.O("accountId", account, "note", note)); err != nil {
		return nil, err
	}
	if _, err := h.db.UpdateUserByID(ctx, account, js.O("email_confirm", true)); err != nil {
		status, code := adminError(err)
		if werr := h.write(ctx, "client.email_verify_failed", clientID, js.O(
			"accountId", account, "status", status, "code", code,
		)); werr != nil {
			return nil, werr
		}
		return nil, fmt.Errorf("email confirm failed: %w", err)
	}
	return outcome("changed")
}

// ---- 3.9.5 lock / unlock ----

func (h *handler) setLock(ctx context.Context, op, clientID string, payload js.Value) (*edge.Reply, error) {
	reason, err := text(payload.Get("reason"), "Reason", 1, maxNote)
	if err != nil {
		return nil, err
	}
	s, err := h.snapshot(ctx, clientID)
	if err != nil {
		return nil, err
	}
	if !s.HasSignIn || !truthy(s.AccountID) {
		return refused("They haven't signed in yet.")
	}
	lock := op == "lock"
	// A ban with no row (a lock whose second half failed and could not be undone) still
	// blocks sign-in, so Unlock must not call that a no-op.
	if (lock && truthy(s.LockedAt)) || (!lock && !truthy(s.LockedAt) && !banned(s, h.now())) {
		return outcome("noop")
	}

	account := *s.AccountID
	ban := func(duration string) error {
		_, err := h.db.UpdateUserByID(ctx, account, js.O("ban_duration", duration))
		return err
	}
	first, undo := "none", banForever
	if lock {
		first, undo = banForever, "none"
	}
	if err := ban(first); err != nil {
		return nil, fmt.Errorf("ban change failed: %w", err)
	}

	raw, err := h.rpc(ctx, "account_admin_set_lock", h.withAudit(js.O(
		"p_agent_id", h.agentID,
		"p_audit_id", uuid.New(),
		"p_client_id", clientID,
		"p_lock", lock,
		"p_reason", reason,
	)))
	if err != nil || raw == nil {
		// Undo the Admin API half so the tab and GoTrue agree. See the package comment.
		if uerr := ban(undo); uerr != nil {
			status, _ := adminError(uerr)
			h.logger().Error("account-admin could not undo ban change", "op", op, "status", status)
		}
		if err != nil {
			return nil, fmt.Errorf("lock row failed: %w", err)
		}
		return nil, errors.New("lock row failed: no row")
	}
	return edge.OK(js.O("outcome", "changed", "sessionsEnded", orUndefValue(value(raw).Get("sessionsEnded"))))
}

// ---- sign out everywhere ----

func (h *handler) signOutEverywhere(ctx context.Context, clientID string) (*edge.Reply, error) {
	raw, err := h.rpc(ctx, "account_admin_sign_out_everywhere", h.withAudit(js.O(
		"p_agent_id", h.agentID,
		"p_audit_id", uuid.New(),
		"p_client_id", clientID,
	)))
	if err != nil {
		return nil, fmt.Errorf("sign out failed: %w", err)
	}
	if raw == nil {
		return nil, problem.NotFound("No such client, or they haven't signed in yet.")
	}
	return edge.OK(js.O("outcome", "changed", "sessionsEnded", value(raw)))
}

// ---- 3.9.6 flag / unflag ----

func (h *handler) setFlag(ctx context.Context, flag bool, clientID string, payload js.Value) (*edge.Reply, error) {
	authEventID, ok := payload.Get("authEventId").Str()
	if !ok || !uuid.IsUUID(authEventID) {
		return nil, problem.BadRequest("authEventId must be a uuid.")
	}
	raw, err := h.rpc(ctx, "account_admin_set_flag", h.withAudit(js.O(
		"p_agent_id", h.agentID,
		"p_audit_id", uuid.New(),
		"p_client_id", clientID,
		"p_auth_event_id", authEventID,
		"p_flag", flag,
	)))
	if err != nil {
		return nil, fmt.Errorf("flag failed: %w", err)
	}
	v := value(raw)
	if s, ok := v.Str(); ok && s == "not_found" {
		return nil, problem.NotFound("No such sign-in.")
	}
	return edge.OK(js.O("outcome", v))
}

// ---- merge (3.9.7 / 3.3.11) ----

// mergePreview is client_merge_preview(), the parts this function decides from.
type mergePreview struct {
	Keep struct {
		Version int64 `json:"version"`
	} `json:"keep"`
	Retire struct {
		Version int64 `json:"version"`
		SignIn  *struct {
			AccountID *string `json:"accountId"`
			Locked    bool    `json:"locked"`
		} `json:"signIn"`
	} `json:"retire"`
	SignInPlan string  `json:"signInPlan"`
	Blocked    *string `json:"blocked"`
}

// mergeResult is account_admin_merge_clients()'s answer.
type mergeResult struct {
	Outcome *string         `json:"outcome"`
	Reason  *string         `json:"reason"`
	Counts  json.RawMessage `json:"counts"`
}

var mergeRefusals = map[string]string{
	"kept_archived": "Restore the record you're keeping before merging into it.",
	"companion_cap": "Together they'd have more than 12 companions. Archive a few first.",
	"name_required": "The record you keep needs a first and last name.",
}

// version is a positive integer, kept as the JavaScript number it was.
func version(v js.Value, field string) (float64, error) {
	n, ok := v.Num()
	if !ok || !js.IsInteger(n) || n < 1 {
		return 0, problem.BadRequest(field + " must be a positive integer.")
	}
	return n, nil
}

var choiceKey = regexp.MustCompile(`^[a-z_]{1,40}$`)

// choices is the picker's flips: {"<field>": "keep" | "retire"}. Absent is none.
func choices(v js.Value) (js.Ordered, error) {
	out := js.O()
	if v.IsUndefined() {
		return out, nil
	}
	o, ok := v.Object()
	if !ok {
		return nil, problem.BadRequest("choices must be an object.")
	}
	for _, key := range o.Keys() {
		pick, isStr := o.Get(key).Str()
		if !choiceKey.MatchString(key) || !isStr || (pick != "keep" && pick != "retire") {
			return nil, problem.BadRequest(`Each choice is a field name and "keep" or "retire".`)
		}
		// `out[key] = pick` on a plain object: assigning "__proto__" a string calls the
		// prototype setter, which ignores it, so that key never reached the SQL.
		if key == "__proto__" {
			continue
		}
		out = out.Set(key, pick)
	}
	return out, nil
}

func (h *handler) merge(ctx context.Context, keepID string, payload js.Value) (*edge.Reply, error) {
	if err := caller.RequireRecentMfa(h.c, recentMfa, h.now()); err != nil {
		return nil, err
	}
	retireID, ok := payload.Get("otherClientId").Str()
	if !ok || !uuid.IsUUID(retireID) {
		return nil, problem.BadRequest("otherClientId must be a uuid.")
	}
	keepVersion, err := version(payload.Get("keepVersion"), "keepVersion")
	if err != nil {
		return nil, err
	}
	retireVersion, err := version(payload.Get("otherVersion"), "otherVersion")
	if err != nil {
		return nil, err
	}
	picks, err := choices(payload.Get("choices"))
	if err != nil {
		return nil, err
	}

	raw, err := h.rpc(ctx, "client_merge_preview", js.O(
		"p_agent_id", h.agentID,
		"p_keep_id", keepID,
		"p_retire_id", retireID,
	))
	if err != nil {
		return nil, fmt.Errorf("merge preview failed: %w", err)
	}
	if raw == nil {
		return nil, problem.NotFound("No such client.")
	}
	var preview mergePreview
	if err := json.Unmarshal(raw, &preview); err != nil {
		return nil, fmt.Errorf("merge preview unreadable: %w", err)
	}

	if truthy(preview.Blocked) {
		return refused(refusalOrUndef(*preview.Blocked))
	}
	if float64(preview.Keep.Version) != keepVersion || float64(preview.Retire.Version) != retireVersion {
		return outcome("stale")
	}

	// Both sign in: ban the retired one first. See the package comment.
	var lockAccount *string
	if preview.SignInPlan == "lock_retired" && preview.Retire.SignIn != nil {
		lockAccount = preview.Retire.SignIn.AccountID
	}
	wasLocked := preview.Retire.SignIn != nil && preview.Retire.SignIn.Locked
	ban := func(duration string) error {
		_, err := h.db.UpdateUserByID(ctx, *lockAccount, js.O("ban_duration", duration))
		return err
	}
	if truthy(lockAccount) {
		if err := ban(banForever); err != nil {
			return nil, fmt.Errorf("ban failed: %w", err)
		}
	}

	// The SQL takes NULL for "banned nothing".
	var expect any
	if lockAccount != nil {
		expect = *lockAccount
	}
	resultRaw, rpcErr := h.rpc(ctx, "account_admin_merge_clients", h.withAudit(js.O(
		"p_agent_id", h.agentID,
		"p_audit_id", uuid.New(),
		"p_keep_id", keepID,
		"p_retire_id", retireID,
		"p_keep_version", int64(keepVersion),
		"p_retire_version", int64(retireVersion),
		"p_choices", picks,
		"p_expect_lock_account", expect,
	)))
	var result mergeResult
	if rpcErr == nil && resultRaw != nil {
		if err := json.Unmarshal(resultRaw, &result); err != nil {
			rpcErr = fmt.Errorf("merge result unreadable: %w", err)
		}
	}

	if rpcErr != nil || deref(result.Outcome) != "merged" {
		if truthy(lockAccount) && !wasLocked {
			// An ambiguous failure may have committed and only the answer was lost. The row
			// says which, so the ban is lifted only when the account is not locked.
			if !h.db.accountLocked(ctx, *lockAccount) {
				if uerr := ban("none"); uerr != nil {
					status, _ := adminError(uerr)
					h.logger().Error("account-admin could not lift the merge ban", "status", status)
				}
			}
		}
		if rpcErr != nil {
			// A field the picker does not offer, from a hand-made request.
			var se *service.Error
			if errors.As(rpcErr, &se) && se.Code == "22023" {
				return nil, problem.BadRequest("One of those choices isn't a field the merge offers.")
			}
			return nil, fmt.Errorf("merge failed: %w", rpcErr)
		}
		switch deref(result.Outcome) {
		case "not_found":
			return nil, problem.NotFound("No such client.")
		case "refused":
			reason, ok := mergeRefusals[deref(result.Reason)]
			if !ok {
				return refused(nil)
			}
			return refused(reason)
		}
		return outcome("stale")
	}

	counts := js.ObjectValue()
	if c := value(result.Counts); !c.IsNullish() {
		counts = c
	}
	return edge.OK(js.O("outcome", "merged", "keptClientId", keepID, "counts", counts))
}

// refusalOrUndef is MERGE_REFUSALS[blocked] where a missing entry is undefined.
func refusalOrUndef(blocked string) any {
	if r, ok := mergeRefusals[blocked]; ok {
		return r
	}
	return js.Undef
}

// ---- JavaScript details ----

// truthy is a nullable string's truthiness: set and not "".
func truthy(s *string) bool { return s != nil && *s != "" }

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func orUndef(s *string) any {
	if s == nil {
		return js.Undef
	}
	return *s
}

func orUndefValue(v js.Value) any {
	if v.IsUndefined() {
		return js.Undef
	}
	return v
}
