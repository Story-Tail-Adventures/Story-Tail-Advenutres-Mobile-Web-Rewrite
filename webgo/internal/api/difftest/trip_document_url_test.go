//go:build difftest && difftest_traveler

package difftest

import (
	"net/url"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripdocumenturl"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["trip-document-url"] = api.Port{Gate: api.GateUser, Fn: tripdocumenturl.Func}
}

func TestTripDocumentURL(t *testing.T) {
	deno, goW := travWorlds(t)
	agent := func(w *World) string { return w.Agent.Token }
	// Every world has one trip of the traveler's for documents to hang off.
	for _, w := range []*World{deno, goW} {
		w.Vars["trip"] = travTrip(t, w, w.Traveler.ClientID, "trip", nil)
	}
	byID := func(w *World) string { return "documentId=" + w.Vars["doc"] }
	fixed := func(q string) func(*World) string { return func(*World) string { return q } }
	// doc registers this case's document: the traveler's own on their trip unless cols say
	// otherwise, with an object at its key when object is true.
	doc := func(label string, object bool, cols js.Ordered) func(*testing.T, *World) {
		return func(t *testing.T, w *World) {
			w.Vars["doc"] = travDocument(t, w, w.Traveler.PlatformUserID, w.Traveler.ClientID, w.Vars["trip"], label, object, cols)
		}
	}
	get := func(name string, setup func(*testing.T, *World), q func(*World) string, expect int) Case {
		return Case{Name: name, Method: "GET", Setup: setup, Query: q, Expect: expect}
	}

	cases := []Case{
		{Name: "POST", Setup: doc("doc", true, nil), Query: byID, Body: travFixed(`{}`), Expect: 400},
		{Name: "an advisor", Method: "GET", Token: agent, Setup: doc("doc", true, nil), Query: byID, Expect: 403},
		get("no documentId", nil, nil, 400),
		get("an empty documentId", nil, fixed("documentId="), 400),
		get("a different parameter", nil, fixed("documentid=x&id=y"), 400),
		get("not a uuid", nil, fixed("documentId=banana"), 400),
		get("a malformed escape", nil, fixed("documentId=%zz"), 400),
		get("an unknown document", nil, func(*World) string { return "documentId=" + uuid.New() }, 404),
		get("an archived document", doc("doc.archived", true, js.O("archived_at", "2026-01-01T00:00:00Z")), byID, 404),
		get("a kind a client may not read", doc("doc.receipt", true, js.O("kind", "receipt")), byID, 404),
		get("another traveler's document", func(t *testing.T, w *World) {
			other := travTrip(t, w, travOther(w), "other.trip", nil)
			w.Vars["doc"] = travDocument(t, w, w.Vars["other.pu"], travOther(w), other, "doc.other", true, nil)
		}, byID, 404),
		get("another traveler's document, on no trip", func(t *testing.T, w *World) {
			w.Vars["doc"] = travDocument(t, w, w.Vars["other.pu"], travOther(w), nil, "doc.other", true, nil)
		}, byID, 404),
		// The row is there and the object is not: a bare 500 that never names the key.
		get("no object behind the row", doc("doc.noobject", false, nil), byID, 500),

		// Signed, as a path, and audited.
		get("their passport", doc("doc", true, nil), byID, 200),
		get("an itinerary the agency filed on their trip", doc("doc.itinerary", true,
			js.O("client_id", nil, "kind", "pdf_itinerary", "filename", "Itinerary.pdf", "is_sensitive", false)), byID, 200),
		get("someone else's on their trip", func(t *testing.T, w *World) {
			w.Vars["doc"] = travDocument(t, w, w.Vars["other.pu"], travOther(w), w.Vars["trip"], "doc.ontrip", true,
				js.O("kind", "supplier_confirmation"))
		}, byID, 200),
		get("their own, on no trip", func(t *testing.T, w *World) {
			w.Vars["doc"] = travDocument(t, w, w.Traveler.PlatformUserID, w.Traveler.ClientID, nil, "doc.loose", true,
				js.O("kind", "photo", "mime_type", "image/jpeg", "filename", "Beach.jpg"))
		}, byID, 200),
		get("an upper-case id", doc("doc", true, nil), func(w *World) string {
			return "documentId=" + strings.ToUpper(w.Vars["doc"])
		}, 200),
		get("the first of two", doc("doc", true, nil), func(w *World) string {
			return "documentId=" + url.QueryEscape(w.Vars["doc"]) + "&documentId=banana"
		}, 200),
	}
	Run(t, deno, goW, travWithAudit("trip-document-url", cases))
}
