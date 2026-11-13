//go:build difftest && difftest_agent

package difftest

import (
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agenttemplate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-template"] = api.Port{Gate: api.GateUser, Fn: agenttemplate.Func}
}

func TestAgentTemplate(t *testing.T) {
	deno, goW := NewWorlds(t)
	agentsDropTemplates(t, deno)
	agentsDropTemplates(t, goW)
	other := agentsOther(deno, goW)
	const fn = "agent-template"
	b, fixed := agentsBody, agentsFixed

	trip := func(key string, rich bool, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewTrip(t, w, w, key, rich, cols) }
	}
	tmpl := func(key string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewTemplate(t, w, w, key, cols) }
	}
	both := func(steps ...func(t *testing.T, w *World)) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			for _, s := range steps {
				s(t, w)
			}
		}
	}
	theirTrip := func(t *testing.T, w *World) { agentsNewTrip(t, w, other(w), "theirtrip", true, nil) }
	theirTmpl := func(t *testing.T, w *World) { agentsNewTemplate(t, w, other(w), "theirtmpl", nil) }
	byName := func(name string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string {
			return S.Rows(t, S.DB.From("trip_template").Select("id,agent_id,name,description,trip_type,payload,archived_at").
				Eq("agent_id", w.Agent.AgentID).Eq("name", name))
		}
	}
	tmplRow := func(key string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string { return agentsTemplate(t, "id", w.Vars[key]) }
	}
	tree := func(key string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string { return agentsTripTree(t, w.Vars[key]) }
	}
	tripID := `"tripId":"` + agentsSeedTrip + `"`

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`op=save`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`["save"]`), Expect: 400},
		{Name: "no op", Fn: fn, Body: fixed(`{"tripId":"x"}`), Expect: 400},
		{Name: "unknown op", Fn: fn, Body: fixed(`{"op":"delete"}`), Expect: 400},

		// ---- save ----
		{Name: "save bad trip id", Fn: fn, Body: fixed(`{"op":"save","tripId":"x","name":"N"}`), Expect: 400},
		{Name: "save no name", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `}`), Expect: 400},
		{Name: "save blank name", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `,"name":" \t "}`), Expect: 400},
		{Name: "save name not text", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `,"name":["N"]}`), Expect: 400},
		{Name: "save name too long", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `,"name":"` + strings.Repeat("\U0001F600", 61) + `"}`), Expect: 400},
		{Name: "save description not text", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `,"name":"N","description":false}`), Expect: 400},
		{Name: "save description too long", Fn: fn, Body: fixed(`{"op":"save",` + tripID + `,"name":"N","description":"` + strings.Repeat("d", 501) + `"}`), Expect: 400},
		{Name: "save the seed advisor's trip", Fn: fn, Snap: byName("Seed pattern"), Expect: 404,
			Body: fixed(`{"op":"save",` + tripID + `,"name":"Seed pattern"}`)},
		{Name: "save the other world's trip", Fn: fn, Setup: theirTrip, Snap: byName("Their pattern"), Expect: 404,
			Body: b(`{"op":"save","tripId":"{theirtrip}","name":"Their pattern"}`)},
		{Name: "save an archived trip", Fn: fn, Setup: trip("arch", true, js.O("archived_at", "2026-01-01T00:00:00Z")),
			Snap: byName("Archived pattern"), Expect: 404, Body: b(`{"op":"save","tripId":"{arch}","name":"Archived pattern"}`)},
		{Name: "save", Fn: fn, Setup: trip("rich", true, js.O("start_date", "2027-03-01", "end_date", "2027-03-06",
			"destinations", []string{"Jamaica"}, "traveler_count", 2)),
			Snap: func(t *testing.T, w *World) string {
				return byName("Negril pattern")(t, w) + agentsTripTree(t, w.Vars["rich"])
			},
			Expect: 200, Body: b(`{"op":"save","tripId":"{rich}","name":"  Negril pattern ","description":"   "}`)},
		{Name: "save a dateless trip", Fn: fn, Setup: trip("undated", true, nil), Snap: byName("Undated pattern"), Expect: 200,
			Body: b(`{"op":"save","tripId":"{undated}","name":"Undated pattern","description":" For <later> & \"maybe\" "}`)},
		{Name: "save an empty trip", Fn: fn, Setup: trip("empty", false, nil), Snap: byName("Empty pattern"), Expect: 200,
			Body: b(`{"op":"save","tripId":"{empty}","name":"Empty pattern","description":null}`)},

		// ---- update ----
		{Name: "update bad template id", Fn: fn, Body: fixed(`{"op":"update","templateId":7,"name":"N"}`), Expect: 400},
		{Name: "update no name", Fn: fn, Body: fixed(`{"op":"update","templateId":"` + agentsSeedTrip + `"}`), Expect: 400},
		{Name: "update description too long", Fn: fn, Body: fixed(`{"op":"update","templateId":"` + agentsSeedTrip + `","name":"N","description":"` + strings.Repeat("\U0001F600", 251) + `"}`), Expect: 400},
		{Name: "update", Fn: fn, Setup: tmpl("t", nil), Snap: tmplRow("t"), Expect: 200,
			Body: b(`{"op":"update","templateId":"{t}","name":" Renamed ","description":" Now described "}`)},
		{Name: "update noop", Fn: fn, Setup: tmpl("t", js.O("description", "Same")), Snap: tmplRow("t"), Expect: 200,
			Body: b(`{"op":"update","templateId":"{t}","name":"Fixture template","description":"Same "}`)},
		{Name: "update clears the description", Fn: fn, Setup: tmpl("t", js.O("description", "Old")), Snap: tmplRow("t"), Expect: 200,
			Body: b(`{"op":"update","templateId":"{t}","name":"Fixture template"}`)},
		{Name: "update an archived template", Fn: fn, Setup: tmpl("t", js.O("archived_at", "2026-01-01T00:00:00Z")),
			Snap: tmplRow("t"), Expect: 404, Body: b(`{"op":"update","templateId":"{t}","name":"X"}`)},
		{Name: "update the other world's template", Fn: fn, Setup: theirTmpl, Snap: tmplRow("theirtmpl"), Expect: 404,
			Body: b(`{"op":"update","templateId":"{theirtmpl}","name":"X"}`)},
		{Name: "update no such template", Fn: fn, Expect: 404, Body: func(*World) string {
			return `{"op":"update","templateId":"` + uuid.New() + `","name":"X"}`
		}},

		// ---- archive ----
		{Name: "archive bad template id", Fn: fn, Body: fixed(`{"op":"archive","templateId":"t"}`), Expect: 400},
		{Name: "archive", Fn: fn, Setup: tmpl("t", nil), Snap: tmplRow("t"), Expect: 200,
			Body: b(`{"op":"archive","templateId":"{t}"}`)},
		{Name: "archive twice", Fn: fn, Setup: tmpl("t", js.O("archived_at", "2026-01-01T00:00:00Z")), Snap: tmplRow("t"), Expect: 404,
			Body: b(`{"op":"archive","templateId":"{t}"}`)},
		{Name: "archive the other world's template", Fn: fn, Setup: theirTmpl, Snap: tmplRow("theirtmpl"), Expect: 404,
			Body: b(`{"op":"archive","templateId":"{theirtmpl}"}`)},

		// ---- apply ----
		{Name: "apply bad template id", Fn: fn, Body: fixed(`{"op":"apply","templateId":"t",` + tripID + `}`), Expect: 400},
		{Name: "apply bad trip id", Fn: fn, Body: fixed(`{"op":"apply","templateId":"` + agentsSeedTrip + `","tripId":null}`), Expect: 400},
		{Name: "apply", Fn: fn, Setup: both(tmpl("t", nil), trip("dest", false, js.O("start_date", "2027-05-10"))),
			Snap: tree("dest"), Expect: 200, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{dest}"}`)},
		{Name: "apply onto a trip already written", Fn: fn,
			Setup: both(tmpl("t", nil), trip("dest", true, js.O("start_date", "2027-03-01", "traveler_count", 4,
				"destinations", []string{"Montego Bay"}))),
			Snap: tree("dest"), Expect: 200, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{dest}"}`)},
		{Name: "apply onto a dateless trip", Fn: fn, Setup: both(tmpl("t", nil), trip("dest", false, nil)),
			Snap: tree("dest"), Expect: 200, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{dest}"}`)},
		{Name: "apply again", Fn: fn, Setup: both(tmpl("t", nil), func(t *testing.T, w *World) {
			agentsNewTrip(t, w, w, "dest", false, js.O("start_date", "2027-05-10", "template_id", w.Vars["t"]))
		}), Snap: tree("dest"), Expect: 200, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{dest}"}`)},
		{Name: "apply an archived template", Fn: fn, Setup: both(tmpl("t", js.O("archived_at", "2026-01-01T00:00:00Z")),
			trip("dest", false, js.O("start_date", "2027-05-10"))),
			Snap: tree("dest"), Expect: 404, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{dest}"}`)},
		{Name: "apply the other world's template", Fn: fn, Setup: both(theirTmpl, trip("dest", false, js.O("start_date", "2027-05-10"))),
			Snap: tree("dest"), Expect: 404, Body: b(`{"op":"apply","templateId":"{theirtmpl}","tripId":"{dest}"}`)},
		{Name: "apply onto the other world's trip", Fn: fn, Setup: both(tmpl("t", nil), theirTrip),
			Snap: tree("theirtrip"), Expect: 404, Body: b(`{"op":"apply","templateId":"{t}","tripId":"{theirtrip}"}`)},
		{Name: "apply onto the seed advisor's trip", Fn: fn, Setup: tmpl("t", nil),
			Snap: func(t *testing.T, w *World) string { return agentsTripTree(t, agentsSeedTrip) }, Expect: 404,
			Body: b(`{"op":"apply","templateId":"{t}",` + tripID + `}`)},
	}))
}
