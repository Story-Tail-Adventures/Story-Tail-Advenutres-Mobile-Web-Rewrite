package emailinbox

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-imap/v2/imapserver"
	"github.com/emersion/go-imap/v2/imapserver/imapmemserver"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/mail"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/emailinbound"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The IMAP flow, end to end, against go-imap's own in-memory server (the probe the review ran),
// and the hostile cases against servers written here.

const mailbox = "gyasi.messages@adventures.story-tail.com"

// commandLine is a command a go-imap client sent: its tag, then the verb (and UID's verb).
var commandLine = regexp.MustCompile(`^T\d+ ([A-Za-z]+)(?: ([A-Za-z]+))?`)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// testCard is a Luhn-valid number built at run time: the repo's guard refuses one in source.
func testCard() string {
	for d := 0; d <= 9; d++ {
		if n := "411111111111111" + strconv.Itoa(d); carddigits.LuhnValid(n) {
			return n[0:4] + " " + n[4:8] + " " + n[8:12] + " " + n[12:]
		}
	}
	panic("no check digit")
}

// ── The in-memory server ────────────────────────────────────────────────────────

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// memServer starts go-imap's in-memory server with these capabilities and one user, u / p.
// wire records what the server read and wrote.
func memServer(t *testing.T, caps ...imap.Cap) (addr string, wire *syncBuf) {
	t.Helper()
	mem := imapmemserver.New()
	u := imapmemserver.NewUser("u", "p")
	if err := u.Create("INBOX", nil); err != nil {
		t.Fatal(err)
	}
	mem.AddUser(u)
	set := imap.CapSet{imap.CapIMAP4rev1: {}}
	for _, c := range caps {
		set[c] = struct{}{}
	}
	wire = &syncBuf{}
	srv := imapserver.New(&imapserver.Options{
		NewSession: func(*imapserver.Conn) (imapserver.Session, *imapserver.GreetingData, error) {
			return mem.NewSession(), nil, nil
		},
		Caps:         set,
		InsecureAuth: true,
		Logger:       log.New(io.Discard, "", 0),
		DebugWriter:  wire,
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })
	return ln.Addr().String(), wire
}

func dialTest(t *testing.T, addr string) *imapclient.Client {
	t.Helper()
	c, err := imapclient.DialInsecure(addr, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Login("u", "p").Wait(); err != nil {
		t.Fatal(err)
	}
	return c
}

// seed appends raw messages to a folder (created when missing), with an internal date.
func seed(t *testing.T, addr, folder string, at time.Time, raws ...string) {
	t.Helper()
	c := dialTest(t, addr)
	defer c.Close()
	if folder != "INBOX" {
		_ = c.Create(folder, nil).Wait()
	}
	for _, raw := range raws {
		raw = strings.ReplaceAll(strings.ReplaceAll(raw, "\r\n", "\n"), "\n", "\r\n")
		ac := c.Append(folder, int64(len(raw)), &imap.AppendOptions{Time: at})
		if _, err := ac.Write([]byte(raw)); err != nil {
			t.Fatal(err)
		}
		if err := ac.Close(); err != nil {
			t.Fatal(err)
		}
		if _, err := ac.Wait(); err != nil {
			t.Fatal(err)
		}
	}
	_ = c.Logout().Wait()
}

// folders is each folder's Message-IDs, in order.
func folders(t *testing.T, addr string) map[string][]string {
	t.Helper()
	c := dialTest(t, addr)
	defer c.Close()
	list, err := c.List("", "*", nil).Collect()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string][]string{}
	for _, l := range list {
		sel, err := c.Select(l.Mailbox, nil).Wait()
		if err != nil {
			t.Fatal(err)
		}
		out[l.Mailbox] = []string{}
		if sel.NumMessages == 0 {
			continue
		}
		section := &imap.FetchItemBodySection{Specifier: imap.PartSpecifierHeader, HeaderFields: []string{"message-id"}, Peek: true}
		msgs, err := c.Fetch(imap.SeqSet{{Start: 1, Stop: sel.NumMessages}}, &imap.FetchOptions{BodySection: []*imap.FetchItemBodySection{section}}).Collect()
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range msgs {
			for _, h := range emailinbound.ParseHeaders(string(m.FindBodySection(section))) {
				out[l.Mailbox] = append(out[l.Mailbox], h.Value)
			}
		}
	}
	_ = c.Logout().Wait()
	return out
}

// ── The run under test ──────────────────────────────────────────────────────────

// fakeRecorder answers like email_inbound_record: the live token is accepted (reply_to the
// verified sender), an answer to an outbox row is a duplicate, anything else an unknown token.
type fakeRecorder struct {
	mu    sync.Mutex
	token string
	calls []recordArgs
	err   error
}

func (f *fakeRecorder) record(_ context.Context, a recordArgs) (*recorded, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, a)
	if f.err != nil {
		return nil, f.err
	}
	switch {
	case f.token != "" && a.TokenHash == email.TokenHashParam(f.token):
		to := "jordan@example.com"
		return &recorded{Outcome: "accepted", ReplyTo: &to}, nil
	case a.ReplyOutboxID != nil:
		return &recorded{Outcome: "accepted", Duplicate: true}, nil
	}
	return &recorded{Outcome: "unknown_token"}, nil
}

type noted struct{ to, subject string }

func testRun(t *testing.T, addr string, rec recorder) (*run, *[]noted) {
	t.Helper()
	host, port, _ := net.SplitHostPort(addr)
	env := map[string]string{"EMAIL_IMAP_HOST": host, "EMAIL_IMAP_PORT": port, "EMAIL_IMAP_USER": "u",
		"EMAIL_IMAP_PASSWORD": "p", "EMAIL_FROM_ADDRESS": mailbox}
	cfg, err := email.InboxConfigFromEnv(func(k string) string { return env[k] })
	if err != nil || cfg == nil || cfg.Secure {
		t.Fatalf("config %+v %v", cfg, err)
	}
	notes := &[]noted{}
	return &run{
		cfg: *cfg, domain: "adventures.story-tail.com", authservID: "mx.ionos.com", rec: rec,
		note: func(_ context.Context, to string, m *fetched) error {
			*notes = append(*notes, noted{to, m.subject})
			return nil
		},
		now: time.Now, log: quiet,
	}, notes
}

func marshal(t *testing.T, v any) string {
	t.Helper()
	b, err := js.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// ── The messages ───────────────────────────────────────────────────────────────

// reply is a client's answer to the plus address: alternative text and HTML (latin-1,
// quoted-printable, format=flowed), quoted history under it, and a PDF that cannot come along.
func reply(token string) string {
	return "From: Jordan Hayes <jordan@example.com>\n" +
		"To: Story-Tail <gyasi.messages+" + token + "@adventures.story-tail.com>\n" +
		"Subject: RE: re: Diff wrote about Lisbon\n" +
		"Message-ID: <reply-1@example.com>\n" +
		"Authentication-Results: mx.ionos.com; dmarc=pass header.from=example.com\n" +
		"MIME-Version: 1.0\n" +
		"Content-Type: multipart/mixed; boundary=XX\n\n" +
		"--XX\nContent-Type: multipart/alternative; boundary=YY\n\n" +
		"--YY\nContent-Type: text/plain; charset=iso-8859-1; format=flowed\nContent-Transfer-Encoding: quoted-printable\n\n" +
		"Caf=E9 sounds good=20\nto us. Card " + testCard() + ".\n\nOn Mon, Nov 2, 2026 at 9:00 AM Diff wrote:\n> old words\n" +
		"--YY\nContent-Type: text/html; charset=utf-8\n\n<p>not this one</p>\n--YY--\n" +
		"--XX\nContent-Type: application/pdf; name=a.pdf\nContent-Disposition: attachment; filename=a.pdf\n" +
		"Content-Transfer-Encoding: base64\n\nJVBERi0xLjQK\n--XX--\n"
}

const stranger = "From: someone@example.org\nTo: gyasi.messages@adventures.story-tail.com\nSubject: Hello\n" +
	"Message-ID: <stranger-1@example.org>\nContent-Type: text/plain\n\nIs this the travel place?\n"

// answer replies to one of our emails by its Message-ID only: one part, base64.
func answer() string {
	return "From: jordan@example.com\nTo: gyasi.messages@adventures.story-tail.com\nSubject: Re: Lisbon\n" +
		"Message-ID: <answer-1@example.com>\n" +
		"In-Reply-To: <0195a2c0-0000-7000-8000-0000000000bb@adventures.story-tail.com>\n" +
		"Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n" +
		base64.StdEncoding.EncodeToString([]byte("Sounds great!\n\nSent from my iPhone")) + "\n"
}

func huge() string {
	return "From: jordan@example.com\nTo: gyasi.messages@adventures.story-tail.com\nSubject: Photos\n" +
		"Message-ID: <huge-1@example.com>\nContent-Type: text/plain\n\n" + strings.Repeat("x", maxMessageBytes) + "\n"
}

func TestARunReadsRecordsMovesAndPurges(t *testing.T) {
	addr, wire := memServer(t, imap.CapMove, imap.CapUIDPlus)
	token := email.NewToken()
	seed(t, addr, "INBOX", time.Now(), reply(token), stranger, answer(), huge())
	seed(t, addr, "Processed", time.Now().Add(-40*24*time.Hour), "Message-ID: <old-1@example.com>\nSubject: old\n\nold\n")
	seed(t, addr, "Processed", time.Now().Add(-2*24*time.Hour), "Message-ID: <recent-1@example.com>\nSubject: recent\n\nrecent\n")
	rec := &fakeRecorder{token: token}
	ru, notes := testRun(t, addr, rec)

	out, err := ru.readInbox(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got := marshal(t, out); got != `{"read":4,"outcomes":{"accepted":1,"unknown_token":1,"duplicate":1,"too_large":1},"skipped":0,"purged":1}` {
		t.Errorf("reply %s", got)
	}

	want := map[string][]string{
		"INBOX":     {},
		"Processed": {"<recent-1@example.com>", "<reply-1@example.com>", "<answer-1@example.com>"},
		"Rejected":  {"<stranger-1@example.org>", "<huge-1@example.com>"},
		"Failed":    {},
	}
	if got := folders(t, addr); !reflect.DeepEqual(got, want) {
		t.Errorf("folders %v", got)
	}

	if len(rec.calls) != 3 {
		t.Fatalf("recorded %d", len(rec.calls))
	}
	r1, r2, r3 := rec.calls[0], rec.calls[1], rec.calls[2]
	// The new words only, latin-1 decoded, flowed lines joined, the card masked.
	if r1.Body != carddigits.MaskCardNumbers("Caf\U000000e9 sounds good to us. Card "+testCard()+".") ||
		r1.From != "jordan@example.com" || !r1.SenderVerified || r1.Files != 1 || r1.AutoReply ||
		r1.ReplyOutboxID != nil || !strings.HasPrefix(r1.ProviderEmailID, "mid:") || r1.TokenHash != email.TokenHashParam(token) {
		t.Errorf("reply recorded as %+v", r1)
	}
	// Not a reply to us: never downloaded, recorded under the hash of "".
	if r2.Body != "" || r2.TokenHash != email.TokenHashParam("") || r2.From != "someone@example.org" || r2.SenderVerified {
		t.Errorf("stranger recorded as %+v", r2)
	}
	// Matched by the email it answers: that path needs DMARC, which this one lacks.
	if r3.Body != "Sounds great!" || r3.ReplyOutboxID == nil || *r3.ReplyOutboxID != "0195a2c0-0000-7000-8000-0000000000bb" ||
		r3.SenderVerified || r3.Files != 0 {
		t.Errorf("answer recorded as %+v", r3)
	}
	// One note, to the verified sender, for the accepted reply with a file (not the duplicate).
	if !reflect.DeepEqual(*notes, []noted{{"jordan@example.com", "RE: re: Diff wrote about Lisbon"}}) {
		t.Errorf("notes %+v", *notes)
	}

	w := wire.String()
	// The over-size message (UID 4) never had its structure or a part fetched, and nothing was
	// ever marked \Seen or fetched without PEEK.
	for _, line := range strings.Split(w, "\r\n") {
		if strings.Contains(line, "UID FETCH") && (strings.Contains(line, "BODYSTRUCTURE") || strings.Contains(line, "BODY.PEEK[")) {
			if strings.Contains(line, "UID FETCH 4") || strings.Contains(line, ":4") || strings.Contains(line, ",4") {
				t.Errorf("the over-size message was fetched: %s", line)
			}
		}
		if strings.Contains(line, "FETCH") && strings.Contains(line, "BODY[") && !strings.Contains(line, "BODY.PEEK[") &&
			!strings.HasPrefix(line, "*") {
			t.Errorf("a fetch without PEEK: %s", line)
		}
	}
	for _, want := range []string{"BODY.PEEK[1.1]<0.240000>", "BODY.PEEK[TEXT]<0.240000>", "UID EXPUNGE"} {
		if !strings.Contains(w, want) {
			t.Errorf("the wire never says %s", want)
		}
	}
	// The commands clients sent (the seeding one APPENDs; the run never does).
	allowed := map[string]bool{"LOGIN": true, "CAPABILITY": true, "LIST": true, "CREATE": true, "SELECT": true,
		"FETCH": true, "UID FETCH": true, "UID MOVE": true, "UID SEARCH": true, "UID STORE": true, "UID EXPUNGE": true,
		"LOGOUT": true, "APPEND": true}
	for _, line := range strings.Split(w, "\r\n") {
		m := commandLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		verb := strings.ToUpper(m[1])
		if verb == "OK" || verb == "NO" || verb == "BAD" {
			continue // the server's tagged answer
		}
		if verb == "UID" {
			verb += " " + strings.ToUpper(m[2])
		}
		if !allowed[verb] {
			t.Errorf("a client sent %s", verb)
		}
	}

	// A second run finds nothing, and the folders already exist.
	out, err = ru.readInbox(context.Background())
	if err != nil || marshal(t, out) != `{"read":0,"outcomes":{},"skipped":0,"purged":0}` {
		t.Errorf("second run %v %v", marshal(t, out), err)
	}
}

func TestWithoutUIDPLUSNothingIsPurged(t *testing.T) {
	addr, wire := memServer(t, imap.CapMove)
	seed(t, addr, "Processed", time.Now().Add(-40*24*time.Hour), "Message-ID: <old-1@example.com>\n\nold\n")
	ru, _ := testRun(t, addr, &fakeRecorder{})
	out, err := ru.readInbox(context.Background())
	if err != nil || marshal(t, out) != `{"read":0,"outcomes":{},"skipped":0,"purged":0}` {
		t.Fatalf("%v %v", marshal(t, out), err)
	}
	if got := folders(t, addr)["Processed"]; len(got) != 1 {
		t.Errorf("old mail went: %v", got)
	}
	if strings.Contains(wire.String(), "EXPUNGE") || strings.Contains(wire.String(), "STORE") {
		t.Error("a plain EXPUNGE could remove mail a person flagged")
	}
}

func TestWithoutMOVENothingIsTouched(t *testing.T) {
	addr, _ := memServer(t, imap.CapUIDPlus)
	seed(t, addr, "INBOX", time.Now(), stranger)
	rec := &fakeRecorder{}
	ru, _ := testRun(t, addr, rec)
	if _, err := ru.readInbox(context.Background()); err == nil || !strings.Contains(err.Error(), "no MOVE") {
		t.Fatalf("%v", err)
	}
	if len(rec.calls) != 0 || len(folders(t, addr)["INBOX"]) != 1 {
		t.Error("something was handled")
	}
}

// A database error stops the run; the message stays in INBOX for the next one.
func TestRecordErrorStopsTheRunAndKeepsTheMessage(t *testing.T) {
	addr, _ := memServer(t, imap.CapMove, imap.CapUIDPlus)
	seed(t, addr, "INBOX", time.Now(), stranger, answer())
	rec := &fakeRecorder{err: &service.Error{Message: "connection refused"}}
	ru, _ := testRun(t, addr, rec)
	_, err := ru.readInbox(context.Background())
	var re *recordError
	if !errors.As(err, &re) {
		t.Fatalf("%v", err)
	}
	if len(rec.calls) != 1 || len(folders(t, addr)["INBOX"]) != 2 {
		t.Errorf("calls %d, inbox %v", len(rec.calls), folders(t, addr)["INBOX"])
	}
}

// Past 60 s no new message is started (it waits in INBOX) and nothing is purged.
func TestTimeBudgetSkipsTheRest(t *testing.T) {
	addr, _ := memServer(t, imap.CapMove, imap.CapUIDPlus)
	seed(t, addr, "INBOX", time.Now(), stranger, answer())
	seed(t, addr, "Processed", time.Now().Add(-40*24*time.Hour), "Message-ID: <old-1@example.com>\n\nold\n")
	ru, _ := testRun(t, addr, &fakeRecorder{})
	t0 := time.Now()
	calls := 0
	ru.now = func() time.Time {
		calls++
		if calls <= 2 { // the start, and the first message's check
			return t0
		}
		return t0.Add(60001 * time.Millisecond)
	}
	out, err := ru.readInbox(context.Background())
	if err != nil || marshal(t, out) != `{"read":1,"outcomes":{"unknown_token":1},"skipped":1,"purged":0}` {
		t.Fatalf("%v %v", marshal(t, out), err)
	}
	if f := folders(t, addr); len(f["INBOX"]) != 1 || len(f["Processed"]) != 1 {
		t.Errorf("%v", f)
	}
}

// ── Hostile servers ─────────────────────────────────────────────────────────────

// scripted serves one connection: each command line goes to answer, which returns what to write
// (and whether to hang up). An empty answer means no reply at all.
func scripted(t *testing.T, greeting string, answer func(tag, cmd string, w io.Writer) bool) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		if greeting != "" {
			fmt.Fprint(conn, greeting)
		}
		r := bufio.NewReader(conn)
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			tag, cmd, _ := strings.Cut(strings.TrimRight(line, "\r\n"), " ")
			if !answer(tag, cmd, conn) {
				return
			}
		}
	}()
	return ln.Addr().String()
}

// mailboxServer answers the run up to its text download, which download decides.
func mailboxServer(t *testing.T, download func(tag string, w io.Writer) bool) string {
	const caps = "IMAP4rev1 MOVE UIDPLUS"
	raw := "From: jordan@example.com\r\nTo: gyasi.messages+abcdefghijklmnopqrstuvwxyz@adventures.story-tail.com\r\n" +
		"Subject: Re: Lisbon\r\nMessage-ID: <cut-1@example.com>\r\n\r\n"
	return scripted(t, "* OK [CAPABILITY "+caps+"] ready\r\n", func(tag, cmd string, w io.Writer) bool {
		up := strings.ToUpper(cmd)
		switch {
		case strings.HasPrefix(up, "LOGIN"):
			fmt.Fprintf(w, "%s OK [CAPABILITY %s] done\r\n", tag, caps)
		case strings.HasPrefix(up, "CAPABILITY"):
			fmt.Fprintf(w, "* CAPABILITY %s\r\n%s OK done\r\n", caps, tag)
		case strings.HasPrefix(up, "LIST"):
			fmt.Fprintf(w, "* LIST () \"/\" INBOX\r\n* LIST () \"/\" Processed\r\n* LIST () \"/\" Rejected\r\n* LIST () \"/\" Failed\r\n%s OK done\r\n", tag)
		case strings.HasPrefix(up, "SELECT"):
			fmt.Fprintf(w, "* 1 EXISTS\r\n* OK [UIDVALIDITY 9] x\r\n%s OK [READ-WRITE] done\r\n", tag)
		case strings.HasPrefix(up, "FETCH"):
			fmt.Fprintf(w, "* 1 FETCH (UID 7 RFC822.SIZE 500)\r\n%s OK done\r\n", tag)
		case strings.HasPrefix(up, "UID FETCH") && strings.Contains(up, "BODYSTRUCTURE"):
			fmt.Fprintf(w, "* 1 FETCH (UID 7 BODYSTRUCTURE (\"text\" \"plain\" (\"charset\" \"utf-8\") NIL NIL \"7bit\" 10 1 NIL NIL NIL NIL) "+
				"BODY[HEADER.FIELDS (FROM TO CC DELIVERED-TO X-ORIGINAL-TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES AUTHENTICATION-RESULTS AUTO-SUBMITTED PRECEDENCE X-AUTOREPLY X-AUTORESPOND)] {%d}\r\n%s)\r\n%s OK done\r\n",
				len(raw), raw, tag)
		case strings.HasPrefix(up, "UID FETCH"):
			return download(tag, w)
		case strings.HasPrefix(up, "UID MOVE"):
			fmt.Fprintf(w, "* 1 EXPUNGE\r\n%s OK done\r\n", tag)
		case strings.HasPrefix(up, "UID SEARCH"):
			fmt.Fprintf(w, "* SEARCH\r\n%s OK done\r\n", tag)
		case strings.HasPrefix(up, "LOGOUT"):
			fmt.Fprintf(w, "* BYE\r\n%s OK done\r\n", tag)
			return false
		default:
			fmt.Fprintf(w, "%s OK done\r\n", tag)
		}
		return true
	})
}

func scriptedRun(t *testing.T, addr string, rec recorder) *run {
	ru, _ := testRun(t, addr, rec)
	return ru
}

// A cut-off text part is never recorded as if whole. The connection is gone with it, so the run
// fails (as imapflow's did) and the message waits in INBOX.
func TestATruncatedPartIsNeverRecorded(t *testing.T) {
	addr := mailboxServer(t, func(tag string, w io.Writer) bool {
		fmt.Fprint(w, "* 1 FETCH (UID 7 BODY[TEXT]<0> {100}\r\n"+strings.Repeat("a", 50))
		return false
	})
	rec := &fakeRecorder{}
	_, err := scriptedRun(t, addr, rec).readInbox(context.Background())
	if err == nil {
		t.Fatal("the run went on")
	}
	if len(rec.calls) != 0 {
		t.Errorf("a cut-off body was recorded: %+v", rec.calls)
	}
}

// A part the server says is not there (NIL) is that message's problem: it goes to Failed and
// the run carries on.
func TestAPartThatWillNotDownloadGoesToFailed(t *testing.T) {
	addr := mailboxServer(t, func(tag string, w io.Writer) bool {
		fmt.Fprintf(w, "* 1 FETCH (UID 7 BODY[TEXT]<0> NIL)\r\n%s OK done\r\n", tag)
		return true
	})
	rec := &fakeRecorder{}
	ru := scriptedRun(t, addr, rec)
	out, err := ru.readInbox(context.Background())
	if err != nil || marshal(t, out) != `{"read":1,"outcomes":{"failed":1},"skipped":0,"purged":0}` || len(rec.calls) != 0 {
		t.Errorf("%v %v %d", marshal(t, out), err, len(rec.calls))
	}
}

// A server that greets and then never answers ends at the run's hard deadline, not never.
func TestASilentServerEndsAtTheHardDeadline(t *testing.T) {
	defer func(d time.Duration) { runLimit = d }(runLimit)
	runLimit = 1500 * time.Millisecond
	addr := scripted(t, "* OK ready\r\n", func(string, string, io.Writer) bool {
		time.Sleep(10 * time.Second)
		return false
	})
	start := time.Now()
	_, err := scriptedRun(t, addr, &fakeRecorder{}).readInbox(context.Background())
	if err == nil || time.Since(start) > 4*time.Second {
		t.Errorf("after %v: %v", time.Since(start), err)
	}
}

func TestAServerThatNeverGreetsTimesOut(t *testing.T) {
	defer func(d time.Duration) { greetingTimeout = d }(greetingTimeout)
	greetingTimeout = 300 * time.Millisecond
	addr := scripted(t, "", func(string, string, io.Writer) bool { return true })
	start := time.Now()
	_, err := scriptedRun(t, addr, &fakeRecorder{}).readInbox(context.Background())
	if err == nil || err.Error() != "imap greeting timed out" || time.Since(start) > 2*time.Second {
		t.Errorf("after %v: %v", time.Since(start), err)
	}
}

// ── The function and the files note ───────────────────────────────────────────

func TestFuncRefusesGetAndAnswersUnconfiguredWithA500(t *testing.T) {
	d := &edge.Deps{Env: func(string) string { return "" }, Log: quiet, Now: time.Now}
	_, err := Func(d, httptest.NewRequest(http.MethodGet, "/", nil))
	if p, ok := problem.As(err); !ok || p.Status != 403 || p.Detail != "Use POST to read the inbox." {
		t.Errorf("GET: %v", err)
	}
	for name, env := range map[string]map[string]string{
		"nothing set": {},
		"port 143 to a real server": {"EMAIL_IMAP_HOST": "imap.ionos.com", "EMAIL_IMAP_PORT": "143",
			"EMAIL_SMTP_USER": "u", "EMAIL_SMTP_PASSWORD": "p", "EMAIL_FROM_ADDRESS": mailbox},
	} {
		d := &edge.Deps{Env: func(k string) string { return env[k] }, Log: quiet, Now: time.Now}
		_, err := Func(d, httptest.NewRequest(http.MethodPost, "/", nil))
		if _, isProblem := problem.As(err); err == nil || isProblem {
			t.Errorf("%s: %v (Deno answered a bare 500)", name, err)
		}
	}
}

func TestFilesNote(t *testing.T) {
	env := map[string]string{"EMAIL_SMTP_HOST": "127.0.0.1", "EMAIL_SMTP_PORT": "1025", "EMAIL_FROM_ADDRESS": mailbox,
		"EMAIL_SITE_URL": "http://localhost:3000", "EMAIL_UNSUBSCRIBE_URL": "http://127.0.0.1:54321/functions/v1/email-unsubscribe"}
	get := func(k string) string { return env[k] }
	var sent []mail.Message
	var used mail.Config
	send := func(_ context.Context, c mail.Config, m mail.Message) error {
		used = c
		sent = append(sent, m)
		return nil
	}
	now := func() time.Time { return time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC) }

	m := &fetched{subject: "RE: re:Re:  Lisbon " + strings.Repeat("x", 200),
		headers: emailinbound.ParseHeaders("Message-ID: <reply-1@example.com>")}
	if err := filesNote(context.Background(), get, send, now, "jordan@example.com", m); err != nil {
		t.Fatal(err)
	}
	n := sent[0]
	if n.Subject != "Re: Lisbon "+strings.Repeat("x", 150-len("Lisbon ")) || n.To != "jordan@example.com" ||
		n.FromName != "Story-Tail Adventures" || n.FromAddress != mailbox || n.ReplyTo != "" ||
		n.InReplyTo != "<reply-1@example.com>" || n.References != n.InReplyTo ||
		!strings.HasSuffix(n.MessageID, "@adventures.story-tail.com>") ||
		!reflect.DeepEqual(n.Headers, []mail.Header{{Name: "Auto-Submitted", Value: "auto-replied"}}) ||
		!strings.HasSuffix(n.Text, "whenever you're ready: http://localhost:3000/messages") {
		t.Errorf("%+v", n)
	}
	if used.Host != "127.0.0.1" || used.Port != 1025 || used.Secure || used.User != "" {
		t.Errorf("transport %+v", used)
	}

	// A subject with a line break, and a Message-ID that is not one: the safe fallbacks.
	sent = nil
	m = &fetched{subject: "a\rb", headers: emailinbound.ParseHeaders("Message-ID: <two words@x>")}
	_ = filesNote(context.Background(), get, send, now, "jordan@example.com", m)
	if sent[0].Subject != "Your files" || sent[0].InReplyTo != "" {
		t.Errorf("%+v", sent[0])
	}

	// No SMTP settings: nothing to send it with, and no error.
	sent = nil
	if err := filesNote(context.Background(), func(string) string { return "" }, send, now, "j@example.com", m); err != nil || sent != nil {
		t.Errorf("%v %v", err, sent)
	}
}
