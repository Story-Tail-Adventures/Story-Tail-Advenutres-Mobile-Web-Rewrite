//go:build difftest && difftest_traveler

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/tripmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["trip-message"] = api.Port{Gate: api.GateUser, Fn: tripmessage.Func}
}

// travMsgID mints this case's message id and labels it.
func travMsgID(w *World) string {
	id := uuid.New()
	w.Vars["msg"] = w.ID("msg", id)
	return id
}

// travThread is what a send leaves behind: the traveler's threads, the case's message and its
// attachments.
func travThread(t *testing.T, w *World) string {
	conv := S.Rows(t, S.DB.From("conversation").
		Select("id,client_id,agent_id,trip_id,subject,last_message_preview,client_unread_count,agent_unread_count,archived_at").
		Eq("client_id", w.Traveler.ClientID).Order("created_at", true))
	msg := S.Rows(t, S.DB.From("message").
		Select("id,conversation_id,sender_user_id,sender_role,body,is_internal_note,read_by_other_at,archived_at,"+
			"conversation:conversation_id(trip_id,subject)").
		Eq("id", w.Vars["msg"]))
	att := travSorted(t, w, S.DB.From("message_attachment").Select("message_id,document_id").Eq("message_id", w.Vars["msg"]))
	return "conversations:" + conv + "\nmessage:" + msg + "\nattachments:" + att
}

func TestTripMessage(t *testing.T) {
	deno, goW := travWorlds(t)
	agent := func(w *World) string { return w.Agent.Token }

	// send builds a body with this case's fresh message id and the fields given.
	send := func(kv ...any) func(w *World) string {
		return func(w *World) string {
			o := js.O("messageId", travMsgID(w))
			for i := 0; i+1 < len(kv); i += 2 {
				o = o.Set(kv[i].(string), kv[i+1])
			}
			b, _ := js.Marshal(o)
			return string(b)
		}
	}
	// withVar is send, where string values naming a w.Vars key ("$trip") are replaced by it.
	withVar := func(kv ...any) func(w *World) string {
		return func(w *World) string {
			out := make([]any, len(kv))
			copy(out, kv)
			for i := 1; i < len(out); i += 2 {
				switch v := out[i].(type) {
				case string:
					if strings.HasPrefix(v, "$") {
						out[i] = w.Vars[v[1:]]
					}
				case []string:
					list := make([]string, len(v))
					for j, s := range v {
						if strings.HasPrefix(s, "$") {
							s = w.Vars[s[1:]]
						}
						list[j] = s
					}
					out[i] = list
				}
			}
			return send(out...)(w)
		}
	}
	old := func(w *World) string {
		return travJSON("messageId", uuid.NewAt(time.Now().Add(-61*time.Minute)), "body", "hi")
	}
	future := func(w *World) string {
		return travJSON("messageId", uuid.NewAt(time.Now().Add(61*time.Minute)), "body", "hi")
	}
	ownTrip := func(label string, cols js.Ordered) func(*testing.T, *World) {
		return func(t *testing.T, w *World) { w.Vars["trip"] = travTrip(t, w, w.Traveler.ClientID, label, cols) }
	}

	cases := []Case{
		// The refusals, in the order the function checks.
		{Name: "GET", Method: "GET", Body: send("body", "hi"), Expect: 400},
		{Name: "an advisor", Token: agent, Body: send("body", "hi"), Expect: 403},
		{Name: "not JSON", Body: travFixed("nope"), Expect: 400},
		{Name: "an array", Body: travFixed("[]"), Expect: 400},
		{Name: "no messageId", Body: travFixed(`{"body":"hi"}`), Expect: 400},
		{Name: "messageId not v7", Body: travFixed(`{"messageId":"banana","body":"hi"}`), Expect: 400},
		{Name: "messageId an hour old", Body: old, Expect: 400},
		{Name: "messageId from the future", Body: future, Expect: 400},
		{Name: "tripId a number", Body: send("tripId", 5, "body", "hi"), Expect: 400},
		{Name: "conversationId a number", Body: send("conversationId", true, "body", "hi"), Expect: 400},
		{Name: "both ids", Body: send("tripId", "a", "conversationId", "b", "body", "hi"), Expect: 400},
		{Name: "a blank message", Body: send("body", " \n\t "), Expect: 400},
		{Name: "8001 UTF-16 units", Body: send("body", strings.Repeat("a", 7999)+"\U0001F600"), Expect: 400},
		{Name: "attachments not an array", Body: send("body", "hi", "attachmentDocumentIds", "x"), Expect: 400},
		{Name: "eleven attachments", Body: send("body", "hi", "attachmentDocumentIds",
			[]string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"}), Expect: 400},
		{Name: "attachments not strings", Body: send("body", "hi", "attachmentDocumentIds", []any{"a", 1}), Expect: 400},
		{Name: "tripId not a uuid", Body: send("tripId", "banana", "body", "hi"), Expect: 400},
		{Name: "another traveler's trip", Setup: func(t *testing.T, w *World) {
			w.Vars["trip"] = travTrip(t, w, travOther(w), "other.trip", nil)
		}, Body: withVar("tripId", "$trip", "body", "hi"), Snap: travThread, Expect: 404},
		{Name: "an archived trip of theirs", Setup: ownTrip("trip.archived", js.O("archived_at", "2026-01-01T00:00:00Z")),
			Body: withVar("tripId", "$trip", "body", "hi"), Snap: travThread, Expect: 404},
		{Name: "conversationId not a uuid", Body: send("conversationId", "nope", "body", "hi"), Expect: 400},
		{Name: "another traveler's conversation", Setup: func(t *testing.T, w *World) {
			w.Vars["conv"] = travConversation(t, w, travOther(w), "", "other.conv", nil)
		}, Body: withVar("conversationId", "$conv", "body", "hi"), Snap: travThread, Expect: 404},
		{Name: "an archived conversation of theirs", Setup: func(t *testing.T, w *World) {
			w.Vars["conv"] = travConversation(t, w, w.Traveler.ClientID, "", "conv.archived", js.O("archived_at", "2026-01-01T00:00:00Z"))
		}, Body: withVar("conversationId", "$conv", "body", "hi"), Snap: travThread, Expect: 404},

		// The general thread (§2.6.3): created on the first message, found on the next. The
		// archived one above is not "live", so it is not the one found.
		{Name: "the general thread is created", Body: send("body", "  Can we talk about\n\n October?  "), Snap: travThread, Expect: 201},
		{Name: "the general thread is found, tripId null", Body: send("tripId", nil, "body", "A second note <b>&</b>"), Snap: travThread, Expect: 201},
		{Name: "an upper-case messageId", Body: func(w *World) string {
			id := uuid.New()
			w.Vars["msg"] = w.ID("msg", id)
			return travJSON("messageId", strings.ToUpper(id), "body", "Loud id")
		}, Snap: travThread, Expect: 201},

		// The trip thread (§2.2.7): created with the trip's title as its subject, then found.
		{Name: "a trip thread is created", Setup: ownTrip("trip.new", js.O("title", "Amalfi <Coast> & Capri")),
			Body: withVar("tripId", "$trip", "body", strings.Repeat("word ", 40)), Snap: travThread, Expect: 201},
		{Name: "a trip thread is found", Setup: func(t *testing.T, w *World) {
			ownTrip("trip.threaded", nil)(t, w)
			w.Vars["conv"] = travConversation(t, w, w.Traveler.ClientID, w.Vars["trip"], "conv.trip", nil)
		}, Body: withVar("tripId", "$trip", "body", "Found it"), Snap: travThread, Expect: 201},

		// A thread named directly (§2.6.2).
		{Name: "a conversation by id", Setup: func(t *testing.T, w *World) {
			ownTrip("trip.byconv", nil)(t, w)
			w.Vars["conv"] = travConversation(t, w, w.Traveler.ClientID, w.Vars["trip"], "conv.byid", nil)
		}, Body: withVar("conversationId", "$conv", "tripId", nil, "body", "By id"), Snap: travThread, Expect: 201},

		// Attachments: only the traveler's own, live documents, each once.
		{Name: "attachments are filtered to their own", Setup: func(t *testing.T, w *World) {
			ownTrip("trip.att", nil)(t, w)
			me := w.Traveler.PlatformUserID
			w.Vars["d1"] = travDocument(t, w, me, w.Traveler.ClientID, w.Vars["trip"], "doc1", false, nil)
			w.Vars["d2"] = travDocument(t, w, me, w.Traveler.ClientID, nil, "doc2", false, js.O("kind", "photo"))
			w.Vars["d3"] = travDocument(t, w, me, w.Traveler.ClientID, w.Vars["trip"], "doc.archived", false,
				js.O("archived_at", "2026-01-01T00:00:00Z"))
			w.Vars["d4"] = travDocument(t, w, w.Vars["other.pu"], travOther(w), nil, "doc.other", false, nil)
			w.Vars["d5"] = w.ID("doc.unknown", uuid.New())
		}, Body: withVar("tripId", "$trip", "body", "Here are the scans", "attachmentDocumentIds",
			[]string{"$d1", "$d2", "$d1", "$d3", "$d4", "$d5"}), Snap: travThread, Expect: 201},
		{Name: "an attachment id that is not a uuid attaches nothing", Setup: func(t *testing.T, w *World) {
			ownTrip("trip.att2", nil)(t, w)
			w.Vars["d1"] = travDocument(t, w, w.Traveler.PlatformUserID, w.Traveler.ClientID, w.Vars["trip"], "doc1", false, nil)
		}, Body: withVar("tripId", "$trip", "body", "One more", "attachmentDocumentIds", []string{"$d1", "banana"}),
			Snap: travThread, Expect: 201},
		{Name: "attachments null", Body: send("body", "No files", "attachmentDocumentIds", nil), Snap: travThread, Expect: 201},

		// The client-minted id makes a retry land once.
		{Name: "a message id already used", Setup: func(t *testing.T, w *World) {
			ownTrip("trip.dup", nil)(t, w)
			w.Vars["conv"] = travConversation(t, w, w.Traveler.ClientID, w.Vars["trip"], "conv.dup", nil)
			id := uuid.New()
			w.Vars["msg"] = w.ID("msg", id)
			travMust(t, S.DB.From("message").Insert(t.Context(), js.O("id", id, "conversation_id", w.Vars["conv"],
				"sender_user_id", w.Traveler.PlatformUserID, "sender_role", "client", "body", "First try"), nil))
		}, Body: func(w *World) string {
			return travJSON("messageId", w.Vars["msg"], "conversationId", w.Vars["conv"], "body", "Second try")
		}, Snap: travThread, Expect: 400},

		// A new thread's first preview cut through an emoji: the half left behind is a lone
		// surrogate Postgres refuses, so the thread is never created.
		{Name: "a first preview cut through an emoji", Setup: ownTrip("trip.emoji", nil),
			Body: withVar("tripId", "$trip", "body", strings.Repeat("a", 139)+"\U0001F600"+"bbb"), Snap: travThread},
		{Name: "an emoji before the cut is whole", Setup: ownTrip("trip.emoji2", nil),
			Body: withVar("tripId", "$trip", "body", strings.Repeat("a", 138)+"\U0001F600"+"bbb"), Snap: travThread, Expect: 201},
	}
	Run(t, deno, goW, travWithAudit("trip-message", cases))
}
