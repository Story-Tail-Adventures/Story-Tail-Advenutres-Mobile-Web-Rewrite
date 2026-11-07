// Package onboardingconnect ports supabase/functions/onboarding-connect: Screen 2.1.13
// Connect with Agent, redeeming an invitation code (Screen Inventory §2.1.13, Data-Model
// §6.7, client-auth.jsx C2113_ConnectAgent). P1.
//
// THE MOST CONSEQUENTIAL WRITE IN §2.1. It moves account ownership: afterwards the signed-in
// account points at a DIFFERENT client row, and every policy answers about that traveler
// instead. So the code is a bearer token for somebody's itinerary and passport details.
//
// The plaintext code is never stored, logged, echoed or audited. client_invite_code_hash()
// (SECURITY DEFINER, EXECUTE for the service role alone) hashes it, and only the hash is
// compared. client_invite has RLS on with zero policies.
//
// WHY SO MUCH MIGRATION. handle_user_email_confirmed() already adopts a matching unclaimed
// client at confirmation. This screen is for when it could not (a different address, or two
// matches). By then the traveler has filled in steps 2 to 4 against the throwaway client
// their sign-up created, and redeeming must bring that with them.
package onboardingconnect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/onboarding"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// outcome is what happened, in the audit trail's vocabulary. Every attempt writes one, success
// or failure (Data-Model §6.7); it is also the only place the rate limit counts from.
type outcome string

const (
	outcomeOK               outcome = "ok"
	outcomeUnknown          outcome = "unknown"
	outcomeExpired          outcome = "expired"
	outcomeRevoked          outcome = "revoked"
	outcomeUsed             outcome = "used"
	outcomeAlreadyConnected outcome = "already_connected"
	outcomeClaimedByAnother outcome = "claimed_by_another"
	outcomeRateLimited      outcome = "rate_limited"
)

// A code is six characters of a 36-symbol alphabet. Ten attempts a quarter-hour makes
// guessing hopeless without inconveniencing somebody retyping a code off an email.
//
// WHAT THIS DOES NOT STOP: the window is per signed-in account, and accounts are cheap. With
// confirmations on and GoTrue's signup throttling that is slow rather than impossible; the
// budget against one invite is ten times however many mailboxes somebody can work through,
// against a space of about two billion. Counting by target too is the fix if codes shrink.
const (
	maxAttempts   = 10
	attemptWindow = 15 * time.Minute
)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	currentClientID, err := onboarding.RequireClientID(c)
	if err != nil {
		return nil, err
	}
	body, err := edge.ReadObject(r, edge.ExpectedJSONObject)
	if err != nil {
		return nil, err
	}
	ctx := r.Context()
	advance := body.Get("advance").IsTrue()

	code, err := onboarding.OptionalText(body, "code")
	if err != nil {
		return nil, err
	}
	// "I don't have a code" is a first-class exit and writes nothing but the cursor.
	if code.Value == nil {
		if advance {
			if err := advanceCursor(ctx, d, c); err != nil {
				return nil, err
			}
		}
		return edge.OK(js.O("ok", true, "redeemed", false))
	}

	// One account's attempts run one at a time in this process, so the count, the check and
	// the attempt row cannot interleave: 60 concurrent wrong guesses were all checked against
	// a limit of 10 before this (review of #185; the Deno version had the same gap).
	unlock := lockAttempts(c.PlatformUserID)
	defer unlock()
	out, err := redeem(ctx, d, c, currentClientID, *code.Value)
	if err != nil {
		return nil, err
	}
	if out != outcomeOK {
		// Recorded before the refusal is returned, so a burst of guesses is countable.
		if err := recordAttempt(ctx, d.DB, c, out); err != nil {
			return nil, err
		}
		return nil, refusal(out)
	}
	if advance {
		if err := advanceCursor(ctx, d, c); err != nil {
			return nil, err
		}
	}
	return edge.OK(js.O("ok", true, "redeemed", true))
}

func advanceCursor(ctx context.Context, d *edge.Deps, c *caller.Context) error {
	return guard.AdvanceOnboarding(ctx, d.DB, c.PlatformUserID, onboarding.NextStep("connect"), false, js.ISOString(d.Now()))
}

// refusal says plainly why the code did not work. SPECIFIC, unlike sign-in: an email address
// is guessable from outside knowledge, a code is not, and the rate limit puts brute force past
// the invitation's lifetime. What IS live is a traveler whose invitation sat in an inbox for
// five weeks and needs to know they want a fresh code, not to retype the old one.
func refusal(o outcome) error {
	switch o {
	case outcomeExpired:
		return problem.BadRequest("That code has expired. Message Gyasi and he'll send you a fresh one.")
	case outcomeUsed:
		return problem.BadRequest("That code has already been used. If that wasn't you, message Gyasi and he'll " +
			"sort it out.")
	case outcomeRevoked:
		return problem.BadRequest("That code is no longer active. Message Gyasi and he'll send you a fresh one.")
	case outcomeAlreadyConnected:
		return problem.BadRequest("You're already linked up with Gyasi, so this code isn't needed. If something's " +
			"missing, message him and he'll sort it out.")
	case outcomeClaimedByAnother:
		// Deliberately vaguer: "another account holds that traveler record" is a fact about
		// somebody else's account, and Gyasi is the one to untangle it.
		return problem.BadRequest("That code can't be used on this account. Message Gyasi and he'll sort it out.")
	case outcomeRateLimited:
		return problem.Forbidden("That's a few tries in a row. Give it fifteen minutes, or message Gyasi and he'll " +
			"link it for you.")
	default:
		return problem.BadRequest("That code didn't match anything. Check the invitation email \U00002014 codes look like " +
			"STA-7HX2J9.")
	}
}

// recordAttempt writes one audit row per refused attempt, with the outcome and never the code
// or its hash. The target is the account doing the trying: most failures have no invite to
// name, and naming the row a guess almost hit would be the leak.
// attemptLocks holds one mutex per account that has tried a code. It only grows by accounts
// that have redeemed or guessed, which is bounded by the travelers there are.
var attemptLocks sync.Map

func lockAttempts(platformUserID string) (unlock func()) {
	m, _ := attemptLocks.LoadOrStore(platformUserID, &sync.Mutex{})
	mu := m.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

func recordAttempt(ctx context.Context, db *service.Client, c *caller.Context, o outcome) error {
	return audit.Write(ctx, db, c, audit.Spec{
		EventType:    "client_invite.redeem_attempted",
		TargetEntity: "client_invite",
		TargetID:     c.PlatformUserID,
		Metadata:     js.O("outcome", string(o)),
	})
}

func tooManyAttempts(ctx context.Context, db *service.Client, c *caller.Context, now time.Time) (bool, error) {
	since := js.ISOString(now.Add(-attemptWindow))
	n, err := db.From("audit_event").Select("id").
		Eq("actor_user_id", c.PlatformUserID).
		Eq("event_type", "client_invite.redeem_attempted").
		// A refusal is not an attempt against a code. Counting them would let each retry
		// after the limit extend the lockout; the row is still written, it just does not
		// feed the counter.
		Neq("metadata->>outcome", "rate_limited").
		Gte("created_at", since).
		Count(ctx)
	// Fail CLOSED: a broken rate limit nobody notices, on the one endpoint where guessing is
	// the attack, is worse than a 500.
	if err != nil {
		return false, fmt.Errorf("attempt count failed: %w", err)
	}
	return n >= maxAttempts, nil
}

type inviteRow struct {
	ID         string  `json:"id"`
	ClientID   string  `json:"client_id"`
	ExpiresAt  string  `json:"expires_at"`
	AcceptedAt *string `json:"accepted_at"`
	RevokedAt  *string `json:"revoked_at"`
}

// classify is the part of redeem that needs nothing but the invite row: "" means the code
// is good so far and the holder check comes next.
func classify(found bool, inv inviteRow, now time.Time, currentClientID string) outcome {
	switch {
	case !found:
		return outcomeUnknown
	case inv.RevokedAt != nil && *inv.RevokedAt != "":
		return outcomeRevoked
	case inv.AcceptedAt != nil && *inv.AcceptedAt != "":
		return outcomeUsed
	}
	// new Date(expires_at).getTime() <= Date.now(); an unreadable date is NaN, never <=.
	if t, ok := js.ParseDate(inv.ExpiresAt); ok && t.UnixMilli() <= now.UnixMilli() {
		return outcomeExpired
	}
	if inv.ClientID == currentClientID {
		return outcomeAlreadyConnected
	}
	return ""
}

func redeem(ctx context.Context, d *edge.Deps, c *caller.Context, currentClientID, code string) (outcome, error) {
	limited, err := tooManyAttempts(ctx, d.DB, c, d.Now())
	if err != nil {
		return "", err
	}
	if limited {
		return outcomeRateLimited, nil
	}

	var codeHash string
	if err := d.DB.RPC(ctx, "client_invite_code_hash", js.O("p_code", code), &codeHash); err != nil {
		return "", fmt.Errorf("code hash failed: %w", err)
	}

	var inv inviteRow
	found, err := d.DB.From("client_invite").Select("id, client_id, expires_at, accepted_at, revoked_at").
		Eq("code_hash", codeHash).MaybeSingle(ctx, &inv)
	if err != nil {
		return "", fmt.Errorf("invite read failed: %w", err)
	}
	if o := classify(found, inv, d.Now(), currentClientID); o != "" {
		return o, nil
	}

	// Somebody else's account already holds the target. The partial unique index
	// platform_user_client would refuse the move anyway; this turns that into an answer.
	var holder struct {
		ID string `json:"id"`
	}
	held, err := d.DB.From("platform_user").Select("id").Eq("client_id", inv.ClientID).MaybeSingle(ctx, &holder)
	if err != nil {
		return "", fmt.Errorf("holder read failed: %w", err)
	}
	if held {
		return outcomeClaimedByAnother, nil
	}

	if err := migrate(ctx, d, c, currentClientID, inv.ClientID, inv.ID); err != nil {
		return "", err
	}
	return outcomeOK, nil
}

// migrate moves the account, and everything the traveler entered, onto the target client.
//
// NOT ATOMIC: these are separate PostgREST round trips. A failure partway leaves the account
// on the throwaway with some children moved, and the traveler can retry: the invite is marked
// accepted only at the end, so a half-finished redemption is a retryable one, not a burnt
// code. The ORDER keeps every intermediate state recoverable: children, then profile fields,
// then the account pointer, then the invite, then the cleanup.
func migrate(ctx context.Context, d *edge.Deps, c *caller.Context, fromClientID, toClientID, inviteID string) error {
	db := d.DB
	prefs, err := mergePreferences(ctx, d, c, fromClientID, toClientID)
	if err != nil {
		return err
	}
	companions, err := repoint(ctx, db, "companion", fromClientID, toClientID)
	if err != nil {
		return err
	}
	documents, err := repoint(ctx, db, "travel_document", fromClientID, toClientID)
	if err != nil {
		return err
	}
	fields, err := rescueClientFields(ctx, d, c, fromClientID, toClientID)
	if err != nil {
		return err
	}

	// The advisor's spelling of the name wins, the precedent handle_user_email_confirmed()
	// sets: somebody who typed "maya carter" should still be greeted as Maya Carter.
	var target struct {
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}
	if err := db.From("client").Select("first_name, last_name").Eq("id", toClientID).Single(ctx, &target); err != nil {
		return fmt.Errorf("target read failed: %w", err)
	}
	if err := db.From("platform_user").Eq("id", c.PlatformUserID).Update(ctx, js.O(
		"client_id", toClientID,
		"display_name", js.Trim(target.FirstName+" "+target.LastName),
		"updated_at", js.ISOString(d.Now()),
	), nil); err != nil {
		return fmt.Errorf("account move failed: %w", err)
	}

	// Only if still unaccepted: two tabs, or one impatient double-click, must not both win.
	// Asking for the rows back is load-bearing: PostgREST does not error on an update that
	// matches nothing, and the loser must not go on to write a second redeemed row.
	var accepted []struct {
		ID string `json:"id"`
	}
	if err := db.From("client_invite").Eq("id", inviteID).Is("accepted_at", nil).Select("id").
		Update(ctx, js.O("accepted_at", js.ISOString(d.Now()), "accepted_account_id", c.AccountID), &accepted); err != nil {
		return fmt.Errorf("invite accept failed: %w", err)
	}
	if len(accepted) == 0 {
		return refusal(outcomeUsed)
	}

	if err := disposeOf(ctx, d, c, fromClientID); err != nil {
		return err
	}

	// Ids and counts, never the code, its hash, or a field VALUE.
	return audit.Write(ctx, db, c, audit.Spec{
		EventType:    "client_invite.redeemed",
		TargetEntity: "client",
		TargetID:     toClientID,
		Metadata: js.O(
			"source", "onboarding-connect",
			"from_client_id", fromClientID,
			"migrated", js.O("travel_preference", prefs, "companion", companions, "travel_document", documents),
			"client_fields", fields,
		),
	})
}

const preferenceColumns = "id, preferred_destinations, travel_styles, dietary_restrictions, dietary_notes, " +
	"accessibility_needs, accessibility_notes, loyalty_programs, budget_band, favorite_past_trips"

// readRow reads one row as a js.Value object (absent: found false). The columns here are
// text, text[] and jsonb with no money in them; reading them as JavaScript values is what
// supabase-js did, and writing them back through js.Value is JSON.stringify's output.
func readRow(ctx context.Context, q *service.Query, single bool) (js.Value, bool, error) {
	var raw json.RawMessage
	found := true
	var err error
	if single {
		err = q.Single(ctx, &raw)
	} else {
		found, err = q.MaybeSingle(ctx, &raw)
	}
	if err != nil || !found {
		return js.Value{}, found, err
	}
	v, err := js.Parse(raw)
	if err != nil {
		return js.Value{}, false, fmt.Errorf("decoding the row: %w", err)
	}
	return v, true, nil
}

func isEmptyArray(v js.Value) bool {
	a, ok := v.Array()
	return ok && len(a) == 0
}

// mergePatch is the "never overwrite" merge: the target keeps everything it has and only
// what it is missing is filled in. An empty array counts as missing, which is exactly what
// the `none` sentinel exists to distinguish it from.
func mergePatch(from, to js.Value) js.Ordered {
	patch := js.O()
	obj, _ := from.Object()
	for _, key := range obj.Keys() {
		if key == "id" {
			continue
		}
		mine, theirs := from.Get(key), to.Get(key)
		theirsEmpty := theirs.IsNull() || isEmptyArray(theirs)
		mineHasSomething := !mine.IsNull() && !isEmptyArray(mine)
		if theirsEmpty && mineHasSomething {
			patch = patch.Set(key, mine)
		}
	}
	return patch
}

// rescuePatch copies what the traveler entered, only where the target has nothing.
func rescuePatch(from, to js.Value) js.Ordered {
	patch := js.O()
	obj, _ := from.Object()
	for _, key := range obj.Keys() {
		if !from.Get(key).IsNull() && to.Get(key).IsNull() {
			patch = patch.Set(key, from.Get(key))
		}
	}
	return patch
}

func sortedKeys(o js.Ordered) []string {
	keys := make([]string, 0, len(o))
	for _, f := range o {
		keys = append(keys, f.Key)
	}
	sort.Strings(keys)
	return keys
}

// mergePreferences handles travel_preference, which is 1:1 (client_id UNIQUE), so a blind
// re-point raises 23505. No target row: the traveler's moves across. Both: MERGED, because
// §3.3.9 lets an advisor fill preferences in directly, so the target's row can hold dietary
// needs taken down over the phone.
func mergePreferences(ctx context.Context, d *edge.Deps, c *caller.Context, fromClientID, toClientID string) (int, error) {
	db := d.DB
	// Both reads run, as Promise.all ran them; the errors are then checked in order.
	from, fromFound, fromErr := readRow(ctx, db.From("travel_preference").Select(preferenceColumns).Eq("client_id", fromClientID), false)
	to, toFound, toErr := readRow(ctx, db.From("travel_preference").Select(preferenceColumns).Eq("client_id", toClientID), false)
	if fromErr != nil {
		return 0, fmt.Errorf("preference read failed: %w", fromErr)
	}
	if toErr != nil {
		return 0, fmt.Errorf("target preference read failed: %w", toErr)
	}
	if !fromFound {
		return 0, nil
	}
	if !toFound {
		return repoint(ctx, db, "travel_preference", fromClientID, toClientID)
	}

	toID, _ := to.Get("id").Str()
	fromID, _ := from.Get("id").Str()
	patch := mergePatch(from, to)
	fields := sortedKeys(patch)
	if len(fields) > 0 {
		patch = patch.Set("updated_at", js.ISOString(d.Now()))
		if err := db.From("travel_preference").Eq("id", toID).Update(ctx, patch, nil); err != nil {
			return 0, fmt.Errorf("preference merge failed: %w", err)
		}
	}

	// Column names only: two of these hold health-adjacent answers. Written even when
	// nothing merged, as the Deno function did.
	if err := audit.Write(ctx, db, c, audit.Spec{
		EventType:    "travel_preference.updated",
		TargetEntity: "travel_preference",
		TargetID:     toID,
		Metadata:     js.O("source", "onboarding-connect", "reason", "invite_redeemed", "fields", fields),
	}); err != nil {
		return 0, err
	}

	if err := db.From("travel_preference").Eq("id", fromID).Delete(ctx, nil); err != nil {
		return 0, fmt.Errorf("preference cleanup failed: %w", err)
	}
	if len(fields) > 0 {
		return 1, nil
	}
	return 0, nil
}

// repoint moves every row of table from one client to the other and counts them.
func repoint(ctx context.Context, db *service.Client, table, fromClientID, toClientID string) (int, error) {
	var rows []struct {
		ID string `json:"id"`
	}
	if err := db.From(table).Eq("client_id", fromClientID).Select("id").
		Update(ctx, js.O("client_id", toClientID), &rows); err != nil {
		return 0, fmt.Errorf("%s repoint failed: %w", table, err)
	}
	return len(rows), nil
}

const clientColumns = "phone, date_of_birth, emergency_contact, mailing_address_id, preferred_name"

// rescueClientFields copies what the traveler typed on steps 2 and 3 onto the target, never
// overwriting: the advisor has had this record for weeks and may know better. client is a
// rule-3 table, so the write is audited, with field names and no contents.
func rescueClientFields(ctx context.Context, d *edge.Deps, c *caller.Context, fromClientID, toClientID string) ([]string, error) {
	db := d.DB
	from, _, fromErr := readRow(ctx, db.From("client").Select(clientColumns).Eq("id", fromClientID), true)
	to, _, toErr := readRow(ctx, db.From("client").Select(clientColumns).Eq("id", toClientID), true)
	if fromErr != nil {
		return nil, fmt.Errorf("throwaway read failed: %w", fromErr)
	}
	if toErr != nil {
		return nil, fmt.Errorf("target read failed: %w", toErr)
	}

	patch := rescuePatch(from, to)
	fields := sortedKeys(patch)
	if len(fields) == 0 {
		return fields, nil
	}

	write := append(js.O(), patch...).Set("updated_at", js.ISOString(d.Now()))
	if _, err := audit.With(ctx, db, c, audit.Spec{
		EventType:    "client.updated",
		TargetEntity: "client",
		TargetID:     toClientID,
		Metadata:     js.O("source", "onboarding-connect", "reason", "invite_redeemed", "fields", fields),
	}, func() (struct{}, error) {
		if err := db.From("client").Eq("id", toClientID).Update(ctx, write, nil); err != nil {
			return struct{}{}, fmt.Errorf("client rescue failed: %w", err)
		}
		return struct{}{}, nil
	}); err != nil {
		return nil, err
	}

	// The throwaway's pointer is dropped AFTER the target holds it. The other order left a
	// crash window where nothing pointed at the address and a retry lost it silently. Two
	// clients pointing at one address for a moment is recoverable; none is not.
	for _, f := range patch {
		if f.Key == "mailing_address_id" {
			if err := db.From("client").Eq("id", fromClientID).Update(ctx, js.O("mailing_address_id", nil), nil); err != nil {
				return nil, fmt.Errorf("address unlink failed: %w", err)
			}
			break
		}
	}
	return fields, nil
}

// disposeOf removes the client row the sign-up made: delete, falling back to archive on a
// foreign key, as handle_user_email_confirmed() does. Audited WITH the deletion, not in the
// closing summary: this sequence is not transactional, and a client row must never vanish
// with no record.
func disposeOf(ctx context.Context, d *edge.Deps, c *caller.Context, throwawayID string) error {
	db := d.DB
	_, err := audit.With(ctx, db, c, audit.Spec{
		EventType:    "client.disposed",
		TargetEntity: "client",
		TargetID:     throwawayID,
		Metadata:     js.O("source", "onboarding-connect", "reason", "invite_redeemed"),
	}, func() (struct{}, error) {
		err := db.From("client").Eq("id", throwawayID).Delete(ctx, nil)
		if err == nil {
			return struct{}{}, nil
		}
		var se *service.Error
		if !errors.As(err, &se) || se.Code != "23503" {
			return struct{}{}, fmt.Errorf("throwaway delete failed: %w", err)
		}
		if err := db.From("client").Eq("id", throwawayID).Update(ctx,
			js.O("status", "archived", "archived_at", js.ISOString(d.Now())), nil); err != nil {
			return struct{}{}, fmt.Errorf("throwaway archive failed: %w", err)
		}
		return struct{}{}, nil
	})
	return err
}
