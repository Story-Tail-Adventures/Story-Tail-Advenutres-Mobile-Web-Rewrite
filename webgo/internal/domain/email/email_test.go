package email

import (
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Ported from _shared/email_test.ts, one Go test per Deno.test. The email half of
// agentAlerts_test.ts is in agentalerts_test.go.

var prodEnv = map[string]string{
	"EMAIL_SMTP_HOST":       "smtp.ionos.com",
	"EMAIL_SMTP_USER":       "gyasi.messages@adventures.story-tail.com",
	"EMAIL_SMTP_PASSWORD":   "secret",
	"EMAIL_FROM_ADDRESS":    "gyasi.messages@adventures.story-tail.com",
	"EMAIL_SITE_URL":        "https://storytailadventures.vercel.app/",
	"EMAIL_UNSUBSCRIBE_URL": "https://x.supabase.co/functions/v1/email-unsubscribe",
}

// unset stands for `undefined` in an override: every setting reads "" and unset alike.
const unset = ""

func envOf(over map[string]string) func(string) string {
	return func(name string) string {
		if v, ok := over[name]; ok {
			return v
		}
		return prodEnv[name]
	}
}

func mustConfig() Config {
	c, err := ConfigFromEnv(envOf(nil))
	if err != nil || c == nil {
		panic("the production settings must load")
	}
	return *c
}

var cfg = mustConfig()

const (
	t1 = "abcdefghijklmnopqrstuvwxyz"
	t2 = "234567abcdefghijklmnopqrst"
)

var tokens = Tokens{Reply: t1, Unsubscribe: t2}

func str(s string) *string { return &s }

func row(edit func(r *ClaimedEmail)) ClaimedEmail {
	r := ClaimedEmail{
		OutboxID:        "0195a2c0-0000-7000-8000-0000000000e1",
		ConversationID:  "0195a2c0-1a00-7000-8000-0000000000b0",
		Recipient:       "jordan.hayes@example.com",
		ClientFirstName: str("Jordan"),
		AgentFirstName:  str("Gyasi"),
		TripTitle:       str("Bahamas Anniversary"),
		Messages: []ClaimedMessage{{
			MessageID:   "m1",
			Body:        "Your ferry is booked for 9am.",
			CreatedAt:   "2026-10-16T14:00:00.123456+00:00",
			Attachments: []string{},
		}},
	}
	if edit != nil {
		edit(&r)
	}
	return r
}

func said(body string, attachments ...string) []ClaimedMessage {
	return []ClaimedMessage{{MessageID: "m", Body: body, Attachments: attachments}}
}

func build(t *testing.T, r ClaimedEmail, tk Tokens) Built {
	t.Helper()
	e, err := BuildEmail(r, tk, cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func eq[T any](t *testing.T, got, want T) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func wantErr(t *testing.T, err error, includes string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), includes) {
		t.Errorf("want an error including %q, got %v", includes, err)
	}
}

func has(t *testing.T, s, part string) {
	t.Helper()
	if !strings.Contains(s, part) {
		t.Errorf("%q does not include %q", s, part)
	}
}

const bullets = "\U00002022\U00002022\U00002022\U00002022"

// visa is `Array(4).fill("4242").join(sep)`: built at runtime, as the PCI guard refuses any
// Luhn-valid number in source, tests included.
func visa(sep string) string { return strings.Join([]string{"4242", "4242", "4242", "4242"}, sep) }

// ── Config ──────────────────────────────────────────────────────────────────

// Deno: "config: production settings are TLS on 465, with credentials"
func TestConfigProductionTLSOn465(t *testing.T) {
	eq(t, cfg.Port, 465)
	eq(t, cfg.Secure, true)
	eq(t, cfg.SiteURL, "https://storytailadventures.vercel.app")
}

// Deno: "config: not set up is null, so the dispatcher refuses before claiming"
func TestConfigNotSetUpIsNull(t *testing.T) {
	c, err := ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_HOST": unset}))
	if c != nil || err != nil {
		t.Errorf("got (%v, %v), want (nil, nil)", c, err)
	}
}

// Deno: "config: any port but 465 is refused for a real server (no STARTTLS, no cleartext)"
func TestConfigAnyPortBut465Refused(t *testing.T) {
	_, err := ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_PORT": "587"}))
	wantErr(t, err, "465 only")
	_, err = ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_PORT": "25"}))
	wantErr(t, err, "465 only")
}

// Deno: "config: the local catcher may be plain, but never with a password"
func TestConfigLocalCatcherPlainNeverWithPassword(t *testing.T) {
	local, err := ConfigFromEnv(envOf(map[string]string{
		"EMAIL_SMTP_HOST":       "supabase_inbucket_storytail-adventures",
		"EMAIL_SMTP_PORT":       "1025",
		"EMAIL_SMTP_USER":       unset,
		"EMAIL_SMTP_PASSWORD":   unset,
		"EMAIL_SITE_URL":        "http://localhost:3000",
		"EMAIL_UNSUBSCRIBE_URL": "http://127.0.0.1:54321/functions/v1/email-unsubscribe",
	}))
	if err != nil || local == nil {
		t.Fatalf("got (%v, %v)", local, err)
	}
	eq(t, local.Secure, false)
	_, err = ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_HOST": "supabase_inbucket_storytail-adventures", "EMAIL_SMTP_PORT": "1025"}))
	wantErr(t, err, "465 only")
}

// Deno: "config: a real server without a login, half a login, or an http link is refused"
func TestConfigRealServerNeedsLoginAndHTTPS(t *testing.T) {
	_, err := ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_USER": unset, "EMAIL_SMTP_PASSWORD": unset}))
	wantErr(t, err, "needs")
	_, err = ConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_PASSWORD": unset}))
	wantErr(t, err, "both")
	_, err = ConfigFromEnv(envOf(map[string]string{"EMAIL_SITE_URL": "http://storytailadventures.vercel.app"}))
	wantErr(t, err, "EMAIL_SITE_URL")
}

// Deno: "inbox config: the sending login, port 993 with TLS, and nothing without a login"
func TestInboxConfig(t *testing.T) {
	c, err := InboxConfigFromEnv(envOf(nil))
	if err != nil || c == nil {
		t.Fatalf("got (%v, %v)", c, err)
	}
	eq(t, []any{c.Host, c.Port, c.Secure, c.Mailbox}, []any{"imap.ionos.com", 993, true, "gyasi.messages@adventures.story-tail.com"})
	none, err := InboxConfigFromEnv(envOf(map[string]string{"EMAIL_SMTP_PASSWORD": unset}))
	if none != nil || err != nil {
		t.Errorf("got (%v, %v), want (nil, nil)", none, err)
	}
	_, err = InboxConfigFromEnv(envOf(map[string]string{"EMAIL_IMAP_PORT": "143"}))
	wantErr(t, err, "993 only")
	local, err := InboxConfigFromEnv(envOf(map[string]string{"EMAIL_IMAP_HOST": "host.docker.internal", "EMAIL_IMAP_PORT": "3143"}))
	if err != nil || local == nil {
		t.Fatalf("got (%v, %v)", local, err)
	}
	eq(t, local.Secure, false)
}

// ── Tokens ──────────────────────────────────────────────────────────────────

// Deno: "tokens: 26 lowercase base32 characters, different every time"
func TestTokensBase32DifferentEveryTime(t *testing.T) {
	a := NewToken()
	b := NewToken()
	if !IsToken(js.StringValue(a)) || !IsToken(js.StringValue(b)) {
		t.Errorf("not tokens: %q %q", a, b)
	}
	if !regexp.MustCompile(`^[a-z2-7]{26}$`).MatchString(a) {
		t.Errorf("got %q", a)
	}
	if a == b {
		t.Error("two tokens were the same")
	}
	eq(t, TokenFromBytes([16]byte{}), strings.Repeat("a", 26))
}

// Deno: "tokens: hashed as SHA-256 in PostgREST's bytea hex form"
func TestTokensHashedAsByteaHex(t *testing.T) {
	// SHA-256 of the empty string.
	eq(t, TokenHashParam(""), "\\xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
	eq(t, TokenHashParam(strings.ToUpper(t1)), TokenHashParam(t1))
}

// ── The email ───────────────────────────────────────────────────────────────

// Deno: "email: from the advisor at Story-Tail, to the bare address, replies to the token"
func TestEmailFromAdvisorToBareAddressRepliesToToken(t *testing.T) {
	e := build(t, row(nil), tokens)
	eq(t, e.From, Sender{Name: "Gyasi at Story-Tail Adventures", Address: cfg.FromAddress})
	eq(t, e.To, "jordan.hayes@example.com")
	// Replies come back to the mailbox itself, matched by the token in the plus address.
	eq(t, e.ReplyTo, "gyasi.messages+"+t1+"@adventures.story-tail.com")
	eq(t, e.Subject, "Gyasi wrote about Bahamas Anniversary")
	eq(t, build(t, row(func(r *ClaimedEmail) { r.TripTitle = nil }), tokens).Subject, "A note from Gyasi")
}

// Deno: "email: with no advisor name, it says 'your advisor', capitalised only to start a sentence"
func TestEmailNoAdvisorNameSaysYourAdvisor(t *testing.T) {
	e := build(t, row(func(r *ClaimedEmail) {
		r.AgentFirstName, r.TripTitle, r.Messages = nil, nil, said("Hello", "a.pdf")
	}), tokens)
	eq(t, e.Subject, "A note from your advisor")
	eq(t, e.From.Name, "Your advisor at Story-Tail Adventures")
	has(t, e.Text, "Your advisor shared a file with you: a.pdf.")
	has(t, e.Text, "Reply to this email and your advisor will see it")
}

// Deno: "email: a card number in a trip title is masked in the subject"
func TestEmailCardNumberInTripTitleMasked(t *testing.T) {
	e := build(t, row(func(r *ClaimedEmail) { r.TripTitle = str("Card " + visa(" ")) }), tokens)
	eq(t, e.Subject, "Gyasi wrote about Card "+bullets+" 4242")
}

// Deno: "email: carries the words, the thread link and both opt-out paths"
func TestEmailCarriesWordsThreadLinkAndOptOuts(t *testing.T) {
	e := build(t, row(nil), tokens)
	has(t, e.Text, "Your ferry is booked for 9am.")
	has(t, e.Text, "https://storytailadventures.vercel.app/messages/0195a2c0-1a00-7000-8000-0000000000b0")
	has(t, e.Text, "https://storytailadventures.vercel.app/email/unsubscribe?t="+t2)
	unsub, _ := e.HeaderValue("List-Unsubscribe")
	eq(t, unsub, "<"+cfg.UnsubscribeURL+"?t="+t2+">")
	post, _ := e.HeaderValue("List-Unsubscribe-Post")
	eq(t, post, "List-Unsubscribe=One-Click")
	if strings.Contains(e.Text, t1) || strings.Contains(e.HTML, t1) {
		t.Error("the reply token is only in Reply-To")
	}
}

// Deno: "email: card numbers are masked in both parts"
func TestEmailCardNumbersMaskedInBothParts(t *testing.T) {
	v := visa(" ")
	e := build(t, row(func(r *ClaimedEmail) { r.Messages = said("Card " + v + " is on file.") }), tokens)
	if strings.Contains(e.Text, v) || !strings.Contains(e.Text, bullets+" 4242") {
		t.Errorf("text: %q", e.Text)
	}
	if strings.Contains(e.HTML, v) || !strings.Contains(e.HTML, bullets+" 4242") {
		t.Errorf("html: %q", e.HTML)
	}
}

// Deno: "email: card numbers split by dots or no-break spaces are masked too (review)"
func TestEmailCardNumbersSplitByDotsOrNBSPMasked(t *testing.T) {
	dotted := visa(".")
	nbsp := visa("\U000000a0")
	e := build(t, row(func(r *ClaimedEmail) { r.Messages = said("A " + dotted + " and B " + nbsp + ".") }), tokens)
	if strings.Contains(e.Text, dotted) || strings.Contains(e.Text, nbsp) {
		t.Errorf("text: %q", e.Text)
	}
	eq(t, strings.Count(e.Text, bullets+" 4242"), 2)
}

// Deno: "email: a short number in front or letters touching cannot hide a card"
func TestEmailShortNumberOrLettersCannotHideCard(t *testing.T) {
	// The guard's rule (carddigits): every span of whole digit groups is tried.
	v := visa(" ")
	e := build(t, row(func(r *ClaimedEmail) {
		r.Messages = said("Paid 12 " + v + ", ref" + strings.ReplaceAll(v, " ", ""))
	}), tokens)
	has(t, e.Text, "Paid 12 "+bullets+" 4242, ref"+bullets+" 4242")
	if strings.Contains(e.HTML, v) {
		t.Errorf("html: %q", e.HTML)
	}
}

// Deno: "email: the advisor's words are escaped, never HTML"
func TestEmailAdvisorWordsEscaped(t *testing.T) {
	e := build(t, row(func(r *ClaimedEmail) { r.Messages = said("<script>alert(1)</script> & <b>hi</b>") }), tokens)
	if strings.Contains(e.HTML, "<script>") {
		t.Error("a script tag reached the HTML")
	}
	has(t, e.HTML, "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;hi&lt;/b&gt;")
}

// Deno: "email: files are named, never attached"
func TestEmailFilesNamedNeverAttached(t *testing.T) {
	e := build(t, row(func(r *ClaimedEmail) { r.Messages = said("Here you go.", "boarding-pass.pdf") }), tokens)
	has(t, e.Text, "Gyasi shared a file with you: boarding-pass.pdf")
	if _, found := reflect.TypeOf(e).FieldByName("Attachments"); found {
		t.Error("a built email has no attachments field")
	}
}

// Deno: "email: threads under the previous email so mail apps keep one conversation"
func TestEmailThreadsUnderPreviousEmail(t *testing.T) {
	first := build(t, row(nil), tokens)
	eq(t, first.MessageID, "<0195a2c0-0000-7000-8000-0000000000e1@adventures.story-tail.com>")
	eq(t, first.InReplyTo, "") // undefined
	next := build(t, row(func(r *ClaimedEmail) {
		r.OutboxID = "0195a2c0-0000-7000-8000-0000000000e2"
		r.PreviousOutboxID = str("0195a2c0-0000-7000-8000-0000000000e1")
	}), tokens)
	eq(t, next.InReplyTo, first.MessageID)
	eq(t, next.References, first.MessageID)
}

// Deno: "email: anything that would break a header, or reach two people, is refused"
func TestEmailHeaderBreakOrTwoRecipientsRefused(t *testing.T) {
	// A line break in a trip title is cleaned into a space, never a second header (found in
	// review: it used to fail the email for good).
	odd := build(t, row(func(r *ClaimedEmail) { r.TripTitle = str("Bahamas\r\nBcc: evil@example.com") }), tokens)
	eq(t, odd.Subject, "Gyasi wrote about Bahamas Bcc: evil@example.com")
	// A name is cut to its first word, so a line break in it never reaches the From header.
	eq(t, build(t, row(func(r *ClaimedEmail) { r.AgentFirstName = str("Gyasi\nX-Evil: 1") }), tokens).From.Name, "Gyasi at Story-Tail Adventures")
	_, err := BuildEmail(row(func(r *ClaimedEmail) { r.Recipient = "a@example.com, b@example.com" }), tokens, cfg, nil)
	wantErr(t, err, "single")
	_, err = BuildEmail(row(func(r *ClaimedEmail) { r.Messages = []ClaimedMessage{} }), tokens, cfg, nil)
	wantErr(t, err, "no replies")
	_, err = BuildEmail(row(nil), Tokens{Reply: "short", Unsubscribe: t2}, cfg, nil)
	wantErr(t, err, "token")
}

// ── SMTP outcomes ───────────────────────────────────────────────────────────

// Deno: "smtp errors: 5xx is permanent, 4xx and network trouble retry"
func TestSMTPErrors5xxPermanent(t *testing.T) {
	permanent, _ := ClassifySMTPError(js.ObjectValue("responseCode", js.NumberValue(550), "response", js.StringValue("550 mailbox unavailable")))
	eq(t, permanent, true)
	permanent, _ = ClassifySMTPError(js.ObjectValue("responseCode", js.NumberValue(421), "response", js.StringValue("421 try later")))
	eq(t, permanent, false)
	permanent, _ = ClassifySMTPError(js.ObjectValue("code", js.StringValue("ETIMEDOUT"), "message", js.StringValue("Connection timeout")))
	eq(t, permanent, false)
}

// Deno: "smtp errors: the kept text names no address and is at most 200 characters"
func TestSMTPErrorsTextNamesNoAddress(t *testing.T) {
	_, text := ClassifySMTPError(js.ObjectValue(
		"responseCode", js.NumberValue(550),
		"response", js.StringValue("550 <jordan.hayes@example.com> rejected "+strings.Repeat("x", 400)),
	))
	if strings.Contains(text, "jordan.hayes@example.com") {
		t.Error("the address was kept")
	}
	has(t, text, "[address]")
	if js.Len(text) > 200 {
		t.Errorf("%d characters", js.Len(text))
	}
}
