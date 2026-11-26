//go:build difftest && difftest_agent

package difftest

import (
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentmessagetemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-message-template"] = api.Port{Gate: api.GateUser, Fn: agentmessagetemplate.Func}
}

func TestAgentMessageTemplate(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := agentsOther(deno, goW)
	const fn = "agent-message-template"
	b, fixed := agentsBody, agentsFixed

	fresh := func(key string) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsFreshID(t, w, key, agentsDropMessageTemplate) }
	}
	mine := func(key string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewMessageTemplate(t, w, w, key, cols) }
	}
	theirs := func(key string) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewMessageTemplate(t, w, other(w), key, nil) }
	}
	both := func(steps ...func(t *testing.T, w *World)) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			for _, s := range steps {
				s(t, w)
			}
		}
	}
	// pinned takes the id a case will name before the fixture is made with it.
	pinned := func(key string, make func(string) func(t *testing.T, w *World)) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			w.Vars[key] = uuid.New()
			make(key)(t, w)
		}
	}
	rows := func(keys ...string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string {
			ids := make([]string, len(keys))
			for i, k := range keys {
				ids[i] = w.Vars[k]
			}
			return agentsMessageTemplates(t, ids...)
		}
	}
	old := uuid.NewAt(time.Now().Add(-2 * time.Hour))
	v4 := "9b2f6a7e-3c1d-4e8f-a0b1-2c3d4e5f6a7b"
	ok := `"category":"pre_trip","name":"N","body":"Hi"`
	create := func(rest string) func(*World) string {
		return func(*World) string { return `{"op":"create","templateId":"` + uuid.New() + `",` + rest + `}` }
	}

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`{op}`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`[{}]`), Expect: 400},
		{Name: "no op", Fn: fn, Body: fixed(`{}`), Expect: 400},
		{Name: "unknown op", Fn: fn, Body: fixed(`{"op":"restore"}`), Expect: 400},

		// ---- create: the sentences ----
		{Name: "create no id", Fn: fn, Body: fixed(`{"op":"create",` + ok + `}`), Expect: 400},
		{Name: "create an hour-old id", Fn: fn, Body: fixed(`{"op":"create","templateId":"` + old + `",` + ok + `}`), Expect: 400},
		{Name: "create a v4 id", Fn: fn, Body: fixed(`{"op":"create","templateId":"` + v4 + `",` + ok + `}`), Expect: 400},
		{Name: "create no category", Fn: fn, Body: create(`"name":"N","body":"Hi"`), Expect: 400},
		{Name: "create bad category", Fn: fn, Body: create(`"category":"Pre_trip","name":"N","body":"Hi"`), Expect: 400},
		{Name: "create no name", Fn: fn, Body: create(`"category":"other","name":"  ","body":"Hi"`), Expect: 400},
		{Name: "create name too long", Fn: fn, Body: create(`"category":"other","name":"` + strings.Repeat("\U0001F600", 41) + `","body":"Hi"`), Expect: 400},
		{Name: "create blank body", Fn: fn, Body: create(`"category":"other","name":"N","body":"\n\n "`), Expect: 400},
		{Name: "create body too long", Fn: fn, Body: create(`"category":"other","name":"N","body":"` + strings.Repeat("b", 8001) + `"`), Expect: 400},
		{Name: "create unknown field", Fn: fn, Body: create(`"category":"other","name":"N","body":"Hi {{client.lastName}}"`), Expect: 400},
		{Name: "create unknown fields", Fn: fn, Body: create(`"category":"other","name":"N","body":"{{ a }} {{b}} {{ a}} {{trip.name}}"`), Expect: 400},
		{Name: "create tags not a list", Fn: fn, Body: create(ok + `,"tags":"beach"`), Expect: 400},
		{Name: "create tags not words", Fn: fn, Body: create(ok + `,"tags":["beach",1]`), Expect: 400},
		{Name: "create too many tags", Fn: fn, Body: create(ok + `,"tags":["a","b","c","d","e","f","g","h","i","j","k","A"]`), Expect: 400},
		{Name: "create tag too long", Fn: fn, Body: create(ok + `,"tags":["` + strings.Repeat("t", 31) + `"]`), Expect: 400},

		// ---- create: writes ----
		{Name: "create", Fn: fn, Setup: fresh("new"), Snap: rows("new"), Expect: 200,
			Body: b(`{"op":"create","templateId":"{new}","category":"payment_reminder","name":"  Deposit nudge ",` +
				`"body":"Hi {{ client.firstName }},\n\n{{payment.label}} for {{trip.name}} is due {{payment.dueDate}}: {{payment.link}}\n",` +
				`"tags":[" Beach ","beach","","Deposit","` + "\U00000130" + `stanbul","istanbul"]}`)},
		{Name: "create again", Fn: fn, Setup: pinned("mine", func(k string) func(*testing.T, *World) { return mine(k, nil) }),
			Snap: rows("mine"), Expect: 200,
			Body: b(`{"op":"create","templateId":"{mine}","category":"other","name":"Changed?","body":"No."}`)},
		{Name: "create over the other world's id", Fn: fn, Setup: pinned("theirs", theirs), Snap: rows("theirs"), Expect: 404,
			Body: b(`{"op":"create","templateId":"{theirs}","category":"other","name":"Mine now","body":"No."}`)},

		// ---- update ----
		{Name: "update bad id", Fn: fn, Body: fixed(`{"op":"update","templateId":"t",` + ok + `}`), Expect: 400},
		{Name: "update an old id is fine", Fn: fn, Body: fixed(`{"op":"update","templateId":"` + old + `",` + ok + `}`), Expect: 404},
		{Name: "update", Fn: fn, Setup: mine("t", nil), Snap: rows("t"), Expect: 200,
			Body: b(`{"op":"update","templateId":"{t}","category":"post_trip","name":"Welcome home","body":"Rest up, {{client.firstName}}.","tags":null}`)},
		{Name: "update noop", Fn: fn, Setup: mine("t", nil), Snap: rows("t"), Expect: 200,
			Body: b(`{"op":"update","templateId":"{t}","category":"pre_trip","name":" Fixture message ","body":"Hi {{client.firstName}}, see you soon.","tags":["beach"," Beach"]}`)},
		{Name: "update an archived template", Fn: fn, Setup: mine("t", js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: rows("t"), Expect: 404,
			Body: b(`{"op":"update","templateId":"{t}",` + ok + `}`)},
		{Name: "update the other world's template", Fn: fn, Setup: theirs("theirs"), Snap: rows("theirs"), Expect: 404,
			Body: b(`{"op":"update","templateId":"{theirs}",` + ok + `}`)},

		// ---- duplicate ----
		{Name: "duplicate bad source", Fn: fn, Body: fixed(`{"op":"duplicate","templateId":null,"newTemplateId":"` + uuid.New() + `"}`), Expect: 400},
		{Name: "duplicate no new id", Fn: fn, Body: fixed(`{"op":"duplicate","templateId":"` + old + `"}`), Expect: 400},
		{Name: "duplicate an old new id", Fn: fn, Body: fixed(`{"op":"duplicate","templateId":"` + old + `","newTemplateId":"` + old + `"}`), Expect: 400},
		{Name: "duplicate", Fn: fn, Setup: both(mine("src", js.O("name", strings.Repeat("Long name ", 7)+"Long name!")), fresh("copy")),
			Snap: rows("src", "copy"), Expect: 200, Body: b(`{"op":"duplicate","templateId":"{src}","newTemplateId":"{copy}"}`)},
		{Name: "duplicate again", Fn: fn, Setup: both(mine("src", nil), mine("copy", nil)),
			Snap: rows("src", "copy"), Expect: 200, Body: b(`{"op":"duplicate","templateId":"{src}","newTemplateId":"{copy}"}`)},
		{Name: "duplicate onto the other world's id", Fn: fn, Setup: both(mine("src", nil), theirs("theirs")),
			Snap: rows("src", "theirs"), Expect: 404, Body: b(`{"op":"duplicate","templateId":"{src}","newTemplateId":"{theirs}"}`)},
		{Name: "duplicate an archived source", Fn: fn, Setup: both(mine("src", js.O("archived_at", "2026-01-01T00:00:00Z")), fresh("copy")),
			Snap: rows("src", "copy"), Expect: 404, Body: b(`{"op":"duplicate","templateId":"{src}","newTemplateId":"{copy}"}`)},
		{Name: "duplicate the other world's template", Fn: fn, Setup: both(theirs("theirs"), fresh("copy")),
			Snap: rows("theirs", "copy"), Expect: 404, Body: b(`{"op":"duplicate","templateId":"{theirs}","newTemplateId":"{copy}"}`)},

		// ---- archive ----
		{Name: "archive bad id", Fn: fn, Body: fixed(`{"op":"archive","templateId":"x","archived":true}`), Expect: 400},
		{Name: "archive not a boolean", Fn: fn, Body: fixed(`{"op":"archive","templateId":"` + old + `","archived":"yes"}`), Expect: 400},
		{Name: "archive", Fn: fn, Setup: mine("t", nil), Snap: rows("t"), Expect: 200, Body: b(`{"op":"archive","templateId":"{t}","archived":true}`)},
		{Name: "archive twice", Fn: fn, Setup: mine("t", js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: rows("t"), Expect: 200,
			Body: b(`{"op":"archive","templateId":"{t}","archived":true}`)},
		{Name: "restore", Fn: fn, Setup: mine("t", js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: rows("t"), Expect: 200,
			Body: b(`{"op":"archive","templateId":"{t}","archived":false}`)},
		{Name: "archive the other world's template", Fn: fn, Setup: theirs("theirs"), Snap: rows("theirs"), Expect: 404,
			Body: b(`{"op":"archive","templateId":"{theirs}","archived":true}`)},
	}))
}
