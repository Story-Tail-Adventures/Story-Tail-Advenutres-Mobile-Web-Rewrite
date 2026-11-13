// Package emailinbox ports supabase/functions/email-inbox: §3.10 Stage 4, client replies by
// email, read out of the app's own IONOS mailbox over IMAP (Data-Model §12.10; Gyasi,
// 2026-10-16: IMAP on info@, not Resend).
//
// NO HUMAN CALLER (GateCron). pg_cron's email_inbox_tick() posts here every two minutes; the
// registry checks STA_CRON_SECRET before this code runs. One run:
//  1. Log in to the mailbox (go-imap v2.0.0-beta.8, used exactly as
//     docs/IMAP-Go-Library-Security-Review.md §5 requires: TLS on 993 with certificates checked,
//     no debug writer, one hard deadline for the whole run).
//  2. Take up to 25 messages from INBOX: their sizes first; then, for those of 1 MB or less, the
//     structure and only the headers this file reads.
//  3. Per message: find the reply token (the `info+<token>@` recipient, or our Message-ID in
//     In-Reply-To / References), read OUR server's Authentication-Results (pinned by
//     EMAIL_AUTHSERV_ID), download only the text part, keep only the new words (card numbers
//     masked), and hand it all to email_inbound_record, which checks token, verified sender and
//     thread and writes the message, the thread bump and its audit row in one transaction. A
//     message seen before is a no-op there.
//  4. Move it to Processed (accepted) or Rejected (everything else). A message that cannot be
//     read goes to Failed, so one bad email never jams the inbox.
//  5. An accepted reply that carried files gets one short note, to the verified sender only.
//  6. Handled mail older than 30 days is deleted from those folders: a client may have pasted a
//     card number into a reply, and the mailbox must not keep it (CLAUDE.md rule 1).
//
// A message is moved only AFTER it is recorded, so a crash leaves it in INBOX for the next run,
// where the dedupe makes the second pass harmless. A database error stops the run (the next one
// retries); a message-specific error moves that message to Failed and the run goes on.
//
// This package is the ONLY importer of go-imap (boundary_test.go here).
package emailinbox

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/emailinbound"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

const (
	batch = 25
	// maxMessageBytes: anything bigger is not a reply worth reading; it is moved aside without
	// its structure or any part being fetched.
	maxMessageBytes = 1_000_000
	// maxTextBytes is the most of a text part read: ten times the message ceiling.
	maxTextBytes = 80_000
	// textWindow is the partial fetch of a text part: enough for maxTextBytes decoded even from
	// quoted-printable's 3 to 1.
	textWindow = 240_000
	// timeBudgetMS: stop starting new messages after this long; the rest wait for the next run.
	timeBudgetMS = 60_000
	// keepDays: handled mail is deleted from the three folders after this many days.
	keepDays = 30

	inbox     = "INBOX"
	processed = "Processed"
	rejected  = "Rejected"
	failed    = "Failed"
)

// The connection's bounds. A hung server cannot hold a run, or overlap the next two-minute tick:
// no deadline the library sets may pass the run's end (§5).
var (
	connectTimeout  = 15 * time.Second
	greetingTimeout = 15 * time.Second
	runLimit        = 100 * time.Second
)

// headerNames are the only headers fetched: never a whole header block from an unknown sender.
var headerNames = []string{
	"from", "to", "cc", "delivered-to", "x-original-to", "subject", "message-id", "in-reply-to",
	"references", "authentication-results", "auto-submitted", "precedence", "x-autoreply",
	"x-autorespond",
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.Forbidden("Use POST to read the inbox.")
	}
	// requireServiceRole(req, "The email inbox reader") is the registry's GateCron.

	cfg, err := email.InboxConfigFromEnv(d.Env)
	if err != nil {
		return nil, fmt.Errorf("inbox settings refused: %w", err)
	}
	if cfg == nil {
		return nil, errors.New("inbox not configured: set EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD and EMAIL_FROM_ADDRESS, see supabase/README.md")
	}
	// OUR server's name in Authentication-Results. Unset: no sender can be verified, so every
	// reply is Rejected (fail closed) until it is read off a real reply.
	authservID := js.Trim(d.Env("EMAIL_AUTHSERV_ID"))

	ru := &run{
		cfg:        *cfg,
		domain:     strings.Split(cfg.Mailbox, "@")[1],
		authservID: authservID,
		rec:        dbRecorder{d.DB},
		note: func(ctx context.Context, to string, m *fetched) error {
			return filesNote(ctx, d.Env, sendMail, d.Now, to, m)
		},
		now: d.Now,
		log: d.Log,
	}
	// pg_net gives up on the tick long before a run may end; the run goes on to its own hard
	// deadline, as the Deno one did, rather than strand a recorded message unmoved.
	out, err := ru.readInbox(context.WithoutCancel(r.Context()))
	if err != nil {
		return nil, err
	}
	return edge.OK(out)
}

func sendMail(ctx context.Context, cfg mail.Config, m mail.Message) error {
	_, err := mail.Send(ctx, cfg, m)
	return err
}

// run is one pass and what it needs.
type run struct {
	cfg        email.InboxConfig
	domain     string
	authservID string
	rec        recorder
	note       func(ctx context.Context, to string, m *fetched) error
	now        func() time.Time
	log        *slog.Logger
}

// fetched is one message as read from INBOX.
type fetched struct {
	seq     uint32
	uid     imap.UID
	size    int64
	headers []emailinbound.Header
	body    structure
	subject string
	// read is false for a message over the size cap (nothing else was fetched) or one whose
	// second fetch came back empty.
	read bool
}

// recordError is a failure that is the database's, not the message's: it stops the run and the
// next one retries.
type recordError struct{ err error }

func (e *recordError) Error() string { return "recording the reply failed: " + e.err.Error() }
func (e *recordError) Unwrap() error { return e.err }

func (ru *run) readInbox(ctx context.Context) (js.Ordered, error) {
	started := ru.now()
	elapsed := func() int64 { return ru.now().Sub(started).Milliseconds() }
	outcomes := js.O()
	bump := func(k string) {
		for i := range outcomes {
			if outcomes[i].Key == k {
				outcomes[i].Value = outcomes[i].Value.(int) + 1
				return
			}
		}
		outcomes = append(outcomes, js.Field{Key: k, Value: 1})
	}
	skipped, purged := 0, 0

	c, closeAll, err := ru.connect(ctx)
	if err != nil {
		return nil, err
	}
	defer closeAll()
	if err := ru.login(c); err != nil {
		return nil, err
	}
	// finally { await client.logout().catch(() => undefined) }
	defer func() { _ = c.Logout().Wait() }()

	caps := c.Caps()
	if !caps.Has(imap.CapMove) {
		// go-imap would fall back to COPY, STORE and a plain EXPUNGE, which the review rules out.
		return nil, errors.New("imap server has no MOVE")
	}
	if err := ensureFolders(c, []string{processed, rejected, failed}); err != nil {
		return nil, err
	}

	sel, err := c.Select(inbox, nil).Wait()
	if err != nil {
		return nil, fmt.Errorf("imap select failed: %w", err)
	}
	uidValidity := strconv.FormatUint(uint64(sel.UIDValidity), 10)

	var msgs []*fetched
	if sel.NumMessages > 0 {
		msgs, err = fetchBatch(c, min(sel.NumMessages, batch))
		if err != nil {
			return nil, err
		}
	}

	for _, m := range msgs {
		if elapsed() > timeBudgetMS {
			skipped++
			continue
		}
		var folder string
		err := func() error {
			if m.size > maxMessageBytes {
				folder = rejected
				bump("too_large")
				return nil
			}
			if !m.read {
				return errors.New("message has no structure")
			}
			res, err := ru.handle(ctx, c, uidValidity, m)
			if err != nil {
				return err
			}
			folder = rejected
			if res.outcome == "accepted" {
				folder = processed
			}
			// A re-delivered copy answers the first copy's outcome; the summary says what it was.
			if res.duplicate {
				bump("duplicate")
			} else {
				bump(res.outcome)
			}
			if res.outcome == "accepted" && !res.duplicate && res.files > 0 && res.replyTo != nil {
				if err := ru.note(ctx, *res.replyTo, m); err != nil {
					ru.log.Error("email-inbox: files note failed", "error", errLabel(err))
				}
			}
			return nil
		}()
		if err != nil {
			var re *recordError
			if errors.As(err, &re) {
				return nil, err
			}
			// Something about THIS message (a part that will not download, odd structure): set it
			// aside for a person to look at, rather than retry it at the head of every run.
			ru.log.Error("email-inbox: message failed", "error", errLabel(err))
			folder = failed
			bump("failed")
		}
		if _, err := c.Move(imap.UIDSetNum(m.uid), folder).Wait(); err != nil {
			return nil, fmt.Errorf("imap move failed: %w", err)
		}
	}

	if elapsed() < timeBudgetMS {
		if purged, err = ru.purgeOld(c, caps, []string{processed, rejected, failed}); err != nil {
			return nil, err
		}
	}

	read := 0
	for _, f := range outcomes {
		read += f.Value.(int)
	}
	return js.O("read", read, "outcomes", outcomes, "skipped", skipped, "purged", purged), nil
}

// errLabel is what a message failure logs: our own prefix, never the library's text (it can
// carry server words) or anything from the mail.
func errLabel(err error) string {
	l, _, _ := strings.Cut(err.Error(), ": ")
	return js.Slice(l, 0, 200)
}

// ── The connection ─────────────────────────────────────────────────────────────

// clampConn never lets a deadline go past the run's end, and reads "no deadline" as the run's
// end: go-imap sets none while it waits for a reply's first byte (#762, #772).
type clampConn struct {
	net.Conn
	end time.Time
}

func (c clampConn) clamp(t time.Time) time.Time {
	if t.IsZero() || t.After(c.end) {
		return c.end
	}
	return t
}

func (c clampConn) SetDeadline(t time.Time) error      { return c.Conn.SetDeadline(c.clamp(t)) }
func (c clampConn) SetReadDeadline(t time.Time) error  { return c.Conn.SetReadDeadline(c.clamp(t)) }
func (c clampConn) SetWriteDeadline(t time.Time) error { return c.Conn.SetWriteDeadline(c.clamp(t)) }

// connect dials (TLS from the first byte, certificate checked against the host; plain only for
// the local test server InboxConfigFromEnv allows), hands the connection to go-imap and waits for
// the greeting. closeAll closes the client and stops the run's timer.
func (ru *run) connect(ctx context.Context) (*imapclient.Client, func(), error) {
	end := time.Now().Add(runLimit)
	dialer := &net.Dialer{Timeout: connectTimeout, Deadline: end}
	raw, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(ru.cfg.Host, strconv.Itoa(ru.cfg.Port)))
	if err != nil {
		return nil, nil, errors.New("imap connect failed")
	}
	conn := raw
	if ru.cfg.Secure {
		tc := tls.Client(raw, &tls.Config{ServerName: ru.cfg.Host, MinVersion: tls.VersionTLS12})
		_ = tc.SetDeadline(clampConn{end: end}.clamp(time.Now().Add(connectTimeout)))
		if err := tc.HandshakeContext(ctx); err != nil {
			raw.Close()
			return nil, nil, errors.New("imap tls failed")
		}
		_ = tc.SetDeadline(time.Time{})
		conn = tc
	}
	// Never a DebugWriter: it writes the password and every message.
	c := imapclient.New(clampConn{Conn: conn, end: end}, &imapclient.Options{})
	timer := time.AfterFunc(time.Until(end), func() { _ = c.Close() })
	closeAll := func() {
		timer.Stop()
		_ = c.Close()
	}
	greeting := make(chan error, 1)
	go func() { greeting <- c.WaitGreeting() }()
	select {
	case err := <-greeting:
		if err != nil {
			closeAll()
			return nil, nil, fmt.Errorf("imap greeting failed: %w", err)
		}
	case <-time.After(greetingTimeout):
		closeAll()
		return nil, nil, errors.New("imap greeting timed out")
	}
	return c, closeAll, nil
}

func (ru *run) login(c *imapclient.Client) error {
	if err := c.Login(ru.cfg.User, ru.cfg.Password).Wait(); err != nil {
		return fmt.Errorf("imap login failed: %w", err)
	}
	return nil
}

// ensureFolders creates the folders on the first run; one that already exists is left alone.
func ensureFolders(c *imapclient.Client, names []string) error {
	list, err := c.List("", "*", nil).Collect()
	if err != nil {
		return fmt.Errorf("imap list failed: %w", err)
	}
	have := map[string]bool{}
	for _, l := range list {
		have[l.Mailbox] = true
	}
	for _, name := range names {
		if !have[name] {
			if err := c.Create(name, nil).Wait(); err != nil {
				return fmt.Errorf("imap create failed: %w", err)
			}
		}
	}
	return nil
}

// purgeOld deletes handled mail older than keepDays from the given folders. The thread already
// holds what the client wrote (card numbers masked); the original, which may hold an unmasked
// one, goes. Only with UIDPLUS: a plain EXPUNGE would also remove anything else a person had
// flagged \Deleted there (imapflow fell back to it; this does not).
func (ru *run) purgeOld(c *imapclient.Client, caps imap.CapSet, folders []string) (int, error) {
	if !caps.Has(imap.CapUIDPlus) {
		ru.log.Warn("email-inbox: no UIDPLUS, old mail not purged")
		return 0, nil
	}
	// SEARCH BEFORE takes a date; go-imap writes it in the time's own zone, imapflow in UTC.
	before := ru.now().UTC().Add(-keepDays * 24 * time.Hour)
	total := 0
	for _, folder := range folders {
		if _, err := c.Select(folder, nil).Wait(); err != nil {
			return 0, fmt.Errorf("imap select failed: %w", err)
		}
		data, err := c.UIDSearch(&imap.SearchCriteria{Before: before}, nil).Wait()
		if err != nil {
			return 0, fmt.Errorf("imap search failed: %w", err)
		}
		uids := data.AllUIDs()
		if len(uids) == 0 {
			continue
		}
		set := imap.UIDSetNum(uids...)
		if err := c.Store(set, &imap.StoreFlags{Op: imap.StoreFlagsAdd, Silent: true, Flags: []imap.Flag{imap.FlagDeleted}}, nil).Close(); err != nil {
			return 0, fmt.Errorf("imap store failed: %w", err)
		}
		if err := c.UIDExpunge(set).Close(); err != nil {
			return 0, fmt.Errorf("imap expunge failed: %w", err)
		}
		total += len(uids)
	}
	return total, nil
}

// ── Reading INBOX ──────────────────────────────────────────────────────────────

// readLiteral reads a whole literal and refuses a short one: go-imap returns a literal the server
// cut off as if it were complete (PR #780), so the byte count must equal what was promised.
func readLiteral(lit imap.LiteralReader, limit int64) ([]byte, error) {
	if lit.Size() > limit {
		return nil, errors.New("literal too large")
	}
	b, err := io.ReadAll(io.LimitReader(lit, limit))
	if err != nil {
		return nil, fmt.Errorf("literal read failed: %w", err)
	}
	if int64(len(b)) != lit.Size() {
		return nil, errors.New("literal cut short")
	}
	return b, nil
}

// fetchBatch reads messages 1 to n: sizes first (sequence numbers, right after SELECT), then by
// UID the structure and the named headers of each message within the size cap. Everything is
// collected before anything else is sent.
func fetchBatch(c *imapclient.Client, n uint32) ([]*fetched, error) {
	var seqs imap.SeqSet
	seqs.AddRange(1, n)
	sizes, err := c.Fetch(seqs, &imap.FetchOptions{UID: true, RFC822Size: true}).Collect()
	if err != nil {
		return nil, fmt.Errorf("imap fetch failed: %w", err)
	}
	sort.Slice(sizes, func(i, j int) bool { return sizes[i].SeqNum < sizes[j].SeqNum })
	var msgs []*fetched
	byUID := map[imap.UID]*fetched{}
	var small imap.UIDSet
	for _, s := range sizes {
		if s.UID == 0 {
			continue
		}
		m := &fetched{seq: s.SeqNum, uid: s.UID, size: s.RFC822Size}
		msgs = append(msgs, m)
		byUID[s.UID] = m
		if s.RFC822Size <= maxMessageBytes {
			small.AddNum(s.UID)
		}
	}
	if len(small) == 0 {
		return msgs, nil
	}

	section := &imap.FetchItemBodySection{Specifier: imap.PartSpecifierHeader, HeaderFields: headerNames, Peek: true}
	fc := c.Fetch(small, &imap.FetchOptions{
		UID:           true,
		BodyStructure: &imap.FetchItemBodyStructure{Extended: true},
		BodySection:   []*imap.FetchItemBodySection{section},
	})
	for msg := fc.Next(); msg != nil; msg = fc.Next() {
		var uid imap.UID
		var bs imap.BodyStructure
		var raw []byte
		for item := msg.Next(); item != nil; item = msg.Next() {
			switch it := item.(type) {
			case imapclient.FetchItemDataUID:
				uid = it.UID
			case imapclient.FetchItemDataBodyStructure:
				bs = it.BodyStructure
			case imapclient.FetchItemDataBodySection:
				if it.Literal != nil {
					b, err := readLiteral(it.Literal, maxMessageBytes)
					if err != nil {
						return nil, abandon(c, fmt.Errorf("imap fetch failed: %w", err))
					}
					raw = b
				}
			}
		}
		m := byUID[uid]
		if m == nil {
			continue
		}
		// No header section reads as no headers, as imapflow's missing `headers` did.
		m.headers = emailinbound.ParseHeaders(utf8Decode(raw))
		m.body = readStructure(bs)
		for _, h := range m.headers {
			if h.Name == "subject" {
				m.subject = h.Value
				break
			}
		}
		m.read = true
	}
	if err := fc.Close(); err != nil {
		return nil, fmt.Errorf("imap fetch failed: %w", err)
	}
	return msgs, nil
}

// abandon closes the client after a literal that could not be read whole, and returns err. A
// short literal means the stream is gone (or out of step), so nothing more is sent on it. And the
// fetch must not be touched again: go-imap would read the rest of the cut literal while its own
// reader goroutine reads the same buffer (a data race, found with -race). Close waits for that
// goroutine to stop.
func abandon(c *imapclient.Client, err error) error {
	_ = c.Close()
	return err
}

type handled struct {
	outcome   string
	duplicate bool
	files     int
	replyTo   *string
}

func (ru *run) handle(ctx context.Context, c *imapclient.Client, uidValidity string, m *fetched) (handled, error) {
	token, hasToken := emailinbound.ReplyTokenFrom(emailinbound.RecipientsOf(m.headers), ru.cfg.Mailbox)
	var outboxID string
	hasOutbox := false
	if !hasToken {
		outboxID, hasOutbox = emailinbound.OutboxIDFrom(m.headers, ru.domain)
	}
	files := emailinbound.CountFiles(m.body.root)
	from, _ := emailinbound.FromOf(m.headers)

	// Mail that names neither is not a reply to us: recorded (as an unknown token) without
	// reading it.
	body := ""
	if hasToken || hasOutbox {
		if ref, ok := emailinbound.TextPart(m.body.root); ok {
			text, err := downloadText(c, m, ref.Part)
			if err != nil {
				return handled{}, err
			}
			var plain, html *string
			if ref.HTML {
				html = &text
			} else {
				plain = &text
			}
			body = carddigits.MaskCardNumbers(emailinbound.NewWordsOnly(plain, html))
		}
	}

	args := recordArgs{
		ProviderEmailID: emailinbound.DedupeKey(m.headers, uidValidity, int64(m.uid)),
		// No token: the hash of "", which no 26-character token can have, so the SQL falls
		// through to the email-it-answers match.
		TokenHash: email.TokenHashParam(token),
		From:      from,
		// The email-it-answers match rests on a Message-ID, which travels in forwards and CCs, so
		// it needs DMARC itself; the token path also accepts aligned SPF and DKIM.
		SenderVerified: emailinbound.SenderVerified(m.headers, from, ru.authservID, !hasToken),
		Body:           body,
		Files:          files,
		MessageID:      uuid.New(),
		AutoReply:      emailinbound.IsAutoReply(m.headers, js.StringValue(m.subject)),
	}
	if hasOutbox {
		args.ReplyOutboxID = &outboxID
	}
	row, err := ru.rec.record(ctx, args)
	if err != nil {
		return handled{}, &recordError{err}
	}
	if row == nil {
		return handled{}, &recordError{errors.New("nothing returned")}
	}
	return handled{outcome: row.Outcome, duplicate: row.Duplicate, files: files, replyTo: row.ReplyTo}, nil
}

// downloadText fetches one text part (`TEXT` for a single-part message, as imapflow asked) in
// one window, refuses a cut-off literal, and decodes it (decodeText).
func downloadText(c *imapclient.Client, m *fetched, part string) (string, error) {
	l, known := m.body.leaves[part]
	if !known {
		return "", fmt.Errorf("part %s has no content", part)
	}
	section := &imap.FetchItemBodySection{Peek: true, Partial: &imap.SectionPartial{Offset: 0, Size: textWindow}}
	if part == "1" && len(m.body.root.ChildNodes) == 0 {
		section.Specifier = imap.PartSpecifierText
	} else {
		path, ok := splitPart(part)
		if !ok {
			return "", fmt.Errorf("part %s has no content", part)
		}
		section.Part = path
	}
	fc := c.Fetch(imap.UIDSetNum(m.uid), &imap.FetchOptions{UID: true, BodySection: []*imap.FetchItemBodySection{section}})
	var raw []byte
	got := false
	for msg := fc.Next(); msg != nil; msg = fc.Next() {
		for item := msg.Next(); item != nil; item = msg.Next() {
			it, ok := item.(imapclient.FetchItemDataBodySection)
			if !ok || it.Literal == nil {
				continue
			}
			// A server that ignores the window sends the whole part; the size gate bounds it.
			b, err := readLiteral(it.Literal, maxMessageBytes)
			if err != nil {
				return "", abandon(c, fmt.Errorf("part download failed: %w", err))
			}
			raw, got = b, true
		}
	}
	if err := fc.Close(); err != nil {
		return "", fmt.Errorf("part download failed: %w", err)
	}
	if !got {
		return "", fmt.Errorf("part %s has no content", part)
	}
	return decodeText(raw, l), nil
}

// ── The files note ─────────────────────────────────────────────────────────────

var (
	rePrefix      = js.Regexp(`^(re:\s*)+`, "i")
	usableReplyID = js.Regexp(`^<[^<>\s\r\n]+>$`, "")
)

// filesNote is the one automatic answer: files were left off, add them in the app. Verified
// sender only (the SQL answers reply_to only then).
func filesNote(ctx context.Context, env func(string) string, send func(context.Context, mail.Config, mail.Message) error,
	now func() time.Time, to string, m *fetched) error {
	cfg, err := email.ConfigFromEnv(env)
	if err != nil {
		return fmt.Errorf("email settings refused: %w", err)
	}
	if cfg == nil {
		return nil
	}
	subject := "Your files"
	if m.subject != "" && !strings.ContainsAny(m.subject, "\r\n") {
		subject = "Re: " + js.Slice(rePrefix.ReplaceAllLiteralString(m.subject, ""), 0, 150)
	}
	msg := mail.Message{
		FromName:    "Story-Tail Adventures",
		FromAddress: cfg.FromAddress,
		To:          to,
		Subject:     subject,
		Text: "Thanks for your reply. It's in your conversation now.\n\n" +
			"Your attachments couldn't come along by email. " +
			"You can add them in the app whenever you're ready: " + cfg.SiteURL + "/messages",
		// nodemailer minted a Message-ID under the sender's domain; so does this.
		MessageID: "<" + uuid.New() + "@" + strings.Split(cfg.FromAddress, "@")[1] + ">",
		Headers:   []mail.Header{{Name: "Auto-Submitted", Value: "auto-replied"}},
		Date:      now(),
	}
	for _, h := range m.headers {
		if h.Name == "message-id" {
			if usableReplyID.MatchString(h.Value) {
				msg.InReplyTo, msg.References = h.Value, h.Value
			}
			break
		}
	}
	t := email.SMTPTransport(*cfg)
	return send(ctx, mail.Config{Host: t.Host, Port: t.Port, Secure: t.ImplicitTLS, User: t.User, Password: t.Password}, msg)
}

// ── The database ───────────────────────────────────────────────────────────────

type recordArgs struct {
	ProviderEmailID string
	TokenHash       string
	From            string
	SenderVerified  bool
	Body            string
	Files           int
	MessageID       string
	AutoReply       bool
	ReplyOutboxID   *string
}

// recorded is email_inbound_record's row.
type recorded struct {
	Outcome   string  `json:"outcome"`
	Duplicate bool    `json:"duplicate"`
	ReplyTo   *string `json:"reply_to"`
}

type recorder interface {
	// record answers the first row, nil when there is none.
	record(ctx context.Context, a recordArgs) (*recorded, error)
}

type dbRecorder struct{ db *service.Client }

func (r dbRecorder) record(ctx context.Context, a recordArgs) (*recorded, error) {
	var outbox any = js.Undef // `outboxId ?? undefined`
	if a.ReplyOutboxID != nil {
		outbox = *a.ReplyOutboxID
	}
	var rows []recorded
	err := r.db.RPC(ctx, "email_inbound_record", js.O(
		"p_provider_email_id", a.ProviderEmailID,
		"p_token_hash", a.TokenHash,
		"p_from", a.From,
		"p_sender_verified", a.SenderVerified,
		"p_body", a.Body,
		"p_files", a.Files,
		"p_message_id", a.MessageID,
		"p_auto_reply", a.AutoReply,
		"p_reply_outbox_id", outbox,
	), &rows)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}
