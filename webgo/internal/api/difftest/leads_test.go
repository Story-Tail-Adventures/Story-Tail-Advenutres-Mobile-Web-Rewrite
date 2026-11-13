//go:build difftest && difftest_leads

package difftest

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentlead"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/leadmessage"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
)

func init() {
	Extra["lead-message"] = api.Port{Gate: api.GateOpen, Fn: leadmessage.Func}
	Extra["agent-lead"] = api.Port{Gate: api.GateUser, Fn: agentlead.Func}
}

var (
	ipSeq    int
	runStamp = time.Now().UnixMilli() / 1000
)

// visitor gives each world its own address for a case, as Deno saw it (the web server's form
// key beside the forwarded address) and as the Go door sees it (Cloudflare's header).
func visitor(w *World, key string) http.Header {
	ip, ok := w.Vars["ip:"+key]
	if !ok {
		// The throttle remembers an address for an hour, so every run needs addresses no
		// earlier run used: the documentation range, with the run's clock in it.
		ipSeq++
		ip = fmt.Sprintf("2001:db8:%x:%x::%x", runStamp>>16&0xffff, runStamp&0xffff, ipSeq)
		w.Vars["ip:"+key] = ip
	}
	if w.Name == "deno" {
		return http.Header{"X-Sta-Form-Key": {LeadFormKey}, "X-Sta-Client-Ip": {ip}}
	}
	return http.Header{"Cf-Connecting-Ip": {ip}}
}

// leadEmail is a fresh address per world and case, labelled so both worlds compare equal.
func leadEmail(w *World, key string) string {
	if e, ok := w.Vars["email:"+key]; ok {
		return e
	}
	e := "difftest-lead-" + key + "-" + w.Tag + "@example.com"
	w.Vars["email:"+key] = e
	w.ID("email:"+key, e)
	return e
}

func leadRows(t *testing.T, email string) string {
	leads := S.Rows(t, S.DB.From("lead").
		Select("agent_id,client_id,email,first_name,last_name,phone,source,status,already_client,utm_source,utm_medium,utm_campaign,close_reason,close_note,first_contacted_at,converted_at,closed_at").
		Eq("email", email))
	msgs := S.Rows(t, S.DB.From("lead_message").
		Select("body,entered_by_agent,page,about_kind,about_slug,about_label,lead!inner(email)").
		Eq("lead.email", email).Order("created_at", true))
	return leads + " " + msgs
}

func cleanupLeads(t *testing.T, prefix string) {
	t.Cleanup(func() {
		ctx := context.Background()
		var rows []struct {
			ID string `json:"id"`
		}
		_ = S.DB.From("lead").Select("id").Like("email", prefix+"%").Rows(ctx, &rows)
		for _, r := range rows {
			_ = S.DB.From("lead_message").Eq("lead_id", r.ID).Delete(ctx, nil)
			_ = S.DB.From("lead").Eq("id", r.ID).Delete(ctx, nil)
		}
	})
}

func formBody(w *World, key string, extra string) string {
	started := time.Now().Add(-10 * time.Second).UnixMilli()
	return fmt.Sprintf(`{"firstName":"Ada","lastName":"Lovelace","email":%q,"phone":"(312) 555-0142",`+
		`"message":"We would love a quiet week by the sea <in June> & July.","page":"topic","aboutKind":"topic",`+
		`"aboutSlug":"beaches","aboutLabel":"Beach trips","utmSource":"ig","startedAt":%d%s}`,
		leadEmail(w, key), started, extra)
}

func TestLeadMessage(t *testing.T) {
	deno, goW := NewWorlds(t)
	cleanupLeads(t, "difftest-lead-")
	none := func(*World) string { return "" }
	c := func(name, key string, expect int, body func(w *World) string) Case {
		return Case{Name: name, Fn: "lead-message", Token: none, Expect: expect,
			Header: func(w *World) http.Header { return visitor(w, key) }, Body: body,
			Snap: func(t *testing.T, w *World) string { return leadRows(t, leadEmail(w, key)) }}
	}
	card := func() string {
		// Built at run time: the repo refuses a Luhn-valid literal in any source file.
		body := "4" + strings.Repeat("1", 14)
		for d := 0; d <= 9; d++ {
			if luhn(body + fmt.Sprint(d)) {
				return body + fmt.Sprint(d)
			}
		}
		return ""
	}()
	cases := []Case{
		{Name: "GET", Fn: "lead-message", Method: "GET", Token: none, Expect: 400},
		c("not json", "nj", 400, func(*World) string { return `{"firstName":` }),
		c("an array", "arr", 400, func(*World) string { return `[1]` }),
		c("no startedAt", "nostart", 400, func(w *World) string { return `{"email":"` + leadEmail(w, "nostart") + `"}` }),
		c("honeypot filled", "honey", 200, func(w *World) string { return formBody(w, "honey", `,"website":"http://spam"`) }),
		c("honeypot not text", "honey2", 200, func(w *World) string { return formBody(w, "honey2", `,"website":5`) }),
		c("too fast", "fast", 200, func(w *World) string {
			return strings.Replace(formBody(w, "fast", ""), `"startedAt":`, `"startedAt":`+fmt.Sprint(time.Now().UnixMilli())+`,"x":`, 1)
		}),
		c("no first name", "nofirst", 400, func(w *World) string {
			return strings.Replace(formBody(w, "nofirst", ""), `"firstName":"Ada"`, `"firstName":"  "`, 1)
		}),
		c("bad email", "bademail", 400, func(w *World) string {
			return strings.Replace(formBody(w, "bademail", ""), leadEmail(w, "bademail"), "not-an-email", 1)
		}),
		c("card number in the message", "card", 400, func(w *World) string {
			return strings.Replace(formBody(w, "card", ""), "quiet week", "card "+card, 1)
		}),
		c("an unknown page is dropped, not refused", "badpage", 200, func(w *World) string {
			return strings.Replace(formBody(w, "badpage", ""), `"page":"topic"`, `"page":"nowhere"`, 1)
		}),
		c("a new lead", "new", 200, func(w *World) string { return formBody(w, "new", "") }),
		c("a second message joins it", "new", 200, func(w *World) string { return formBody(w, "new", "") }),
		{Name: "an existing client's address", Fn: "lead-message", Token: none, Expect: 200,
			Header: func(w *World) http.Header { return visitor(w, "client") },
			Body: func(w *World) string {
				return strings.Replace(formBody(w, "client", ""), leadEmail(w, "client"), w.Traveler.Email, 1)
			},
			Snap: func(t *testing.T, w *World) string { return leadRows(t, w.Traveler.Email) }},
	}
	// Five sends an hour per address, then 429.
	for i := 1; i <= 6; i++ {
		expect := 200
		if i == 6 {
			expect = 429
		}
		cases = append(cases, c(fmt.Sprintf("throttle send %d", i), "throttle", expect,
			func(w *World) string { return formBody(w, "throttle", "") }))
	}
	Run(t, deno, goW, cases)
}

func luhn(digits string) bool {
	total, double := 0, false
	for i := len(digits) - 1; i >= 0; i-- {
		d := int(digits[i] - '0')
		if double {
			if d *= 2; d > 9 {
				d -= 9
			}
		}
		total += d
		double = !double
	}
	return total%10 == 0
}

// seedLead makes a lead of the world's advisor through the same RPC the function uses.
func seedLead(t *testing.T, w *World, key string) string {
	t.Helper()
	var res struct {
		LeadID string `json:"lead_id"`
	}
	if _, err := S.DB.RPCRow(context.Background(), "agent_lead_create", js.O(
		"p_agent_id", w.Agent.AgentID, "p_first_name", "Seed", "p_last_name", nil,
		"p_email", leadEmail(w, key), "p_phone", nil, "p_source", "email", "p_body", "Seeded for a case.",
	), &res); err != nil {
		t.Fatal(err)
	}
	w.Vars["lead:"+key] = res.LeadID
	return w.ID("lead:"+key, res.LeadID)
}

func TestAgentLead(t *testing.T) {
	deno, goW := NewWorlds(t)
	cleanupLeads(t, "difftest-lead-")
	op := func(name, key string, expect int, body func(w *World) string) Case {
		return Case{Name: name, Fn: "agent-lead", Expect: expect, Body: body,
			Snap: func(t *testing.T, w *World) string { return leadRows(t, leadEmail(w, key)) }}
	}
	withLead := func(name, key string, expect int, body func(w *World, lead string) string) Case {
		cs := op(name, key, expect, func(w *World) string { return body(w, w.Vars["lead:"+key]) })
		cs.Setup = func(t *testing.T, w *World) {
			if w.Vars["lead:"+key] == "" {
				seedLead(t, w, key)
			}
		}
		return cs
	}
	create := func(w *World, key, source string) string {
		return fmt.Sprintf(`{"op":"create","firstName":"Grace","lastName":"Hopper","email":%q,"phone":"+44 20 7946 0958","source":%q,"message":"Called about a <river> cruise & a rail trip."}`,
			leadEmail(w, key), source)
	}
	Run(t, deno, goW, []Case{
		{Name: "a traveler", Fn: "agent-lead", Token: func(w *World) string { return w.Traveler.Token }, Body: func(*World) string { return `{}` }, Expect: 403},
		{Name: "GET", Fn: "agent-lead", Method: "GET", Expect: 400},
		op("not json", "x", 400, func(*World) string { return `nope` }),
		op("bad op", "x", 400, func(*World) string { return `{"op":"archive"}` }),
		op("create: bad source", "c1", 400, func(w *World) string { return create(w, "c1", "fax") }),
		op("create: no message", "c1", 400, func(w *World) string {
			return strings.Replace(create(w, "c1", "phone"), `"message":"Called about a <river> cruise & a rail trip."`, `"message":""`, 1)
		}),
		op("create: new", "c2", 200, func(w *World) string { return create(w, "c2", "phone") }),
		op("create: the same address adds a note", "c2", 200, func(w *World) string { return create(w, "c2", "referral") }),
		{Name: "create: a client's address", Fn: "agent-lead", Expect: 200,
			Body: func(w *World) string {
				return strings.Replace(create(w, "c3", "email"), leadEmail(w, "c3"), w.Traveler.Email, 1)
			}},
		op("not a lead id", "x", 400, func(*World) string { return `{"op":"mark_contacted","leadId":"banana"}` }),
		op("no such lead", "x", 404, func(*World) string {
			return `{"op":"mark_contacted","leadId":"0190a0a0-0000-7000-8000-00000000dead"}`
		}),
		withLead("mark contacted", "l1", 200, func(_ *World, l string) string { return `{"op":"mark_contacted","leadId":"` + l + `"}` }),
		withLead("mark contacted again", "l1", 200, func(_ *World, l string) string { return `{"op":"mark_contacted","leadId":"` + l + `"}` }),
		withLead("close: bad reason", "l1", 400, func(_ *World, l string) string { return `{"op":"close","leadId":"` + l + `","reason":"bored"}` }),
		withLead("close: note not text", "l1", 400, func(_ *World, l string) string {
			return `{"op":"close","leadId":"` + l + `","reason":"no_reply","note":7}`
		}),
		withLead("close", "l1", 200, func(_ *World, l string) string {
			return `{"op":"close","leadId":"` + l + `","reason":"went_elsewhere","note":"  Booked direct.\r\n  "}`
		}),
		withLead("contact a closed lead", "l1", 0, func(_ *World, l string) string { return `{"op":"mark_contacted","leadId":"` + l + `"}` }),
		withLead("reopen", "l1", 200, func(_ *World, l string) string { return `{"op":"reopen","leadId":"` + l + `"}` }),
		withLead("convert: not a client id", "l2", 400, func(_ *World, l string) string {
			return `{"op":"convert","leadId":"` + l + `","clientId":"x"}`
		}),
		withLead("convert: someone else's client", "l2", 404, func(_ *World, l string) string {
			return `{"op":"convert","leadId":"` + l + `","clientId":"0190a0a0-0000-7000-8000-00000000beef"}`
		}),
		withLead("convert", "l2", 200, func(w *World, l string) string {
			return `{"op":"convert","leadId":"` + l + `","clientId":"` + w.Traveler.ClientID + `"}`
		}),
		withLead("delete as spam", "l3", 200, func(_ *World, l string) string { return `{"op":"delete_spam","leadId":"` + l + `"}` }),
		withLead("delete again", "l3", 404, func(_ *World, l string) string { return `{"op":"delete_spam","leadId":"` + l + `"}` }),
	})
}
