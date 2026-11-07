// Package signinemail ports supabase/functions/_shared/signInEmail.ts: the three sign-in emails
// an advisor can send a client (reset, magic link, invite). Screen Inventory §3.9 (ruled
// 2026-10-16).
//
// Pure: no network, no database, no clock. `account-admin` asks GoTrue to MAKE the link
// (generateLink) and hands its token hash here; this builds the URL and the email, and the
// function sends the result.
//
// ── THE LINK SIGNS SOMEONE IN AS THE CLIENT ─────────────────────────────────
//
// So it exists in exactly one place: the body of an email to the client's own address. Nothing
// here returns it except inside the built email, and the caller never logs that value, returns
// it, or writes any part of it to an audit row.
//
// ── WHY OUR OWN URL, NOT GOTRUE'S action_link ───────────────────────────────
//
// action_link points at GoTrue's /verify and then redirects with tokens in the URL fragment,
// which our cookie-based (PKCE) web app cannot read. The token hash goes instead to
// /auth/confirm on the web app, which calls verifyOtp({ token_hash, type }) server-side and sets
// the session cookies.
package signinemail

import (
	"errors"
	"regexp"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

// Kind is SignInEmailKind.
type Kind string

// The kinds.
const (
	Reset     Kind = "reset"
	MagicLink Kind = "magic_link"
	Invite    Kind = "invite"
)

// VerifyType is GoTrue's verification_type for each kind, which /auth/confirm passes to verifyOtp.
var VerifyType = map[Kind]string{
	Reset:     "recovery",
	MagicLink: "magiclink",
	Invite:    "invite",
}

// NextPath is where /auth/confirm sends them once signed in. Fixed per kind; never from a request.
var NextPath = map[Kind]string{
	Reset:     "/reset-password",
	MagicLink: "/dashboard",
	Invite:    "/dashboard",
}

// Input is SignInEmailInput. nil pointers are nulls.
type Input struct {
	Kind Kind
	// To is the client's sign-in address (the record's address for an invite).
	To              string
	ClientFirstName *string
	AgentFirstName  *string
	// TokenHash is properties.hashed_token from generateLink.
	TokenHash string
	// MessageKey is for the Message-ID; any unique id (a uuid v7).
	MessageKey string
}

var (
	address = regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)
	// tokenHash is GoTrue's hashed_token: lowercase hex (a SHA-224 today); anything else is refused.
	tokenHash = regexp.MustCompile(`^[0-9a-f]{32,128}$`)
	spaces    = js.Regexp(`\s+`, "")
)

func headerSafe(value, what string) (string, error) {
	if strings.ContainsAny(value, "\r\n") {
		return "", errors.New(what + " would break a mail header")
	}
	return value, nil
}

var htmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

func escapeHTML(text string) string { return htmlEscaper.Replace(text) }

// firstWord is the first word of a name, with control characters dropped; the fallback when empty.
func firstWord(value *string, fallback string) string {
	v := ""
	if value != nil {
		v = *value
	}
	cleaned := strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return ' '
		}
		return r
	}, v)
	if words := spaces.Split(js.Trim(cleaned), -1); words[0] != "" {
		return words[0]
	}
	return fallback
}

// SignInURL is the URL the email carries. Exported for tests; callers use BuildSignInEmail.
func SignInURL(cfg email.Config, kind Kind, hash string) (string, error) {
	if !tokenHash.MatchString(hash) {
		return "", errors.New("token hash is not what GoTrue issues")
	}
	// URLSearchParams in insertion order (url.Values would sort the keys).
	q := "token_hash=" + formEncode(hash) + "&type=" + formEncode(VerifyType[kind]) + "&next=" + formEncode(NextPath[kind])
	return cfg.SiteURL + "/auth/confirm?" + q, nil
}

// formEncode is URLSearchParams' application/x-www-form-urlencoded serializer: A-Z a-z 0-9
// * - . _ as they are, a space as +, everything else percent-encoded. (url.QueryEscape differs
// on * and ~.)
func formEncode(s string) string {
	const hexDigits = "0123456789ABCDEF"
	s = js.ValidUTF8(s)
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'A' <= c && c <= 'Z' || 'a' <= c && c <= 'z' || '0' <= c && c <= '9' || c == '*' || c == '-' || c == '.' || c == '_':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&15])
		}
	}
	return b.String()
}

// Design-System §3 light scheme, as email.BuildEmail uses.
const (
	burgundy = "#7A1A1F"
	cream    = "#FBF6EE"
	ink      = "#2B2B2B"
	muted    = "#6B6259"
)

type copyText struct {
	subject string
	lead    string
	button  string
	after   string
}

func copyFor(kind Kind, agent string) (copyText, bool) {
	switch kind {
	case Reset:
		return copyText{
			subject: agent + " sent you a link to reset your password",
			lead: agent + " sent you this link because you asked for help signing in to Story-Tail " +
				"Adventures. It lets you choose a new password.",
			button: "Choose a new password",
			after: "The link works once, for the next hour. If it runs out, just ask " + agent + " for a " +
				"new one. If you didn't ask for help, you can ignore this email and nothing will change.",
		}, true
	case MagicLink:
		return copyText{
			subject: "Your sign-in link from " + agent,
			lead: agent + " sent you this link because you asked for help signing in to Story-Tail " +
				"Adventures. It signs you straight in, no password needed.",
			button: "Sign me in",
			after: "The link works once, for the next hour, and it's just for you, so please don't " +
				"forward it. If it runs out, just ask " + agent + " for a new one. If you didn't ask for " +
				"help, you can ignore this email and nothing will change.",
		}, true
	case Invite:
		return copyText{
			subject: agent + " invited you to Story-Tail Adventures",
			lead: agent + " set up a place for your trips, where your plans, messages and travel " +
				"documents all live together. This link opens it for the first time.",
			button: "Open my trips",
			after: "The link works once, for the next hour. If it runs out, just ask " + agent + " for a " +
				"new one. If you weren't expecting this, you can ignore it.",
		}, true
	}
	return copyText{}, false
}

// BuildSignInEmail is BuiltSignInEmail for one request.
func BuildSignInEmail(input Input, cfg email.Config) (email.Outgoing, error) {
	to := js.Trim(input.To)
	if !address.MatchString(to) {
		return email.Outgoing{}, errors.New("recipient is not a single email address")
	}

	agent := firstWord(input.AgentFirstName, "Your advisor")
	client := firstWord(input.ClientFirstName, "")
	link, err := SignInURL(cfg, input.Kind, input.TokenHash)
	if err != nil {
		return email.Outgoing{}, err
	}
	c, ok := copyFor(input.Kind, agent)
	if !ok {
		// The Deno type allowed only the three kinds.
		return email.Outgoing{}, errors.New("not a sign-in email kind")
	}

	subject, err := headerSafe(c.subject, "subject")
	if err != nil {
		return email.Outgoing{}, err
	}
	fromName, err := headerSafe(agent+" at Story-Tail Adventures", "sender name")
	if err != nil {
		return email.Outgoing{}, err
	}
	greeting := "Hi,"
	if client != "" {
		greeting = "Hi " + client + ","
	}

	text := strings.Join([]string{
		greeting,
		"",
		c.lead,
		"",
		c.button + ": " + link,
		"",
		c.after,
	}, "\n")

	html := "<!doctype html>\n" +
		`<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` + "\n" +
		`<title>` + escapeHTML(subject) + `</title></head>` + "\n" +
		`<body style="margin:0;padding:0;background:` + cream + `;color:` + ink + `;font-family:Poppins,Helvetica,Arial,sans-serif;font-size:16px">` + "\n" +
		`<div style="max-width:560px;margin:0 auto;padding:28px 18px">` + "\n" +
		`<p style="margin:0 0 22px;font-weight:600;color:` + burgundy + `;letter-spacing:0.02em">Story-Tail Adventures</p>` + "\n" +
		`<p style="margin:0 0 14px;line-height:1.55">` + escapeHTML(greeting) + `</p>` + "\n" +
		`<p style="margin:0 0 14px;line-height:1.55">` + escapeHTML(c.lead) + `</p>` + "\n" +
		`<p style="margin:22px 0"><a href="` + escapeHTML(link) + `" style="display:inline-block;background:` + burgundy +
		`;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">` + escapeHTML(c.button) + `</a></p>` + "\n" +
		`<p style="margin:0;color:` + muted + `;font-size:14px;line-height:1.5">` + escapeHTML(c.after) + `</p>` + "\n" +
		`</div></body></html>`

	domain := "undefined" // `fromAddress.split("@")[1]` of an address with no @, as a template writes it
	if parts := strings.Split(cfg.FromAddress, "@"); len(parts) > 1 {
		domain = parts[1]
	}
	messageID, err := headerSafe("<"+input.MessageKey+"@"+domain+">", "message id")
	if err != nil {
		return email.Outgoing{}, err
	}
	return email.Outgoing{
		From:      email.Sender{Name: fromName, Address: cfg.FromAddress},
		To:        to,
		Subject:   subject,
		Text:      text,
		HTML:      html,
		MessageID: messageID,
		Headers:   []email.Header{{Name: "Auto-Submitted", Value: "auto-generated"}},
	}, nil
}
