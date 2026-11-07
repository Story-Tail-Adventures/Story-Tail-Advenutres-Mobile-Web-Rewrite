// Package email ports supabase/functions/_shared/email.ts: what an email to a client says, and
// how its secrets are made (§3.10 Stage 4, Data-Model §12.8 / §12.9,
// docs/Email-Provider-Review.md §6, docs/SMTP-Library-Security-Review.md §5). It also holds
// smtp.ts's transport settings as data (Transport), since smtp.ts parses nothing.
//
// Pure: no network, no database. `email-dispatch` claims rows and hands them here, then sends
// the result.
//
// ── WHAT THE SENDER IS NEVER GIVEN ───────────────────────────────────────────
//
// The security review binds this package: every header value is built here, from constants and
// ids, and refused if it holds CR or LF; the To is a bare address with no display name, so a
// client's chosen name never reaches a header; no file, path or URL is ever content. Bodies have
// card numbers masked to the last four (carddigits) before anything else sees them.
//
// JavaScript details written out by hand, as in package emailinbound: /i patterns are matched
// in lower case against asciiLower(text) (Go's (?i) also folds ſ and the Kelvin sign); lower()
// writes U+0130 as JavaScript lowers it; `String.prototype.replace` with a string keeps its
// $-patterns (replaceJS); encodeURIComponent and the first-letter capital (sentenceStart) are
// JavaScript's. The capital uses js.ToUpper, which leaves "ß" where JavaScript writes "SS" (and
// likewise the few other letters whose capital is two letters); a first name starting with one
// would differ.
package email

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/emailinbound"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Config is EmailConfig, the SMTP settings.
type Config struct {
	Host string
	Port int
	// Secure is implicit TLS (465). False only for the local mail catcher, with no credentials.
	Secure bool
	// User and Password are "" for null (Deno turned an empty setting into null, so the two
	// never differ).
	User     string
	Password string
	// FromAddress is the app-only mailbox, e.g. gyasi.messages@adventures.story-tail.com.
	FromAddress string
	// SiteURL is the web app's origin, for "Open the conversation" and the opt-out page.
	SiteURL string
	// UnsubscribeURL is the `email-unsubscribe` function's URL, for the one-click header.
	UnsubscribeURL string
}

// localCatcher is the hosts that may be reached without TLS: the local stack's Mailpit, never
// anything real. /…/i, matched against asciiLower(host).
var localCatcher = regexp.MustCompile(`^(localhost|127\.0\.0\.1|host\.docker\.internal|supabase_inbucket_[a-z0-9_-]+|inbucket|mailpit|greenmail)$`)

func isLocalCatcher(host string) bool { return localCatcher.MatchString(asciiLower(host)) }

var (
	address    = regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)
	siteOrigin = js.Regexp(`^https?://[^\s/]+$`, "")
	anyURL     = js.Regexp(`^https?://\S+$`, "")
)

// ConfigFromEnv reads the SMTP settings: nil, nil when email is not set up (the dispatcher then
// refuses before claiming, so rows wait rather than burn their tries). An error for a setting
// that would send a password in the clear: port 465 only, unless it is the local catcher with
// no credentials. env answers "" for an unset name (os.Getenv).
func ConfigFromEnv(env func(name string) string) (*Config, error) {
	host := js.Trim(env("EMAIL_SMTP_HOST"))
	fromAddress := js.Trim(env("EMAIL_FROM_ADDRESS"))
	if host == "" || fromAddress == "" {
		return nil, nil
	}

	portText := js.Trim(env("EMAIL_SMTP_PORT"))
	if portText == "" {
		portText = "465"
	}
	port := js.ToNumber(portText)
	user := js.Trim(env("EMAIL_SMTP_USER"))
	password := env("EMAIL_SMTP_PASSWORD")
	siteURL := strings.TrimRight(js.Trim(env("EMAIL_SITE_URL")), "/")
	unsubscribeURL := js.Trim(env("EMAIL_UNSUBSCRIBE_URL"))

	if !js.IsInteger(port) || port <= 0 || port > 65535 {
		return nil, errors.New("EMAIL_SMTP_PORT must be a port number.")
	}
	local := isLocalCatcher(host)
	if port != 465 && !(local && user == "" && password == "") {
		// Supabase blocks 25 and 587 anyway; anything but implicit TLS would send the login in
		// the clear or rely on STARTTLS, which the review rules out.
		return nil, errors.New("Email goes out on port 465 only (the local mail catcher is the one exception).")
	}
	if (user == "") != (password == "") {
		return nil, errors.New("Set both EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD, or neither.")
	}
	if !local && (user == "" || password == "") {
		return nil, errors.New("A real SMTP server needs EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD.")
	}
	if !address.MatchString(fromAddress) {
		return nil, errors.New("EMAIL_FROM_ADDRESS must be an email address.")
	}
	if !siteOrigin.MatchString(siteURL) || (!local && !strings.HasPrefix(siteURL, "https://")) {
		return nil, errors.New("EMAIL_SITE_URL must be the app's origin, e.g. https://storytailadventures.vercel.app.")
	}
	if !anyURL.MatchString(unsubscribeURL) || (!local && !strings.HasPrefix(unsubscribeURL, "https://")) {
		return nil, errors.New("EMAIL_UNSUBSCRIBE_URL must be the email-unsubscribe function's URL.")
	}
	return &Config{
		Host:           host,
		Port:           int(port),
		Secure:         port == 465,
		User:           user,
		Password:       password,
		FromAddress:    fromAddress,
		SiteURL:        siteURL,
		UnsubscribeURL: unsubscribeURL,
	}, nil
}

// Transport is how smtp.ts opened every SMTP connection (nodemailer 10.0.14, configured as
// docs/SMTP-Library-Security-Review.md §5 requires), written down as data so `email-dispatch`
// and `email-inbox` cannot drift apart on a safety setting. The Go sender applies it; nothing
// here sends. smtp.ts also turned off what has no Go counterpart: pooling (one connection per
// send), the logger and debug output (they print whole messages, addresses and words included),
// and file and URL access (no content is ever a path or a URL).
type Transport struct {
	Host string
	Port int
	// ImplicitTLS is TLS from the first byte (465). RequireTLS: never downgrade. IgnoreTLS: the
	// local catcher's plain connection never tries STARTTLS. Only the catcher (no credentials,
	// see ConfigFromEnv) is ever plain.
	ImplicitTLS bool
	RequireTLS  bool
	IgnoreTLS   bool
	// ServerName is what the certificate is checked against. Certificates are always checked.
	ServerName string
	// User and Password log in only when both are set ("" otherwise).
	User     string
	Password string
	// The timeouts: reaching the server, its greeting, and any silence after.
	ConnectionTimeout time.Duration
	GreetingTimeout   time.Duration
	SocketTimeout     time.Duration
}

// SMTPTransport is smtpTransport's settings for cfg.
func SMTPTransport(cfg Config) Transport {
	t := Transport{
		Host:              cfg.Host,
		Port:              cfg.Port,
		ImplicitTLS:       cfg.Secure,
		RequireTLS:        cfg.Secure,
		IgnoreTLS:         !cfg.Secure,
		ServerName:        cfg.Host,
		ConnectionTimeout: 10 * time.Second,
		GreetingTimeout:   10 * time.Second,
		SocketTimeout:     20 * time.Second,
	}
	if cfg.User != "" && cfg.Password != "" {
		t.User, t.Password = cfg.User, cfg.Password
	}
	return t
}

// ── Reading replies (IMAP) ─────────────────────────────────────────────────────

// InboxConfig is the IMAP settings for `email-inbox`.
type InboxConfig struct {
	Host string
	Port int
	// Secure is TLS from the first byte (993). False only for a local test server.
	Secure   bool
	User     string
	Password string
	// Mailbox is the one replies come back to; its plus addresses carry the reply tokens.
	Mailbox string
}

// InboxConfigFromEnv reads the IMAP settings: nil, nil when replies are not set up. The login
// is the sending mailbox's own (EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD): it is the same mailbox,
// and docs/IMAP-Library-Security-Review.md §1 explains why that adds no exposure. Port 993 with
// TLS only, except a local test server (which, unlike SMTP's catcher, needs a throwaway login).
func InboxConfigFromEnv(env func(name string) string) (*InboxConfig, error) {
	host := js.Trim(env("EMAIL_IMAP_HOST"))
	if host == "" {
		host = "imap.ionos.com"
	}
	// Optional overrides, for a local test server whose login differs from the (credential-free)
	// local SMTP catcher. Production leaves them unset and reuses the sending login.
	user := js.Trim(env("EMAIL_IMAP_USER"))
	if user == "" {
		user = js.Trim(env("EMAIL_SMTP_USER"))
	}
	password := env("EMAIL_IMAP_PASSWORD")
	if password == "" {
		password = env("EMAIL_SMTP_PASSWORD")
	}
	mailbox := lower(js.Trim(env("EMAIL_FROM_ADDRESS")))
	if user == "" || password == "" || mailbox == "" {
		return nil, nil
	}

	portText := js.Trim(env("EMAIL_IMAP_PORT"))
	if portText == "" {
		portText = "993"
	}
	port := js.ToNumber(portText)
	if !js.IsInteger(port) || port <= 0 || port > 65535 {
		return nil, errors.New("EMAIL_IMAP_PORT must be a port number.")
	}
	local := isLocalCatcher(host)
	if port != 993 && !local {
		return nil, errors.New("Replies are read on port 993 only (a local test server is the one exception).")
	}
	if !address.MatchString(mailbox) {
		return nil, errors.New("EMAIL_FROM_ADDRESS must be an email address.")
	}
	return &InboxConfig{Host: host, Port: int(port), Secure: port == 993, User: user, Password: password, Mailbox: mailbox}, nil
}

// ── Tokens ─────────────────────────────────────────────────────────────────────

const base32 = "abcdefghijklmnopqrstuvwxyz234567"

// NewToken is 128 random bits as 26 lowercase base32 characters: safe in an email local part
// and a URL.
func NewToken() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("email: no randomness: " + err.Error()) // crypto/rand.Read never fails on supported platforms
	}
	return TokenFromBytes(b)
}

// TokenFromBytes is newToken's encoding of given bytes (the Deno function took the random
// source as a parameter, for its test).
func TokenFromBytes(b [16]byte) string {
	var out strings.Builder
	bits, value := 0, uint32(0)
	for _, c := range b {
		value = value<<8 | uint32(c)
		bits += 8
		for bits >= 5 {
			out.WriteByte(base32[(value>>(bits-5))&31])
			bits -= 5
		}
	}
	if bits > 0 {
		out.WriteByte(base32[(value<<(5-bits))&31])
	}
	return out.String()
}

// tokenShape is /^[a-z2-7]{26}$/i with the fold written out: JavaScript's /i adds A-Z and
// nothing else.
var tokenShape = regexp.MustCompile(`^[a-zA-Z2-7]{26}$`)

func isToken(s string) bool { return tokenShape.MatchString(s) }

// IsToken reports a token as it may arrive: 26 base32 characters, any case.
func IsToken(value js.Value) bool {
	s, ok := value.Str()
	return ok && isToken(s)
}

// TokenHashParam is SHA-256 of a token, as the `\x…` hex PostgREST takes for a bytea parameter.
func TokenHashParam(token string) string {
	digest := sha256.Sum256([]byte(lower(token)))
	return `\x` + hex.EncodeToString(digest[:])
}

// ── The email ─────────────────────────────────────────────────────────────────

// Sender is the From: a display name and the address.
type Sender struct {
	Name    string
	Address string
}

// Header is one extra header, in the order it is written.
type Header struct {
	Name  string
	Value string
}

// Outgoing is an email as handed to the sender (buildAlertEmail's and signInEmail's shape).
type Outgoing struct {
	From      Sender
	To        string
	Subject   string
	Text      string
	HTML      string
	MessageID string
	Headers   []Header
}

// HeaderValue is the extra header of that name.
func (o Outgoing) HeaderValue(name string) (string, bool) {
	for _, h := range o.Headers {
		if h.Name == name {
			return h.Value, true
		}
	}
	return "", false
}

// Built is BuiltEmail, the email to a client. InReplyTo and References are "" when Deno left
// them undefined (the first email of a thread); set, they are never empty.
type Built struct {
	Outgoing
	ReplyTo    string
	InReplyTo  string
	References string
}

// ClaimedMessage is one reply a claimed row carries.
type ClaimedMessage struct {
	MessageID   string   `json:"message_id"`
	Body        string   `json:"body"`
	CreatedAt   string   `json:"created_at"`
	Attachments []string `json:"attachments"`
}

// ClaimedEmail is a row `email_claim_due` hands out. nil pointers are SQL nulls.
type ClaimedEmail struct {
	OutboxID         string           `json:"outbox_id"`
	ConversationID   string           `json:"conversation_id"`
	Recipient        string           `json:"recipient"`
	ClientFirstName  *string          `json:"client_first_name"`
	AgentFirstName   *string          `json:"agent_first_name"`
	TripTitle        *string          `json:"trip_title"`
	PreviousOutboxID *string          `json:"previous_outbox_id"`
	Messages         []ClaimedMessage `json:"messages"`
}

// Tokens is the two secrets an email carries.
type Tokens struct {
	Reply       string
	Unsubscribe string
}

// headerSafe refuses any header value that could start a new header (CRLF injection).
func headerSafe(value, what string) (string, error) {
	if strings.ContainsAny(value, "\r\n") {
		return "", errors.New(what + " would break a mail header")
	}
	return value, nil
}

// messageIDFor mints a Message-ID under the sending mailbox's own domain.
func messageIDFor(id, fromAddress string) string {
	return "<" + id + "@" + domainPart(fromAddress) + ">"
}

// domainPart is `address.split("@")[1]`: what lies between the first @ and any second one.
func domainPart(addr string) string {
	parts := strings.Split(addr, "@")
	if len(parts) < 2 {
		return "undefined" // as a template literal writes it
	}
	return parts[1]
}

var htmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

func escapeHTML(text string) string { return htmlEscaper.Replace(text) }

// firstName is one display word for a name that may be missing.
func firstName(value *string, fallback string) string {
	if value == nil {
		return fallback
	}
	if words := strings.FieldsFunc(js.Trim(*value), js.IsSpace); len(words) > 0 {
		return words[0]
	}
	return fallback
}

// sentenceStart is for the start of a sentence: "your advisor" becomes "Your advisor"; a name
// is unchanged. `charAt(0).toUpperCase()`: the first UTF-16 unit only, so a first character
// outside the BMP (half of a pair to charAt) stays as it is.
func sentenceStart(text string) string {
	r, size := utf8.DecodeRuneInString(text)
	if size == 0 || r > 0xFFFF || (r == utf8.RuneError && size == 1) {
		return text
	}
	return js.ToUpper(string(r)) + text[size:]
}

var spaceRun = js.Regexp(`\s+`, "")

// cleanTitle is a trip title (or a name) as it may appear in a subject: control characters (a
// pasted line break) become spaces rather than failing the email, and a card number in it is
// masked like the body. "" for null.
func cleanTitle(value *string) string {
	if value == nil || *value == "" {
		return ""
	}
	controls := strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return ' '
		}
		return r
	}, *value)
	title := js.Trim(spaceRun.ReplaceAllLiteralString(controls, " "))
	if title == "" {
		return ""
	}
	return carddigits.MaskCardNumbers(title)
}

// ThreadURL is the thread on the web app. A plain link: it carries no token and signs no one in.
func ThreadURL(cfg Config, conversationID string) string {
	return cfg.SiteURL + "/messages/" + encodeURIComponent(conversationID)
}

// UnsubscribeLinks is the opt-out page on the web app (Page), and the one-click endpoint mail
// apps POST to (OneClick).
func UnsubscribeLinks(cfg Config, token string) (page, oneClick string) {
	t := encodeURIComponent(token)
	sep := "?"
	if strings.Contains(cfg.UnsubscribeURL, "?") {
		sep = "&"
	}
	return cfg.SiteURL + "/email/unsubscribe?t=" + t, cfg.UnsubscribeURL + sep + "t=" + t
}

// Design-System §3 light scheme: burgundy primary, cream ground, sand surface.
const (
	burgundy = "#7A1A1F"
	cream    = "#FBF6EE"
	sand     = "#F1E7D5"
	ink      = "#2B2B2B"
	muted    = "#6B6259"
)

// ── §3.12.4 The advisor's signature ──────────────────────────────────────────

// LockedSignatureLine is the line under every signature (Q18). Not stored and not editable:
// the host agency's.
const LockedSignatureLine = "Story-Tail Adventures \U000000b7 Hosted by Inteletravel"

// SignatureSource is what `agent_signature_for_conversation` hands back. nil pointers are nulls.
type SignatureSource struct {
	Signature   *string `json:"signature"`
	DisplayName *string `json:"display_name"`
	Phone       *string `json:"phone"`
	Email       *string `json:"email"`
}

var (
	fieldName  = js.Regexp(`\{\{\s*agent\.name\s*\}\}`, "")
	fieldPhone = js.Regexp(`\{\{\s*agent\.phone\s*\}\}`, "")
	fieldEmail = js.Regexp(`\{\{\s*agent\.email\s*\}\}`, "")
	dotRun     = js.Regexp(`\s*\x{00B7}\s*(?:\x{00B7}\s*)+`, "")
	dotLead    = js.Regexp(`^\s*\x{00B7}\s*`, "")
	dotTrail   = js.Regexp(`\s*\x{00B7}\s*$`, "")
)

// trimmedOrEmpty is `p?.trim() ?? ""`.
func trimmedOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return js.Trim(*p)
}

// RenderSignature is the signature as lines of plain text: the three merge fields filled, the
// separators a missing phone leaves behind tidied away ("· gyasi@…" becomes "gyasi@…"), a line
// left empty by that dropped, and the locked line always last. Card numbers are masked like the
// body. src nil is null.
func RenderSignature(src *SignatureSource) []string {
	var signature, name, phone, mail string
	if src != nil {
		if src.Signature != nil {
			signature = *src.Signature
		}
		name, phone, mail = trimmedOrEmpty(src.DisplayName), trimmedOrEmpty(src.Phone), trimmedOrEmpty(src.Email)
	}
	text := js.Trim(signature)
	filled := replaceJS(fieldName, text, name)
	filled = replaceJS(fieldPhone, filled, phone)
	filled = replaceJS(fieldEmail, filled, mail)
	sourceLines := strings.Split(text, "\n")
	lines := []string{}
	for i, raw := range strings.Split(filled, "\n") {
		hadField := i < len(sourceLines) && strings.Contains(sourceLines[i], "{{")
		// Only the "·" a missing field leaves stranded is tidied: doubled, leading or trailing.
		// Anything else the advisor typed stays exactly as typed.
		line := dotRun.ReplaceAllLiteralString(raw, " \U000000b7 ")
		line = replaceFirst(dotLead, line, "")
		line = replaceFirst(dotTrail, line, "")
		line = js.TrimEnd(line)
		// A line that only held merge fields with nothing behind them disappears; a blank line
		// the advisor typed on purpose (between blocks) stays.
		if js.Trim(line) == "" && hadField {
			continue
		}
		lines = append(lines, carddigits.MaskCardNumbers(line))
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return append(lines, "", LockedSignatureLine)
}

// linkable is linkify's /gi pattern in lower case, for asciiLower(text). A bare domain only
// with a common web ending, so "St.Lucia" or "e.g." never becomes a link.
var linkable = js.Regexp(`\b(https?://[^\s<&]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:[a-z0-9-]+\.)+(?:com|net|org|travel|co|us|ca|mx|io|info|biz)\b(?:/[^\s<&]*)?)`, "")

// linkify makes links typed into a signature clickable: https URLs, bare story-tail style
// domains, and email addresses. Its input is already escaped.
func linkify(escaped string) string {
	matches := linkable.FindAllStringIndex(asciiLower(escaped), -1)
	if matches == nil {
		return escaped
	}
	var b strings.Builder
	at := 0
	for _, loc := range matches {
		m := escaped[loc[0]:loc[1]]
		var href string
		switch {
		case strings.Contains(m, "@") && !strings.HasPrefix(m, "http"):
			href = "mailto:" + m
		case strings.HasPrefix(asciiLower(m), "http:") || strings.HasPrefix(asciiLower(m), "https:"):
			href = m
		default:
			href = "https://" + m
		}
		b.WriteString(escaped[at:loc[0]])
		b.WriteString(`<a href="` + href + `" style="color:` + burgundy + `">` + m + `</a>`)
		at = loc[1]
	}
	b.WriteString(escaped[at:])
	return b.String()
}

func signatureHTML(lines []string) string {
	parts := make([]string, len(lines))
	for i, l := range lines {
		if l != "" {
			parts[i] = linkify(escapeHTML(l))
		}
	}
	return `<div style="margin:18px 0 0;padding:14px 0 0;border-top:1px solid ` + sand + `;color:` + muted + `;font-size:14px;line-height:1.5">` +
		strings.Join(parts, "<br>") + `</div>`
}

// htmlHead is the shared start of every email's HTML, up to and including the wordmark line.
func htmlHead(subject string) string {
	return "<!doctype html>\n" +
		`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` + "\n" +
		`<title>` + escapeHTML(subject) + `</title></head>` + "\n" +
		`<body style="margin:0;padding:0;background:` + cream + `;color:` + ink + `;font-family:Poppins,Helvetica,Arial,sans-serif;font-size:16px">` + "\n" +
		`<div style="max-width:560px;margin:0 auto;padding:28px 18px">` + "\n" +
		`<p style="margin:0 0 22px;font-weight:600;color:` + burgundy + `;letter-spacing:0.02em">Story-Tail Adventures</p>` + "\n"
}

// button is the one call to action.
func button(link, label string) string {
	return `<p style="margin:22px 0"><a href="` + escapeHTML(link) + `" style="display:inline-block;background:` + burgundy +
		`;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">` + label + `</a></p>`
}

var paragraphBreak = regexp.MustCompile(`\n{2,}`)

// BuildEmail is the email for one claimed row. An error when the row cannot honestly be sent
// (no replies left to carry, a recipient that is not one address), so the caller fails it
// rather than mailing something wrong. signature nil is null.
func BuildEmail(row ClaimedEmail, tokens Tokens, cfg Config, signature *SignatureSource) (Built, error) {
	to := js.Trim(row.Recipient)
	if !address.MatchString(to) {
		return Built{}, errors.New("recipient is not a single email address")
	}
	if len(row.Messages) == 0 {
		return Built{}, errors.New("no replies left to send")
	}
	if !isToken(tokens.Reply) || !isToken(tokens.Unsubscribe) {
		return Built{}, errors.New("bad token")
	}

	// Lowercase unless it starts a sentence (brand review): "A note from your advisor".
	agent := firstName(row.AgentFirstName, "your advisor")
	trip := cleanTitle(row.TripTitle)

	subjectText := "A note from " + agent
	if trip != "" {
		subjectText = sentenceStart(agent) + " wrote about " + trip
	}
	subject, err := headerSafe(subjectText, "subject")
	if err != nil {
		return Built{}, err
	}
	fromName, err := headerSafe(sentenceStart(agent)+" at Story-Tail Adventures", "sender name")
	if err != nil {
		return Built{}, err
	}
	// The mailbox's own plus address (docs/IMAP-Library-Security-Review.md §3a): `email-inbox`
	// reads replies out of that mailbox and matches them by this token.
	replyTo, err := headerSafe(emailinbound.PlusAddress(cfg.FromAddress, tokens.Reply), "reply address")
	if err != nil {
		return Built{}, err
	}
	link := ThreadURL(cfg, row.ConversationID)
	unsubPage, unsubOneClick := UnsubscribeLinks(cfg, tokens.Unsubscribe)

	texts := make([]string, len(row.Messages))
	var files []string
	for i, m := range row.Messages {
		texts[i] = carddigits.MaskCardNumbers(js.Trim(m.Body))
		for _, f := range m.Attachments {
			if js.Trim(f) != "" {
				files = append(files, f)
			}
		}
	}
	fileLine := ""
	switch {
	case len(files) == 1:
		fileLine = sentenceStart(agent) + " shared a file with you: " + files[0] + ". You'll find it in the conversation."
	case len(files) > 1:
		fileLine = sentenceStart(agent) + " shared " + strconv.Itoa(len(files)) + " files with you: " +
			strings.Join(files, ", ") + ". You'll find them in the conversation."
	}
	replyLine := "Reply to this email and " + agent + " will see it in your conversation. Files are best added in the app."

	// §3.12.4: under the advisor's words, above the button.
	sigLines := RenderSignature(signature)

	// No greeting of ours: the advisor's own words open the email, and they usually greet already.
	textLines := []string{strings.Join(texts, "\n\n---\n\n"), "", "-- "}
	textLines = append(textLines, sigLines...)
	if fileLine != "" {
		textLines = append(textLines, "", fileLine)
	}
	textLines = append(textLines,
		"",
		"Open the conversation: "+link,
		"",
		replyLine,
		"",
		"Stop emailing me about messages: "+unsubPage,
	)
	text := strings.Join(textLines, "\n")

	para := func(t string) string {
		var b strings.Builder
		for _, p := range paragraphBreak.Split(t, -1) {
			b.WriteString(`<p style="margin:0 0 14px;line-height:1.55">` + strings.ReplaceAll(escapeHTML(p), "\n", "<br>") + `</p>`)
		}
		return b.String()
	}
	var messageBlocks strings.Builder
	for _, t := range texts {
		messageBlocks.WriteString(`<div style="background:#FFFFFF;border-radius:12px;padding:18px 20px;margin:0 0 12px;border:1px solid ` + sand + `">` + para(t) + `</div>`)
	}
	fileHTML := ""
	if fileLine != "" {
		fileHTML = `<p style="margin:4px 0 16px;color:` + muted + `;font-size:14px">` + escapeHTML(fileLine) + `</p>`
	}

	html := htmlHead(subject) +
		messageBlocks.String() + "\n" +
		signatureHTML(sigLines) + "\n" +
		fileHTML + "\n" +
		button(link, "Open the conversation") + "\n" +
		`<p style="margin:0 0 28px;color:` + muted + `;font-size:14px;line-height:1.5">` + escapeHTML(replyLine) + `</p>` + "\n" +
		`<p style="margin:0;color:` + muted + `;font-size:12px"><a href="` + escapeHTML(unsubPage) + `" style="color:` + muted + `">Stop emailing me about messages</a></p>` + "\n" +
		`</div></body></html>`

	messageID := messageIDFor(row.OutboxID, cfg.FromAddress)
	previous := ""
	if row.PreviousOutboxID != nil && *row.PreviousOutboxID != "" {
		previous = messageIDFor(*row.PreviousOutboxID, cfg.FromAddress)
	}

	// RFC 8058 one-click. Built here (not through the mail library's list option) so no comment
	// syntax is ever parsed, the shape nodemailer's List-* advisory was about.
	listUnsubscribe, err := headerSafe("<"+unsubOneClick+">", "unsubscribe header")
	if err != nil {
		return Built{}, err
	}
	return Built{
		Outgoing: Outgoing{
			From:      Sender{Name: fromName, Address: cfg.FromAddress},
			To:        to,
			Subject:   subject,
			Text:      text,
			HTML:      html,
			MessageID: messageID,
			Headers: []Header{
				{"List-Unsubscribe", listUnsubscribe},
				{"List-Unsubscribe-Post", "List-Unsubscribe=One-Click"},
				{"Auto-Submitted", "auto-generated"},
			},
		},
		ReplyTo:    replyTo,
		InReplyTo:  previous,
		References: previous,
	}, nil
}

// ── §3.12.3 The advisor's alert emails ───────────────────────────────────────

// The kinds of a claimed alert.
const (
	AlertClientMessage = "client_message"
	AlertQuoteRequest  = "quote_request"
	AlertLeadMessage   = "lead_message"
)

// ClaimedAlert is a row `agent_alert_email_claim` hands out. Never a client's words: there is
// no body field. nil pointers are SQL nulls.
type ClaimedAlert struct {
	AlertID string `json:"alert_id"`
	// Kind is AlertClientMessage, AlertQuoteRequest or AlertLeadMessage.
	Kind           string  `json:"kind"`
	Recipient      string  `json:"recipient"`
	AgentFirstName *string `json:"agent_first_name"`
	ClientName     *string `json:"client_name"`
	TripTitle      *string `json:"trip_title"`
	ConversationID *string `json:"conversation_id"`
	TripID         *string `json:"trip_id"`
	// LeadID is set for a lead's message (§3.8, 2026-10-21); ClientName is then the lead's name.
	LeadID *string `json:"lead_id"`
}

// orNull is `${p}` for a string that may be null.
func orNull(p *string) string {
	if p == nil {
		return "null"
	}
	return *p
}

func set(p *string) bool { return p != nil && *p != "" }

// AlertURL is where "Open in Story-Tail" goes: the thread, the inquiry trip, or the lead. Plain
// links.
func AlertURL(cfg Config, row ClaimedAlert) string {
	if row.Kind == AlertClientMessage && set(row.ConversationID) {
		return cfg.SiteURL + "/agent/messages/" + *row.ConversationID
	}
	if row.Kind == AlertLeadMessage {
		return cfg.SiteURL + "/agent/leads/" + orNull(row.LeadID)
	}
	return cfg.SiteURL + "/agent/trips/" + orNull(row.TripID)
}

// BuildAlertEmail is the advisor's own alert (Q15): who, which trip, and a link. The client's
// words never appear, so they (and any card number a client types) stay out of the advisor's
// mail provider.
func BuildAlertEmail(row ClaimedAlert, cfg Config) (Outgoing, error) {
	to := js.Trim(row.Recipient)
	if !address.MatchString(to) {
		return Outgoing{}, errors.New("recipient is not a single email address")
	}
	if row.Kind == AlertClientMessage && !set(row.ConversationID) {
		return Outgoing{}, errors.New("no thread to open")
	}
	if row.Kind == AlertQuoteRequest && !set(row.TripID) {
		return Outgoing{}, errors.New("no trip to open")
	}
	if row.Kind == AlertLeadMessage && !set(row.LeadID) {
		return Outgoing{}, errors.New("no lead to open")
	}

	isMessage := row.Kind == AlertClientMessage
	isLead := row.Kind == AlertLeadMessage
	client := cleanTitle(row.ClientName)
	if client == "" {
		client = "A client"
		if isLead {
			client = "Someone new"
		}
	}
	trip := cleanTitle(row.TripTitle)
	link := AlertURL(cfg, row)

	var subjectText, line string
	switch {
	case isMessage:
		subjectText = "New message from " + client
		line = client + " wrote to you."
		if trip != "" {
			line = client + " wrote to you about " + trip + "."
		}
	case isLead:
		subjectText = client + " wrote to you from the website"
		// A lead's words stay out of the mail provider exactly as a client's do (§3.8).
		line = client + " doesn't have an account yet and sent you a note from the website."
	default:
		subjectText = "New trip request from " + client
		line = client + " sent a trip request."
		if trip != "" {
			line = client + " asked about a trip: " + trip + "."
		}
	}
	subject, err := headerSafe(subjectText, "subject")
	if err != nil {
		return Outgoing{}, err
	}
	// The quote-request switch covers leads too since 2026-10-21, and reads "New inquiries and
	// messages" (Screen Inventory 3.12.3).
	why := `You get this because "New inquiries and messages" emails are on in your notification settings.`
	if isMessage {
		why = "You get this because client-message emails are on in your notification settings."
	}

	text := strings.Join([]string{line, "", "Open in Story-Tail: " + link, "", why}, "\n")
	html := htmlHead(subject) +
		`<p style="margin:0 0 18px;line-height:1.55">` + escapeHTML(line) + `</p>` + "\n" +
		button(link, "Open in Story-Tail") + "\n" +
		`<p style="margin:0;color:` + muted + `;font-size:12px">` + escapeHTML(why) + `</p>` + "\n" +
		`</div></body></html>`

	return Outgoing{
		From:      Sender{Name: "Story-Tail Adventures", Address: cfg.FromAddress},
		To:        to,
		Subject:   subject,
		Text:      text,
		HTML:      html,
		MessageID: messageIDFor(row.AlertID, cfg.FromAddress),
		Headers:   []Header{{"Auto-Submitted", "auto-generated"}},
	}, nil
}

// ── SMTP outcomes ────────────────────────────────────────────────────────────

var (
	addressLike = js.Regexp(`[^\s<>"']+@[^\s<>"']+`, "")
	whitespace  = js.Regexp(`\s+`, "")
)

// ClassifySMTPError says what an SMTP error means for the row: a 5xx reply (or a rejected
// recipient) will not get better by retrying (permanent); anything else (4xx, timeouts, a
// dropped connection) is worth another try. The text kept is the code and the server's words,
// with any address removed and cut to 200 characters (Data-Model §12.8 `last_error`).
//
// err is the error as nodemailer shaped it: `responseCode` (a number), `response`, `message`
// and `code` (strings). The Go sender builds that object from its own error.
func ClassifySMTPError(err js.Value) (permanent bool, text string) {
	code, hasCode := err.Get("responseCode").Num()
	var parts []string
	if hasCode {
		parts = append(parts, js.NumberString(code))
	} else if c, ok := err.Get("code").Str(); ok && c != "" {
		parts = append(parts, c)
	}
	words := "send failed"
	if r, ok := err.Get("response").Str(); ok {
		words = r
	} else if m, ok := err.Get("message").Str(); ok {
		words = m
	}
	if words != "" {
		parts = append(parts, words)
	}
	raw := strings.Join(parts, " ")
	scrubbed := js.Trim(whitespace.ReplaceAllLiteralString(addressLike.ReplaceAllLiteralString(raw, "[address]"), " "))
	return hasCode && code >= 500 && code < 600, js.Slice(scrubbed, 0, 200)
}

// ── JavaScript details ───────────────────────────────────────────────────────

// encodeURIComponent percent-encodes everything but A-Z a-z 0-9 - _ . ! ~ * ' ( ).
func encodeURIComponent(s string) string {
	const hexDigits = "0123456789ABCDEF"
	s = js.ValidUTF8(s)
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' || strings.IndexByte("-_.!~*'()", c) >= 0 {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hexDigits[c>>4])
		b.WriteByte(hexDigits[c&15])
	}
	return b.String()
}

// replaceJS is `s.replace(re /g, replacement)` with a string replacement, $-patterns and all:
// $$ is $, $& the match, $` what precedes it, $' what follows. Every pattern passed here has no
// groups, so $1 and the like stay literal, as they do in JavaScript then. A display name of
// "Bob $& Co" really did come out as "Bob {{agent.name}} Co".
func replaceJS(re *regexp.Regexp, s, replacement string) string {
	if re.NumSubexp() != 0 {
		panic("email: replaceJS handles patterns without groups only")
	}
	matches := re.FindAllStringIndex(s, -1)
	if matches == nil {
		return s
	}
	var b strings.Builder
	at := 0
	for _, m := range matches {
		b.WriteString(s[at:m[0]])
		for i := 0; i < len(replacement); i++ {
			c := replacement[i]
			if c != '$' || i+1 == len(replacement) {
				b.WriteByte(c)
				continue
			}
			switch replacement[i+1] {
			case '$':
				b.WriteByte('$')
			case '&':
				b.WriteString(s[m[0]:m[1]])
			case '`':
				b.WriteString(s[:m[0]])
			case '\'':
				b.WriteString(s[m[1]:])
			default:
				b.WriteByte('$')
				continue
			}
			i++
		}
		at = m[1]
	}
	b.WriteString(s[at:])
	return b.String()
}

// replaceFirst is `s.replace(re, repl)` without the g flag, for a constant repl.
func replaceFirst(re *regexp.Regexp, s, repl string) string {
	m := re.FindStringIndex(s)
	if m == nil {
		return s
	}
	return s[:m[0]] + repl + s[m[1]:]
}

// asciiLower lowers A-Z only, keeping every byte offset (see the package comment).
func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + ('a' - 'A')
		}
	}
	return string(b)
}

// lower is toLowerCase: js.ToLower, but with U+0130 (İ) lowered to "i" + U+0307 as JavaScript
// does, where Go writes a plain "i".
func lower(s string) string {
	if strings.ContainsRune(s, 0x130) {
		s = strings.ReplaceAll(s, "\U00000130", "i\U00000307")
	}
	return js.ToLower(s)
}
