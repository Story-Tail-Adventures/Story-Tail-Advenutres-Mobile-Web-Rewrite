// Package tripdocumenturl ports supabase/functions/trip-document-url: sign a short-lived READ
// url for a document the caller owns, the single door to the private trip-documents bucket.
// Screens 2.2.6 and 2.2.11. Mobile calls it (GET ?documentId=).
//
// WHY IT EXISTS: storage_bucket and storage_key are outside the client's column grant, and
// Storage is addressed by key, so a client cannot even form a request; the bucket has no
// authenticated policies and this is the only way in. A Compose app has no server of its own,
// so without it the phone cannot open a file at all.
//
// WHAT IT CHECKS, in order, explicitly (the service role skips RLS): the caller is a client;
// the document exists; its kind is one a client may read; it is theirs (by client_id or by one
// of their trips); it is not archived. And it audits every signature: each one is an access to
// somebody's passport scan or insurance certificate (Data-Model §18.3).
package tripdocumenturl

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// ttlSeconds is five minutes: long enough to open a PDF on a slow connection, short enough
// that a url pasted into a chat is dead by the time anybody clicks it.
const ttlSeconds = 300

// readableKinds are the kinds a client may READ: wider than what they may upload (supplier
// confirmations and itinerary PDFs are the agency's to file but the client's to see), and
// identical to document_self_select's allowlist, which is the point.
var readableKinds = []string{"passport", "visa", "insurance_cert", "supplier_confirmation", "photo", "pdf_itinerary"}

type documentRow struct {
	ID            string  `json:"id"`
	ClientID      *string `json:"client_id"`
	TripID        *string `json:"trip_id"`
	Kind          string  `json:"kind"`
	Filename      string  `json:"filename"`
	MimeType      string  `json:"mime_type"`
	StorageBucket *string `json:"storage_bucket"`
	StorageKey    string  `json:"storage_key"`
	ArchivedAt    *string `json:"archived_at"`
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodGet {
		return nil, problem.BadRequest("Use GET.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	clientID, err := trip.RequireClientID(c)
	if err != nil {
		return nil, err
	}

	documentID, _ := searchParam(r.URL.RawQuery, "documentId")
	if documentID == "" {
		return nil, problem.BadRequest("Pass documentId.")
	}
	// A query-string id arrives from a url somebody may have edited: shape-checked before it
	// reaches Postgres, or a malformed one is an opaque 500 instead of a 400.
	if !uuid.IsUUID(documentID) {
		return nil, problem.BadRequest("That is not a document id.")
	}
	ctx := r.Context()

	var doc documentRow
	found, err := d.DB.From("document").
		Select("id, client_id, trip_id, kind, filename, mime_type, storage_bucket, storage_key, archived_at").
		Eq("id", documentID).MaybeSingle(ctx, &doc)
	if err != nil {
		return nil, fmt.Errorf("document lookup failed: %w", err)
	}
	// One answer for every failure below, so nobody can probe for other people's documents.
	notFound := problem.NotFound("No such document.")
	if !found || doc.ArchivedAt != nil {
		return nil, notFound
	}
	if !slices.Contains(readableKinds, doc.Kind) {
		return nil, notFound
	}

	owned := doc.ClientID != nil && *doc.ClientID == clientID
	if !owned && doc.TripID != nil && *doc.TripID != "" {
		// A failed read is "not theirs", as Deno read data as null and ignored the error.
		var t struct {
			ID string `json:"id"`
		}
		ok, err := d.DB.From("trip").Select("id").Eq("id", *doc.TripID).Eq("client_id", clientID).MaybeSingle(ctx, &t)
		owned = err == nil && ok
	}
	if !owned {
		return nil, notFound
	}

	bucket := trip.DocumentsBucket
	if doc.StorageBucket != nil {
		bucket = *doc.StorageBucket
	}
	signedURL, err := d.DB.CreateSignedURL(ctx, bucket, doc.StorageKey, ttlSeconds)
	if err != nil || signedURL == "" {
		// The row exists but the object does not, or storage is down. Never echo the storage
		// error: it contains the key, the one thing this endpoint exists to withhold.
		return nil, errors.New("could not sign a URL for the stored object")
	}
	// A PATH, not an absolute URL: see trip.ToStoragePath.
	signedPath, err := trip.ToStoragePath(signedURL)
	if err != nil {
		return nil, err
	}

	// AFTER signing (a failed signature is no access) and before returning (no url leaves
	// that is not on the record). Data-Model §18.3.
	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    "document.url_signed",
		TargetEntity: "document",
		TargetID:     doc.ID,
		Metadata:     js.O("kind", doc.Kind, "tripId", doc.TripID, "ttlSeconds", ttlSeconds),
	}); err != nil {
		return nil, err
	}

	return edge.OK(js.O(
		"documentId", doc.ID,
		"path", signedPath,
		"expiresAt", js.ISOString(d.Now().Add(ttlSeconds*time.Second)),
		"filename", doc.Filename,
		"mimeType", doc.MimeType,
	))
}

// searchParam is `new URL(req.url).searchParams.get(name)`: the first pair whose name matches,
// read as application/x-www-form-urlencoded. Unlike url.ParseQuery it keeps a malformed
// escape ("%zz") as text and does not drop a pair holding a semicolon.
func searchParam(rawQuery, name string) (string, bool) {
	for _, pair := range strings.Split(rawQuery, "&") {
		if pair == "" {
			continue
		}
		k, v, _ := strings.Cut(pair, "=")
		if formDecode(k) == name {
			return formDecode(v), true
		}
	}
	return "", false
}

func formDecode(s string) string {
	s = strings.ReplaceAll(s, "+", " ")
	b := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			b = append(b, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 2
			continue
		}
		b = append(b, s[i])
	}
	return js.ValidUTF8(string(b))
}

func isHex(c byte) bool {
	return '0' <= c && c <= '9' || 'a' <= c && c <= 'f' || 'A' <= c && c <= 'F'
}

func unhex(c byte) byte {
	switch {
	case c <= '9':
		return c - '0'
	case c <= 'F':
		return c - 'A' + 10
	default:
		return c - 'a' + 10
	}
}
