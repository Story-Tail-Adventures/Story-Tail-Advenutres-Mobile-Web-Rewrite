package signinemail

import (
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
)

// Ported from _shared/signInEmail_test.ts, one Go test per Deno.test.

var prodEnv = map[string]string{
	"EMAIL_SMTP_HOST":       "smtp.ionos.com",
	"EMAIL_SMTP_USER":       "gyasi.messages@adventures.story-tail.com",
	"EMAIL_SMTP_PASSWORD":   "secret",
	"EMAIL_FROM_ADDRESS":    "gyasi.messages@adventures.story-tail.com",
	"EMAIL_SITE_URL":        "https://storytailadventures.vercel.app/",
	"EMAIL_UNSUBSCRIBE_URL": "https://x.supabase.co/functions/v1/email-unsubscribe",
}

func mustConfig() email.Config {
	c, err := email.ConfigFromEnv(func(n string) string { return prodEnv[n] })
	if err != nil || c == nil {
		panic("the production settings must load")
	}
	return *c
}

var cfg = mustConfig()

// GoTrue's hashed_token: hex SHA-224 of email + OTP.
const hash = "a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233"

var kinds = []Kind{Reset, MagicLink, Invite}

func str(s string) *string { return &s }

func build(t *testing.T, kind Kind, edit func(in *Input)) email.Outgoing {
	t.Helper()
	e, err := buildErr(kind, edit)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func buildErr(kind Kind, edit func(in *Input)) (email.Outgoing, error) {
	in := Input{
		Kind:            kind,
		To:              "jordan.hayes@example.com",
		ClientFirstName: str("Jordan"),
		AgentFirstName:  str("Gyasi"),
		TokenHash:       hash,
		MessageKey:      "0195a2c0-0000-7000-8000-0000000000f1",
	}
	if edit != nil {
		edit(&in)
	}
	return BuildSignInEmail(in, cfg)
}

func mustURL(t *testing.T, kind Kind) string {
	t.Helper()
	link, err := SignInURL(cfg, kind, hash)
	if err != nil {
		t.Fatal(err)
	}
	return link
}

func eq[T comparable](t *testing.T, got, want T) {
	t.Helper()
	if got != want {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

func has(t *testing.T, s, part string) {
	t.Helper()
	if !strings.Contains(s, part) {
		t.Errorf("%q does not include %q", s, part)
	}
}

// Deno: "the link goes to /auth/confirm on the site, with the hash, type and a fixed next"
func TestLinkGoesToAuthConfirmWithHashTypeAndFixedNext(t *testing.T) {
	for _, kind := range kinds {
		u, err := url.Parse(mustURL(t, kind))
		if err != nil {
			t.Fatal(err)
		}
		eq(t, u.Scheme+"://"+u.Host, "https://storytailadventures.vercel.app")
		eq(t, u.Path, "/auth/confirm")
		q := u.Query()
		eq(t, q.Get("token_hash"), hash)
		eq(t, q.Get("type"), VerifyType[kind])
		eq(t, q.Get("next"), NextPath[kind])
	}
	eq(t, VerifyType[Reset], "recovery")
	eq(t, NextPath[Reset], "/reset-password")
}

// Deno: "a token hash that is not GoTrue's shape is refused, not sent"
func TestTokenHashNotGoTrueShapeRefused(t *testing.T) {
	for _, bad := range []string{"not-a-hash&next=https://evil.example", "", strings.ToUpper(hash)} {
		if _, err := SignInURL(cfg, Reset, bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

// Deno: "each email carries the link in both parts and names the advisor"
func TestEachEmailCarriesLinkInBothPartsAndNamesAdvisor(t *testing.T) {
	messageID := regexp.MustCompile(`^<0195a2c0-0000-7000-8000-0000000000f1@adventures\.story-tail\.com>$`)
	for _, kind := range kinds {
		e := build(t, kind, nil)
		link := mustURL(t, kind)
		has(t, e.Text, link)
		has(t, e.HTML, strings.ReplaceAll(link, "&", "&amp;"))
		has(t, e.Text, "Gyasi")
		has(t, e.Text, "Hi Jordan,")
		eq(t, e.From.Name, "Gyasi at Story-Tail Adventures")
		eq(t, e.From.Address, cfg.FromAddress)
		eq(t, e.To, "jordan.hayes@example.com")
		if !messageID.MatchString(e.MessageID) {
			t.Errorf("message id %q", e.MessageID)
		}
	}
}

// Deno: "reset and magic link say it was asked for and is safe to ignore"
func TestResetAndMagicLinkSayAskedForAndSafeToIgnore(t *testing.T) {
	for _, kind := range []Kind{Reset, MagicLink} {
		e := build(t, kind, nil)
		has(t, e.Text, "because you asked for help signing in")
		has(t, e.Text, "you can ignore this email")
		has(t, e.Text, "for the next hour")
	}
	has(t, build(t, Invite, nil).Text, "you can ignore it")
}

// Deno: "the subject holds no link and no token"
func TestSubjectHoldsNoLinkAndNoToken(t *testing.T) {
	for _, kind := range kinds {
		e := build(t, kind, nil)
		if strings.Contains(e.Subject, hash) || strings.Contains(e.Subject, "http") {
			t.Errorf("subject %q", e.Subject)
		}
	}
}

// Deno: "names cannot inject a header or markup"
func TestNamesCannotInjectHeaderOrMarkup(t *testing.T) {
	e := build(t, Reset, func(in *Input) {
		in.AgentFirstName = str("Gyasi\r\nBcc: x@evil.example")
		in.ClientFirstName = str("<b>Jo</b>")
	})
	eq(t, e.From.Name, "Gyasi at Story-Tail Adventures")
	if strings.Contains(e.Subject, "\n") {
		t.Errorf("subject %q", e.Subject)
	}
	if strings.Contains(e.HTML, "<b>Jo</b>") {
		t.Error("markup in a name reached the HTML")
	}
	has(t, e.HTML, "Hi &lt;b&gt;Jo&lt;/b&gt;,")
}

// Deno: "missing names fall back gently"
func TestMissingNamesFallBackGently(t *testing.T) {
	e := build(t, MagicLink, func(in *Input) { in.AgentFirstName, in.ClientFirstName = nil, str("  ") })
	has(t, e.Text, "Hi,\n")
	eq(t, e.Subject, "Your sign-in link from Your advisor")
	eq(t, e.From.Name, "Your advisor at Story-Tail Adventures")
}

// Deno: "a recipient that is not one address is refused"
func TestRecipientNotOneAddressRefused(t *testing.T) {
	if _, err := buildErr(Reset, func(in *Input) { in.To = "a@example.com, b@example.com" }); err == nil {
		t.Error("two recipients: want an error")
	}
	if _, err := buildErr(Reset, func(in *Input) { in.To = "" }); err == nil {
		t.Error("no recipient: want an error")
	}
}
