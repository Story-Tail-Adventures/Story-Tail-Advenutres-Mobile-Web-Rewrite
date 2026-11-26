// Package lead ports supabase/functions/_shared/lead.ts: what §3.8's public form and the
// advisor's lead actions accept (revived 2026-10-21, BRD §6.5, Data-Model §11).
//
// Pure: no network, no database. lead-message and agent-lead hand it the parsed body and the
// request headers, so every rule below is testable in CI.
//
// THE TWO SPAM CHECKS THAT STORE NOTHING. The form carries a hidden field (`website`) that a
// person never sees and a bot fills, and the moment it was drawn (`startedAt`, epoch
// milliseconds). A filled hidden field, or a send less than three seconds after the form was
// drawn, is answered like a success and writes nothing, so a bot learns nothing. The third
// check, five sends an hour per network address, lives in the database
// (lead_throttle_check), because it has to remember.
//
// WHOSE ADDRESS. The web form posts through a server action, so the address the function
// sees is the web server's, and every visitor would share one limit. The server passes the
// visitor's address in x-sta-client-ip beside a shared key (x-sta-form-key, LEAD_FORM_KEY
// here and STA_LEAD_FORM_KEY on the web). Without the right key the header is ignored and the
// connection's own address is used, so a caller who calls the function directly cannot pick
// a fresh address for every send.
package lead

import (
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/carddigits"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// LeadPages are the public pages a message can be sent from.
var LeadPages = []string{"landing", "how-it-works", "about", "topic", "results", "detail", "join", "app"}

// ManualLeadSources are 3.8.5's sources. `website` is the form's alone.
var ManualLeadSources = []string{"email", "phone", "referral", "social", "other"}

// LeadCloseReasons are 3.8.4's reasons.
var LeadCloseReasons = []string{"not_a_fit", "no_reply", "went_elsewhere", "other"}

// LeadOps are agent-lead's operations besides create.
var LeadOps = []string{"mark_contacted", "close", "reopen", "convert", "delete_spam"}

// The caps.
const (
	MaxName      = 80
	MaxEmail     = 254
	MaxPhone     = 40
	MaxBody      = 2000
	MaxAbout     = 120
	MaxUTM       = 100
	MaxCloseNote = 500
	// MinFillMS: faster than this from drawing the form to sending it, and it was not a person.
	MinFillMS = 3000
)

// Audience is WHO IS READING THE 400. The same parsers serve the public form (a visitor, so
// the sentence speaks about Gyasi) and the advisor's Add lead and Close (Gyasi himself, who
// should not be told "Please tell Gyasi your first name"). Each sentence comes in both voices.
type Audience int

// The two audiences.
const (
	Visitor Audience = iota
	Advisor
)

// What the form, or the advisor's screen, shows when a text holds a card number.
const (
	CardNumberRefusal        = "Please leave card numbers out. Gyasi will never ask for one here."
	CardNumberRefusalAdvisor = "Card numbers can't be saved here. Please take it out and try again."
)

type sentences struct{ firstName, body, bodyLong, card string }

var say = map[Audience]sentences{
	Visitor: {
		firstName: "Please tell Gyasi your first name.",
		body:      "Please write a few words for Gyasi.",
		bodyLong:  "Your note is a little long. Please keep it under 2,000 characters.",
		card:      CardNumberRefusal,
	},
	Advisor: {
		firstName: "Add a first name.",
		body:      "Add a few words about what they're looking for.",
		bodyLong:  "That's a little long. Please keep it under 2,000 characters.",
		card:      CardNumberRefusalAdvisor,
	},
}

var (
	emailShape = js.Regexp(`^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$`, "")
	phoneShape = js.Regexp(`^[0-9+().\-\s]{3,40}$`, "")
	slugShape  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,119}$`)
	// Control characters (other than newline and tab in a message body) never belong in a field.
	control    = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`)
	lineBreaks = regexp.MustCompile(`[\r\n\t\x{2028}\x{2029}]+`)
	spaceRuns  = js.Regexp(`\s+`, "")
	crlf       = regexp.MustCompile(`\r\n?`)
)

// line is one line of text, trimmed, or nil when empty. Too long is the caller's 400.
func line(value js.Value, max int, label string) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(label + " must be text.")
	}
	cleaned := js.Trim(spaceRuns.ReplaceAllString(lineBreaks.ReplaceAllString(control.ReplaceAllString(s, ""), " "), " "))
	if cleaned == "" {
		return nil, nil
	}
	if js.Len(cleaned) > max {
		return nil, problem.BadRequest(label + " is too long.")
	}
	return &cleaned, nil
}

// body is a message body: newlines kept, other control characters dropped, trimmed.
func body(value js.Value, audience Audience) (string, error) {
	s, ok := value.Str()
	if !ok {
		return "", problem.BadRequest(say[audience].body)
	}
	cleaned := js.Trim(control.ReplaceAllString(crlf.ReplaceAllString(s, "\n"), ""))
	if cleaned == "" {
		return "", problem.BadRequest(say[audience].body)
	}
	if js.Len(cleaned) > MaxBody {
		return "", problem.BadRequest(say[audience].bodyLong)
	}
	return cleaned, nil
}

func requiredName(value js.Value, audience Audience) (string, error) {
	first, err := line(value, MaxName, "First name")
	if err != nil {
		return "", err
	}
	if first == nil {
		return "", problem.BadRequest(say[audience].firstName)
	}
	return *first, nil
}

func email(value js.Value) (string, error) {
	e, err := line(value, MaxEmail, "Email")
	if err != nil {
		return "", err
	}
	if e == nil || !emailShape.MatchString(*e) {
		return "", problem.BadRequest("Please check your email address.")
	}
	return *e, nil
}

func phone(value js.Value) (*string, error) {
	p, err := line(value, MaxPhone, "Phone")
	if err != nil {
		return nil, err
	}
	if p != nil && !phoneShape.MatchString(*p) {
		return nil, problem.BadRequest("Please check your phone number.")
	}
	return p, nil
}

func refuseCard(audience Audience, texts ...*string) error {
	for _, t := range texts {
		if t != nil && carddigits.HasCardNumber(*t) {
			return problem.BadRequest(say[audience].card)
		}
	}
	return nil
}

// LeadFormInput is the public form's fields, checked.
type LeadFormInput struct {
	FirstName   string  `json:"firstName"`
	LastName    *string `json:"lastName"`
	Email       string  `json:"email"`
	Phone       *string `json:"phone"`
	Message     string  `json:"message"`
	Page        *string `json:"page"`
	AboutKind   *string `json:"aboutKind"` // "trip" or "topic"
	AboutSlug   *string `json:"aboutSlug"`
	AboutLabel  *string `json:"aboutLabel"`
	UTMSource   *string `json:"utmSource"`
	UTMMedium   *string `json:"utmMedium"`
	UTMCampaign *string `json:"utmCampaign"`
}

// LooksAutomated reports whether a send is a bot's: the hidden field filled, or sent too fast.
// now is epoch milliseconds. startedAt missing or not a number is a malformed request (a
// 400), not a bot: every caller we wrote sends it.
func LooksAutomated(payload js.Value, now int64) (bool, error) {
	honeypot := payload.Get("website")
	if h, ok := honeypot.Str(); ok && js.Trim(h) != "" {
		return true, nil
	}
	if !honeypot.IsNullish() && honeypot.TypeOf() != "string" {
		return true, nil
	}
	started, ok := payload.Get("startedAt").Num()
	if !ok || !js.IsFinite(started) {
		return false, problem.BadRequest("Send startedAt, the moment the form was drawn.")
	}
	return float64(now)-started < MinFillMS, nil
}

// ParseLeadForm checks the public form's fields. It returns a 400 a person can read.
func ParseLeadForm(payload js.Value) (LeadFormInput, error) {
	var f LeadFormInput
	var err error
	if f.FirstName, err = requiredName(payload.Get("firstName"), Visitor); err != nil {
		return LeadFormInput{}, err
	}
	if f.LastName, err = line(payload.Get("lastName"), MaxName, "Last name"); err != nil {
		return LeadFormInput{}, err
	}
	if f.Email, err = email(payload.Get("email")); err != nil {
		return LeadFormInput{}, err
	}
	if f.Phone, err = phone(payload.Get("phone")); err != nil {
		return LeadFormInput{}, err
	}
	if f.Message, err = body(payload.Get("message"), Visitor); err != nil {
		return LeadFormInput{}, err
	}
	if err = refuseCard(Visitor, &f.Message, f.Phone); err != nil {
		return LeadFormInput{}, err
	}

	if page, ok := payload.Get("page").Str(); ok && slices.Contains(LeadPages, page) {
		f.Page = &page
	}

	// What they were viewing. Dropped (not refused) when malformed: it is context for Gyasi,
	// and a visitor should never be stopped by something they did not type.
	if about := payload.Get("about"); about.IsPlainObject() {
		kind, _ := about.Get("kind").Str()
		slug, isString := about.Get("slug").Str()
		if (kind == "trip" || kind == "topic") && isString && slugShape.MatchString(slug) {
			f.AboutKind = &kind
			f.AboutSlug = &slug
			if label, err := line(about.Get("label"), MaxAbout, "About"); err == nil {
				f.AboutLabel = label
			}
		}
	}

	utm := payload.Get("utm")
	if !utm.IsPlainObject() {
		utm = js.ObjectValue()
	}
	tag := func(v js.Value) *string {
		t, err := line(v, MaxUTM, "Campaign tag")
		if err != nil {
			return nil
		}
		return t
	}
	f.UTMSource = tag(utm.Get("source"))
	f.UTMMedium = tag(utm.Get("medium"))
	f.UTMCampaign = tag(utm.Get("campaign"))
	return f, nil
}

// ManualLeadInput is 3.8.5 Add lead's fields, checked.
type ManualLeadInput struct {
	FirstName string  `json:"firstName"`
	LastName  *string `json:"lastName"`
	Email     string  `json:"email"`
	Phone     *string `json:"phone"`
	Source    string  `json:"source"`
	Message   string  `json:"message"`
}

// ParseManualLead checks 3.8.5 Add lead.
func ParseManualLead(payload js.Value) (ManualLeadInput, error) {
	source, ok := payload.Get("source").Str()
	if !ok || !slices.Contains(ManualLeadSources, source) {
		return ManualLeadInput{}, problem.BadRequest("source must be one of: " + strings.Join(ManualLeadSources, ", ") + ".")
	}
	m := ManualLeadInput{Source: source}
	var err error
	if m.FirstName, err = requiredName(payload.Get("firstName"), Advisor); err != nil {
		return ManualLeadInput{}, err
	}
	if m.LastName, err = line(payload.Get("lastName"), MaxName, "Last name"); err != nil {
		return ManualLeadInput{}, err
	}
	if m.Email, err = email(payload.Get("email")); err != nil {
		return ManualLeadInput{}, err
	}
	if m.Phone, err = phone(payload.Get("phone")); err != nil {
		return ManualLeadInput{}, err
	}
	if m.Message, err = body(payload.Get("message"), Advisor); err != nil {
		return ManualLeadInput{}, err
	}
	if err = refuseCard(Advisor, &m.Message, m.Phone); err != nil {
		return ManualLeadInput{}, err
	}
	return m, nil
}

// CloseInput is 3.8.4 Close: a reason from the list and an optional private note.
type CloseInput struct {
	Reason string  `json:"reason"`
	Note   *string `json:"note"`
}

// ParseClose checks 3.8.4 Close.
func ParseClose(payload js.Value) (CloseInput, error) {
	reason, ok := payload.Get("reason").Str()
	if !ok || !slices.Contains(LeadCloseReasons, reason) {
		return CloseInput{}, problem.BadRequest("reason must be one of: " + strings.Join(LeadCloseReasons, ", ") + ".")
	}
	c := CloseInput{Reason: reason}
	if note := payload.Get("note"); !note.IsNullish() {
		text, ok := note.Str()
		if !ok {
			return CloseInput{}, problem.BadRequest("note must be text.")
		}
		trimmed := js.Trim(control.ReplaceAllString(crlf.ReplaceAllString(text, "\n"), ""))
		if js.Len(trimmed) > MaxCloseNote {
			return CloseInput{}, problem.BadRequest("That note is too long.")
		}
		if trimmed != "" {
			c.Note = &trimmed
		}
	}
	if err := refuseCard(Advisor, c.Note); err != nil {
		return CloseInput{}, err
	}
	return c, nil
}

// RequireLeadOp is agent-lead's op: "create" or one of LeadOps.
func RequireLeadOp(value js.Value) (string, error) {
	op, ok := value.Str()
	if ok && (op == "create" || slices.Contains(LeadOps, op)) {
		return op, nil
	}
	return "", problem.BadRequest("op must be create or one of: " + strings.Join(LeadOps, ", ") + ".")
}

// SameSecret is a constant-time string comparison, for the form key. It compares the UTF-8
// bytes, as the Deno version compared TextEncoder output, touching every byte of the longer.
func SameSecret(a, b string) bool {
	x, y := []byte(a), []byte(b)
	diff := len(x) ^ len(y)
	for i := 0; i < max(len(x), len(y)); i++ {
		var xi, yi byte
		if i < len(x) {
			xi = x[i]
		}
		if i < len(y) {
			yi = y[i]
		}
		diff |= int(xi ^ yi)
	}
	return diff == 0
}

// header is Fetch's Headers.get: every value of the name joined with ", ", or false when the
// header is absent. Deno hands header values to JavaScript as byte strings, one character
// per byte, so a non-ASCII byte is read as its Latin-1 character here too: lengths and
// comparisons then count bytes, as they did there.
func header(h http.Header, name string) (string, bool) {
	values := h.Values(name)
	if len(values) == 0 {
		return "", false
	}
	joined := strings.Join(values, ", ")
	var b strings.Builder
	for i := 0; i < len(joined); i++ {
		b.WriteRune(rune(joined[i]))
	}
	return b.String(), true
}

// ClientAddress is the address the per-address limit counts. The web server's forwarded
// visitor address when it holds the shared key. Otherwise the connection's own:
// cf-connecting-ip when the edge set it (a caller cannot), else the left-most x-forwarded-for
// entry, the rule hotel search's limiter already uses. NOT x-real-ip: on the local stack that
// is the gateway's own address, which would put every visitor in one bucket. nil when none is
// there: the database then counts all such sends together.
//
// formKey "" stands for the Deno version's null: both are falsy, so both mean "no key".
func ClientAddress(headers http.Header, formKey string) *string {
	offered, _ := header(headers, "x-sta-form-key")
	forwarded, _ := header(headers, "x-sta-client-ip")
	forwarded = js.Trim(forwarded)
	if formKey != "" && offered != "" && forwarded != "" && SameSecret(offered, formKey) && js.Len(forwarded) <= 64 {
		return &forwarded
	}
	cf, hasCF := header(headers, "cf-connecting-ip")
	xff, hasXFF := header(headers, "x-forwarded-for")
	if hasXFF {
		xff, _, _ = strings.Cut(xff, ",")
	}
	for _, c := range []struct {
		v  string
		ok bool
	}{{cf, hasCF}, {xff, hasXFF}} {
		if !c.ok {
			continue
		}
		if v := js.Trim(c.v); v != "" && js.Len(v) <= 64 {
			return &v
		}
	}
	return nil
}
