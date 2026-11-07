//go:build difftest && difftest_agent

package difftest

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/agentsettings"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["agent-settings"] = api.Port{Gate: api.GateUser, Fn: agentsettings.Func}
}

func TestAgentSettings(t *testing.T) {
	deno, goW := NewWorlds(t)
	agentsSettingsBase(t, deno)
	agentsSettingsBase(t, goW)
	other := agentsOther(deno, goW)
	const fn = "agent-settings"
	b, fixed := agentsBody, agentsFixed

	// Every case starts from the advisor as the harness made them, then its own steps.
	with := func(steps ...func(t *testing.T, w *World)) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			agentsResetSettings(t, w)
			for _, s := range steps {
				s(t, w)
			}
		}
	}
	snap := agentsSettingsSnap
	c := func(name, body string, expect int, steps ...func(t *testing.T, w *World)) Case {
		return Case{Name: name, Fn: fn, Setup: with(steps...), Snap: snap, Body: b(body), Expect: expect}
	}
	avatar := func(ext, ct string) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewAvatar(t, w, ext, ct) }
	}
	set := func(table, key, col string, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) {
			id := w.Agent.AgentID
			if col == "user_id" {
				id = w.Agent.PlatformUserID
			}
			agentsMust(t, S.DB.From(table).Eq(col, id).Update(t.Context(), cols, nil))
		}
	}
	prefs := func(t *testing.T, w *World) {
		agentsMust(t, S.DB.From("notification_preference").Insert(t.Context(), js.O("user_id", w.Agent.PlatformUserID,
			"channels", js.O("client_messages", js.O("push", false, "email", true), "quote_requests", js.O("push", true, "email", false),
				"marketing", js.O("email", false))), nil))
	}
	freshTimeOff := func(t *testing.T, w *World) {
		id := uuid.New()
		w.ID("new", id)
		w.Vars["new"] = id
	}
	timeOff := func(key string, from, to int, cols js.Ordered) func(t *testing.T, w *World) {
		return func(t *testing.T, w *World) { agentsNewTimeOff(t, w, w, key, from, to, cols) }
	}
	theirTimeOff := func(t *testing.T, w *World) { agentsNewTimeOff(t, w, other(w), "theirs", 30, 32, nil) }
	day := agentsLocalDay
	png := base64.StdEncoding.EncodeToString(agentsPNG)
	webp := base64.StdEncoding.EncodeToString([]byte("RIFF\x10\x00\x00\x00WEBPVP8 difftest"))
	gif := base64.StdEncoding.EncodeToString([]byte("GIF89a\x01\x00\x01\x00"))
	week := `{"mon":{"start":"09:00","end":"17:30"},"tue":{"start":"09:00","end":"17:00"},"wed":null,` +
		`"thu":{"start":"08:30","end":"24:00"},"fri":{"start":"10:00","end":"16:00"},"sat":null,"sun":null}`
	weekJSON := js.O("mon", js.O("start", "09:00", "end", "17:30"), "tue", js.O("start", "09:00", "end", "17:00"), "wed", nil,
		"thu", js.O("start", "08:30", "end", "24:00"), "fri", js.O("start", "10:00", "end", "16:00"), "sat", nil, "sun", nil)
	old := uuid.NewAt(time.Now().Add(-2 * time.Hour))
	nameOnly := `{"op":"update_profile","displayName":"Diff Agent {tag}"}`

	Run(t, deno, goW, agentsExact([]Case{
		{Name: "GET", Fn: fn, Method: "GET", Expect: 400},
		{Name: "traveler", Fn: fn, Token: func(w *World) string { return w.Traveler.Token }, Body: fixed(`{"op":"update_profile"}`), Expect: 403},
		{Name: "not json", Fn: fn, Body: fixed(`{"op":"update_profile",}`), Expect: 400},
		{Name: "an array", Fn: fn, Body: fixed(`[]`), Expect: 400},
		{Name: "unknown op", Fn: fn, Body: fixed(`{"op":"delete_account"}`), Expect: 400},
		{Name: "no op", Fn: fn, Body: fixed(`{"displayName":"x"}`), Expect: 400},

		// ---- update_profile ----
		c("profile no name", `{"op":"update_profile","displayName":"   "}`, 400),
		c("profile name not text", `{"op":"update_profile","displayName":7}`, 400),
		c("profile name too long", `{"op":"update_profile","displayName":"`+strings.Repeat("n", 81)+`"}`, 400),
		c("profile pronouns too long", `{"op":"update_profile","displayName":"A","pronouns":"`+strings.Repeat("p", 31)+`"}`, 400),
		c("profile phone letters", `{"op":"update_profile","displayName":"A","phone":"call me"}`, 400),
		c("profile phone short", `{"op":"update_profile","displayName":"A","phone":"555-01"}`, 400),
		c("profile bio not text", `{"op":"update_profile","displayName":"A","bio":["x"]}`, 400),
		c("profile links not an object", `{"op":"update_profile","displayName":"A","socialLinks":["x"]}`, 400),
		c("profile unknown network", `{"op":"update_profile","displayName":"A","socialLinks":{"tiktok":"x"}}`, 400),
		c("profile http link", `{"op":"update_profile","displayName":"A","socialLinks":{"website":"http://story-tail.com"}}`, 400),
		c("profile instagram elsewhere", `{"op":"update_profile","displayName":"A","socialLinks":{"instagram":"https://evil.example/story"}}`, 400),
		c("profile linkedin bare site", `{"op":"update_profile","displayName":"A","socialLinks":{"linkedin":"linkedin.com/"}}`, 400),
		c("profile mailto", `{"op":"update_profile","displayName":"A","socialLinks":{"website":"mailto:a@b.c"}}`, 400),
		c("profile", `{"op":"update_profile","displayName":"  Gyasi Story ","pronouns":"he/him","phone":"+1 (555) 010-0100",`+
			`"bio":" I plan trips <carefully> & \"slowly\". ","socialLinks":{"website":"story-tail.com/about","instagram":"@story.tail",`+
			`"facebook":"https://www.facebook.com/storytail","linkedin":null}}`, 200),
		c("profile unchanged", nameOnly, 200),
		c("profile clears", `{"op":"update_profile","displayName":"Diff Agent {tag}","pronouns":"","phone":null,"bio":"  ","socialLinks":{}}`, 200,
			set("agent", "", "id", js.O("pronouns", "she/her", "phone", "555-555-0100", "bio", "Hi", "social_links", js.O("website", "https://a.example")))),

		// ---- the photo ----
		c("avatar missing", `{"op":"set_avatar"}`, 400),
		c("avatar empty", `{"op":"set_avatar","image":""}`, 400),
		c("avatar not base64", `{"op":"set_avatar","image":"not*base64"}`, 400),
		c("avatar a gif", `{"op":"set_avatar","image":"`+gif+`"}`, 400),
		c("avatar too large", `{"op":"set_avatar","image":"`+strings.Repeat("A", 1398112)+`"}`, 400),
		c("avatar", `{"op":"set_avatar","image":"`+png+`","contentType":"image/gif"}`, 200),
		c("avatar replaces the old one", `{"op":"set_avatar","image":"`+webp+`"}`, 200, avatar("jpg", "image/jpeg")),
		c("avatar from outside the folder stays", `{"op":"set_avatar","image":"`+png+`"}`, 200,
			set("agent", "", "id", js.O("avatar_url", "https://legacy.example/me.png"))),
		c("remove avatar", `{"op":"remove_avatar","image":"`+png+`"}`, 200, avatar("png", "image/png")),
		c("remove no avatar", `{"op":"remove_avatar"}`, 200),

		// ---- availability ----
		c("availability no zone", `{"op":"update_availability","weeklySchedule":`+week+`,"responseTimeHours":4}`, 400),
		c("availability zone abroad", `{"op":"update_availability","timeZone":"Europe/Paris","weeklySchedule":`+week+`,"responseTimeHours":4}`, 400),
		c("availability no week", `{"op":"update_availability","timeZone":"America/Denver","responseTimeHours":4}`, 400),
		c("availability a day missing", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":{"mon":null},"responseTimeHours":4}`, 400),
		c("availability a day not hours", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":`+
			strings.Replace(week, `"wed":null`, `"wed":{"start":"09:00"}`, 1)+`,"responseTimeHours":4}`, 400),
		c("availability quarter hours", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":`+
			strings.Replace(week, `"wed":null`, `"wed":{"start":"09:15","end":"17:00"}`, 1)+`,"responseTimeHours":4}`, 400),
		c("availability ends before it starts", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":`+
			strings.Replace(week, `"wed":null`, `"wed":{"start":"17:00","end":"09:00"}`, 1)+`,"responseTimeHours":4}`, 400),
		c("availability reply time", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":`+week+`,"responseTimeHours":"4"}`, 400),
		c("availability", `{"op":"update_availability","timeZone":"America/Denver","weeklySchedule":`+week+`,"responseTimeHours":48}`, 200),
		c("availability unchanged", `{"op":"update_availability","timeZone":"America/Chicago","weeklySchedule":`+week+`,"responseTimeHours":12}`, 200,
			set("agent_availability", "", "agent_id", js.O("weekly_schedule", weekJSON, "response_time_hours", 12))),

		// ---- time away ----
		c("time off bad id", `{"op":"save_time_off","timeOffId":"x","startsOn":"`+day(5)+`","endsOn":"`+day(6)+`"}`, 400),
		c("time off new with an old id", `{"op":"save_time_off","timeOffId":"`+old+`","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(6)+`"}`, 400),
		c("time off no start", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"endsOn":"`+day(6)+`"}`, 400, freshTimeOff),
		c("time off not a real date", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"2027-02-29"}`, 400, freshTimeOff),
		c("time off backwards", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(6)+`","endsOn":"`+day(5)+`"}`, 400, freshTimeOff),
		c("time off over a year", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(372)+`"}`, 400, freshTimeOff),
		c("time off reply switch not a boolean", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(6)+`","autoReplyEnabled":"on"}`, 400, freshTimeOff),
		c("time off reply with no words", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(6)+`","autoReplyEnabled":true,"autoReplyText":"  "}`, 400, freshTimeOff),
		c("time off reply unknown field", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(6)+`","autoReplyText":"Back {{ name }}"}`, 400, freshTimeOff),
		c("time off label too long", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(6)+`","label":"`+strings.Repeat("l", 81)+`"}`, 400, freshTimeOff),
		c("time off", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(5)+`","endsOn":"`+day(9)+`",`+
			`"label":" Family ","autoReplyEnabled":true,"autoReplyText":" Back on {{ return_date }}, rested. "}`, 200, freshTimeOff),
		c("time off starting today", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(0)+`","endsOn":"`+day(0)+`"}`, 200, freshTimeOff),
		c("time off in the past", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(-1)+`","endsOn":"`+day(3)+`"}`, 400, freshTimeOff),
		c("time off overlaps", `{"op":"save_time_off","timeOffId":"{new}","isNew":true,"startsOn":"`+day(8)+`","endsOn":"`+day(12)+`"}`, 409,
			freshTimeOff, timeOff("block", 10, 14, nil)),
		c("time off edit", `{"op":"save_time_off","timeOffId":"{block}","startsOn":"`+day(11)+`","endsOn":"`+day(15)+`","label":"Beach"}`, 200,
			timeOff("block", 10, 14, nil)),
		c("time off edit unchanged", `{"op":"save_time_off","timeOffId":"{block}","isNew":false,"startsOn":"`+day(10)+`","endsOn":"`+day(14)+`","label":"Fixture trip"}`, 200,
			timeOff("block", 10, 14, nil)),
		c("time off edit into another", `{"op":"save_time_off","timeOffId":"{block}","startsOn":"`+day(10)+`","endsOn":"`+day(21)+`"}`, 409,
			timeOff("block", 10, 14, nil), timeOff("later", 20, 22, nil)),
		c("time off edit one that started", `{"op":"save_time_off","timeOffId":"{block}","startsOn":"`+day(1)+`","endsOn":"`+day(4)+`"}`, 409,
			timeOff("block", -2, 3, nil)),
		c("time off edit one that doesn't exist", `{"op":"save_time_off","timeOffId":"{new}","startsOn":"`+day(5)+`","endsOn":"`+day(6)+`"}`, 404, freshTimeOff),
		c("time off edit the other world's", `{"op":"save_time_off","timeOffId":"{theirs}","startsOn":"`+day(30)+`","endsOn":"`+day(31)+`"}`, 404, theirTimeOff),
		c("end time off bad id", `{"op":"end_time_off","timeOffId":7}`, 400),
		c("end time off upcoming", `{"op":"end_time_off","timeOffId":"{block}"}`, 200, timeOff("block", 3, 5, js.O("auto_reply_enabled", true, "auto_reply_text", "Away"))),
		c("end time off starting today", `{"op":"end_time_off","timeOffId":"{block}"}`, 200, timeOff("block", 0, 2, nil)),
		c("end time off running", `{"op":"end_time_off","timeOffId":"{block}"}`, 200, timeOff("block", -3, 2, nil)),
		c("end time off over", `{"op":"end_time_off","timeOffId":"{block}"}`, 409, timeOff("block", -6, -2, nil)),
		c("end time off unknown", `{"op":"end_time_off","timeOffId":"{new}"}`, 404, freshTimeOff),
		c("end time off the other world's", `{"op":"end_time_off","timeOffId":"{theirs}"}`, 404, theirTimeOff),

		// ---- notifications ----
		c("notifications a switch missing", `{"op":"update_notifications","clientMessagesPush":true,"clientMessagesEmail":true,"quoteRequestsPush":true}`, 400),
		c("notifications a switch as text", `{"op":"update_notifications","clientMessagesPush":"true","clientMessagesEmail":true,"quoteRequestsPush":true,"quoteRequestsEmail":true}`, 400),
		c("notifications", `{"op":"update_notifications","clientMessagesPush":false,"clientMessagesEmail":false,"quoteRequestsPush":true,"quoteRequestsEmail":true}`, 200),
		c("notifications keep other categories", `{"op":"update_notifications","clientMessagesPush":true,"clientMessagesEmail":true,"quoteRequestsPush":true,"quoteRequestsEmail":false}`, 200, prefs),
		c("notifications unchanged", `{"op":"update_notifications","clientMessagesPush":false,"clientMessagesEmail":true,"quoteRequestsPush":true,"quoteRequestsEmail":false}`, 200, prefs),

		// ---- signature ----
		c("signature not text", `{"op":"update_signature","signature":5}`, 400),
		c("signature too long", `{"op":"update_signature","signature":"`+strings.Repeat("s", 501)+`"}`, 400),
		c("signature too many lines", `{"op":"update_signature","signature":"`+strings.Repeat(`a\n`, 8)+`b"}`, 400),
		c("signature unknown field", `{"op":"update_signature","signature":"{{ agent.name }} {{agent.title}} {{x}}"}`, 400),
		c("signature", `{"op":"update_signature","signature":"\r\n\n  {{agent.name}}  \r\nStory-Tail <Adventures> & co\n{{ agent.phone }}\n\n"}`, 200),
		c("signature empty", `{"op":"update_signature","signature":" \n "}`, 200, set("agent", "", "id", js.O("email_signature", "Old one"))),
		c("signature the default", `{"op":"update_signature","signature":"{{agent.name}}, Travel Advisor\n{{agent.phone}} `+"\U000000b7"+
			` {{agent.email}}\nadventures.story-tail.com\n\nMaking travel an adventure"}`, 200, set("agent", "", "id", js.O("email_signature", "Old one"))),
		c("signature unchanged", `{"op":"update_signature"}`, 200),
	}))
}
