// Package emaildispatch ports supabase/functions/email-dispatch: §3.10 Stage 4, emailing the
// client what the queue says is due (Data-Model §12.8 / §12.9), and §3.12.3, the advisor's own
// alert emails (§12.11).
//
// NO HUMAN CALLER (GateCron). pg_cron's email_dispatch_tick() posts here when a row is due; the
// registry checks STA_CRON_SECRET before this code runs, where Deno checked for the service
// role.
//
// One pass:
//  1. Claim what is due (email_claim_due, SKIP LOCKED). The SQL has already cleared threads read
//     in the app and skipped opted-out, archived or unverified clients.
//  2. Per row: mint the reply and unsubscribe tokens and save their hashes FIRST
//     (email_record_tokens), so no email ever goes out with dead links; build the email (package
//     email, card numbers masked) under the advisor's signature; send it over SMTP.
//  3. Finish each row: sent (stamping the "Emailed" mark), back for a retry, or failed on a 5xx
//     (email_finish).
//  4. Then the advisor's alert emails (agent_alert_email_claim): who and which trip, with a
//     link, never the client's words.
//
// The SMTP sender is internal/api/mail (the standard library, ruling 15), set up exactly as
// smtp.ts set nodemailer up: implicit TLS on 465 with certificates checked, one connection per
// message, nothing logged. Missing settings are a 500 BEFORE anything is claimed, so rows wait.
package emaildispatch

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// batch is how many rows (and, after them, how many alerts) one pass claims.
const batch = 10

// timeBudgetMS: stop starting new sends after this long. Rows left over go back to waiting with
// no try counted (email_release), so a slow SMTP server can never make one run outlast the
// 15-minute stale window and be re-claimed under itself (found in review: that would email a
// client twice).
const timeBudgetMS = 90_000

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.Forbidden("Use POST to run the email dispatcher.")
	}
	// requireServiceRole(req, "The email dispatcher") is the registry's GateCron.

	cfg, err := email.ConfigFromEnv(d.Env)
	if err != nil {
		return nil, fmt.Errorf("email settings refused: %w", err)
	}
	if cfg == nil {
		return nil, errors.New("email not configured: set EMAIL_SMTP_HOST and EMAIL_FROM_ADDRESS (and the rest), see supabase/README.md")
	}

	// pg_net gives up on the tick after 30 seconds, but a pass may run for 90: Deno kept going
	// after the caller left, and so must this, or every row claimed would be stranded 'sending'
	// for the 15-minute stale window.
	ctx := context.WithoutCancel(r.Context())
	t := email.SMTPTransport(*cfg)
	smtp := mail.Config{Host: t.Host, Port: t.Port, Secure: t.ImplicitTLS, User: t.User, Password: t.Password}
	send := func(ctx context.Context, m mail.Message) error {
		_, err := mail.Send(ctx, smtp, m)
		return err
	}

	c, err := dispatch(ctx, dbStore{d.DB}, send, *cfg, d.Now, d.Log)
	if err != nil {
		return nil, err
	}
	return edge.OK(c.reply())
}

// reply is `{ sent, alertsSent, retried, failed, released }`.
func (c counts) reply() js.Ordered {
	return js.O("sent", c.sent, "alertsSent", c.alertsSent, "retried", c.retried, "failed", c.failed,
		"released", c.released)
}

// store is the dispatcher's reads and writes, each one RPC the Deno function made.
type store interface {
	claimDue(ctx context.Context, limit int) ([]email.ClaimedEmail, error)
	recordTokens(ctx context.Context, outboxID, replyHash, unsubHash string) error
	signature(ctx context.Context, conversationID string) (*email.SignatureSource, error)
	finish(ctx context.Context, outboxID string, ok, permanent bool, errText *string) (*string, error)
	release(ctx context.Context, outboxID string) error
	claimAlerts(ctx context.Context, limit int) ([]email.ClaimedAlert, error)
	finishAlert(ctx context.Context, alertID string, ok, permanent bool, errText *string) (*string, error)
	releaseAlert(ctx context.Context, alertID string) error
}

// sender sends one email.
type sender func(ctx context.Context, m mail.Message) error

type counts struct{ sent, alertsSent, retried, failed, released int }

// tally counts what a finish answered: 'sent', 'failed', and anything else (pending, cleared,
// not_claimed, or null) as a retry, as the Deno counters did.
func tally(state *string, sent, failed, retried *int) {
	switch {
	case state != nil && *state == "sent":
		*sent++
	case state != nil && *state == "failed":
		*failed++
	default:
		*retried++
	}
}

func dispatch(ctx context.Context, db store, send sender, cfg email.Config, now func() time.Time, log *slog.Logger) (counts, error) {
	claimed, err := db.claimDue(ctx, batch)
	if err != nil {
		return counts{}, fmt.Errorf("claim failed: %w", err)
	}

	var c counts
	finish := func(outboxID string, ok, permanent bool, errText *string) error {
		state, err := db.finish(ctx, outboxID, ok, permanent, errText)
		if err != nil {
			return fmt.Errorf("finish failed: %w", err)
		}
		tally(state, &c.sent, &c.failed, &c.retried)
		return nil
	}

	started := now()
	elapsed := func() int64 { return now().Sub(started).Milliseconds() }

	for _, row := range claimed {
		if elapsed() > timeBudgetMS {
			if err := db.release(ctx, row.OutboxID); err != nil {
				log.Error("email-dispatch: release failed", dbCode(err)...)
			}
			c.released++
			continue
		}
		// One row's trouble is its own: it is finished as a failure and the next is still sent,
		// rather than the pass dying with every claimed row stuck 'sending'.
		if err := sendRow(ctx, db, send, cfg, now, log, row, finish); err != nil {
			log.Error("email-dispatch: row failed", label(err)...)
			_ = finish(row.OutboxID, false, false, ptr("internal error"))
		}
	}

	// §3.12.3: the advisor's alerts, in what is left of the time budget. Anything not reached
	// stays pending (it is only claimed when there is time to send it).
	if elapsed() < timeBudgetMS {
		alerts, err := db.claimAlerts(ctx, batch)
		if err != nil {
			return counts{}, fmt.Errorf("alert claim failed: %w", err)
		}
		for _, alert := range alerts {
			// Out of time: back to waiting with no try counted, so a slow pass never outlasts
			// the 15-minute stale window and is claimed again under itself (a double send).
			if elapsed() > timeBudgetMS {
				if err := db.releaseAlert(ctx, alert.AlertID); err != nil {
					log.Error("email-dispatch: alert release failed", dbCode(err)...)
				}
				c.released++
				continue
			}
			done := func(ok, permanent bool, errText *string) error {
				state, err := db.finishAlert(ctx, alert.AlertID, ok, permanent, errText)
				if err != nil {
					return fmt.Errorf("alert finish failed: %w", err)
				}
				tally(state, &c.alertsSent, &c.failed, &c.retried)
				return nil
			}
			if err := sendAlert(ctx, send, cfg, now, alert, done); err != nil {
				log.Error("email-dispatch: alert failed", label(err)...)
				_ = done(false, false, ptr("internal error"))
			}
		}
	}
	return c, nil
}

// sendRow is the body of the Deno row loop's outer try: an error it returns is the outer catch's
// ("internal error", a retry).
func sendRow(ctx context.Context, db store, send sender, cfg email.Config, now func() time.Time, log *slog.Logger,
	row email.ClaimedEmail, finish func(string, bool, bool, *string) error) error {
	tokens := email.Tokens{Reply: email.NewToken(), Unsubscribe: email.NewToken()}
	if err := db.recordTokens(ctx, row.OutboxID, email.TokenHashParam(tokens.Reply), email.TokenHashParam(tokens.Unsubscribe)); err != nil {
		return fmt.Errorf("token save failed: %w", err)
	}

	// A failed signature read costs the email its signature, never the email: the advisor's
	// words still go, with the locked host-agency line.
	signature, err := db.signature(ctx, row.ConversationID)
	if err != nil {
		log.Error("email-dispatch: signature read failed", dbCode(err)...)
		signature = nil
	}

	built, err := email.BuildEmail(row, tokens, cfg, signature)
	if err != nil {
		// Nothing honest to send (a bad address, no replies left): retrying cannot help.
		return finish(row.OutboxID, false, true, ptr(err.Error()))
	}
	m := message(built.Outgoing, now())
	m.ReplyTo, m.InReplyTo, m.References = built.ReplyTo, built.InReplyTo, built.References
	return sendAndFinish(ctx, send, m, func(ok, permanent bool, errText *string) error {
		return finish(row.OutboxID, ok, permanent, errText)
	})
}

// sendAlert is the body of the alert loop's outer try.
func sendAlert(ctx context.Context, send sender, cfg email.Config, now func() time.Time, alert email.ClaimedAlert,
	done func(bool, bool, *string) error) error {
	built, err := email.BuildAlertEmail(alert, cfg)
	if err != nil {
		return done(false, true, ptr(err.Error()))
	}
	return sendAndFinish(ctx, send, message(built, now()), done)
}

// sendAndFinish is the inner try around sendMail: the send and the success finish share one
// catch, so a success finish that fails is classified like a send error and finished again as a
// retry, exactly as the Deno code did. nodemailer reported a rejected recipient through
// info.rejected only when SOME of several were rejected; with one recipient a rejection is an
// error, which mail.Send also returns, so that branch has no Go counterpart.
func sendAndFinish(ctx context.Context, send sender, m mail.Message, finish func(bool, bool, *string) error) error {
	err := send(ctx, m)
	if err == nil {
		if err = finish(true, false, nil); err == nil {
			return nil
		}
	}
	permanent, text := email.ClassifySMTPError(errorShape(err))
	return finish(false, permanent, &text)
}

// errorShape is an error as nodemailer shaped it, for ClassifySMTPError. A refused SMTP reply
// carries responseCode and response, where nodemailer's response is the server's whole reply
// INCLUDING its code ("550 5.1.1 No such user"), so last_error reads "550 550 5.1.1 ..." as it
// did; a multi-line reply is rebuilt the way nodemailer joined it ("550-...\n550 ..."). A
// connection failure has no response: nodemailer kept its own message there, so the Go text
// goes in message. Any other error (a finish that failed inside the send's try) is a plain Error
// with its message.
func errorShape(err error) js.Value {
	var me *mail.Error
	if !errors.As(err, &me) {
		return js.ObjectValue("message", js.StringValue(err.Error()))
	}
	kv := []any{}
	if me.Code != 0 {
		code := strconv.Itoa(me.Code)
		lines := strings.Split(me.Text, "\n")
		for i, l := range lines {
			sep := "-"
			if i == len(lines)-1 {
				sep = " "
			}
			lines[i] = code + sep + l
		}
		kv = append(kv, "responseCode", js.NumberValue(float64(me.Code)), "response", js.StringValue(strings.Join(lines, "\n")))
	} else {
		kv = append(kv, "message", js.StringValue(me.Text))
	}
	if me.Kind != "" {
		kv = append(kv, "code", js.StringValue(me.Kind))
	}
	return js.ObjectValue(kv...)
}

// message maps a built email onto the sender's message. Every value was built by package email.
func message(o email.Outgoing, date time.Time) mail.Message {
	hs := make([]mail.Header, len(o.Headers))
	for i, h := range o.Headers {
		hs[i] = mail.Header{Name: h.Name, Value: h.Value}
	}
	return mail.Message{
		FromName: o.From.Name, FromAddress: o.From.Address, To: o.To, Subject: o.Subject,
		Text: o.Text, HTML: o.HTML, MessageID: o.MessageID, Headers: hs, Date: date,
	}
}

func ptr(s string) *string { return &s }

// label is what a row failure logs: our own wrap prefix and the database code, never a message.
func label(err error) []any {
	l, _, _ := strings.Cut(err.Error(), ": ")
	return append([]any{"error", l}, dbCode(err)...)
}

func dbCode(err error) []any {
	var se *service.Error
	if errors.As(err, &se) {
		return []any{"db_code", se.Code, "db_status", se.Status}
	}
	return nil
}

// ── The database ─────────────────────────────────────────────────────────────

// dbStore is the service client, called exactly as supabase-js was.
type dbStore struct{ db *service.Client }

func (s dbStore) claimDue(ctx context.Context, limit int) ([]email.ClaimedEmail, error) {
	var rows []email.ClaimedEmail
	err := s.db.RPC(ctx, "email_claim_due", js.O("p_limit", limit), &rows)
	return rows, err
}

func (s dbStore) recordTokens(ctx context.Context, outboxID, replyHash, unsubHash string) error {
	return s.db.RPC(ctx, "email_record_tokens", js.O("p_outbox_id", outboxID, "p_reply_hash", replyHash,
		"p_unsub_hash", unsubHash), nil)
}

// signature is `Array.isArray(data) ? data[0] : data`, null when there is none.
func (s dbStore) signature(ctx context.Context, conversationID string) (*email.SignatureSource, error) {
	var sig email.SignatureSource
	found, err := s.db.RPCRow(ctx, "agent_signature_for_conversation", js.O("p_conversation_id", conversationID), &sig)
	if err != nil || !found {
		return nil, err
	}
	return &sig, nil
}

// orUndef is `error ?? undefined`: a null error is left out, so the SQL default applies.
func orUndef(p *string) any {
	if p == nil {
		return js.Undef
	}
	return *p
}

func (s dbStore) finish(ctx context.Context, outboxID string, ok, permanent bool, errText *string) (*string, error) {
	var state *string
	err := s.db.RPC(ctx, "email_finish", js.O("p_outbox_id", outboxID, "p_ok", ok, "p_permanent", permanent,
		"p_error", orUndef(errText)), &state)
	return state, err
}

func (s dbStore) release(ctx context.Context, outboxID string) error {
	return s.db.RPC(ctx, "email_release", js.O("p_outbox_id", outboxID), nil)
}

func (s dbStore) claimAlerts(ctx context.Context, limit int) ([]email.ClaimedAlert, error) {
	var rows []email.ClaimedAlert
	err := s.db.RPC(ctx, "agent_alert_email_claim", js.O("p_limit", limit), &rows)
	return rows, err
}

func (s dbStore) finishAlert(ctx context.Context, alertID string, ok, permanent bool, errText *string) (*string, error) {
	var state *string
	err := s.db.RPC(ctx, "agent_alert_email_finish", js.O("p_alert_id", alertID, "p_ok", ok, "p_permanent", permanent,
		"p_error", orUndef(errText)), &state)
	return state, err
}

func (s dbStore) releaseAlert(ctx context.Context, alertID string) error {
	return s.db.RPC(ctx, "agent_alert_email_release", js.O("p_alert_id", alertID), nil)
}
