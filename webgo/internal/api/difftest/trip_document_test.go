//go:build difftest && difftest_traveler

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripdocument"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["trip-document"] = api.Port{Gate: api.GateUser, Fn: tripdocument.Func}
}

// travDocuments is every document row the traveler owns, oldest first.
func travDocuments(t *testing.T, w *World) string {
	return S.Rows(t, S.DB.From("document").
		Select("id,owner_user_id,client_id,trip_id,kind,filename,mime_type,size_bytes,storage_bucket,storage_key,"+
			"checksum_sha256,is_sensitive,archived_at").
		Eq("client_id", w.Traveler.ClientID).Order("created_at", true))
}

func TestTripDocument(t *testing.T) {
	deno, goW := travWorlds(t)
	agent := func(w *World) string { return w.Agent.Token }

	// register builds a body: this case's fresh document id (labelled), the world's trip
	// (w.Vars["trip"]) unless the fields name another, and the fields given.
	register := func(kv ...any) func(w *World) string {
		return func(w *World) string {
			id := uuid.New()
			w.Vars["doc"] = w.ID("doc", id)
			o := js.O("documentId", id, "tripId", w.Vars["trip"], "kind", "passport", "filename", "passport.pdf",
				"mimeType", "application/pdf", "sizeBytes", "1048576")
			for i := 0; i+1 < len(kv); i += 2 {
				v := kv[i+1]
				if s, ok := v.(string); ok && strings.HasPrefix(s, "$") {
					v = w.Vars[s[1:]]
				}
				o = o.Set(kv[i].(string), v)
			}
			b, _ := js.Marshal(o)
			return string(b)
		}
	}
	ownTrip := func(t *testing.T, w *World) {
		w.Vars["trip"] = travTrip(t, w, w.Traveler.ClientID, "trip", nil)
	}
	snap := func(t *testing.T, w *World) string { return travDocuments(t, w) }

	cases := []Case{
		{Name: "GET", Method: "GET", Body: register(), Expect: 400},
		{Name: "an advisor", Token: agent, Body: register(), Expect: 403},
		{Name: "not JSON", Body: travFixed(`{"documentId":`), Expect: 400},
		{Name: "null", Body: travFixed(`null`), Expect: 400},
		{Name: "no documentId", Body: travFixed(`{"tripId":"x"}`), Expect: 400},
		{Name: "documentId not v7", Body: register("documentId", "0195a2c0-1a00-4000-8000-000000000001"), Expect: 400},
		{Name: "documentId an hour old", Body: register("documentId", uuid.NewAt(time.Now().Add(-2*time.Hour))), Expect: 400},
		{Name: "no tripId", Body: register("tripId", js.Undef), Expect: 400},
		{Name: "tripId a number", Body: register("tripId", 7), Expect: 400},
		{Name: "an agency kind", Body: register("tripId", "t", "kind", "receipt"), Expect: 400},
		{Name: "a blank filename", Body: register("tripId", "t", "filename", "   "), Expect: 400},
		{Name: "a 256-unit filename", Body: register("tripId", "t", "filename", strings.Repeat("\U0001F600", 128)), Expect: 400},
		{Name: "a gif", Body: register("tripId", "t", "mimeType", "image/gif"), Expect: 400},
		{Name: "no size", Body: register("tripId", "t", "sizeBytes", js.Undef), Expect: 400},
		{Name: "size zero", Body: register("tripId", "t", "sizeBytes", 0), Expect: 400},
		{Name: "size over 50 MiB", Body: register("tripId", "t", "sizeBytes", "52428801"), Expect: 400},
		{Name: "size true", Body: register("tripId", "t", "sizeBytes", true), Expect: 400},
		{Name: "tripId not a uuid", Body: register("tripId", "t"), Expect: 400},
		{Name: "another traveler's trip", Setup: func(t *testing.T, w *World) {
			w.Vars["trip"] = travTrip(t, w, travOther(w), "other.trip", nil)
		}, Body: register(), Snap: snap, Expect: 404},
		{Name: "an archived trip of theirs", Setup: func(t *testing.T, w *World) {
			w.Vars["trip"] = travTrip(t, w, w.Traveler.ClientID, "trip.archived", js.O("archived_at", "2026-01-01T00:00:00Z"))
		}, Body: register(), Snap: snap, Expect: 404},

		// Registered: the key is the server's, from the trip, the id and the mime type.
		{Name: "a passport scan", Setup: ownTrip, Body: register("filename", "  Passport <Hayes> & co.pdf  "), Snap: snap, Expect: 201},
		{Name: "the same id again", Body: func(w *World) string {
			return travJSON("documentId", w.Vars["doc"], "tripId", w.Vars["trip"], "kind", "passport",
				"filename", "passport.pdf", "mimeType", "application/pdf", "sizeBytes", 10)
		}, Snap: snap, Expect: 400},
		{Name: "a photo, its size read like parseInt", Body: register("kind", "photo", "mimeType", "image/jpeg", "sizeBytes", "12abc"),
			Snap: snap, Expect: 201},
		{Name: "a visa as webp, size 1e21", Body: register("kind", "visa", "mimeType", "image/webp", "sizeBytes", 1e21),
			Snap: snap, Expect: 201},
		{Name: "insurance as heic, size [2048]", Body: register("kind", "insurance_cert", "mimeType", "image/heic", "sizeBytes", []int{2048}),
			Snap: snap, Expect: 201},
		{Name: "a png, the largest size", Body: register("kind", "photo", "mimeType", "image/png", "sizeBytes", 52428800),
			Snap: snap, Expect: 201},
		{Name: "an upper-case trip id", Body: func(w *World) string {
			return register("tripId", strings.ToUpper(w.Vars["trip"]), "kind", "photo")(w)
		}, Snap: snap, Expect: 201},
	}
	Run(t, deno, goW, travWithAudit("trip-document", cases))
}
