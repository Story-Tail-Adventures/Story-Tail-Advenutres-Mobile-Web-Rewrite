// Package trip ports the pure half of supabase/functions/_shared/trip.ts: shared helpers for
// the §2.2 write functions.
//
// The traveler-side functions all need the same two things: the caller's client id, and proof
// that a trip belongs to them. Doing that in several places is how one of them ends up
// checking a different predicate from the read policies, which would mean a client could write
// to a trip they cannot read, or the reverse.
//
// Not ported here (needs the database / network; ported with its function):
//   - requireOwnedTrip: checks the uuid shape (400 "That is not a trip id."), then reads the
//     trip on the SERVICE role and answers 404 "No such trip." unless client_id matches and
//     archived_at is null. 404 rather than 403 so a client cannot enumerate trip ids. Mirrors
//     the predicate in the trip read policies migration.
//   - requireOwnedConversation: the same for a conversation (400 "That is not a conversation
//     id.", 404 "No such conversation."); ARCHIVED IS NOT FOUND, since a client cannot read
//     an archived thread and must not write to one.
//   - requireClientAgentId: client.agent_id for a client (404 "No such client."), needed only
//     when creating a thread with no trip.
//   - tripDb: serviceClient() under a name.
//   - readJson: ported elsewhere with the request plumbing (400 "Send a JSON object.").
package trip

import (
	"errors"
	"net/url"
	"slices"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/caller"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// ClientDocumentKinds are the document kinds a CLIENT may contribute.
//
// Deliberately narrower than document_self_select's read allowlist, which also includes
// supplier_confirmation and pdf_itinerary: those are the agency's to file. A client cannot
// mint a receipt or a csv_import at all; those are agency records.
var ClientDocumentKinds = []string{"passport", "visa", "insurance_cert", "photo"}

// IsClientDocumentKind is isClientDocumentKind.
func IsClientDocumentKind(value js.Value) bool { return oneOf(value, ClientDocumentKinds) }

// RefundStatuses are where a refund stands on a cancelled trip (§3.4.16).
//
// MIRRORS the trip_refund_status_vocabulary CHECK, which is the authority: this list existing
// does not make the database accept anything. Kept in step by a pair of tests rather than a
// shared definition.
//
// NULL is not a member and is deliberately legal on the column. "Not stated" is a different
// fact from none_expected: one is an advisor who has not checked, the other one who has, and
// collapsing them would put a confident "no refund" on the traveler's screen for every trip
// cancelled before this shipped.
var RefundStatuses = []string{"none_expected", "pending", "partial", "full"}

// IsRefundStatus is isRefundStatus.
func IsRefundStatus(value js.Value) bool { return oneOf(value, RefundStatuses) }

// AllowedMimeTypes are the mime types the trip-documents bucket accepts, matching its own
// allowed_mime_types.
var AllowedMimeTypes = []string{
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/heic",
	"image/webp",
}

// MaxUploadBytes is 50 MiB, matching the bucket's file_size_limit and [storage] in
// config.toml.
const MaxUploadBytes = 52_428_800

// DocumentsBucket is TRIP_DOCUMENTS_BUCKET.
const DocumentsBucket = "trip-documents"

// RequireClientID is trip.ts's requireClientId: the caller's client id, or 403. An agent has
// none and does not belong on these routes. (onboarding has its own, with another sentence.)
func RequireClientID(c *caller.Context) (string, error) {
	if c.Role != caller.RoleClient || c.ClientID == nil || *c.ClientID == "" {
		return "", problem.Forbidden("This is the traveler's side of the platform.")
	}
	return *c.ClientID, nil
}

var placeholder = &url.URL{Scheme: "http", Host: "placeholder.invalid"}

// ToStoragePath is toStoragePath:
// http://kong:8000/storage/v1/object/sign/...?token=... becomes
// /storage/v1/object/sign/...?token=...
//
// WHY A PATH AND NOT AN ABSOLUTE URL. Storage builds signed URLs from SUPABASE_URL as seen
// from inside the server, which locally is http://kong:8000, a hostname that resolves nowhere
// in a browser or on a phone. Re-basing onto a public origin would need a second setting that
// is wrong, silently, whenever it drifts; every caller already knows the right origin (the one
// it reached us on), so the path is the portable answer. The signature rides in the query
// string, so the token survives intact. Relative input passes through unchanged, so a client
// library that starts returning a path is not double-prefixed.
//
// net/url stands in for the WHATWG URL parser. They agree on every URL storage signs (dot
// segments removed, non-ASCII path bytes percent-encoded, an empty query dropped, the fragment
// dropped). Where they differ, on input storage does not produce: WHATWG reads a backslash as
// a slash, percent-encodes a raw space or quote in the query, and passes a bad escape like
// %zz through, where net/url keeps the first two raw and refuses the third.
func ToStoragePath(signedURL string) (string, error) {
	u, err := placeholder.Parse(signedURL)
	if err != nil {
		return "", errors.New("storage returned a signed URL that will not parse")
	}
	path := u.EscapedPath()
	if path == "" {
		path = "/" // an http(s) URL's pathname is never empty
	}
	if u.RawQuery != "" {
		path += "?" + u.RawQuery
	}
	return path, nil
}

func oneOf(value js.Value, allowed []string) bool {
	s, ok := value.Str()
	return ok && slices.Contains(allowed, s)
}
