//go:build difftest && difftest_background

package difftest

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/pushdevice"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["push-device"] = api.Port{Gate: api.GateUser, Fn: pushdevice.Func}
}

// push-device: mobile and the web call it with the user's token. Registering only stores an
// address (nothing is sent anywhere), so every path is reachable. Every address carries the
// world's tag, so pushDeviceSnap sees every row a case wrote or moved, whoever owns it.

// Test-only browser keys: base64url of the right shapes, never a real subscription.
const (
	pushP256dh  = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
	pushAuth    = "BTBZMqHH6r4Tts7J_aSIgg"
	pushP256dh2 = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"
	pushAuth2   = "DGv6ra1nlYgDCS1FRnbzlw"
)

func pushDeviceSnap(t *testing.T, w *World) string {
	return S.Rows(t, S.DB.From("push_device").
		Select("id,platform_user_id,platform,fcm_token,web_endpoint,web_p256dh,web_auth,label").
		Or("fcm_token.like.*"+w.Tag+"*,web_endpoint.like.*"+w.Tag+"*").
		Order("platform", true).Order("fcm_token", true).Order("web_endpoint", true))
}

// pushWorld adds what push-device's cases need: a second advisor (who signs in on the first
// one's phone), an archived advisor, and the first advisor signed in with a password only.
func pushWorld(t *testing.T, w *World) {
	t.Helper()
	ctx := context.Background()
	second := S.NewAgent(t, Unique())
	w.label(second, "agent2")
	w.Vars["agent2"] = second.Token

	archived := S.NewAgent(t, Unique())
	w.label(archived, "archived")
	w.Vars["archived"] = archived.Token
	w.Vars["archived.pu"] = archived.PlatformUserID
	if err := S.DB.From("agent").Eq("id", archived.AgentID).Update(ctx, js.O("status", "archived"), nil); err != nil {
		t.Fatal(err)
	}

	// A fresh password sign-in is aal1 even with a verified factor.
	w.Vars["aal1"] = S.signIn(t, w.Agent.Email)

	w.Vars["phone"] = w.ID("phone", "difftest-"+w.Tag+"-phone-one:APA91b_x")
	w.Vars["phone2"] = w.ID("phone2", "difftest-"+w.Tag+"-phone-two:APA91b_y")
	w.Vars["browser"] = w.ID("browser", "https://fcm.googleapis.com/fcm/send/difftest-"+w.Tag+":browser-one")
	w.Vars["archivedPhone"] = w.ID("archivedPhone", "difftest-"+w.Tag+"-archived-phone:APA91b_z")
	tag := w.Tag
	t.Cleanup(func() {
		_ = S.DB.From("push_device").Or("fcm_token.like.*"+tag+"*,web_endpoint.like.*"+tag+"*").Delete(context.Background(), nil)
	})
}

func TestPushDevice(t *testing.T) {
	deno, goW := NewWorlds(t)
	pushWorld(t, deno)
	pushWorld(t, goW)

	q := func(s string) string { return `"` + s + `"` }
	newID := func(label string) func(*testing.T, *World) {
		return func(_ *testing.T, w *World) { w.Vars[label] = w.ID(label, uuid.New()) }
	}
	vars := func(w *World, s string) string {
		for k, v := range w.Vars {
			s = strings.ReplaceAll(s, "{"+k+"}", v)
		}
		return s
	}
	body := func(s string) func(*World) string { return func(w *World) string { return vars(w, s) } }
	as := func(key string) func(*World) string { return func(w *World) string { return w.Vars[key] } }
	traveler := func(w *World) string { return w.Traveler.Token }

	c := func(name, b string, expect int) Case {
		return Case{Name: name, Fn: "push-device", Body: body(b), Expect: expect, Snap: pushDeviceSnap}
	}
	withSetup := func(cs Case, setup func(*testing.T, *World)) Case { cs.Setup = setup; return cs }
	withToken := func(cs Case, tok func(*World) string) Case { cs.Token = tok; return cs }

	web := func(endpoint, p256dh, auth string) string {
		return `"subscription":{"endpoint":` + q(endpoint) + `,"keys":{"p256dh":` + q(p256dh) + `,"auth":` + q(auth) + `}}`
	}
	longLabel := "  Pixel " + strings.Repeat("8", 85) + "  "

	Run(t, deno, goW, []Case{
		// ---- register ----
		withSetup(c("register a phone, the label trimmed and cut to 80",
			`{"op":"register","deviceId":"{dev1}","platform":"android","fcmToken":"{phone}","label":`+q(longLabel)+`}`, 200), newID("dev1")),
		withSetup(c("register a browser",
			`{"op":"register","deviceId":"{dev2}","platform":"web",`+web("{browser}", pushP256dh, pushAuth)+",\"label\":\"Chrome \U000000b7 macOS\"}", 200), newID("dev2")),
		withSetup(c("the same phone again: its first id, its label kept",
			`{"op":"register","deviceId":"{dev3}","platform":"android","fcmToken":"{phone}"}`, 200), newID("dev3")),
		withSetup(c("the same browser with new keys and a null label",
			`{"op":"register","deviceId":"{dev4}","platform":"web",`+web("{browser}", pushP256dh2, pushAuth2)+`,"label":null}`, 200), newID("dev4")),
		withSetup(withToken(c("another advisor signs in on the phone: it moves to them",
			`{"op":"register","deviceId":"{dev5}","platform":"android","fcmToken":"{phone}","label":"Shared phone"}`, 200), as("agent2")), newID("dev5")),
		c("an id another device already has", `{"op":"register","deviceId":"{dev2}","platform":"android","fcmToken":"{phone2}"}`, 400),
		withSetup(c("a second phone", `{"op":"register","deviceId":"{dev6}","platform":"android","fcmToken":"{phone2}","label":""}`, 200), newID("dev6")),

		// ---- register refusals, in the order the function checks ----
		c("no device id", `{"op":"register","platform":"android","fcmToken":"{phone}"}`, 400),
		c("a device id that is a number", `{"op":"register","deviceId":7,"platform":"android"}`, 400),
		c("a v4 device id", `{"op":"register","deviceId":"2f1c7e9a-3b4d-4c5e-8f6a-7b8c9d0e1f2a","platform":"android","fcmToken":"{phone}"}`, 400),
		withSetup(c("a device id from two hours ago", `{"op":"register","deviceId":"{old}","platform":"android","fcmToken":"{phone}"}`, 400),
			func(_ *testing.T, w *World) { w.Vars["old"] = w.ID("old", uuid.NewAt(time.Now().Add(-2*time.Hour))) }),
		withSetup(c("a label that is not text", `{"op":"register","deviceId":"{dev7}","platform":"ios","label":["x"]}`, 400), newID("dev7")),
		withSetup(c("ios", `{"op":"register","deviceId":"{dev7}","platform":"ios","fcmToken":"{phone}"}`, 400), newID("dev7")),
		withSetup(c("no platform", `{"op":"register","deviceId":"{dev7}"}`, 400), newID("dev7")),
		withSetup(c("a browser address off the list", `{"op":"register","deviceId":"{dev7}","platform":"web",`+web("http://10.0.0.1/{tag}", pushP256dh, pushAuth)+`}`, 400),
			func(_ *testing.T, w *World) { w.Vars["dev7"] = w.ID("dev7", uuid.New()); w.Vars["tag"] = w.Tag }),
		withSetup(c("a browser on another port", `{"op":"register","deviceId":"{dev7}","platform":"web",`+web("https://fcm.googleapis.com:8443/{tag}", pushP256dh, pushAuth)+`}`, 400),
			func(_ *testing.T, w *World) { w.Vars["dev7"] = w.ID("dev7", uuid.New()); w.Vars["tag"] = w.Tag }),
		withSetup(c("a browser with no keys", `{"op":"register","deviceId":"{dev7}","platform":"web","subscription":{"endpoint":"{browser}"}}`, 400), newID("dev7")),
		withSetup(c("a browser key too short", `{"op":"register","deviceId":"{dev7}","platform":"web",`+web("{browser}", "short", pushAuth)+`}`, 400), newID("dev7")),
		withSetup(c("a phone token too short", `{"op":"register","deviceId":"{dev7}","platform":"android","fcmToken":"short-token"}`, 400), newID("dev7")),
		withSetup(c("a phone token with a space", `{"op":"register","deviceId":"{dev7}","platform":"android","fcmToken":"difftest token with spaces in it"}`, 400), newID("dev7")),

		// ---- who may register ----
		withSetup(withToken(c("a traveler may not register", `{"op":"register","deviceId":"{dev7}","platform":"android","fcmToken":"{phone2}"}`, 403), traveler), newID("dev7")),
		withSetup(withToken(c("an advisor without their second factor may not", `{"op":"register","deviceId":"{dev7}","platform":"android","fcmToken":"{phone2}"}`, 403), as("aal1")), newID("dev7")),
		withSetup(withToken(c("an archived advisor may not", `{"op":"register","deviceId":"{dev7}","platform":"android","fcmToken":"{archivedPhone}"}`, 403), as("archived")), newID("dev7")),
		// The advisor check comes before the body is read.
		withToken(c("a traveler with a broken register body", `{"op":"register"}`, 403), traveler),

		// ---- unregister ----
		c("the first advisor cannot turn off the phone that moved", `{"op":"unregister","fcmToken":"{phone}"}`, 200),
		withToken(c("the second advisor turns it off", `{"op":"unregister","fcmToken":"{phone}"}`, 200), as("agent2")),
		c("turn the browser off", `{"op":"unregister","endpoint":"{browser}"}`, 200),
		c("turn it off again", `{"op":"unregister","endpoint":"{browser}"}`, 200),
		c("a browser and a phone at once", `{"op":"unregister","endpoint":"{browser}","fcmToken":"{phone2}"}`, 200),
		c("nothing to turn off", `{"op":"unregister"}`, 400),
		c("empty addresses", `{"op":"unregister","endpoint":"","fcmToken":""}`, 400),
		c("addresses that are not text", `{"op":"unregister","endpoint":5,"fcmToken":["x"]}`, 400),
		c("an address over 4096", `{"op":"unregister","endpoint":"`+strings.Repeat("e", 4097)+`"}`, 400),
		c("one too long, one fine", `{"op":"unregister","endpoint":"`+strings.Repeat("e", 4097)+`","fcmToken":"{phone}"}`, 200),
		withToken(c("a traveler may unregister (and has nothing)", `{"op":"unregister","fcmToken":"{phone}"}`, 200), traveler),
		withToken(c("an advisor without their second factor may unregister", `{"op":"unregister","fcmToken":"{phone}"}`, 200), as("aal1")),
		withSetup(withToken(c("an archived advisor can still turn their phone off", `{"op":"unregister","fcmToken":"{archivedPhone}"}`, 200), as("archived")),
			func(t *testing.T, w *World) {
				if err := S.DB.From("push_device").Insert(context.Background(), js.O("id", w.ID("archivedDevice", uuid.New()),
					"platform_user_id", w.Vars["archived.pu"], "platform", "android", "fcm_token", w.Vars["archivedPhone"]), nil); err != nil {
					t.Fatal(err)
				}
			}),

		// ---- the request itself ----
		c("no op", `{}`, 400),
		c("an unknown op", `{"op":"delete"}`, 400),
		c("an op that is not text", `{"op":1}`, 400),
		c("a body that is not an object", `["register"]`, 400),
		c("a body that is not JSON", `{"op":`, 400),
		c("no body", ``, 400),
		{Name: "GET", Fn: "push-device", Method: "GET", Expect: 400, Snap: pushDeviceSnap},
	})
}
