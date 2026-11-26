// Package tripdocument ports supabase/functions/trip-document: register a document and sign a
// short-lived UPLOAD url for it. Screens 2.2.6 and 2.2.11.
//
// A `document` row and an object in the private bucket have to appear together, and the client
// can do neither (no write policy on document, and storage_key is outside its grant). So this
// creates the row, signs an upload url for a key the CLIENT NEVER CHOOSES, and audits it.
//
// WHY THE SERVER PICKS THE KEY: a client-supplied key could collide, could traverse out of the
// trip prefix, and would have to be returned, which is the one field the read grant withholds.
//
// IT DOES NOT CONFIRM THE UPLOAD. A url requested and never used leaves a row with no object;
// a known, accepted gap (a confirm endpoint is real work for what a sweep can clean up).
package tripdocument

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/guard"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/service"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/audit"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/trip"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// uploadTTL is ten minutes: long enough to upload a 50 MiB scan over a hotel connection.
const uploadTTL = 600 * time.Second

// extensionByMime: the extension comes from the mime type, never the filename, so a name
// cannot smuggle one in.
var extensionByMime = map[string]string{
	"application/pdf": "pdf",
	"image/jpeg":      "jpg",
	"image/png":       "png",
	"image/heic":      "heic",
	"image/webp":      "webp",
}

// request is the parsed body.
type request struct {
	DocumentID string
	TripID     string
	Kind       string
	Filename   string
	MimeType   string
	SizeBytes  int64
}

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use POST.")
	}
	c, err := edge.RequireUser(d, r)
	if err != nil {
		return nil, err
	}
	clientID, err := trip.RequireClientID(c)
	if err != nil {
		return nil, err
	}
	payload, err := edge.ReadObject(r, edge.SendJSONObject)
	if err != nil {
		return nil, err
	}
	req, err := parse(payload, d.Now())
	if err != nil {
		return nil, err
	}
	ctx := r.Context()
	if _, err := guard.RequireOwnedTrip(ctx, d.DB, clientID, req.TripID); err != nil {
		return nil, err
	}

	// Derived from ids the server trusts, never from the client.
	ext, ok := extensionByMime[req.MimeType]
	if !ok {
		ext = "bin"
	}
	storageKey := "trips/" + req.TripID + "/" + req.DocumentID + "." + ext

	signed, err := d.DB.CreateSignedUploadURL(ctx, trip.DocumentsBucket, storageKey, true)
	if err != nil || signed.SignedURL == "" {
		return nil, errors.New("could not sign an upload URL")
	}
	// A PATH, not an absolute URL: see trip.ToStoragePath.
	uploadPath, err := trip.ToStoragePath(signed.SignedURL)
	if err != nil {
		return nil, err
	}

	// checksum_sha256 is NOT NULL and cannot be known before the bytes arrive; 32 zero bytes
	// (bytea over PostgREST is a hex-escape STRING) are the honest placeholder.
	err = d.DB.From("document").Insert(ctx, js.O(
		"id", req.DocumentID,
		"owner_user_id", c.PlatformUserID,
		"client_id", clientID,
		"trip_id", req.TripID,
		"kind", req.Kind,
		"filename", req.Filename,
		"mime_type", req.MimeType,
		"size_bytes", req.SizeBytes,
		"storage_bucket", trip.DocumentsBucket,
		"storage_key", storageKey,
		"checksum_sha256", `\x`+strings.Repeat("00", 32),
		// A passport or a visa is Sensitive PII (Data-Model §18); this flag turns on the
		// tighter access logging §18.3 asks for.
		"is_sensitive", req.Kind == "passport" || req.Kind == "visa",
	), nil)
	if err != nil {
		// A retry of the same request lands here, which is the point of the client-minted id.
		var se *service.Error
		if errors.As(err, &se) && se.Code == "23505" {
			return nil, problem.BadRequest("That document has already been registered.")
		}
		return nil, fmt.Errorf("document insert failed: %w", err)
	}

	if err := audit.Write(ctx, d.DB, c, audit.Spec{
		EventType:    "document.created",
		TargetEntity: "document",
		TargetID:     req.DocumentID,
		Metadata:     js.O("kind", req.Kind, "tripId", req.TripID, "sizeBytes", req.SizeBytes, "mimeType", req.MimeType),
	}); err != nil {
		return nil, err
	}

	return &edge.Reply{Status: http.StatusCreated, Body: js.O(
		"documentId", req.DocumentID,
		"uploadPath", uploadPath,
		"expiresAt", js.ISOString(d.Now().Add(uploadTTL)),
	)}, nil
}

// parse reads the body in the order the TypeScript checks it.
func parse(p js.Value, now time.Time) (request, error) {
	var req request
	id, ok := p.Get("documentId").Str()
	if !ok {
		return req, problem.BadRequest("Send a documentId.")
	}
	// Client-minted v7 with a recent timestamp (Data-Model §21.6): what makes a retry
	// idempotent rather than a second row.
	if msg := recentV7Problem(id, now); msg != "" {
		return req, problem.BadRequest("documentId must be a recent UUID v7: " + msg)
	}
	req.DocumentID = id

	if req.TripID, ok = p.Get("tripId").Str(); !ok {
		return req, problem.BadRequest("Send a tripId.")
	}

	kind := p.Get("kind")
	if !trip.IsClientDocumentKind(kind) {
		return req, problem.BadRequest("kind must be one of: passport, visa, insurance_cert, photo.")
	}
	req.Kind, _ = kind.Str()

	if s, ok := p.Get("filename").Str(); ok {
		req.Filename = js.Trim(s)
	}
	if req.Filename == "" || js.Len(req.Filename) > 255 {
		return req, problem.BadRequest("Send a filename under 255 characters.")
	}

	mime, ok := p.Get("mimeType").Str()
	if !ok || !slices.Contains(trip.AllowedMimeTypes, mime) {
		return req, problem.BadRequest("mimeType must be one of: " + strings.Join(trip.AllowedMimeTypes, ", ") + ".")
	}
	req.MimeType = mime

	// Sent as a digit-string for the same precision reason money is (CLAUDE.md rule 5):
	// Number.parseInt(String(body.sizeBytes ?? ""), 10).
	sizeV := p.Get("sizeBytes")
	text := ""
	if !sizeV.IsNullish() {
		text = jsString(sizeV)
	}
	size := parseInt10(text)
	if !js.IsSafeInteger(size) || size <= 0 || size > trip.MaxUploadBytes {
		return req, problem.BadRequest("sizeBytes must be a positive integer up to " + strconv.Itoa(trip.MaxUploadBytes) + ".")
	}
	req.SizeBytes = int64(size)
	return req, nil
}

// jsString is String(value) for a parsed body value: an array joins its elements with
// commas (null and undefined elements as ""), an object is "[object Object]".
func jsString(v js.Value) string {
	switch v.Kind() {
	case js.String:
		s, _ := v.Str()
		return s
	case js.Number:
		n, _ := v.Num()
		return js.NumberString(n)
	case js.Bool:
		b, _ := v.Bool()
		return strconv.FormatBool(b)
	case js.Null:
		return "null"
	case js.Undefined:
		return "undefined"
	case js.Array:
		items, _ := v.Array()
		parts := make([]string, len(items))
		for i, it := range items {
			if !it.IsNullish() {
				parts[i] = jsString(it)
			}
		}
		return strings.Join(parts, ",")
	default:
		return "[object Object]"
	}
}

// parseInt10 is Number.parseInt(s, 10): leading whitespace skipped, an optional sign, then the
// longest run of decimal digits; NaN when there is none.
func parseInt10(s string) float64 {
	s = js.TrimStart(s)
	neg := false
	if s != "" && (s[0] == '-' || s[0] == '+') {
		neg = s[0] == '-'
		s = s[1:]
	}
	end := 0
	for end < len(s) && s[end] >= '0' && s[end] <= '9' {
		end++
	}
	if end == 0 {
		return math.NaN()
	}
	f, err := strconv.ParseFloat(s[:end], 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return math.NaN()
	}
	if neg {
		f = -f
	}
	return f
}

// recentV7Problem is the message assertRecentUuidV7 threw, which the function quotes in its
// 400; "" when the id is a recent v7. internal/uuid's errors carry other sentences, so the
// Deno ones are rebuilt here. Judged on a millisecond clock, as Date.now() is.
func recentV7Problem(id string, now time.Time) string {
	err := uuid.CheckRecent(id, now.Truncate(time.Millisecond))
	switch {
	case err == nil:
		return ""
	case errors.Is(err, uuid.ErrTooOld):
		return "UUID v7 timestamp is more than 3600000ms old"
	case errors.Is(err, uuid.ErrInFuture):
		return "UUID v7 timestamp is more than 3600000ms in the future"
	default:
		return "Not a UUID v7: " + id
	}
}
