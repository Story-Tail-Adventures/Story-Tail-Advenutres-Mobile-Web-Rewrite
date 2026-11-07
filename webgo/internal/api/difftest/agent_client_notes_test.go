//go:build difftest && difftest_agent

package difftest

import (
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentclientnotes"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-client-notes"] = api.Port{Gate: api.GateUser, Fn: agentclientnotes.Func}
}

func TestAgentClientNotes(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := agentsOther(deno, goW)
	const fn = "agent-client-notes"
	b, fixed := agentsBody, agentsFixed

	// client makes the world's own fixture client; note adds a note to it by the advisor.
	client := func(t *testing.T, w *World) { agentsNewClient(t, w, w, "cl", nil) }
	note := func(cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			client(t, w)
			agentsNewNote(t, w, "note", w.Vars["cl"], w.Agent.PlatformUserID, cols)
		}
	}
	notes := func(t *testing.T, w *World) string { return agentsNotes(t, w.Vars["cl"]) }
	theirs := func(t *testing.T, w *World) {
		o := other(w)
		agentsNewClient(t, w, o, "theirs", nil)
		agentsNewNote(t, w, "theirnote", w.Vars["theirs"], o.Agent.PlatformUserID, nil)
	}
	theirNotes := func(t *testing.T, w *World) string { return agentsNotes(t, w.Vars["theirs"]) }

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`{"op":`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`[]`), Expect: 400},
		{Name: "no client id", Fn: fn, Body: fixed(`{"op":"create","body":"x"}`), Expect: 400},
		{Name: "client id not a uuid", Fn: fn, Body: fixed(`{"clientId":"0195a2c0","op":"nope"}`), Expect: 400},
		{Name: "bad op", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"delete"}`), Expect: 400},
		{Name: "update no note id", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"update","body":"x"}`), Expect: 400},
		{Name: "archive bad note id", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"archive","noteId":"n"}`), Expect: 400},
		{Name: "create no body", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"create"}`), Expect: 400},
		{Name: "create blank body", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"create","body":" \n\t` + "\U000000a0" + `"}`), Expect: 400},
		{Name: "update body not text", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"update","noteId":"` + agentsSeedNote + `","body":["x"]}`), Expect: 400},
		{Name: "create too long", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"create","body":"` + strings.Repeat("x", 4001) + `"}`), Expect: 400},
		{Name: "create too long in UTF-16", Fn: fn, Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"create","body":"` + strings.Repeat("\U0001F600", 2001) + `"}`), Expect: 400},

		{Name: "create on the seed advisor's client", Fn: fn, Expect: 404,
			Snap: func(t *testing.T, w *World) string { return agentsNotes(t, agentsSeedClient) },
			Body: fixed(`{"clientId":"` + agentsSeedClient + `","op":"create","body":"x"}`)},
		{Name: "create on the other world's client", Fn: fn, Setup: theirs, Snap: theirNotes, Expect: 404,
			Body: b(`{"clientId":"{theirs}","op":"create","body":"x"}`)},
		{Name: "create on no such client", Fn: fn, Expect: 404, Body: func(*World) string {
			return `{"clientId":"` + uuid.New() + `","op":"create","body":"x"}`
		}},
		{Name: "create", Fn: fn, Setup: client, Snap: notes, Expect: 200,
			Body: b(`{"clientId":"{cl}","op":"create","body":"  Prefers <aisle> & \"quiet\" ` + "\U0001F600" + ` ","noteId":"ignored"}`)},
		{Name: "create at the cap", Fn: fn, Setup: client, Snap: notes, Expect: 200,
			Body: b(`{"clientId":"{cl}","op":"create","body":"` + strings.Repeat("y", 4000) + `"}`)},

		{Name: "update", Fn: fn, Setup: note(nil), Snap: notes, Expect: 200,
			Body: b(`{"clientId":"{cl}","op":"update","noteId":"{note}","body":" Edited "}`)},
		{Name: "update noop", Fn: fn, Setup: note(js.O("body", "Same text")), Snap: notes, Expect: 200,
			Body: b(`{"clientId":"{cl}","op":"update","noteId":"{note}","body":"  Same text  "}`)},
		{Name: "update someone else's note", Fn: fn, Expect: 404, Snap: notes,
			Setup: func(t *testing.T, w *World) {
				client(t, w)
				agentsNewNote(t, w, "note", w.Vars["cl"], w.Traveler.PlatformUserID, nil)
			},
			Body: b(`{"clientId":"{cl}","op":"update","noteId":"{note}","body":"x"}`)},
		{Name: "update an archived note", Fn: fn, Setup: note(js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: notes, Expect: 404,
			Body: b(`{"clientId":"{cl}","op":"update","noteId":"{note}","body":"x"}`)},
		{Name: "update the seed note through my client", Fn: fn, Setup: client, Expect: 404,
			Snap: func(t *testing.T, w *World) string { return agentsNotes(t, w.Vars["cl"]) },
			Body: b(`{"clientId":"{cl}","op":"update","noteId":"` + agentsSeedNote + `","body":"x"}`)},
		{Name: "update the other world's note", Fn: fn, Setup: theirs, Snap: theirNotes, Expect: 404,
			Body: b(`{"clientId":"{theirs}","op":"update","noteId":"{theirnote}","body":"x"}`)},
		{Name: "archive", Fn: fn, Setup: note(nil), Snap: notes, Expect: 200,
			Body: b(`{"clientId":"{cl}","op":"archive","noteId":"{note}","body":""}`)},
		{Name: "archive twice", Fn: fn, Setup: note(js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: notes, Expect: 404,
			Body: b(`{"clientId":"{cl}","op":"archive","noteId":"{note}"}`)},
		{Name: "archive the other world's note", Fn: fn, Setup: theirs, Snap: theirNotes, Expect: 404,
			Body: b(`{"clientId":"{theirs}","op":"archive","noteId":"{theirnote}"}`)},
	}))
}
