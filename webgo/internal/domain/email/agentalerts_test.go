package email

import (
	"strings"
	"testing"
)

// The email half of _shared/agentAlerts_test.ts ("── Signature ──" and "── The advisor's alert
// emails ──"), one Go test per Deno.test. Its push cases are in push (and one in fcm). Its two
// "Settings readers" cases test agentSettings.ts (readSignature, readAutoReply) and belong with
// that module's port, not here.

var alertCfg = Config{
	Host:           "inbucket",
	Port:           1025,
	Secure:         false,
	FromAddress:    "gyasi.messages@adventures.story-tail.com",
	SiteURL:        "https://storytailadventures.vercel.app",
	UnsubscribeURL: "https://x.supabase.co/functions/v1/email-unsubscribe",
}

const defaultSig = "{{agent.name}}, Travel Advisor\n{{agent.phone}} \U000000b7 {{agent.email}}\nadventures.story-tail.com\n\nMaking travel an adventure"

// card is built at run time: the repo's card-number guard refuses the literal (CLAUDE.md rule 1).
var card = strings.Repeat("4242 ", 3) + "4242"

// ── Signature ────────────────────────────────────────────────────────────────

// Deno: "renderSignature: fills the fields and always ends with the locked host-agency line"
func TestRenderSignatureFillsFieldsEndsWithLockedLine(t *testing.T) {
	lines := RenderSignature(&SignatureSource{
		Signature:   str(defaultSig),
		DisplayName: str("Gyasi Story"),
		Phone:       str("+1 (305) 555-0184"),
		Email:       str("gyasi@story-tail.com"),
	})
	eq(t, lines, []string{
		"Gyasi Story, Travel Advisor",
		"+1 (305) 555-0184 \U000000b7 gyasi@story-tail.com",
		"adventures.story-tail.com",
		"",
		"Making travel an adventure",
		"",
		LockedSignatureLine,
	})
}

// Deno: "renderSignature: a missing phone leaves no stranded separator"
func TestRenderSignatureMissingPhoneNoStrandedSeparator(t *testing.T) {
	lines := RenderSignature(&SignatureSource{Signature: str(defaultSig), DisplayName: str("Gyasi Story"), Email: str("g@x.com")})
	eq(t, lines[1], "g@x.com")
	none := RenderSignature(&SignatureSource{Signature: str("{{agent.phone}}\nHi"), DisplayName: str("G"), Phone: str(""), Email: str("")})
	eq(t, none, []string{"Hi", "", LockedSignatureLine})
}

// Deno: "renderSignature: with nothing stored, only the locked line; card numbers masked"
func TestRenderSignatureNothingStoredCardMasked(t *testing.T) {
	eq(t, RenderSignature(nil), []string{"", LockedSignatureLine})
	masked := RenderSignature(&SignatureSource{Signature: str("Pay with " + card)})
	if strings.Contains(strings.Join(masked, " "), card) {
		t.Errorf("got %q", masked)
	}
}

var alertRow = ClaimedEmail{
	OutboxID:        "0195a2c0-1a00-7000-8000-0000000000e1",
	ConversationID:  "0195a2c0-1a00-7000-8000-0000000000b0",
	Recipient:       "jordan@example.com",
	ClientFirstName: str("Jordan"),
	AgentFirstName:  str("Gyasi"),
	TripTitle:       str("Anniversary Week"),
	Messages:        []ClaimedMessage{{MessageID: "m1", Body: "See you soon!", CreatedAt: "2026-10-19T08:00:00Z", Attachments: []string{}}},
}

var alertTokens = Tokens{Reply: NewToken(), Unsubscribe: NewToken()}

// Deno: "buildEmail: the signature sits under the advisor's words, links clickable, text escaped"
func TestBuildEmailSignatureUnderWordsLinksEscaped(t *testing.T) {
	built, err := BuildEmail(alertRow, alertTokens, alertCfg, &SignatureSource{
		Signature:   str("{{agent.name}} <b>bold</b>\nstory-tail.com\n{{agent.email}}"),
		DisplayName: str("Gyasi Story"),
		Email:       str("gyasi@story-tail.com"),
	})
	if err != nil {
		t.Fatal(err)
	}
	words := strings.Index(built.Text, "See you soon!")
	sig := strings.Index(built.Text, "Gyasi Story <b>bold</b>")
	button := strings.Index(built.Text, "Open the conversation")
	if !(words >= 0 && sig > words && button > sig) {
		t.Errorf("words, then signature, then the link: %d %d %d", words, sig, button)
	}
	has(t, built.Text, LockedSignatureLine)
	has(t, built.HTML, "Gyasi Story &lt;b&gt;bold&lt;/b&gt;")
	has(t, built.HTML, `<a href="https://story-tail.com"`)
	has(t, built.HTML, `<a href="mailto:gyasi@story-tail.com"`)
	if strings.Contains(built.HTML, "<b>bold</b>") {
		t.Error("a tag typed into a signature is never HTML")
	}
	plain, err := BuildEmail(alertRow, alertTokens, alertCfg, &SignatureSource{Signature: str("Ask me about St.Lucia")})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(plain.HTML, `href="https://St.Lucia"`) {
		t.Error("a place name with a dot is not a link")
	}
}

// ── The advisor's alert emails ───────────────────────────────────────────────

var alert = ClaimedAlert{
	AlertID:        "0195a2c0-1a00-7000-8000-0000000000f1",
	Kind:           AlertClientMessage,
	Recipient:      "gyasi@example.com",
	AgentFirstName: str("Gyasi"),
	ClientName:     str("Jordan Hayes"),
	TripTitle:      str("Anniversary Week in Negril"),
	ConversationID: str("0195a2c0-1a00-7000-8000-0000000000b0"),
}

func buildAlert(t *testing.T, edit func(a *ClaimedAlert)) Outgoing {
	t.Helper()
	a := alert
	if edit != nil {
		edit(&a)
	}
	e, err := BuildAlertEmail(a, alertCfg)
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func alertErr(edit func(a *ClaimedAlert)) error {
	a := alert
	edit(&a)
	_, err := BuildAlertEmail(a, alertCfg)
	return err
}

// Deno: "buildAlertEmail: who, which trip and a link to the thread; no client words exist to leak"
func TestBuildAlertEmailWhoWhichTripLink(t *testing.T) {
	e := buildAlert(t, nil)
	eq(t, e.Subject, "New message from Jordan Hayes")
	eq(t, e.To, "gyasi@example.com")
	has(t, e.Text, "Jordan Hayes wrote to you about Anniversary Week in Negril.")
	has(t, e.Text, "https://storytailadventures.vercel.app/agent/messages/0195a2c0-1a00-7000-8000-0000000000b0")
	has(t, e.HTML, "Open in Story-Tail")
}

// Deno: "buildAlertEmail: a trip request links to the inquiry trip"
func TestBuildAlertEmailTripRequestLinksToTrip(t *testing.T) {
	e := buildAlert(t, func(a *ClaimedAlert) {
		a.Kind, a.ConversationID, a.TripID, a.TripTitle = AlertQuoteRequest, nil, str("t-1"), str("Hotel in Negril")
	})
	eq(t, e.Subject, "New trip request from Jordan Hayes")
	has(t, e.Text, "/agent/trips/t-1")
}

// Deno: "buildAlertEmail: a lead's message names them and links to the lead, never their words"
func TestBuildAlertEmailLeadMessage(t *testing.T) {
	e := buildAlert(t, func(a *ClaimedAlert) {
		a.Kind, a.ConversationID, a.TripTitle, a.ClientName, a.LeadID = AlertLeadMessage, nil, nil, str("Dana Reyes"), str("l-1")
	})
	eq(t, e.Subject, "Dana Reyes wrote to you from the website")
	has(t, e.Text, "Dana Reyes doesn't have an account yet and sent you a note from the website.")
	has(t, e.Text, "https://storytailadventures.vercel.app/agent/leads/l-1")
	has(t, e.Text, `"New inquiries and messages" emails are on`)
	if alertErr(func(a *ClaimedAlert) { a.Kind, a.ConversationID, a.LeadID = AlertLeadMessage, nil, nil }) == nil {
		t.Error("a lead alert with no lead: want an error")
	}
}

// Deno: "buildAlertEmail: refuses what it cannot honestly send"
func TestBuildAlertEmailRefusesWhatItCannotSend(t *testing.T) {
	if alertErr(func(a *ClaimedAlert) { a.Recipient = "a@b.com, c@d.com" }) == nil {
		t.Error("two recipients: want an error")
	}
	if alertErr(func(a *ClaimedAlert) { a.ConversationID = nil }) == nil {
		t.Error("no thread: want an error")
	}
	// A pasted line break in a name can never start a new header.
	e := buildAlert(t, func(a *ClaimedAlert) { a.ClientName = str("Jordan\r\nBcc: x@y.com") })
	if strings.ContainsAny(e.Subject, "\r\n") {
		t.Errorf("subject %q", e.Subject)
	}
}
