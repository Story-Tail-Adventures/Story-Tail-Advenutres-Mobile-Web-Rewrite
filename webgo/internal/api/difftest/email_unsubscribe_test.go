//go:build difftest && difftest_email

package difftest

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/emailunsubscribe"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

func init() {
	Extra["email-unsubscribe"] = api.Port{Gate: api.GateOpen, Fn: emailunsubscribe.Func}
}

// unsubTokens gives the world's traveler two unsubscribe tokens, one live and one expired,
// on one general conversation (a client may have only one open general thread).
func unsubTokens(t *testing.T, w *World) {
	t.Helper()
	ctx := context.Background()
	conv := uuid.New()
	if err := S.DB.From("conversation").Insert(ctx, js.O("id", conv, "client_id", w.Traveler.ClientID,
		"agent_id", w.Agent.AgentID), nil); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = S.DB.From("email_token").Eq("conversation_id", conv).Delete(context.Background(), nil)
		_ = S.DB.From("conversation").Eq("id", conv).Delete(context.Background(), nil)
		_ = S.DB.From("notification_preference").Eq("user_id", w.Traveler.PlatformUserID).Delete(context.Background(), nil)
	})
	for key, exp := range map[string]time.Time{"live": time.Now().Add(24 * time.Hour), "old": time.Now().Add(-time.Hour)} {
		tok := email.NewToken()
		if err := S.DB.From("email_token").Insert(ctx, js.O("token_hash", email.TokenHashParam(tok), "purpose", "unsubscribe",
			"conversation_id", conv, "client_user_id", w.Traveler.PlatformUserID, "expires_at", js.ISOString(exp)), nil); err != nil {
			t.Fatal(err)
		}
		w.Vars["unsub:"+key] = tok
		w.ID("token:"+key, tok)
	}
}

func unsubToken(_ *testing.T, w *World, key string, _ bool) string { return w.Vars["unsub:"+key] }

func prefs(t *testing.T, w *World) string {
	return S.Rows(t, S.DB.From("notification_preference").Select("channels").Eq("user_id", w.Traveler.PlatformUserID))
}

func TestEmailUnsubscribe(t *testing.T) {
	deno, goW := NewWorlds(t)
	unsubTokens(t, deno)
	unsubTokens(t, goW)
	none := func(*World) string { return "" }
	form := func(*World) http.Header {
		return http.Header{"Content-Type": {"application/x-www-form-urlencoded"}}
	}
	jsonH := func(*World) http.Header { return http.Header{"Content-Type": {"application/json"}} }
	tq := func(key string, expired bool) func(w *World) string {
		return func(w *World) string { return "t=" + unsubToken(t, w, key, expired) }
	}
	c := func(name, method string, expect int, q func(*World) string, h func(*World) http.Header, body func(*World) string) Case {
		return Case{Name: name, Fn: "email-unsubscribe", Method: method, Token: none, Expect: expect,
			Query: q, Header: h, Body: body, Snap: func(t *testing.T, w *World) string { return prefs(t, w) }}
	}
	b := func(s string) func(*World) string { return func(*World) string { return s } }
	Run(t, deno, goW, []Case{
		c("GET: no token", "GET", 200, nil, nil, nil),
		c("GET: not a token", "GET", 200, b("t=abc"), nil, nil),
		c("GET: a live token", "GET", 200, tq("live", false), nil, nil),
		c("GET: an expired token", "GET", 200, tq("old", true), nil, nil),
		c("PUT", "PUT", 400, tq("live", false), nil, nil),
		c("POST: a form that is not one-click", "POST", 400, tq("live", false), form, b("x=1")),
		c("POST: one-click turns it off", "POST", 200, tq("live", false), form, b("List-Unsubscribe=One-Click")),
		c("GET: now off", "GET", 200, tq("live", false), nil, nil),
		c("POST JSON: not JSON", "POST", 400, nil, jsonH, b("{")),
		c("POST JSON: null", "POST", 500, nil, jsonH, b("null")),
		c("POST JSON: on missing", "POST", 400, nil, jsonH, func(w *World) string {
			return `{"token":"` + unsubToken(t, w, "live", false) + `"}`
		}),
		c("POST JSON: back on", "POST", 200, nil, jsonH, func(w *World) string {
			return `{"token":"` + unsubToken(t, w, "live", false) + `","on":true}`
		}),
		c("POST JSON: token from the query", "POST", 200, tq("live", false), jsonH, b(`{"token":null,"on":false}`)),
		c("POST JSON: a bad token", "POST", 200, nil, jsonH, b(`{"token":"nope","on":true}`)),
		c("POST JSON: an expired token", "POST", 200, nil, jsonH, func(w *World) string {
			return `{"token":"` + unsubToken(t, w, "old", true) + `","on":false}`
		}),
		c("POST JSON: an array", "POST", 400, tq("live", false), jsonH, b(`[]`)),
	})
}
