package public

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// §3.10 Stage 4, "Stop emailing me about messages" (/email/unsubscribe). Ports
// app/(public)/(plain)/email/unsubscribe/{page.tsx,actions.ts,copy.ts} and the two calls in
// lib/email/unsubscribe.ts. Data-Model §12.9, Screen Inventory §3.10.
//
// The link in every message email lands here. There is no sign-in: the 128-bit token in the
// link is the credential, and it changes one switch for one person.
//
// OPENING THE PAGE CHANGES NOTHING. The read is a GET to the function and the change needs
// the button, so a mail scanner that follows every link in a message unsubscribes nobody.
//
// The token is in the URL, which is why this page is answered with Referrer-Policy:
// no-referrer (Next set it in next.config.ts and in the page's metadata): without it the
// address bar, token and all, would travel to every host the page then asks for anything
// from. It is never cached, never logged and never put in a log line with its status.

const unsubscribePath = "/email/unsubscribe"

// The copy, from copy.ts UNSUBSCRIBE_COPY, word for word.
const (
	unsubMetaTitle        = "Message emails"
	unsubOnTitle          = "Stop emailing you about messages?"
	unsubOnBody           = "Every message from your advisor will still be waiting in the app, and you'll still get notifications there. This only stops the emails."
	unsubStop             = "Stop these emails"
	unsubOffTitle         = "Done. We've stopped the message emails."
	unsubOffBody          = "Your conversation is still in the app whenever you want it. Changed your mind?"
	unsubTurnBackOn       = "Turn them back on"
	unsubBackOnTitle      = "You're all set. Message emails are back on."
	unsubInvalidTitle     = "This link doesn't work anymore"
	unsubInvalidBody      = "Sign in to see your messages. You can reply there any time."
	unsubUnavailableTitle = "We couldn't reach your settings just now"
	unsubUnavailableBody  = "Please try the link again in a moment."
)

// unsubStatus is what the switch is now, as the function reports it.
type unsubStatus string

// The four states the page draws.
const (
	unsubOn unsubStatus = "on"
	// unsubOff: the emails are stopped.
	unsubOff unsubStatus = "off"
	// unsubInvalid: no such token, or one that has been used up.
	unsubInvalid unsubStatus = "invalid"
	// unsubUnavailable: the function could not be reached or did not answer with a status.
	unsubUnavailable unsubStatus = "unavailable"
)

// emailToken is a token as the email carries it: 26 base32 characters. Anything else is not
// worth a call.
var emailToken = regexp.MustCompile(`^[A-Za-z2-7]{26}$`)

// isEmailToken ports lib/email/unsubscribe.ts isEmailToken.
func isEmailToken(value string) bool { return emailToken.MatchString(value) }

// readUnsubStatus reads the function's reply. Anything but the three known values, including
// a body that is not an object, is "unavailable": a page that guessed would tell somebody
// their emails are off when nothing had changed.
func readUnsubStatus(raw []byte) unsubStatus {
	var body struct {
		Status string `json:"status"`
	}
	if json.Unmarshal(raw, &body) != nil {
		return unsubUnavailable
	}
	switch unsubStatus(body.Status) {
	case unsubOn:
		return unsubOn
	case unsubOff:
		return unsubOff
	case unsubInvalid:
		return unsubInvalid
	}
	return unsubUnavailable
}

var unsubscribeSpec = page.Spec{
	File:   "public/unsubscribe.html",
	Layout: shell.PublicPlain,
	Slots: []string{
		"failed", "title", "body", "form", "field-token", "field-on", "submit", "sign-in",
	},
}

// unsubscribeView is one rendering: the question, the state it is in, and the one button.
type unsubscribeView struct {
	Status unsubStatus
	// Token is the token to post back, empty when it was not a token at all.
	Token string
	// Done is the ?done= a press came back with: "on", "off" or "error".
	Done string
}

// title and body are the page's two sentences for this state.
func (v unsubscribeView) title() string {
	switch v.Status {
	case unsubOn:
		if v.Done == "on" {
			return unsubBackOnTitle
		}
		return unsubOnTitle
	case unsubOff:
		return unsubOffTitle
	case unsubInvalid:
		return unsubInvalidTitle
	default:
		return unsubUnavailableTitle
	}
}

func (v unsubscribeView) body() string {
	switch v.Status {
	case unsubOn:
		return unsubOnBody
	case unsubOff:
		return unsubOffBody
	case unsubInvalid:
		return unsubInvalidBody
	default:
		return unsubUnavailableBody
	}
}

// action is the button's label and the switch it posts, and false when this state offers no
// button (an invalid link, or a read that failed).
func (v unsubscribeView) action() (label string, on, ok bool) {
	switch v.Status {
	case unsubOn:
		return unsubStop, false, true
	case unsubOff:
		return unsubTurnBackOn, true, true
	}
	return "", false, false
}

// signIn reports whether this state offers the sign-in button instead.
func (v unsubscribeView) signIn() bool { return v.Status == unsubInvalid }

// failed reports whether a press that did not go through is shown above the question.
func (v unsubscribeView) failed() bool {
	_, _, hasAction := v.action()
	return v.Done == "error" && hasAction
}

func (s *site) fillUnsubscribe(d *page.Doc, v unsubscribeView) {
	s.chrome(d, nil, unsubscribePath)
	// Neither indexed nor followed: the link is one person's. Next also set the page's
	// referrer metadata, which the header above does instead, and no canonical (this one is
	// the path without the token, which is the page a crawler could have anyway).
	s.head(d, meta{Title: unsubMetaTitle, Path: unsubscribePath, NoIndex: true, NoFollow: true, NoCanonical: true})
	if v.failed() {
		d.Keep("failed")
	} else {
		d.Remove("failed")
	}
	d.Text("title", v.title())
	d.Text("body", v.body())

	if label, on, ok := v.action(); ok {
		d.Keep("form")
		d.Attr("field-token", "value", v.Token)
		d.Attr("field-on", "value", boolString(on))
		d.Text("submit", label)
		if on {
			// "Turn them back on" is the quieter of the two (Button variant="outlined").
			d.Class("submit", "btn-contained", false)
			d.Class("submit", "btn-outlined", true)
		}
	} else {
		d.Remove("form")
	}
	if v.signIn() {
		d.Keep("sign-in")
	} else {
		d.Remove("sign-in")
	}
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

// noReferrer keeps the token in this page's URL out of every request the page then makes.
// The server's own header is strict-origin-when-cross-origin, which would still send the
// origin; this page needs none of it to go anywhere.
func noReferrer(w http.ResponseWriter) {
	w.Header().Set("Referrer-Policy", "no-referrer")
}

// unsubscribe serves GET /email/unsubscribe. It asks the function what the switch is and
// changes nothing.
func (s *site) unsubscribe(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		noReferrer(w)
		q := r.URL.Query()
		v := unsubscribeView{Token: q.Get("t"), Done: q.Get("done")}
		if !isEmailToken(v.Token) {
			v.Token, v.Status = "", unsubInvalid
		} else {
			v.Status = s.unsubRead(r, v.Token)
		}
		d := tmpl.New()
		s.fillUnsubscribe(d, v)
		// Per person and read fresh every time: never stored by a shared cache.
		web.Render(w, s.Log, d, http.StatusOK, web.Private)
	}
}

// unsubscribePost serves POST /email/unsubscribe: the one button, either way. It redirects
// back with done= so a refresh never re-posts, and so the page reads the switch again rather
// than trusting what it just asked for.
func (s *site) unsubscribePost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		noReferrer(w)
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		token := form.Get("t")
		if !isEmailToken(token) {
			web.SeeOther(w, r, unsubscribePath)
			return
		}
		done := "error"
		switch s.unsubWrite(r, token, form.Get("on") == "true") {
		case unsubOn:
			done = "on"
		case unsubOff:
			done = "off"
		}
		q := url.Values{"t": {token}, "done": {done}}
		web.SeeOther(w, r, unsubscribePath+"?"+q.Encode())
	}
}

// unsubRead asks what the switch is (a GET: it changes nothing).
func (s *site) unsubRead(r *http.Request, token string) unsubStatus {
	return s.unsubCall(r, api.Input{Method: http.MethodGet, Query: url.Values{"t": {token}}})
}

// unsubWrite turns the messages email off, or back on.
func (s *site) unsubWrite(r *http.Request, token string, on bool) unsubStatus {
	return s.unsubCall(r, api.Input{
		Method: http.MethodPost,
		Body:   unsubscribeBody{Token: token, On: on},
	})
}

// unsubscribeBody is the change, as email-unsubscribe takes it.
type unsubscribeBody struct {
	Token string `json:"token"`
	On    bool   `json:"on"`
}

// unsubCall runs one call to email-unsubscribe with the anon key, which is all it needs: the
// token in the body is the credential. Nothing about the call is logged, because the token
// is in the URL of a GET.
func (s *site) unsubCall(r *http.Request, in api.Input) unsubStatus {
	if !s.Config.SupabaseConfigured() {
		return unsubUnavailable
	}
	res := s.API.Call(r.Context(), "email-unsubscribe", s.Config.SupabaseAnonKey, in)
	if !res.OK {
		return unsubUnavailable
	}
	return readUnsubStatus(res.Data)
}
