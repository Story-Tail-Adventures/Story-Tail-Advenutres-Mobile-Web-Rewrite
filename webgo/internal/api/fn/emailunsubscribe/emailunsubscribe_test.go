package emailunsubscribe

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The branches that answer before the database. The rest is proven against Deno in
// difftest/email_unsubscribe_test.go (16 cases).
func TestBeforeTheDatabase(t *testing.T) {
	d := &edge.Deps{}
	cases := []struct {
		name, method, target, ctype, body string
		status                            int
		detail, reply                     string
	}{
		{"GET with no token", "GET", "/", "", "", 200, "", `{"status":"invalid"}`},
		{"GET with a non-token", "GET", "/?t=abc", "", "", 200, "", `{"status":"invalid"}`},
		{"PUT", "PUT", "/?t=abc", "", "", 400, "Use GET or POST.", ""},
		{"a form that is not one-click", "POST", "/", "application/x-www-form-urlencoded", "x=1", 400, "Use the link in the email.", ""},
		{"one-click with no token", "POST", "/", "application/x-www-form-urlencoded", "List-Unsubscribe=One-Click", 200, "", `{"status":"invalid"}`},
		{"JSON that will not parse", "POST", "/", "application/json", "{", 400, "Send JSON.", ""},
		{"JSON without on", "POST", "/", "application/json", `{"token":"x"}`, 400, "Say on: true or false.", ""},
		{"JSON with a bad token", "POST", "/", "application/json", `{"token":"nope","on":true}`, 200, "", `{"status":"invalid"}`},
		{"JSON null (a TypeError in Deno)", "POST", "/", "application/json", `null`, 500, "", ""},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, c.target, strings.NewReader(c.body))
		if c.ctype != "" {
			r.Header.Set("Content-Type", c.ctype)
		}
		reply, err := Func(d, r)
		switch {
		case c.status == 200:
			b, _ := js.Marshal(reply.Body)
			if err != nil || string(b) != c.reply || reply.Header.Get("Cache-Control") != "no-store" {
				t.Errorf("%s: %v %s %v", c.name, err, b, reply)
			}
		case c.status == 500:
			if _, ok := problem.As(err); ok || err == nil {
				t.Errorf("%s: want a bare 500, got %v", c.name, err)
			}
		default:
			p, ok := problem.As(err)
			if !ok || p.Status != c.status || p.Detail != c.detail {
				t.Errorf("%s: %v", c.name, err)
			}
		}
	}
}
