package public

import (
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 2.0.12 Message Gyasi, the guest lead form (/message, never /messages, which is the
// traveler's own inbox). Ports app/(public)/(plain)/message/{page.tsx,MessageForm.tsx,
// actions.ts,state.ts}. P2 (BRD §6.5, 2026-10-21; Data-Model §11).
//
// Anyone who only messages Gyasi without an account is a LEAD, and lead-message is where one
// is made. The field rules, the honeypot, the too-fast check and the refusal of a card number
// in the note (CLAUDE.md rule 1) all live in that function, which answers a 400 with a
// sentence; this page shows that sentence rather than keeping a second copy of the rules.
//
// WHAT IT NEVER DOES: tell the visitor whether their address belongs to a client (every
// accepted send is the same thank-you), email them anything, or log what they typed.
//
// Everything in the URL and in the posted form is untrusted: `from` is an allow-list, `trip`
// is looked up in the curated catalog and only the catalog NAME is rendered, `topic` is an
// allow-list, and the campaign tags are cut to plain characters. Nothing a visitor typed in a
// URL appears on the page as text, and the "about" context Gyasi sees is rebuilt from the
// catalog rather than taken from the form.

// messagePath is the page's own path; /messages is the gated inbox.
const messagePath = "/message"

// messageMax is the longest note the function accepts (Data-Model §11.2).
const messageMax = 2000

// The copy, from state.ts MESSAGE_TEXT. Only the strings Go decides between are here; the
// rest sit in message.html, where they read in place.
const (
	messageMetaTitle       = "Message Gyasi"
	messageMetaDescription = "No account needed. Send Gyasi a note about the trip you're dreaming of. He usually replies the same day."
	messageAboutPrefix     = "About: "
	// messageThrottled is unused on purpose, and kept because check_copy_parity.py pins it
	// against state.ts. A 429 reaches the visitor as the function's own sentence instead,
	// because api.Result carries no status and matching on the words of a detail is what
	// edge.ts warns against. It becomes live again when api.Result grows a Status field.
	messageThrottled   = "A few notes have come from this connection in the last hour. Please try again a little later."
	messageUnavailable = "Your note didn't send just now. What you wrote is still here, so please try again in a moment."
)

// messageTopics are the topics the form will name. A trip wins over a topic.
var messageTopics = []content.Topic{content.Caribbean, content.Cruises, content.Honeymoons}

var messageSpec = page.Spec{
	File:   "public/message.html",
	Layout: shell.PublicPlain,
	Slots: []string{
		"lead", "about", "form", "sent",
		"field-from", "field-trip", "field-topic",
		"field-utm-source", "field-utm-medium", "field-utm-campaign", "field-started-at",
		"alert", "alert-text",
		"field-first-name", "field-last-name", "field-email", "field-phone", "field-message",
		"quote-link", "explore-link",
	},
}

// messageValues are the five fields the visitor fills, echoed back on a refusal so a failed
// send does not clear what they typed.
type messageValues struct {
	FirstName string
	LastName  string
	Email     string
	Phone     string
	Message   string
}

// messageView is one rendering of the page: the context from the URL (or from the form on a
// refusal), what the visitor typed, and which of the two panels to show.
type messageView struct {
	// From is an allow-listed inquiry source, or "".
	From string
	// Trip is a slug that exists in the catalog, or "".
	Trip string
	// Topic is one of messageTopics, used only when Trip is empty.
	Topic string
	// AboutLabel is what the card names, from the catalog: "Beaches Turks & Caicos" or
	// "a honeymoon". Empty shows no "About:" line.
	AboutLabel  string
	UTMSource   string
	UTMMedium   string
	UTMCampaign string
	// StartedAt is when the form was drawn, in epoch milliseconds. lead-message drops a send
	// made under three seconds after it, which no person filling the form can manage.
	StartedAt int64
	Values    messageValues
	// Error is the one sentence a refused send shows, or "".
	Error string
	// Sent shows the thank-you panel instead of the form.
	Sent bool
}

// messageTag cleans a campaign tag from the URL: one short line of plain characters, or "".
// Ports the page's `tag`, replace(/[^\w.\-+ ]/g, "").slice(0, 100). Everything that survives
// is ASCII, so cutting bytes and cutting UTF-16 code units are the same cut.
func messageTag(value string) string {
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9',
			c == '_', c == '.', c == '-', c == '+', c == ' ':
			b.WriteByte(c)
		}
		if b.Len() == 100 {
			break
		}
	}
	return b.String()
}

// messageAbout resolves what the card and the lead row name, from the catalog only: a trip
// slug that exists, else a known topic, else nothing. The slug a visitor edits in the page
// can therefore never reach Gyasi as "what they were looking at".
func messageAbout(c *content.Catalog, tripSlug, topic string) (slug, topicOut, label string) {
	if tripSlug != "" {
		if trip, ok := c.Trip(tripSlug); ok {
			return trip.Slug, "", trip.Name
		}
	}
	if slices.Contains(messageTopics, content.Topic(topic)) {
		return "", topic, search.TopicLabel[content.Topic(topic)]
	}
	return "", "", ""
}

// messageSource keeps an allow-listed inquiry source and drops anything else.
func messageSource(value string) string {
	if search.IsInquirySource(value) {
		return value
	}
	return ""
}

// messageContext builds the part of the view that comes from the URL or the posted form.
// values is the query string on a GET and the body on a POST; both are a visitor's to write.
func (s *site) messageContext(values url.Values, now time.Time) messageView {
	v := messageView{
		From:        messageSource(values.Get("from")),
		UTMSource:   messageTag(values.Get("utm_source")),
		UTMMedium:   messageTag(values.Get("utm_medium")),
		UTMCampaign: messageTag(values.Get("utm_campaign")),
		StartedAt:   now.UnixMilli(),
	}
	v.Trip, v.Topic, v.AboutLabel = messageAbout(s.cat, values.Get("trip"), values.Get("topic"))
	return v
}

// exploreHref is where "Keep exploring" goes: the trip they were looking at, or home.
func (v messageView) exploreHref() string {
	if v.Trip != "" {
		return search.TripHref(v.Trip)
	}
	return "/"
}

// joinHref is the "ready for a full quote" link: the gate, carrying the trip.
func (v messageView) joinHref() string {
	intent := search.IntentTour
	if v.Trip != "" {
		intent = search.IntentQuote
	}
	return search.JoinHref(search.JoinLink{Intent: intent, Trip: v.Trip})
}

// sentHref is where a successful send lands: this page again, showing the thank-you panel.
// React swapped the panel in place; a post answers 303 so a refresh cannot send twice
// (docs/GO-MIGRATION.md §4.9). The context travels so "Keep exploring" still knows the trip.
func (v messageView) sentHref() string {
	q := url.Values{"sent": {"1"}}
	if v.From != "" {
		q.Set("from", v.From)
	}
	if v.Trip != "" {
		q.Set("trip", v.Trip)
	}
	if v.Topic != "" {
		q.Set("topic", v.Topic)
	}
	return messagePath + "?" + q.Encode()
}

// fill writes one rendering of the page.
func (s *site) fillMessage(d *page.Doc, v messageView) {
	s.chrome(d, nil, messagePath)
	s.head(d, meta{
		Title:       messageMetaTitle,
		Description: messageMetaDescription,
		Path:        messagePath,
		NoIndex:     true,
	})

	if v.AboutLabel != "" {
		d.Text("about", messageAboutPrefix+v.AboutLabel)
		d.Class("lead", "gate-lead-about", true)
	} else {
		d.Remove("about")
	}
	d.Keep("lead")

	if v.Sent {
		d.Remove("form")
		d.Keep("sent")
		d.URL("explore-link", "href", v.exploreHref())
		return
	}
	d.Remove("sent")
	d.Keep("form")

	d.Attr("field-from", "value", v.From)
	d.Attr("field-trip", "value", v.Trip)
	d.Attr("field-topic", "value", v.Topic)
	d.Attr("field-utm-source", "value", v.UTMSource)
	d.Attr("field-utm-medium", "value", v.UTMMedium)
	d.Attr("field-utm-campaign", "value", v.UTMCampaign)
	d.Attr("field-started-at", "value", strconv.FormatInt(v.StartedAt, 10))

	if v.Error != "" {
		d.Keep("alert")
		d.Text("alert-text", v.Error)
	} else {
		d.Remove("alert")
	}

	d.Attr("field-first-name", "value", v.Values.FirstName)
	d.Attr("field-last-name", "value", v.Values.LastName)
	d.Attr("field-email", "value", v.Values.Email)
	d.Attr("field-phone", "value", v.Values.Phone)
	d.Text("field-message", v.Values.Message)
	d.URL("quote-link", "href", v.joinHref())
}

// message serves GET /message: the form, or the thank-you panel after a send. It reads the
// URL and nothing else, so one cached copy per URL is right for everybody.
func (s *site) message(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		v := s.messageContext(q, time.Now())
		v.Sent = q.Get("sent") == "1"
		d := tmpl.New()
		s.fillMessage(d, v)
		// Not s.render: this page may not be cached, though §4.7's general rule would allow
		// it (no cookie, no call). The form carries startedAt, the moment it was drawn, and
		// lead-message rejects a send that arrives less than MIN_FILL_MS after it. A shared
		// cache would freeze one stamp into every copy for an hour, so the check would
		// measure against whenever the cache happened to fill rather than against this
		// visitor, and would stop meaning what it says. Next renders it per request for the
		// same reason: its page awaits searchParams, which makes the route dynamic.
		web.Render(w, s.Log, d, http.StatusOK, web.Private)
	}
}

// leadMessageAbout is what the visitor was looking at, as lead-message takes it.
type leadMessageAbout struct {
	Kind  string `json:"kind"`
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

// leadMessageUTM is the campaign tag set. An empty field is left out, as the action's
// `|| undefined` did.
type leadMessageUTM struct {
	Source   string `json:"source,omitempty"`
	Medium   string `json:"medium,omitempty"`
	Campaign string `json:"campaign,omitempty"`
}

// leadMessageBody is the call's JSON body (lib/public/leadMessage.ts LeadMessageInput).
type leadMessageBody struct {
	FirstName string            `json:"firstName"`
	LastName  string            `json:"lastName"`
	Email     string            `json:"email"`
	Phone     string            `json:"phone"`
	Message   string            `json:"message"`
	Page      *string           `json:"page"`
	About     *leadMessageAbout `json:"about"`
	UTM       leadMessageUTM    `json:"utm"`
	// Website is the honeypot, passed through: the function decides.
	Website string `json:"website"`
	// StartedAt is epoch milliseconds, 0 when the field was not a number.
	StartedAt int64 `json:"startedAt"`
}

// messageBody builds the call's body from the view and the posted form.
func messageBody(v messageView, website string, startedAt int64) leadMessageBody {
	b := leadMessageBody{
		FirstName: v.Values.FirstName,
		LastName:  v.Values.LastName,
		Email:     v.Values.Email,
		Phone:     v.Values.Phone,
		Message:   v.Values.Message,
		UTM:       leadMessageUTM{Source: v.UTMSource, Medium: v.UTMMedium, Campaign: v.UTMCampaign},
		Website:   website,
		StartedAt: startedAt,
	}
	if v.From != "" {
		from := v.From
		b.Page = &from
	}
	switch {
	case v.Trip != "":
		b.About = &leadMessageAbout{Kind: "trip", Slug: v.Trip, Label: v.AboutLabel}
	case v.Topic != "":
		b.About = &leadMessageAbout{Kind: "topic", Slug: v.Topic, Label: v.AboutLabel}
	}
	return b
}

// messagePost serves POST /message: the send. On success a 303 to the thank-you panel; on a
// refusal the same page again at 422 with what the visitor typed and the function's own
// sentence. Nothing here is logged: not the body, not the address, not the email.
func (s *site) messagePost(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		v := s.messageContext(form, time.Now())
		v.Values = messageValues{
			FirstName: form.Get("firstName"),
			LastName:  form.Get("lastName"),
			Email:     form.Get("email"),
			Phone:     form.Get("phone"),
			Message:   form.Get("message"),
		}
		// Number(value) with anything but a number is NaN, which the action sent as 0.
		startedAt, _ := strconv.ParseInt(strings.TrimSpace(form.Get("startedAt")), 10, 64)
		if startedAt > 0 {
			// Keep when the form was DRAWN, not when it was refused. A fresh stamp here would
			// make a quick second try look like a machine, and lead-message drops those
			// silently: the visitor would be told their note was on its way when it was not.
			v.StartedAt = startedAt
		}
		body := messageBody(v, form.Get("website"), startedAt)

		status := http.StatusUnprocessableEntity
		switch {
		case !s.Config.SupabaseConfigured():
			// Before `supabase start` has ever run there is nothing to call. Say so on the
			// page rather than failing (the action's authChecksDisabledForLocalDev branch).
			v.Error = messageUnavailable
			status = http.StatusServiceUnavailable
		default:
			visitor, _ := clientaddr.From(r.Header)
			res := s.API.Call(r.Context(), "lead-message", s.Config.SupabaseAnonKey, api.Input{
				Method:  http.MethodPost,
				Body:    body,
				Visitor: visitor,
			})
			out := web.FromResult(res, messageUnavailable)
			switch {
			case out.OK:
				web.SeeOther(w, r, v.sentHref())
				return
			case out.SignIn:
				// There is no session to lose here: the call carries the anon key, so a 401
				// means the key or the function is wrong, which is ours to fix, not theirs.
				v.Error = messageUnavailable
				status = http.StatusServiceUnavailable
			case out.Status == http.StatusUnprocessableEntity:
				// The function's own sentence, or this page's when it sent none.
				v.Error, status = out.Message, out.Status
			default:
				// Unreachable or broken. FromResult's own outage sentence is the auth one;
				// this page has its own, and it is the one that says the note is still here.
				v.Error, status = messageUnavailable, out.Status
			}
		}

		d := tmpl.New()
		s.fillMessage(d, v)
		web.Render(w, s.Log, d, status, web.Private)
	}
}
