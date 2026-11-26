package leadmessage

import (
	"io"
	"log/slog"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// The branches that answer before the database: the method, the body, the bot checks and
// the field checks. (The rest is proven against Deno in difftest/leads_test.go.)
func TestBeforeTheDatabase(t *testing.T) {
	now := time.Date(2026, 11, 6, 12, 0, 0, 0, time.UTC)
	d := &edge.Deps{Now: func() time.Time { return now }, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Env: func(string) string { return "" }}
	long := strconv.FormatInt(now.Add(-time.Minute).UnixMilli(), 10)
	cases := []struct {
		name, method, body string
		status             int
		detail             string
	}{
		{"GET", "GET", "", 400, "Use POST."},
		{"not an object", "POST", `[1]`, 400, "Send a JSON object."},
		{"no startedAt", "POST", `{}`, 400, "Send startedAt, the moment the form was drawn."},
		{"honeypot", "POST", `{"website":"x","startedAt":` + long + `}`, 200, ""},
		{"too fast", "POST", `{"startedAt":` + strconv.FormatInt(now.UnixMilli()-500, 10) + `}`, 200, ""},
		{"no first name", "POST", `{"startedAt":` + long + `,"email":"a@b.co","message":"hi"}`, 400, ""},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, "/", strings.NewReader(c.body))
		reply, err := Func(d, r)
		if c.status == 200 {
			b, _ := js.Marshal(reply.Body)
			if err != nil || string(b) != `{"ok":true}` {
				t.Errorf("%s: %v %s", c.name, err, b)
			}
			continue
		}
		p, ok := problem.As(err)
		if !ok || p.Status != c.status || (c.detail != "" && p.Detail != c.detail) {
			t.Errorf("%s: %v", c.name, err)
		}
	}
}
