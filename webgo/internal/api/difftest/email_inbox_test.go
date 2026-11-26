//go:build difftest && difftest_email

package difftest

import (
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/fn/emailinbox"
)

func init() {
	Extra["email-inbox"] = api.Port{Gate: api.GateCron, Fn: emailinbox.Func}
}

// email-inbox. This stack has no IMAP server, and functions.env sets no EMAIL_SMTP_USER or
// EMAIL_IMAP_* (the repo's docs describe no local IMAP server), so both sides take the
// not-configured path: a bare 500 before any connection. The IMAP flow itself is proven by the
// Go unit tests in fn/emailinbox, against go-imap's in-memory server and hand-written hostile
// ones. No rows are written on either side.
func TestEmailInbox(t *testing.T) {
	w := func(name string) *World { return &World{Name: name, Agent: &Actor{}, Traveler: &Actor{}} }
	deno, goW := w("deno"), w("go")
	c := func(name, method string, expect int) Case {
		k := Case{Name: name, Fn: "email-inbox", Method: method, Token: cronToken, Expect: expect, SkipAudit: true}
		if method == "POST" {
			k.Body = func(*World) string { return `{"trigger":"cron"}` }
		}
		return k
	}
	Run(t, deno, goW, []Case{
		c("GET is refused", "GET", 403),
		c("PUT is refused", "PUT", 403),
		c("not configured: a bare 500", "POST", 500),
	})
}
