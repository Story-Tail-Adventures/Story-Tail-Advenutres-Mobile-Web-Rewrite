//go:build difftest && difftest_agent

package difftest

import (
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentclient"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-client"] = api.Port{Gate: api.GateUser, Fn: agentclient.Func}
}

func TestAgentClient(t *testing.T) {
	deno, goW := NewWorlds(t)
	other := agentsOther(deno, goW)
	const fn = "agent-client"

	// mine makes fixture clients of the world's own advisor; theirs, of the other world's.
	mine := func(key string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewClient(t, w, w, key, cols) }
	}
	theirs := func(t *testing.T, w *World) { agentsNewClient(t, w, other(w), "theirs", nil) }
	row := func(key string) func(t *testing.T, w *World) string {
		return func(t *testing.T, w *World) string { return agentsClientRow(t, w.Vars[key]) }
	}
	created := func(email string) (func(t *testing.T, w *World), func(t *testing.T, w *World) string) {
		return func(t *testing.T, w *World) { agentsDropClientsByEmail(t, w, email) },
			func(t *testing.T, w *World) string { return agentsClientsByEmail(t, w, email) }
	}
	b := agentsBody
	fixed := agentsFixed
	okClient := `"client":{"firstName":"Ann","lastName":"Lee","email":"ann.lee@example.com"}`
	create := func(client string) func(*World) string { return fixed(`{"op":"create","client":` + client + `}`) }

	fullSetup, fullSnap := created("create.full@example.com")
	minSetup, minSnap := created("create.min@example.com")
	sharpSetup, sharpSnap := created("create.sharp@example.com")
	dupSetup := func(t *testing.T, w *World) { mine("dup", js.O("email", "dup@example.com"))(t, w) }
	dupSnap := func(t *testing.T, w *World) string { return agentsClientsByEmail(t, w, "dup@example.com") }

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`client`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`[{"op":"create"}]`), Expect: 400},
		{Name: "no op", Fn: fn, Body: fixed(`{}`), Expect: 400},
		{Name: "unknown op", Fn: fn, Body: fixed(`{"op":"delete"}`), Expect: 400},

		// ---- create: every sentence, in the order readClient reaches them ----
		{Name: "create no client", Fn: fn, Body: fixed(`{"op":"create"}`), Expect: 400},
		{Name: "create client is text", Fn: fn, Body: create(`"ann"`), Expect: 400},
		{Name: "create email blank", Fn: fn, Body: create(`{"email":"   ","firstName":""}`), Expect: 400},
		{Name: "create email not text", Fn: fn, Body: create(`{"email":5}`), Expect: 400},
		{Name: "create email too long", Fn: fn, Body: create(`{"email":"` + strings.Repeat("a", 195) + `@b.com"}`), Expect: 400},
		{Name: "create email shape", Fn: fn, Body: create(`{"email":"ann@"}`), Expect: 400},
		{Name: "create country before names", Fn: fn, Body: create(`{"email":"a@b","address":{"country":"USA"}}`), Expect: 400},
		{Name: "create first name", Fn: fn, Body: create(`{"email":"a@b","lastName":"B"}`), Expect: 400},
		{Name: "create last name", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"  "}`), Expect: 400},
		{Name: "create first name too long", Fn: fn, Body: create(`{"email":"a@b","firstName":"` + strings.Repeat("\U0001F600", 61) + `","lastName":"B"}`), Expect: 400},
		{Name: "create preferred name", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","preferredName":{}}`), Expect: 400},
		{Name: "create phone", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","phone":"` + strings.Repeat("1", 41) + `"}`), Expect: 400},
		{Name: "create date of birth", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","dateOfBirth":"1990-2-3"}`), Expect: 400},
		{Name: "create tags not a list", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","tags":"vip"}`), Expect: 400},
		{Name: "create too many tags", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","tags":[` + strings.Repeat(`"",`, 20) + `""]}`), Expect: 400},
		{Name: "create tag too long", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","tags":["` + strings.Repeat("x", 41) + `"]}`), Expect: 400},
		{Name: "create dates not a list", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":"x"}`), Expect: 400},
		{Name: "create too many dates", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[` + strings.Repeat(`0,`, 12) + `0]}`), Expect: 400},
		{Name: "create date unreadable", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":"a","date":"2020-01-01"},false]}`), Expect: 400},
		{Name: "create date label", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[["x"]]}`), Expect: 400},
		{Name: "create date label too long", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":"` + strings.Repeat("l", 61) + `"}]}`), Expect: 400},
		{Name: "create date missing", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":" Anniversary ","date":""}]}`), Expect: 400},
		{Name: "create date shape", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","importantDates":[{"label":"x","date":20200101}]}`), Expect: 400},
		{Name: "create notes", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","notes":"` + strings.Repeat("n", 4001) + `"}`), Expect: 400},
		{Name: "create line1", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","address":{"line1":1}}`), Expect: 400},
		{Name: "create line2", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","address":{"line2":[]}}`), Expect: 400},
		{Name: "create city", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","address":{"city":true}}`), Expect: 400},
		{Name: "create region", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","address":{"region":"` + strings.Repeat("r", 121) + `"}}`), Expect: 400},
		{Name: "create postal code", Fn: fn, Body: create(`{"email":"a@b","firstName":"A","lastName":"B","address":{"postalCode":"` + strings.Repeat("9", 21) + `"}}`), Expect: 400},

		// ---- create: writes ----
		{Name: "create full", Fn: fn, Setup: fullSetup, Snap: fullSnap, Expect: 200, Body: create(`{"firstName":"  Ada ",` +
			`"lastName":"Lovelace","preferredName":"Addie","email":" create.full@example.com ","phone":" +1 555 0100 ",` +
			`"dateOfBirth":"1990-02-03","tags":[" VIP ","vip","Repeat",3,"","` + "\U0000039F\U00000394\U0000039F\U000003A3" + `","` + "\U00000130" + `stanbul"],` +
			`"importantDates":[{"label":" Anniversary ","date":"2020-06-01","recurring":true},{"label":"Retirement","date":"2031-01-01","recurring":"yes"}],` +
			`"notes":" Likes <window> seats & \"quiet\" ","address":{"line1":" 1 Main St ","line2":"","city":"Austin","region":"TX",` +
			`"postalCode":"78701","country":"us"},"extra":1}`)},
		{Name: "create minimal", Fn: fn, Setup: minSetup, Snap: minSnap, Expect: 200,
			Body: create(`{"firstName":"Min","lastName":"Imal","email":"create.min@example.com","tags":null,"importantDates":null,"address":null}`)},
		{Name: "create sharp s country", Fn: fn, Setup: sharpSetup, Snap: sharpSnap, Expect: 200,
			Body: create(`{"firstName":"S","lastName":"S","email":"create.sharp@example.com","address":{"line1":"1 Weg","city":"Berlin","country":"` + "\U000000df" + `"}}`)},
		{Name: "create country too long once upper-cased", Fn: fn, Expect: 500,
			Body: create(`{"firstName":"S","lastName":"S","email":"create.sharp2@example.com","address":{"line1":"1 Weg","city":"Berlin","country":"` + "\U000000df\U000000df" + `"}}`)},
		{Name: "create an address with no country", Fn: fn, Expect: 500,
			Body: create(`{"firstName":"S","lastName":"S","email":"create.nocountry@example.com","address":{"line1":"1 Weg","city":"Berlin"}}`)},
		{Name: "create an impossible date", Fn: fn, Expect: 500,
			Body: create(`{"firstName":"S","lastName":"S","email":"create.baddate@example.com","dateOfBirth":"2026-13-45"}`)},
		{Name: "create duplicate email", Fn: fn, Setup: dupSetup, Snap: dupSnap, Expect: 200,
			Body: create(`{"firstName":"Dee","lastName":"Up","email":"DUP@example.com"}`)},

		// ---- update ----
		{Name: "update bad id", Fn: fn, Body: fixed(`{"op":"update","clientId":"nope","expectedVersion":1,` + okClient + `}`), Expect: 400},
		{Name: "update no version", Fn: fn, Body: fixed(`{"op":"update","clientId":"` + agentsSeedClient + `",` + okClient + `}`), Expect: 400},
		{Name: "update version past int4", Fn: fn, Body: fixed(`{"op":"update","clientId":"` + agentsSeedClient + `","expectedVersion":2147483648,` + okClient + `}`), Expect: 400},
		{Name: "update version as text", Fn: fn, Body: fixed(`{"op":"update","clientId":"` + agentsSeedClient + `","expectedVersion":"1",` + okClient + `}`), Expect: 400},
		{Name: "update no client", Fn: fn, Body: fixed(`{"op":"update","clientId":"` + agentsSeedClient + `","expectedVersion":1}`), Expect: 400},
		{Name: "update the seed advisor's client", Fn: fn, Body: fixed(`{"op":"update","clientId":"` + agentsSeedClient + `","expectedVersion":1,` + okClient + `}`),
			Snap: func(t *testing.T, w *World) string { return agentsClientRow(t, agentsSeedClient) }, Expect: 404},
		{Name: "update the other world's client", Fn: fn, Setup: theirs, Snap: row("theirs"), Expect: 404,
			Body: b(`{"op":"update","clientId":"{theirs}","expectedVersion":1,` + okClient + `}`)},
		{Name: "update no such client", Fn: fn, Expect: 404, Body: func(*World) string {
			return `{"op":"update","clientId":"` + uuid.New() + `","expectedVersion":1,` + okClient + `}`
		}},
		{Name: "update stale", Fn: fn, Setup: mine("stale", nil), Snap: row("stale"), Expect: 409,
			Body: b(`{"op":"update","clientId":"{stale}","expectedVersion":2,` + okClient + `}`)},
		{Name: "update noop", Fn: fn, Setup: mine("noop", js.O("first_name", "Same", "last_name", "Same", "email", "upd.noop@example.com")),
			Snap: row("noop"), Expect: 200,
			Body: b(`{"op":"update","clientId":"{noop}","expectedVersion":1,"client":{"firstName":" Same","lastName":"Same ","email":"UPD.noop@example.com","tags":[],"preferredName":""}}`)},
		{Name: "update changed", Fn: fn, Snap: row("chg"), Expect: 200,
			Setup: mine("chg", js.O("first_name", "Old", "last_name", "Name", "phone", "+1 555 0000", "tags", []string{"old"}, "notes", "keep")),
			Body: b(`{"op":"update","clientId":"{chg}","expectedVersion":1,"client":{"firstName":"New","lastName":"Name",` +
				`"email":"chg@example.com","tags":["VIP","vip"],"importantDates":[{"label":"Bday","date":"1980-01-02"}],"notes":"keep",` +
				`"address":{"line1":"2 Elm","city":"Toronto","country":"ca"}}}`)},
		{Name: "update an address only", Fn: fn, Expect: 200,
			Setup: func(t *testing.T, w *World) {
				mine("addr", js.O("mailing_address_id", agentsNewAddress(t, w, "addr.row")))(t, w)
			},
			Snap: row("addr"),
			Body: b(`{"op":"update","clientId":"{addr}","expectedVersion":1,"client":{"firstName":"Fix","lastName":"Ture",` +
				`"email":"addr@example.com","address":{"line1":"9 Old Rd","city":"York","country":"gb"}}}`)},
		{Name: "update clears an address", Fn: fn, Expect: 200,
			Setup: func(t *testing.T, w *World) {
				mine("clear", js.O("mailing_address_id", agentsNewAddress(t, w, "clear.row")))(t, w)
			},
			Snap: row("clear"),
			Body: b(`{"op":"update","clientId":"{clear}","expectedVersion":1,"client":{"firstName":"Fix","lastName":"Ture",` +
				`"email":"clear@example.com","address":{"line1":" ","country":"gb"}}}`)},
		{Name: "update duplicate email", Fn: fn, Expect: 200,
			Setup: func(t *testing.T, w *World) {
				mine("upda", nil)(t, w)
				mine("updb", nil)(t, w)
			},
			Snap: func(t *testing.T, w *World) string {
				return agentsClientRow(t, w.Vars["upda"]) + agentsClientRow(t, w.Vars["updb"])
			},
			Body: b(`{"op":"update","clientId":"{upda}","expectedVersion":1,"client":{"firstName":"A","lastName":"B","email":"UPDB@example.com"}}`)},

		// ---- bulk tag ----
		{Name: "bulk not a list", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":"x","tag":"vip","add":true}`), Expect: 400},
		{Name: "bulk empty", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":[],"tag":"vip","add":true}`), Expect: 400},
		{Name: "bulk too many", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":[` + strings.Repeat(`"x",`, 100) + `"x"],"tag":"vip","add":true}`), Expect: 400},
		{Name: "bulk bad id", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":["` + agentsSeedClient + `",7],"tag":"vip","add":true}`), Expect: 400},
		{Name: "bulk no tag", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":["` + agentsSeedClient + `"],"tag":" ","add":true}`), Expect: 400},
		{Name: "bulk tag not text", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":["` + agentsSeedClient + `"],"tag":1,"add":true}`), Expect: 400},
		{Name: "bulk tag too long", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":["` + agentsSeedClient + `"],"tag":"` + strings.Repeat("t", 41) + `","add":true}`), Expect: 400},
		{Name: "bulk add not a boolean", Fn: fn, Body: fixed(`{"op":"bulk_tag","clientIds":["` + agentsSeedClient + `"],"tag":"vip","add":1}`), Expect: 400},
		{Name: "bulk add", Fn: fn, Expect: 200,
			Setup: func(t *testing.T, w *World) {
				mine("bulk1", nil)(t, w)
				mine("bulk2", js.O("tags", []string{"vip"}))(t, w)
				mine("bulk3", js.O("tags", []string{"x"}))(t, w)
				full := make([]string, 20)
				for i := range full {
					full[i] = "t" + string(rune('a'+i))
				}
				mine("bulk4", js.O("tags", full))(t, w)
				theirs(t, w)
			},
			Snap: func(t *testing.T, w *World) string {
				out := ""
				for _, k := range []string{"bulk1", "bulk2", "bulk3", "bulk4", "theirs"} {
					out += agentsClientRow(t, w.Vars[k])
				}
				return out + agentsClientRow(t, agentsSeedClient)
			},
			Body: b(`{"op":"bulk_tag","clientIds":["{bulk1}","{bulk2}","{bulk3}","{bulk4}","{theirs}","` + agentsSeedClient + `","{bulk1}"],"tag":" VIP ","add":true}`)},
		{Name: "bulk remove", Fn: fn, Expect: 200,
			Setup: func(t *testing.T, w *World) {
				mine("rm1", js.O("tags", []string{"vip", "x"}))(t, w)
				mine("rm2", js.O("tags", []string{"x"}))(t, w)
			},
			Snap: func(t *testing.T, w *World) string {
				return agentsClientRow(t, w.Vars["rm1"]) + agentsClientRow(t, w.Vars["rm2"])
			},
			Body: b(`{"op":"bulk_tag","clientIds":["{rm1}","{rm2}"],"tag":"Vip","add":false}`)},

		// ---- archive / restore ----
		{Name: "archive bad id", Fn: fn, Body: fixed(`{"op":"archive","clientId":"","expectedVersion":1,"archived":true}`), Expect: 400},
		{Name: "archive no version", Fn: fn, Body: fixed(`{"op":"archive","clientId":"` + agentsSeedClient + `","archived":true}`), Expect: 400},
		{Name: "archive archived not a boolean", Fn: fn, Body: fixed(`{"op":"archive","clientId":"` + agentsSeedClient + `","expectedVersion":1,"archived":"true"}`), Expect: 400},
		{Name: "archive reason not text", Fn: fn, Body: fixed(`{"op":"archive","clientId":"` + agentsSeedClient + `","expectedVersion":1,"archived":true,"reason":5}`), Expect: 400},
		{Name: "archive reason too long", Fn: fn, Body: fixed(`{"op":"archive","clientId":"` + agentsSeedClient + `","expectedVersion":1,"archived":true,"reason":"` + strings.Repeat("r", 501) + `"}`), Expect: 400},
		{Name: "archive the seed advisor's client", Fn: fn, Expect: 404,
			Snap: func(t *testing.T, w *World) string { return agentsClientRow(t, agentsSeedClient) },
			Body: fixed(`{"op":"archive","clientId":"` + agentsSeedClient + `","expectedVersion":1,"archived":true}`)},
		{Name: "archive the other world's client", Fn: fn, Setup: theirs, Snap: row("theirs"), Expect: 404,
			Body: b(`{"op":"archive","clientId":"{theirs}","expectedVersion":1,"archived":true}`)},
		{Name: "archive stale", Fn: fn, Setup: mine("astale", nil), Snap: row("astale"), Expect: 409,
			Body: b(`{"op":"archive","clientId":"{astale}","expectedVersion":3,"archived":true}`)},
		{Name: "archive with a reason", Fn: fn, Setup: mine("arch", nil), Snap: row("arch"), Expect: 200,
			Body: b(`{"op":"archive","clientId":"{arch}","expectedVersion":1,"archived":true,"reason":" Moved abroad "}`)},
		{Name: "archive without a reason", Fn: fn, Setup: mine("arch2", nil), Snap: row("arch2"), Expect: 200,
			Body: b(`{"op":"archive","clientId":"{arch2}","expectedVersion":1,"archived":true,"reason":""}`)},
		{Name: "restore", Fn: fn, Setup: mine("rest", js.O("status", "archived", "archived_at", "2026-01-01T00:00:00Z", "version", 4)),
			Snap: row("rest"), Expect: 200,
			Body: b(`{"op":"archive","clientId":"{rest}","expectedVersion":4,"archived":false,"reason":"Back again"}`)},
		{Name: "archive noop", Fn: fn, Setup: mine("anoop", nil), Snap: row("anoop"), Expect: 200,
			Body: b(`{"op":"archive","clientId":"{anoop}","expectedVersion":1,"archived":false}`)},
	}))
}
