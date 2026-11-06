// Package gate decides who may see which route. It ports the routing table in
// web/lib/supabase/middleware.ts (authRedirectFor) and web/lib/safe-next.ts, case for case.
//
// The decision is a pure function so it can be tested without a session. Router (router.go)
// applies it by MOUNTING: every route is registered as public, protected, auth-only, the
// front door or the MFA challenge, and a protected or auth-only route outside these prefix
// lists refuses to register. A route therefore cannot exist without a gate, which is the
// silent failure web/proxy.test.ts worked hard to prevent with a matcher.
package gate

import (
	"net/url"
	"strings"
)

// ProtectedPrefixes need a signed-in user (middleware.ts PROTECTED_PREFIXES).
var ProtectedPrefixes = []string{
	"/dashboard",
	"/trips",
	"/account",
	"/documents", // Screen 2.5.4, somebody's passports
	"/messages",  // §2.6; NOT /message, the public lead form
	"/agent",
	"/mfa",
	"/welcome", // the onboarding wizard reads and writes a traveler's own record
	"/onboarding",
}

// AuthOnlyPrefixes bounce a signed-in user away (middleware.ts AUTH_ONLY_PREFIXES).
// /reset-password, /verify-email and /link-account are deliberately absent; see the comment
// on AUTH_ONLY_PREFIXES in middleware.ts for why each one would break.
var AuthOnlyPrefixes = []string{"/login", "/register", "/join", "/forgot-password"}

// MFAChallenge is Screen 2.1.7. It lives under /login but needs a (half-assured) session.
const MFAChallenge = "/login/mfa"

// Assurance is how far through authentication a request is.
type Assurance int

const (
	// None: no verified second factor on the account; aal1 is all there is.
	None Assurance = iota
	// Required: a factor IS enrolled and this session has not been challenged yet.
	Required
	// Satisfied: the second factor has been verified on this session (aal2).
	Satisfied
)

func (a Assurance) String() string {
	switch a {
	case Required:
		return "required"
	case Satisfied:
		return "satisfied"
	default:
		return "none"
	}
}

// HasPrefix reports whether path is prefix itself or under it ("/trips" and "/trips/x",
// never "/tripster").
func HasPrefix(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

func hasAny(path string, prefixes []string) bool {
	for _, p := range prefixes {
		if HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// IsProtected reports whether path needs a signed-in user.
func IsProtected(path string) bool { return hasAny(path, ProtectedPrefixes) }

// IsAuthOnly reports whether path is an auth screen a signed-in user is bounced from.
func IsAuthOnly(path string) bool { return hasAny(path, AuthOnlyPrefixes) }

// RedirectFor returns where this request should go instead, or "" to let it through. next
// is the request's own ?next=, consulted only for a signed-in visitor on an auth-only page.
// The caller adds ?next= when the answer is /login or the MFA challenge.
func RedirectFor(path string, signedIn bool, a Assurance, next string) string {
	// The challenge screen is judged on its own terms, before the /login prefix rule below
	// can mistake it for a page a signed-in visitor should be bounced off.
	if path == MFAChallenge {
		if !signedIn {
			return "/login"
		}
		if a != Required {
			return "/dashboard" // nothing to challenge: a code entry that can never succeed is a dead end
		}
		return ""
	}

	if !signedIn && IsProtected(path) {
		return "/login"
	}

	// A half-authenticated session finishes signing in before it goes anywhere that assumes
	// it is signed in, including the pages it would otherwise be bounced off. Public pages
	// stay readable.
	if signedIn && a == Required {
		if IsProtected(path) || IsAuthOnly(path) || path == "/" {
			return MFAChallenge
		}
		return ""
	}

	if signedIn && IsAuthOnly(path) {
		return resolveSignedInNext(next)
	}
	if signedIn && path == "/" {
		return "/dashboard"
	}
	return ""
}

// resolveSignedInNext sends a signed-in visitor on an auth-only page where they were going
// (a "Request a quote" click carries its context in next), but never back to an auth-only
// page or "/", which would loop.
func resolveSignedInNext(next string) string {
	resolved := SafeNext(next, "/dashboard")
	path, _, _ := strings.Cut(resolved, "?")
	if path == "/" || IsAuthOnly(path) {
		return "/dashboard"
	}
	return resolved
}

// SafeNext allows only same-origin relative paths, so a ?next= cannot be an open redirect.
// It ports web/lib/safe-next.ts: a startsWith("/") && !startsWith("//") check is not
// enough, because browsers read "/\evil.com" as http://evil.com/. Resolving against a fixed
// base and comparing hosts settles it, whatever quirk the input relies on.
func SafeNext(raw, fallback string) string {
	if !strings.HasPrefix(raw, "/") {
		return fallback
	}
	// Browsers drop tabs and newlines inside a URL and read a backslash as a slash; Go's
	// parser does neither, so apply the browser's view first and then check the result.
	cleaned := strings.NewReplacer("\t", "", "\n", "", "\r", "", `\`, "/").Replace(raw)
	if strings.HasPrefix(cleaned, "//") {
		// Scheme-relative in a browser's eyes ("//evil.com", "///evil.com", "/\evil.com"),
		// however Go's parser reads it.
		return fallback
	}
	base, _ := url.Parse("http://localhost")
	ref, err := url.Parse(cleaned)
	if err != nil {
		return fallback
	}
	resolved := base.ResolveReference(ref)
	if resolved.Scheme != base.Scheme || resolved.Host != base.Host || resolved.User != nil {
		return fallback
	}
	out := resolved.EscapedPath()
	if resolved.RawQuery != "" {
		out += "?" + resolved.RawQuery
	}
	if resolved.Fragment != "" {
		out += "#" + resolved.EscapedFragment()
	}
	if !strings.HasPrefix(out, "/") || strings.HasPrefix(out, "//") {
		return fallback
	}
	return out
}
