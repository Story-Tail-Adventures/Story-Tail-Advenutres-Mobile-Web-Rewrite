//go:build difftest && difftest_agent

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-message"] = api.Port{Gate: api.GateUser, Fn: agentmessage.Func}
}

func TestAgentMessage(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := agentsOther(deno, goW)
	const fn = "agent-message"
	b, fixed := agentsBody, agentsFixed

	steps := func(s ...func(t *testing.T, w *World)) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			for _, f := range s {
				f(t, w)
			}
		}
	}
	// msg mints the id the request names for its message.
	msg := func(t *testing.T, w *World) {
		id := uuid.New()
		w.ID("msg", id)
		w.Vars["msg"] = id
	}
	client := func(key string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewClient(t, w, w, key, cols) }
	}
	// thread is a general thread on the world's fixture client "cl" with two client messages
	// the advisor has not read, and one earlier reply of theirs.
	thread := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			agentsNewClient(t, w, w, "cl", nil)
			c := agentsNewConversation(t, w, w, "conv", w.Vars["cl"], "", js.O("agent_unread_count", 2, "client_unread_count", 1).Spread(cols))
			agentsNewMessage(t, w, "m1", c, w.Agent.PlatformUserID, "agent", "Earlier", "2026-11-01T09:00:00Z")
			agentsNewMessage(t, w, "m2", c, w.Traveler.PlatformUserID, "client", "Question one", "2026-11-01T10:01:00.123456Z")
			agentsNewMessage(t, w, "m3", c, w.Traveler.PlatformUserID, "client", "Question two", "2026-11-01T10:02:00.654321Z")
		}
	}
	theirThread := func(t *testing.T, w *World) {
		o := other(w)
		agentsNewClient(t, w, o, "theirs", nil)
		agentsNewConversation(t, w, o, "theirconv", w.Vars["theirs"], "", js.O("agent_unread_count", 1))
	}
	threads := func(key string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string { return agentsThreads(t, w.Vars[key]) }
	}
	old := uuid.NewAt(time.Now().Add(-2 * time.Hour))
	tid := `"conversationId":"` + agentsSeedClient + `"`
	ok := `"body":"Hi","internalNote":false,"messageId":"{msg}"`

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{"op":"send"}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`{"op":"send"`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`["send"]`), Expect: 400},
		{Name: "unknown op", Fn: fn, Body: fixed(`{"op":"delete"}`), Expect: 400},

		// ---- send: the sentences, in order ----
		{Name: "send no address", Fn: fn, Body: fixed(`{"op":"send","body":"Hi"}`), Expect: 400},
		{Name: "send bad thread id", Fn: fn, Body: fixed(`{"op":"send","conversationId":"t","clientId":"x"}`), Expect: 400},
		{Name: "send thread and client", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"clientId":"` + agentsSeedClient + `"}`), Expect: 400},
		{Name: "send thread and trip", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"tripId":"x"}`), Expect: 400},
		{Name: "send bad trip id", Fn: fn, Body: fixed(`{"op":"send","clientId":"` + agentsSeedClient + `","tripId":7}`), Expect: 400},
		{Name: "send blank body", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":" \n "}`), Expect: 400},
		{Name: "send body too long", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":"` + strings.Repeat("\U0001F600", 4001) + `"}`), Expect: 400},
		{Name: "send an unfilled field", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":"Pay {{payment.link}} by {{ payment.dueDate }}, {{payment.link}}"}`), Expect: 400},
		{Name: "send no note flag", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":"Hi {{client.middleName}}"}`), Expect: 400},
		{Name: "send no message id", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":"Hi","internalNote":false}`), Expect: 400},
		{Name: "send an old message id", Fn: fn, Body: fixed(`{"op":"send",` + tid + `,"body":"Hi","internalNote":false,"messageId":"` + old + `"}`), Expect: 400},
		{Name: "send bad seenUpTo", Fn: fn, Setup: msg, Body: b(`{"op":"send",` + tid + `,` + ok + `,"seenUpTo":"2026-11-01"}`), Expect: 400},

		// ---- send: writes ----
		{Name: "send starts a thread", Fn: fn, Setup: steps(msg, client("cl", nil)), Snap: threads("cl"), Expect: 201,
			Body: b(`{"op":"send","clientId":"{cl}","tripId":null,"body":"  Hello <there> & \"welcome\"  ","internalNote":false,"messageId":"{msg}"}`)},
		{Name: "send starts a trip thread", Fn: fn, Expect: 201,
			Setup: steps(msg, func(t *testing.T, w *World) {
				agentsNewTrip(t, w, w, "trip", false, js.O("title", "Negril honeymoon"))
				w.Vars["tcl"] = w.Traveler.ClientID
			}),
			Snap: threads("tcl"),
			Body: b(`{"op":"send","clientId":"{tcl}","tripId":"{trip}","body":"Your rooms are held.","internalNote":false,"messageId":"{msg}"}`)},
		{Name: "send a note with no thread", Fn: fn, Setup: steps(msg, client("cl", nil)), Snap: threads("cl"), Expect: 400,
			Body: b(`{"op":"send","clientId":"{cl}","body":"Private","internalNote":true,"messageId":"{msg}"}`)},
		{Name: "send into a thread", Fn: fn, Setup: steps(msg, thread(nil)), Snap: threads("cl"), Expect: 201,
			Body: b(`{"op":"send","conversationId":"{conv}",` + ok + `,"seenUpTo":"2026-11-01T10:01:00.123456Z"}`)},
		{Name: "send to a client finds their thread", Fn: fn, Setup: steps(msg, thread(nil)), Snap: threads("cl"), Expect: 201,
			Body: b(`{"op":"send","clientId":"{cl}",` + ok + `,"seenUpTo":"2026-11-01 10:02:00.654321+00"}`)},
		{Name: "send a note into a thread", Fn: fn, Setup: steps(msg, thread(nil)), Snap: threads("cl"), Expect: 201,
			Body: b(`{"op":"send","conversationId":"{conv}","body":"Call them Friday","internalNote":true,"messageId":"{msg}","seenUpTo":"2026-11-02T00:00:00Z"}`)},
		{Name: "send the same message twice", Fn: fn, Expect: 400, Snap: threads("cl"),
			Setup: steps(thread(nil), func(t *testing.T, w *World) {
				agentsNewMessage(t, w, "msg", w.Vars["conv"], w.Agent.PlatformUserID, "agent", "Hi", "2026-11-01T11:00:00Z")
			}),
			Body: b(`{"op":"send","conversationId":"{conv}",` + ok + `}`)},
		{Name: "send into an archived thread", Fn: fn, Setup: steps(msg, thread(js.O("archived_at", "2026-11-02T00:00:00Z"))),
			Snap: threads("cl"), Expect: 404, Body: b(`{"op":"send","conversationId":"{conv}",` + ok + `}`)},
		{Name: "send into the other world's thread", Fn: fn, Setup: steps(msg, theirThread), Snap: threads("theirs"), Expect: 404,
			Body: b(`{"op":"send","conversationId":"{theirconv}",` + ok + `}`)},
		{Name: "send to the other world's client", Fn: fn, Setup: steps(msg, theirThread), Snap: threads("theirs"), Expect: 404,
			Body: b(`{"op":"send","clientId":"{theirs}",` + ok + `}`)},
		{Name: "send to the seed advisor's client", Fn: fn, Setup: msg, Expect: 404,
			Body: b(`{"op":"send","clientId":"` + agentsSeedClient + `",` + ok + `}`)},
		{Name: "send to an archived client", Fn: fn, Setup: steps(msg, client("cl", js.O("status", "archived", "archived_at", "2026-11-01T00:00:00Z"))),
			Snap: threads("cl"), Expect: 404, Body: b(`{"op":"send","clientId":"{cl}",` + ok + `}`)},
		{Name: "send to a trip that is not the client's", Fn: fn, Setup: steps(msg, client("cl", nil), func(t *testing.T, w *World) {
			agentsNewTrip(t, w, w, "trip", false, nil)
		}), Snap: threads("cl"), Expect: 404, Body: b(`{"op":"send","clientId":"{cl}","tripId":"{trip}",` + ok + `}`)},

		// ---- read ----
		{Name: "read bad id", Fn: fn, Body: fixed(`{"op":"read","conversationId":5,"seenUpTo":"2026-11-01T10:00:00Z"}`), Expect: 400},
		{Name: "read no seenUpTo", Fn: fn, Body: fixed(`{"op":"read",` + tid + `}`), Expect: 400},
		// V8 lets 30 February through Date.parse, as the Go port does, and Postgres refuses it.
		{Name: "read an impossible seenUpTo", Fn: fn, Body: fixed(`{"op":"read",` + tid + `,"seenUpTo":"2026-02-30T10:00:00Z"}`), Expect: 500},
		{Name: "read bad seenUpTo", Fn: fn, Body: fixed(`{"op":"read",` + tid + `,"seenUpTo":"2026-11-01T10:00"}`), Expect: 400},
		{Name: "read", Fn: fn, Setup: thread(nil), Snap: threads("cl"), Expect: 200,
			Body: b(`{"op":"read","conversationId":"{conv}","seenUpTo":"2026-11-01T10:02:00.654321+00:00"}`)},
		{Name: "read part", Fn: fn, Setup: thread(nil), Snap: threads("cl"), Expect: 200,
			Body: b(`{"op":"read","conversationId":"{conv}","seenUpTo":"2026-11-01T10:01:00.123456Z"}`)},
		{Name: "read nothing new", Fn: fn, Setup: thread(js.O("agent_unread_count", 0)), Snap: threads("cl"), Expect: 200,
			Body: b(`{"op":"read","conversationId":"{conv}","seenUpTo":"2026-11-01T10:02:00Z"}`)},
		{Name: "read the other world's thread", Fn: fn, Setup: theirThread, Snap: threads("theirs"), Expect: 200,
			Body: b(`{"op":"read","conversationId":"{theirconv}","seenUpTo":"2026-11-09T00:00:00Z"}`)},

		// ---- archive ----
		{Name: "archive none", Fn: fn, Body: fixed(`{"op":"archive","conversationIds":[],"archived":true}`), Expect: 400},
		{Name: "archive not a list", Fn: fn, Body: fixed(`{"op":"archive","conversationIds":"x","archived":true}`), Expect: 400},
		{Name: "archive too many", Fn: fn, Body: fixed(`{"op":"archive","conversationIds":[` + strings.Repeat(`"`+agentsSeedClient+`",`, 100) + `"x"],"archived":true}`), Expect: 400},
		{Name: "archive bad id", Fn: fn, Body: fixed(`{"op":"archive","conversationIds":["` + agentsSeedClient + `",null],"archived":true}`), Expect: 400},
		{Name: "archive no flag", Fn: fn, Body: fixed(`{"op":"archive","conversationIds":["` + agentsSeedClient + `"]}`), Expect: 400},
		{Name: "archive", Fn: fn, Setup: steps(thread(nil), theirThread),
			Snap: func(t *testing.T, w *World) string {
				return agentsThreads(t, w.Vars["cl"]) + agentsThreads(t, w.Vars["theirs"])
			},
			Expect: 200, Body: func(w *World) string {
				return `{"op":"archive","conversationIds":["` + w.Vars["conv"] + `","` + strings.ToUpper(w.Vars["conv"]) + `","` +
					w.Vars["theirconv"] + `","` + uuid.New() + `"],"archived":true}`
			}},
		{Name: "bring back", Fn: fn, Setup: thread(js.O("agent_archived_at", "2026-11-01T10:00:00Z")), Snap: threads("cl"), Expect: 200,
			Body: b(`{"op":"archive","conversationIds":["{conv}"],"archived":false}`)},
		{Name: "bring back one not archived", Fn: fn, Setup: thread(nil), Snap: threads("cl"), Expect: 200,
			Body: b(`{"op":"archive","conversationIds":["{conv}"],"archived":false}`)},
	}))
}
