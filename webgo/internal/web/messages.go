package web

import (
	"net/http"
	"net/url"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
)

// Story-Tail's auth and outage sentences, ported from web/lib/auth-errors.ts WORD FOR WORD
// (Design-System §2.6: warm, not accusatory, always offering the next move). The Kotlin twin
// is com.storytail.adventures.api.AuthError; check_copy_parity.py pins the shared kinds.
//
// Two rules carried with them:
//
//  1. Never tell "no such account" from "wrong password": both are invalid_credentials, or
//     the sign-in form becomes an account-enumeration oracle.
//  2. email_taken reads like the success path, and a sign-up must show the same state for
//     both, so it never confirms that an account exists.

// AuthErrorKind names one sentence.
type AuthErrorKind string

// The kinds, as in auth-errors.ts.
const (
	InvalidCredentials AuthErrorKind = "invalid_credentials"
	EmailNotConfirmed  AuthErrorKind = "email_not_confirmed"
	EmailTaken         AuthErrorKind = "email_taken"
	EmailInvalid       AuthErrorKind = "email_invalid"
	RateLimited        AuthErrorKind = "rate_limited"
	AccountLocked      AuthErrorKind = "account_locked"
	Network            AuthErrorKind = "network"
	NotConfigured      AuthErrorKind = "not_configured"
	WeakPassword       AuthErrorKind = "weak_password"
	SessionExpired     AuthErrorKind = "session_expired"
	Unknown            AuthErrorKind = "unknown"
)

// Action is where to send someone who is stuck.
type Action struct {
	Label string
	Href  string
}

// AuthMessage is one mapped error: the sentence and, where useful, the next move.
type AuthMessage struct {
	Kind    AuthErrorKind
	Message string
	Action  *Action
}

var authMessages = map[AuthErrorKind]AuthMessage{
	InvalidCredentials: {
		Kind:    InvalidCredentials,
		Message: "That email and password don't match.",
		Action:  &Action{Label: "Reset your password", Href: "/forgot-password"},
	},
	EmailNotConfirmed: {
		Kind:    EmailNotConfirmed,
		Message: "Almost there — check your email for the verification link.",
		Action:  &Action{Label: "Resend it", Href: "/verify-email"},
	},
	RateLimited: {
		Kind:    RateLimited,
		Message: "That's a few too many tries. Give it a minute, then try again.",
	},
	AccountLocked: {
		Kind:    AccountLocked,
		Message: "This account is on hold.",
		Action:  &Action{Label: "Email Gyasi", Href: "mailto:info@adventures.story-tail.com"},
	},
	Network: {
		Kind:    Network,
		Message: "We couldn't reach Story-Tail. Check your connection and try again.",
	},
	WeakPassword: {
		Kind:    WeakPassword,
		Message: "That password is a little too easy to guess.",
		Action:  &Action{Label: "See what's needed", Href: "/register"},
	},
	EmailTaken: {
		Kind:    EmailTaken,
		Message: "Check your inbox for a link to finish up.",
		Action:  &Action{Label: "Sign in", Href: "/login"},
	},
	SessionExpired: {
		Kind:    SessionExpired,
		Message: "That link has expired — reset links are only good for an hour.",
		Action:  &Action{Label: "Send a new one", Href: "/forgot-password"},
	},
	EmailInvalid: {
		Kind:    EmailInvalid,
		Message: "We can't send email to that address — try a different one.",
	},
	NotConfigured: {
		Kind:    NotConfigured,
		Message: "We're not quite ready to sign you in yet — check back shortly.",
	},
	Unknown: {
		Kind:    Unknown,
		Message: "Something went sideways on our end. Try again in a moment.",
	},
}

// AuthError returns the message for kind (authErrorByKind). An unknown kind gets Unknown's.
func AuthError(kind AuthErrorKind) AuthMessage {
	if m, ok := authMessages[kind]; ok {
		return m
	}
	return authMessages[Unknown]
}

// AuthErrorFromParam maps an untrusted ?error= value to a message (authErrorFromParam). It
// is a KEY into a closed table and never rendered itself, so nobody can put chosen text on a
// page through the address bar.
func AuthErrorFromParam(value string) (AuthMessage, bool) {
	m, ok := authMessages[AuthErrorKind(value)]
	return m, ok
}

// MapAuthError ports mapAuthError: GoTrue's error code and HTTP status to a message. status
// 0 means the request never reached the auth server.
func MapAuthError(code string, status int) AuthMessage {
	switch code {
	case "invalid_credentials", "invalid_grant":
		return authMessages[InvalidCredentials]
	case "email_not_confirmed":
		return authMessages[EmailNotConfirmed]
	case "over_request_rate_limit", "over_email_send_rate_limit":
		return authMessages[RateLimited]
	case "user_banned":
		return authMessages[AccountLocked]
	case "weak_password":
		return authMessages[WeakPassword]
	case "user_already_exists", "email_exists":
		return authMessages[EmailTaken]
	case "email_address_invalid":
		return authMessages[EmailInvalid]
	case "signup_disabled":
		return authMessages[NotConfigured]
	}
	switch {
	case status == http.StatusTooManyRequests:
		return authMessages[RateLimited]
	case status == 0:
		return authMessages[Network]
	case status == http.StatusBadRequest || status == http.StatusUnauthorized:
		return authMessages[InvalidCredentials]
	}
	return authMessages[Unknown]
}

// Outcome is what a page does with a function call's result (api.Result, the port of
// EdgeCallResult): carry on, send the visitor to sign in, or re-render with a sentence.
type Outcome struct {
	OK bool
	// SignIn: the session is gone (401/403). Redirect to SignInURL; never show an error for it.
	SignIn bool
	// Status to re-render with: 422 for a rejection, 409 for the optimistic lock, 503 when the
	// function could not be reached.
	Status int
	// Message is the function's own `detail` sentence on a rejection, else the fallback the
	// page passed, else the outage sentence.
	Message string
	// Conflict is the 409. Branch on it, never on Message's words (edge.ts's lesson).
	Conflict bool
}

// FromResult maps a function result for a page. fallback is the page's own sentence for a
// rejection that carried no detail; empty uses the outage sentence.
func FromResult(res api.Result, fallback string) Outcome {
	switch {
	case res.OK:
		return Outcome{OK: true}
	case res.Kind == api.Unauthenticated:
		return Outcome{SignIn: true}
	case res.Kind == api.Rejected:
		msg := res.Detail
		if msg == "" {
			msg = fallback
		}
		if msg == "" {
			msg = authMessages[Unknown].Message
		}
		status := http.StatusUnprocessableEntity
		if res.Conflict {
			status = http.StatusConflict
		}
		return Outcome{Status: status, Message: msg, Conflict: res.Conflict}
	default:
		return Outcome{Status: http.StatusServiceUnavailable, Message: authMessages[Unknown].Message}
	}
}

// SignInURL is /login with this request's path as next, the way the gate sends a signed-out
// visitor (the escaped path, so an encoded ? or # survives the round trip).
func SignInURL(r *http.Request) string {
	return "/login?next=" + url.QueryEscape(r.URL.EscapedPath())
}
