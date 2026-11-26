package emailinbound

import (
	"reflect"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Ported from _shared/emailInbound_test.ts, one Go test per Deno.test.

const (
	mailbox = "info@adventures.story-tail.com"
	tok     = "abcdefghijklmnopqrstuvwxyz"
	outbox  = "0195a2c0-0000-7000-8000-0000000000e1"
)

func h(raw string) []Header { return ParseHeaders(raw) }

func str(s string) *string { return &s }

func wantAddr(t *testing.T, got string, ok bool, want string, wantOK bool) {
	t.Helper()
	if ok != wantOK || got != want {
		t.Errorf("got (%q, %v), want (%q, %v)", got, ok, want, wantOK)
	}
}

// ── Headers ─────────────────────────────────────────────────────────────────

// Deno: "headers: unfolded, lowercased, in order"
func TestHeadersUnfoldedLowercasedInOrder(t *testing.T) {
	parsed := h("Subject: Re: Bahamas\r\n trip\r\nFrom: Jordan <jordan@example.com>\r\nX-A: 1\r\nX-A: 2\r\n")
	want := []Header{{"subject", "Re: Bahamas trip"}, {"from", "Jordan <jordan@example.com>"}, {"x-a", "1"}, {"x-a", "2"}}
	if !reflect.DeepEqual(parsed, want) {
		t.Errorf("got %q, want %q", parsed, want)
	}
}

// ── Addresses ───────────────────────────────────────────────────────────────

// Deno: "addresses: a bare address out of the usual shapes"
func TestAddressesBareAddressOutOfUsualShapes(t *testing.T) {
	got, ok := BareAddress(js.StringValue("Jordan Hayes <Jordan.Hayes@Example.com>"))
	wantAddr(t, got, ok, "jordan.hayes@example.com", true)
	got, ok = BareAddress(js.StringValue(" jordan@example.com "))
	wantAddr(t, got, ok, "jordan@example.com", true)
	got, ok = BareAddress(js.StringValue("not an address"))
	wantAddr(t, got, ok, "", false)
	got, ok = BareAddress(js.NumberValue(42))
	wantAddr(t, got, ok, "", false)
}

// Deno: "addresses: a display name cannot spoof the sender (found in review)"
func TestAddressesDisplayNameCannotSpoofSender(t *testing.T) {
	got, ok := BareAddress(js.StringValue(`"<jordan.hayes@example.com>" <attacker@evil.com>`))
	wantAddr(t, got, ok, "", false)
	got, ok = BareAddress(js.StringValue("jordan.hayes@example.com <attacker@evil.com>"))
	wantAddr(t, got, ok, "", false)
	got, ok = BareAddress(js.StringValue("a@example.com, b@example.com"))
	wantAddr(t, got, ok, "", false)
	got, ok = FromOf(h("From: a@example.com\nFrom: b@example.com"))
	wantAddr(t, got, ok, "", false) // two From headers: refused
	got, ok = FromOf(h("From: Jordan <jordan@example.com>"))
	wantAddr(t, got, ok, "jordan@example.com", true)
}

// ── The reply token ─────────────────────────────────────────────────────────

// Deno: "token: the reply address is the mailbox's own plus address"
func TestTokenReplyAddressIsMailboxPlusAddress(t *testing.T) {
	if got := PlusAddress(mailbox, tok); got != "info+"+tok+"@adventures.story-tail.com" {
		t.Errorf("got %q", got)
	}
}

// Deno: "token: found only in OUR mailbox's plus address"
func TestTokenFoundOnlyInOurMailboxPlusAddress(t *testing.T) {
	got, ok := ReplyTokenFrom([]string{"someone@example.com", "Gyasi <info+" + tok + "@adventures.story-tail.com>"}, mailbox)
	wantAddr(t, got, ok, tok, true)
	got, ok = ReplyTokenFrom([]string{"INFO+" + strings.ToUpper(tok) + "@Adventures.Story-Tail.com"}, mailbox)
	wantAddr(t, got, ok, tok, true)
	got, ok = ReplyTokenFrom([]string{"sales+" + tok + "@adventures.story-tail.com"}, mailbox)
	wantAddr(t, got, ok, "", false) // another mailbox
	got, ok = ReplyTokenFrom([]string{"info+" + tok + "@adventures.story-tail.com.evil.com"}, mailbox)
	wantAddr(t, got, ok, "", false) // lookalike domain
	got, ok = ReplyTokenFrom([]string{"info+short@adventures.story-tail.com"}, mailbox)
	wantAddr(t, got, ok, "", false)
	got, ok = ReplyTokenFrom([]string{}, mailbox)
	wantAddr(t, got, ok, "", false)
}

// Deno: "token: the server's delivery headers count as recipients"
func TestTokenDeliveryHeadersCountAsRecipients(t *testing.T) {
	headers := h("Delivered-To: info+" + tok + "@adventures.story-tail.com\nTo: Gyasi at Story-Tail Adventures <info@adventures.story-tail.com>")
	got, ok := ReplyTokenFrom(RecipientsOf(headers), mailbox)
	wantAddr(t, got, ok, tok, true)
}

// Deno: "fallback: the email answered, from In-Reply-To, then the last of ours in References"
func TestFallbackInReplyToThenLastOfOursInReferences(t *testing.T) {
	got, ok := OutboxIDFrom(h("In-Reply-To: <"+outbox+"@adventures.story-tail.com>"), "adventures.story-tail.com")
	wantAddr(t, got, ok, outbox, true)
	older := "0195a2c0-0000-7000-8000-0000000000e0"
	got, ok = OutboxIDFrom(
		h("References: <"+older+"@adventures.story-tail.com> <CAJ1@mail.gmail.com> <"+outbox+"@adventures.story-tail.com>"),
		"adventures.story-tail.com",
	)
	wantAddr(t, got, ok, outbox, true)
	got, ok = OutboxIDFrom(h("In-Reply-To: <"+outbox+"@evil.com>"), "adventures.story-tail.com")
	wantAddr(t, got, ok, "", false) // not our domain
	got, ok = OutboxIDFrom(h("In-Reply-To: <CAJ1@mail.gmail.com>"), "adventures.story-tail.com")
	wantAddr(t, got, ok, "", false)
}

// Deno: "dedupe: the sender plus the email's own Message-ID, so a re-delivery is handled once"
func TestDedupeSenderPlusMessageID(t *testing.T) {
	a := DedupeKey(h("From: jordan@example.com\nMessage-ID: <CAJ1@mail.gmail.com>"), "7", 3)
	if b := DedupeKey(h("From: Jordan <jordan@example.com>\nMessage-ID: <CAJ1@mail.gmail.com>"), "7", 9); a != b {
		t.Errorf("same sender and id: same key; got %q and %q", a, b)
	}
	if !strings.HasPrefix(a, "mid:") {
		t.Errorf("got %q", a)
	}
	if a == DedupeKey(h("From: attacker@evil.com\nMessage-ID: <CAJ1@mail.gmail.com>"), "7", 3) {
		t.Error("another sender cannot pre-empt it")
	}
	if a == DedupeKey(h("From: jordan@example.com\nMessage-ID: <caj1@mail.gmail.com>"), "7", 3) {
		t.Error("case is kept")
	}
	if got := DedupeKey(h("Subject: no id"), "7", 3); got != "imap:7:3" {
		t.Errorf("got %q", got)
	}
	if got := DedupeKey(h("Message-ID: not-bracketed"), "7", 3); got != "imap:7:3" {
		t.Errorf("got %q", got)
	}
}

// ── The sender's verdict ────────────────────────────────────────────────────

func ar(v string) []Header { return h("Authentication-Results: " + v) }

const (
	serverID = "mx.ionos.com"
	from     = "jordan@example.com"
)

// Deno: "verdict: parsed strictly; a quoted value cannot read as a result (review)"
func TestVerdictParsedStrictly(t *testing.T) {
	r := ParseAuthResults(`mx.ionos.com; spf=pass smtp.mailfrom="a;dmarc=pass"@evil.com (dmarc=pass); dmarc=fail`)
	if r.AuthservID != "mx.ionos.com" {
		t.Errorf("authserv-id %q", r.AuthservID)
	}
	var got []string
	for _, m := range r.Methods {
		got = append(got, m.Method+"="+m.Result)
	}
	if want := []string{"spf=pass", "dmarc=fail"}; !reflect.DeepEqual(got, want) {
		t.Errorf("got %q, want %q", got, want)
	}
}

// Deno: "verdict: DMARC pass from OUR server passes"
func TestVerdictDMARCPassFromOurServerPasses(t *testing.T) {
	if !SenderVerified(ar(serverID+"; dmarc=pass header.from=example.com"), from, serverID, false) {
		t.Error("want verified")
	}
}

// Deno: "verdict: no pinned server id, or another server's header on top, fails closed (review)"
func TestVerdictFailsClosed(t *testing.T) {
	if SenderVerified(ar(serverID+"; dmarc=pass"), from, "", false) {
		t.Error("id not configured")
	}
	if SenderVerified(ar("evil.example; dmarc=pass"), from, serverID, false) {
		t.Error("a header the sender wrote")
	}
	if SenderVerified(h("Subject: hi"), from, serverID, false) {
		t.Error("no header at all")
	}
	if SenderVerified(ar(serverID+"; dmarc=pass"), "", serverID, false) {
		t.Error("no single From")
	}
}

// Deno: "verdict: dmarc=fail always fails; unaligned SPF and DKIM prove nothing (review)"
func TestVerdictDMARCFailAndUnalignedSPFDKIM(t *testing.T) {
	if SenderVerified(ar(serverID+"; spf=pass smtp.mailfrom=evil.com; dkim=pass header.d=evil.com; dmarc=fail"), from, serverID, false) {
		t.Error("dmarc=fail")
	}
	if SenderVerified(ar(serverID+"; spf=pass smtp.mailfrom=evil.com; dkim=pass header.d=evil.com; dmarc=none"), from, serverID, false) {
		t.Error("unaligned")
	}
	if !SenderVerified(ar(serverID+"; spf=pass smtp.mailfrom=jordan@example.com; dkim=pass header.d=example.com; dmarc=none"), from, serverID, false) {
		t.Error("aligned SPF and DKIM")
	}
	if SenderVerified(ar(serverID+"; spf=pass smtp.mailfrom=jordan@example.com; dkim=fail header.d=example.com; dmarc=none"), from, serverID, false) {
		t.Error("dkim=fail")
	}
}

// Deno: "verdict: the email-it-answers path needs DMARC itself"
func TestVerdictStrictNeedsDMARC(t *testing.T) {
	aligned := ar(serverID + "; spf=pass smtp.mailfrom=jordan@example.com; dkim=pass header.d=example.com; dmarc=none")
	if SenderVerified(aligned, from, serverID, true) {
		t.Error("strict: SPF and DKIM are not enough")
	}
	if !SenderVerified(ar(serverID+"; dmarc=pass"), from, serverID, true) {
		t.Error("strict: DMARC pass")
	}
}

// Deno: "verdict: a lower header the SENDER wrote is ignored (RFC 8601)"
func TestVerdictLowerHeaderIgnored(t *testing.T) {
	forged := h("Authentication-Results: " + serverID + "; spf=fail; dkim=none; dmarc=fail\nAuthentication-Results: " + serverID + "; dmarc=pass")
	if SenderVerified(forged, from, serverID, false) {
		t.Error("want not verified")
	}
}

// ── Automatic answers ───────────────────────────────────────────────────────

// Deno: "auto replies: RFC 3834 headers, the usual vendor headers and subjects"
func TestAutoReplies(t *testing.T) {
	s := js.StringValue
	if !IsAutoReply(h("Auto-Submitted: auto-replied"), s("Re: Bahamas")) {
		t.Error("Auto-Submitted: auto-replied")
	}
	if IsAutoReply(h("Auto-Submitted: no"), s("Re: Bahamas")) {
		t.Error("Auto-Submitted: no")
	}
	if !IsAutoReply(h("Precedence: auto_reply"), s("Re: Bahamas")) {
		t.Error("Precedence: auto_reply")
	}
	if !IsAutoReply(h("X-Autoreply: yes"), s("Re: Bahamas")) {
		t.Error("X-Autoreply")
	}
	if !IsAutoReply(nil, s("Automatic reply: Gyasi wrote about Bahamas")) {
		t.Error("Automatic reply subject")
	}
	if !IsAutoReply(nil, s("Out of Office: back Monday")) {
		t.Error("Out of Office subject")
	}
	if IsAutoReply(h("From: jordan@example.com"), s("Re: Gyasi wrote about Bahamas")) {
		t.Error("an ordinary reply")
	}
	if IsAutoReply(nil, s("Out of this world trip, thanks!")) {
		t.Error("Out of this world")
	}
}

// ── Parts ───────────────────────────────────────────────────────────────────

var multipart = &BodyNode{
	Type: "multipart/mixed",
	ChildNodes: []BodyNode{
		{
			Type: "multipart/alternative",
			ChildNodes: []BodyNode{
				{Part: str("1.1"), Type: "text/plain"},
				{Part: str("1.2"), Type: "text/html"},
			},
		},
		{Part: str("2"), Type: "image/png", Disposition: "inline", ID: "<logo>"},
		{Part: str("3"), Type: "application/pdf", Disposition: "attachment", DispositionParameters: map[string]string{"filename": "passport.pdf"}},
		{Part: str("4"), Type: "image/jpeg", Parameters: map[string]string{"name": "photo.jpg"}},
	},
}

func wantPart(t *testing.T, got TextPartRef, ok bool, want TextPartRef, wantOK bool) {
	t.Helper()
	if ok != wantOK || got != want {
		t.Errorf("got (%+v, %v), want (%+v, %v)", got, ok, want, wantOK)
	}
}

// Deno: "parts: the plain text is read; files are counted, signature images are not"
func TestPartsPlainTextReadFilesCounted(t *testing.T) {
	got, ok := TextPart(multipart)
	wantPart(t, got, ok, TextPartRef{Part: "1.1", HTML: false}, true)
	if n := CountFiles(multipart); n != 2 {
		t.Errorf("CountFiles = %d, want 2", n)
	}
}

// Deno: "parts: HTML only when there is no plain text; a single part is part 1"
func TestPartsHTMLOnlyWithoutPlainText(t *testing.T) {
	got, ok := TextPart(&BodyNode{Type: "multipart/alternative", ChildNodes: []BodyNode{{Part: str("1"), Type: "text/html"}}})
	wantPart(t, got, ok, TextPartRef{Part: "1", HTML: true}, true)
	got, ok = TextPart(&BodyNode{Type: "text/plain"})
	wantPart(t, got, ok, TextPartRef{Part: "1", HTML: false}, true)
	got, ok = TextPart(&BodyNode{Type: "image/png", Disposition: "attachment"})
	wantPart(t, got, ok, TextPartRef{}, false)
	if n := CountFiles(nil); n != 0 {
		t.Errorf("CountFiles(nil) = %d", n)
	}
}

// ── The new words only ───────────────────────────────────────────────────────

func wantWords(t *testing.T, got, want string) {
	t.Helper()
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// Deno: "words: Gmail and Apple Mail history is cut"
func TestWordsGmailAndAppleMailHistoryCut(t *testing.T) {
	text := "Perfect, see you then!\n\nOn Fri, Oct 16, 2026 at 9:05 AM Gyasi at Story-Tail Adventures <info@adventures.story-tail.com> wrote:\n> Your ferry is booked."
	wantWords(t, NewWordsOnly(&text, nil), "Perfect, see you then!")
}

// Deno: "words: Outlook history, quoted lines and phone signatures are cut"
func TestWordsOutlookQuotedAndSignaturesCut(t *testing.T) {
	wantWords(t, NewWordsOnly(str("Yes please.\n\n-----Original Message-----\nFrom: Gyasi"), nil), "Yes please.")
	wantWords(t, NewWordsOnly(str("Yes please.\n________________________________\nFrom: Gyasi\nSent: today"), nil), "Yes please.")
	wantWords(t, NewWordsOnly(str("Line one\n> quoted\nLine two\n\nSent from my iPhone"), nil), "Line one\nLine two")
	wantWords(t, NewWordsOnly(str("Thanks!\n-- \nJordan Hayes\n555-0100"), nil), "Thanks!")
}

// Deno: "words: HTML-only mail becomes text, never markup, and quotes go"
func TestWordsHTMLOnlyBecomesText(t *testing.T) {
	html := "<div>Sounds <b>great</b>&nbsp;&amp; thanks</div><blockquote>old stuff</blockquote><script>x()</script>"
	wantWords(t, NewWordsOnly(nil, &html), "Sounds great & thanks")
}

// Deno: "words: nothing new is empty (the SQL then refuses it)"
func TestWordsNothingNewIsEmpty(t *testing.T) {
	wantWords(t, NewWordsOnly(str("\n\nOn Fri wrote something wrote:\n> hi"), nil), "")
	wantWords(t, NewWordsOnly(nil, nil), "")
}
