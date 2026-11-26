// Package problem ports supabase/functions/_shared/problem.ts: the errors a function answers
// with, as RFC 7807 problem+json.
//
// It lives under internal/domain because the pure validation code (component, payLink, lead
// and the rest) raises these too, exactly as the Deno modules throw badRequest(). The HTTP
// writing is internal/api/edge's job; this package only holds the value.
//
// The rule it exists for: an error body never carries SQL text, a stack trace or a row
// count. Anything that is not an *Error becomes a bare 500 with no detail.
package problem

import (
	"errors"
	"net/http"
)

// Error is HttpError: a status, its title, and the sentence the caller reads.
type Error struct {
	Status int
	Title  string
	// Detail is the caller's sentence. Empty means the body has no detail field at all,
	// as `...(err.detail ? { detail } : {})` leaves it out when it is "" or undefined.
	Detail string
	// Header carries the few response headers an error needs (429's Retry-After).
	Header http.Header
}

func (e *Error) Error() string {
	if e.Detail != "" {
		return e.Title + ": " + e.Detail
	}
	return e.Title
}

// New builds an error with any status and title, as `new HttpError(status, title, detail)`.
func New(status int, title, detail string) *Error {
	return &Error{Status: status, Title: title, Detail: detail}
}

// Unauthorized is 401.
func Unauthorized(detail string) *Error { return New(http.StatusUnauthorized, "Unauthorized", detail) }

// Forbidden is 403.
func Forbidden(detail string) *Error { return New(http.StatusForbidden, "Forbidden", detail) }

// BadRequest is 400.
func BadRequest(detail string) *Error { return New(http.StatusBadRequest, "Bad Request", detail) }

// NotFound is 404.
func NotFound(detail string) *Error { return New(http.StatusNotFound, "Not Found", detail) }

// Conflict is 409, and only ever the optimistic lock: a write that lost a race, not a bad
// one. The web reads Result.Conflict off the status, never off these words.
func Conflict(detail string) *Error { return New(http.StatusConflict, "Conflict", detail) }

// As reports whether err is (or wraps) an *Error.
func As(err error) (*Error, bool) {
	var p *Error
	if errors.As(err, &p) {
		return p, true
	}
	return nil, false
}
