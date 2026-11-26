package public

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/clientaddr"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/handlers/public/search"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/internal/web"
)

// Screen 2.0.6 Sign-up Gate / Quote Request Prompt (/join). Ports
// app/(public)/(plain)/join/{page.tsx,JoinForm.tsx,actions.ts,schema.ts,state.ts}. P2.
//
// The gate is where an anonymous visitor becomes someone a Trip can belong to (BRD §6.5):
// every "Request a quote" button on the public surface points here with the trip and the
// page to return to, never at the quote form itself.
//
// Three rules carried over from the action, each with teeth:
//
//   - The account's metadata is exactly {first_name, last_name}, built from validated
//     fields. The handle_new_user trigger trusts raw_user_meta_data, so nothing else from
//     the form is passed and agent_id in particular is never accepted from a visitor.
//   - Account enumeration. With email confirmations on, GoTrue answers a duplicate address
//     with an obfuscated user and no session, the same shape as a real sign-up awaiting
//     confirmation; with them off it answers user_already_exists. So email_taken shows the
//     SAME check-your-inbox panel as a sign-up without a session. Do not add a "that email
//     is taken" branch.
//   - Logging. Never the password, the email or the metadata: the error's code and status
//     only.
//
// Everything in the URL is untrusted: intent is an allow-list, trip is looked up in the
// catalog and only the catalog NAME reaches the headline, and next goes through SafeNext
// before it reaches the form or the sign-in link.

const joinPath = "/join"

// The copy Go decides between, from state.ts JOIN_TEXT. The rest sits in join.html.
const (
	joinMetaTitle       = "Create your account"
	joinMetaDescription = "Create a Story-Tail account to send Gyasi your trip details, save favorites and see curated proposals."
	joinDefaultNext     = "/dashboard"
)

// The field messages, from lib/validation/{registration,auth}.ts. They are user-facing copy
// and stay byte-identical across web, Go and the Kotlin twins (check_copy_parity.py).
const (
	nameRequired          = "Tell us your name"
	nameTooLong           = "Keep it to 80 characters or fewer"
	nameInvalid           = "Some of those characters won't work here"
	termsRequired         = "Check the box to agree to our terms"
	emailRequired         = "Don't forget your email"
	emailInvalid          = "That doesn't look like an email address"
	passwordTooShort      = "Use at least 12 characters"
	passwordNeedsDigit    = "Add at least one number"
	passwordNeedsUpper    = "Add at least one capital letter"
	passwordNeedsLower    = "Add at least one lowercase letter"
	joinNameMax           = 80
	joinPasswordMinLength = 12
)

// joinEmail is lib/validation/auth.ts's EMAIL_RE. Deliberately loose: the address is proved
// by the confirmation link, not by a pattern.
//
// Go's \s is the five ASCII spaces; JavaScript's is those plus NBSP, the Unicode space
// separators, the line and paragraph separators and the BOM. So the pattern alone accepts
// "a\u00a0b@example.co", which the web and mobile twins reject, and the rule would quietly
// differ per platform. matchesJoinEmail closes the gap rather than spelling the whole class
// into the pattern, where it would be easy to get subtly wrong.
var joinEmail = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

// matchesJoinEmail is EMAIL_RE with JavaScript's idea of a space.
func matchesJoinEmail(value string) bool {
	return !strings.ContainsFunc(value, isJSSpace) && joinEmail.MatchString(value)
}

var joinSpec = page.Spec{
	File:   "public/join.html",
	Layout: shell.PublicPlain,
	Slots: []string{
		"title", "form", "confirm",
		"field-intent", "field-trip", "field-next",
		"alert", "alert-text", "alert-action", "alert-action-link",
		"google", "apple",
		"field-first-name", "field-last-name", "field-email", "field-password", "field-terms",
		"error-first-name", "error-last-name", "error-email", "error-password", "error-terms",
		"password-hint", "submit",
		"sign-in-link", "email-link",
		"confirm-email", "confirm-sign-in",
	},
}

// joinValues are the fields echoed back on a failure. The password is deliberately absent,
// here and everywhere else in this file.
type joinValues struct {
	FirstName string
	LastName  string
	Email     string
}

// joinErrors is the first message for each field, which is what the form shows
// (state.fieldErrors?.x?.[0]).
type joinErrors struct {
	FirstName string
	LastName  string
	Email     string
	Password  string
	Terms     string
}

func (e joinErrors) any() bool {
	return e != joinErrors{}
}

// joinView is one rendering of the gate.
type joinView struct {
	// Intent is an allow-listed join intent, or "".
	Intent search.JoinIntent
	// Trip is a slug that exists in the catalog, or "".
	Trip string
	// TripName is the catalog's name for Trip, the only form of it that reaches the page.
	TripName string
	// Next is the same-origin path to continue to after sign-up.
	Next string
	// SignInHref is /login carrying the visitor's own next, as the page built it.
	SignInHref string
	Values     joinValues
	Errors     joinErrors
	// FormError is the sentence above the form, with its next move.
	FormError *web.AuthMessage
	// Confirm shows the check-your-inbox panel for ConfirmEmail instead of the form.
	Confirm      bool
	ConfirmEmail string
}

// joinTitle is the headline by intent (state.ts joinCopy, fidelity spec §5.4). tripName is
// the CATALOG name resolved by the page, never the raw ?trip= parameter, so nothing a
// visitor typed into a URL can appear in the headline.
func joinTitle(intent search.JoinIntent, tripName string) string {
	switch intent {
	case search.IntentQuote:
		if tripName != "" {
			return "Create an account to send Gyasi your trip details for " + tripName + "."
		}
		return "Create an account to send Gyasi your trip details."
	case search.IntentSave:
		return "Create an account to save this for later."
	case search.IntentMessage:
		return "Almost there — tell Gyasi what you're dreaming about."
	default:
		return "Create an account to start planning with Gyasi."
	}
}

// joinSubmitLabel is the submit button by intent. It never says "send quote": the visitor
// requests, and Gyasi sends.
func joinSubmitLabel(intent search.JoinIntent) string {
	switch intent {
	case search.IntentQuote:
		return "Create account & send my request"
	case search.IntentSave:
		return "Create account & save"
	default:
		return "Create account"
	}
}

// utf16Units is a JavaScript string's length, which is what zod's min and max count.
func utf16Units(s string) int {
	n := 0
	for _, r := range s {
		n += utf16.RuneLen(r)
	}
	return n
}

// isJSSpace is String.prototype.trim's set (WhiteSpace plus LineTerminator), so a name
// trims to the same string here as it did in the browser.
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0x00A0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F,
		0x3000, 0xFEFF:
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

func jsTrim(s string) string { return strings.TrimFunc(s, isJSSpace) }

// validateName ports nameSchema: trim, then required, then 80 characters, then no control
// character (a newline in a name is a second line somewhere it is later rendered or
// emailed). It returns the trimmed value and the first message, as the form shows it.
func validateName(raw string) (string, string) {
	value := jsTrim(raw)
	switch {
	case value == "":
		return value, nameRequired
	case utf16Units(value) > joinNameMax:
		return value, nameTooLong
	case strings.ContainsFunc(value, unicode.IsControl):
		return value, nameInvalid
	}
	return value, ""
}

// validateEmail ports emailSchema.
func validateEmail(raw string) (string, string) {
	value := jsTrim(raw)
	switch {
	case value == "":
		return value, emailRequired
	case !matchesJoinEmail(value):
		return value, emailInvalid
	}
	return value, ""
}

// validatePassword ports newPasswordSchema, the registration policy. It is not trimmed: the
// spaces someone typed are part of their password. The rules stay in step with
// password_requirements in supabase/config.toml and with AuthValidation on mobile; a looser
// rule here means being told the password is fine and then refused as weak.
func validatePassword(value string) string {
	var digit, upper, lower bool
	for _, r := range value {
		switch {
		case r >= '0' && r <= '9':
			digit = true
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= 'a' && r <= 'z':
			lower = true
		}
	}
	switch {
	case utf16Units(value) < joinPasswordMinLength:
		return passwordTooShort
	case !digit:
		return passwordNeedsDigit
	case !upper:
		return passwordNeedsUpper
	case !lower:
		return passwordNeedsLower
	}
	return ""
}

// joinInput is one validated sign-up.
type joinInput struct {
	FirstName string
	LastName  string
	Email     string
	Password  string
}

// validateJoin ports joinSchema (registrationSchema). A checked checkbox posts the literal
// "on" and an unchecked one posts nothing at all, so the rule lives here and not only in
// the markup: both this page and 2.1.2 are reachable without their form.
func validateJoin(values url.Values) (joinInput, joinErrors) {
	var in joinInput
	var errs joinErrors
	in.FirstName, errs.FirstName = validateName(values.Get("firstName"))
	in.LastName, errs.LastName = validateName(values.Get("lastName"))
	in.Email, errs.Email = validateEmail(values.Get("email"))
	in.Password = values.Get("password")
	errs.Password = validatePassword(in.Password)
	if values.Get("terms") != "on" {
		errs.Terms = termsRequired
	}
	return in, errs
}

// joinContext reads the gate's context from the URL (a GET) or the hidden fields (a POST).
func (s *site) joinContext(values url.Values) joinView {
	v := joinView{Next: joinDefaultNext}
	if raw := values.Get("intent"); search.IsJoinIntent(raw) {
		v.Intent = search.JoinIntent(raw)
	}
	if slug := values.Get("trip"); slug != "" {
		if trip, ok := s.cat.Trip(slug); ok {
			v.Trip, v.TripName = trip.Slug, trip.Name
		}
	}
	// The sign-in link carries the visitor's own next, so an empty one stays empty there
	// (/login, not /login?next=/dashboard) while the form still posts the default.
	requested := gate.SafeNext(values.Get("next"), "")
	if requested != "" {
		v.Next = requested
	}
	v.SignInHref = search.LoginHref(requested)
	return v
}

// emailHref is the guest inquiry link: the 2.0.12 form, saying the visitor came from here.
func (v joinView) emailHref() string {
	ctx := search.GuestInquiryContext{Source: search.FromJoin}
	if v.Trip != "" {
		ctx.Trip = &search.InquiryTrip{Slug: v.Trip, Name: v.TripName}
	}
	return search.InquiryHref(ctx)
}

// fillJoinField writes one text field: the value typed, and its error. errorID is the id of
// the error paragraph in the page, which the control points at while it is shown.
func fillJoinField(d *page.Doc, field, errorSlot, errorID, message, value string) {
	d.Attr(field, "value", value)
	if message == "" {
		d.Remove(errorSlot)
		return
	}
	d.Keep(errorSlot)
	d.Text(errorSlot, message)
	d.Attr(field, "aria-invalid", "true")
	d.Attr(field, "aria-describedby", errorID)
}

// fillSocial switches one social button on. Neither provider is configured yet, so both
// are drawn disabled in the page and this only has to undo that.
func fillSocial(d *page.Doc, slot string, enabled bool) {
	d.Keep(slot)
	if enabled {
		d.Bool(slot, "disabled", false)
		d.Attr(slot, "title", "")
	}
}

func (s *site) fillJoin(d *page.Doc, v joinView) {
	s.chrome(d, nil, joinPath)
	s.head(d, meta{
		Title:       joinMetaTitle,
		Description: joinMetaDescription,
		Path:        joinPath,
		Image:       "turks",
		NoIndex:     true,
	})
	d.Text("title", joinTitle(v.Intent, v.TripName))

	if v.Confirm {
		d.Remove("form")
		d.Keep("confirm")
		d.Text("confirm-email", v.ConfirmEmail)
		d.URL("confirm-sign-in", "href", v.SignInHref)
		return
	}
	d.Remove("confirm")
	d.Keep("form")

	d.Attr("field-intent", "value", string(v.Intent))
	d.Attr("field-trip", "value", v.Trip)
	d.Attr("field-next", "value", v.Next)

	if v.FormError != nil {
		d.Keep("alert")
		d.Text("alert-text", v.FormError.Message)
		if v.FormError.Action != nil {
			d.Keep("alert-action")
			d.Text("alert-action-link", v.FormError.Action.Label)
			d.URL("alert-action-link", "href", v.FormError.Action.Href)
		} else {
			d.Remove("alert-action")
		}
	} else {
		d.Remove("alert")
	}

	// The social buttons stay disabled until their provider is configured, as the page's
	// googleEnabled / appleEnabled props did. An enabled one loses the explaining tooltip
	// with it (an empty title shows none).
	fillSocial(d, "google", s.Config.GoogleAuthEnabled)
	fillSocial(d, "apple", s.Config.AppleAuthEnabled)

	fillJoinField(d, "field-first-name", "error-first-name", "firstName-error", v.Errors.FirstName, v.Values.FirstName)
	fillJoinField(d, "field-last-name", "error-last-name", "lastName-error", v.Errors.LastName, v.Values.LastName)
	fillJoinField(d, "field-email", "error-email", "email-error", v.Errors.Email, v.Values.Email)
	// The password is never echoed; only its error is.
	if v.Errors.Password != "" {
		d.Keep("error-password")
		d.Text("error-password", v.Errors.Password)
		d.Remove("password-hint")
		d.Attr("field-password", "aria-invalid", "true")
		d.Attr("field-password", "aria-describedby", "password-error")
	} else {
		d.Remove("error-password")
		d.Keep("password-hint")
	}
	d.Attr("field-password", "value", "")

	d.Keep("field-terms")
	if v.Errors.Terms != "" {
		d.Keep("error-terms")
		d.Text("error-terms", v.Errors.Terms)
		d.Attr("field-terms", "aria-invalid", "true")
		d.Attr("field-terms", "aria-describedby", "terms-error")
	} else {
		d.Remove("error-terms")
	}

	d.Text("submit", joinSubmitLabel(v.Intent))
	d.URL("sign-in-link", "href", v.SignInHref)
	d.URL("email-link", "href", v.emailHref())
}

// join serves GET /join. It is mounted AuthOnly, so a signed-in visitor is sent on to next
// before the handler runs, and the answer therefore depends on the session cookie: never
// cached.
func (s *site) join(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		d := tmpl.New()
		s.fillJoin(d, s.joinContext(r.URL.Query()))
		web.Render(w, s.Log, d, http.StatusOK, web.Private)
	}
}

// joinPost serves POST /join: the sign-up.
//
// Success with a session (confirmations off) starts the session and goes to next. Success
// without one shows the check-your-inbox panel, and so does an address that already has an
// account. The panel is rendered on the post itself rather than after a redirect, because
// the only thing that could carry the address to a second request is the URL, and an email
// address does not belong in one; a resubmit is harmless, since it ends on the same panel.
func (s *site) joinPost(tmpl *page.Template) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		v := s.joinContext(form)
		in, errs := validateJoin(form)
		// Echoed back as they typed it, not as the rules trimmed it. The password is
		// deliberately absent from this, and from every re-render below.
		v.Values = joinValues{
			FirstName: form.Get("firstName"),
			LastName:  form.Get("lastName"),
			Email:     form.Get("email"),
		}

		render := func(status int) {
			d := tmpl.New()
			s.fillJoin(d, v)
			web.Render(w, s.Log, d, status, web.Private)
		}
		confirm := func() {
			v.Confirm, v.ConfirmEmail = true, in.Email
			render(http.StatusOK)
		}

		if errs.any() {
			// What the browser's own required and type checks would have caught, caught again
			// here: this form is reachable without its page.
			v.Errors = errs
			render(http.StatusUnprocessableEntity)
			return
		}
		if !s.Config.SupabaseConfigured() {
			// Before `supabase start` has ever run there is no URL or anon key. Say so on
			// the form rather than failing (mirrors AuthError.NotConfigured on mobile).
			msg := web.AuthError(web.NotConfigured)
			v.FormError = &msg
			render(http.StatusServiceUnavailable)
			return
		}

		tokens, result := s.signUp(r, in, v.Next)
		switch result.Kind {
		case "":
			if tokens.AccessToken != "" {
				// Confirmations are off: they are signed in right now.
				s.Sessions.Start(w, tokens)
				web.SeeOther(w, r, v.Next)
				return
			}
			confirm()
		case web.EmailTaken:
			// The same state as a success without a session, on purpose. See the file comment.
			confirm()
		case web.EmailInvalid:
			v.Errors.Email = result.Message
			render(http.StatusUnprocessableEntity)
		case web.WeakPassword:
			// GoTrue's policy caught something the rule above did not; it belongs on the
			// field, and the kind's "See what's needed" link points back at this very form.
			v.Errors.Password = result.Message
			render(http.StatusUnprocessableEntity)
		default:
			// A sign-up has no "wrong password": that sentence, and its reset-password link,
			// is sign-in vocabulary. Anything unrecognised is simply "try again".
			msg := result
			if result.Kind == web.InvalidCredentials {
				msg = web.AuthError(web.Unknown)
			}
			v.FormError = &msg
			render(http.StatusServiceUnavailable)
		}
	}
}

// signUpClient is the client the sign-up call uses. It never follows a redirect, which would
// copy the apikey to whatever host the Location named. A test replaces it.
var signUpClient = &http.Client{
	Timeout:       15 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// signUpMeta is the account metadata: exactly these two keys. See the file comment.
type signUpMeta struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

type signUpRequest struct {
	Email    string     `json:"email"`
	Password string     `json:"password"`
	Data     signUpMeta `json:"data"`
}

// signUpResponse is the part of GoTrue's answer this page reads: the session when
// confirmations are off, and the error's code when it refused.
type signUpResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
	Code         string `json:"code"`
	ErrorCode    string `json:"error_code"`
}

// signUp creates the account at GoTrue and returns its session, if it came with one, and the
// message to show (a zero AuthMessage means it worked).
//
// This is the one GoTrue call the public area makes, and it is here rather than in
// internal/supa because that package has no SignUp yet: the auth area builds one in Phase 3,
// and this collapses into it then. It keeps supa's rules in the meantime: the anon key only,
// no redirect followed, the visitor's own address and user agent passed on so the advisor's
// Login activity shows the traveler and not this server, and nothing logged but a code and a
// status.
func (s *site) signUp(r *http.Request, in joinInput, next string) (supa.Tokens, web.AuthMessage) {
	body, err := json.Marshal(signUpRequest{
		Email:    in.Email,
		Password: in.Password,
		Data:     signUpMeta{FirstName: in.FirstName, LastName: in.LastName},
	})
	if err != nil {
		return supa.Tokens{}, web.AuthError(web.Unknown)
	}
	// Where the confirmation link lands. SafeNext has already settled next.
	redirect := s.Config.SiteURL + "/auth/callback?next=" + url.QueryEscape(next)
	target := s.Config.SupabaseURL + "/auth/v1/signup?redirect_to=" + url.QueryEscape(redirect)

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(body))
	if err != nil {
		return supa.Tokens{}, web.AuthError(web.Unknown)
	}
	req.Header.Set("apikey", s.Config.SupabaseAnonKey)
	req.Header.Set("Content-Type", "application/json")
	if ua := r.Header.Get("User-Agent"); ua != "" {
		req.Header.Set("User-Agent", ua)
	}
	if addr, ok := clientaddr.From(r.Header); ok {
		req.Header.Set("X-Forwarded-For", addr)
	}

	resp, err := signUpClient.Do(req)
	if err != nil {
		// Never the error itself: it carries the URL.
		s.Log.Warn("sign-up could not reach the auth server")
		return supa.Tokens{}, web.MapAuthError("", 0)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out signUpResponse
	_ = json.Unmarshal(raw, &out) // a body we cannot read is judged by the status alone

	if resp.StatusCode == http.StatusOK {
		return supa.Tokens{
			AccessToken:  out.AccessToken,
			RefreshToken: out.RefreshToken,
			ExpiresAt:    out.ExpiresAt,
		}, web.AuthMessage{}
	}
	code := out.ErrorCode
	if code == "" {
		code = out.Code
	}
	mapped := web.MapAuthError(code, resp.StatusCode)
	if mapped.Kind != web.EmailTaken {
		s.Log.Warn("sign-up failed", "code", code, "status", resp.StatusCode)
	}
	return supa.Tokens{}, mapped
}
