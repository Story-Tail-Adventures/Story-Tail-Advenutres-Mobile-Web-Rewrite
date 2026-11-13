// Package emailunsubscribe ports supabase/functions/email-unsubscribe: "Stop emailing me
// about messages" (§3.10 Stage 4, Data-Model §12.9, §12.5).
//
// NO SIGN-IN (GateOpen). The token in the link is the credential: 128 random bits, stored
// only as a hash, good for one person's one switch. Mail apps that honour RFC 8058 POST here
// with no Authorization header.
//
//	GET  ?t=<token>                              { status: "on" | "off" | "invalid" }. Changes
//	                                             NOTHING, so a mail scanner that follows links
//	                                             unsubscribes no one.
//	POST ?t=<token>  List-Unsubscribe=One-Click  (RFC 8058) turns it off.
//	POST { token, on: boolean }                  the web page: off, or back on.
//
// Only channels.messages.email changes; each change is audited inside
// email_set_messages_email.
package emailunsubscribe

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api/edge"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/email"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

var oneClick = regexp.MustCompile(`List-Unsubscribe=One-Click`)

// Func is the function.
func Func(d *edge.Deps, r *http.Request) (*edge.Reply, error) {
	ctx := r.Context()
	reply := func(status *string) (*edge.Reply, error) {
		return &edge.Reply{Status: http.StatusOK, Body: js.O("status", status),
			Header: http.Header{"Cache-Control": {"no-store"}}}, nil
	}
	invalid := "invalid"

	if r.Method == http.MethodGet {
		t, present := queryParam(r, "t")
		if !present || !email.IsToken(js.StringValue(t)) {
			return reply(&invalid)
		}
		var status *string
		if err := d.DB.RPC(ctx, "email_unsubscribe_status", js.O("p_token_hash", email.TokenHashParam(t)), &status); err != nil {
			return nil, fmt.Errorf("status read failed: %w", err)
		}
		return reply(status)
	}

	if r.Method != http.MethodPost {
		return nil, problem.BadRequest("Use GET or POST.")
	}

	token := js.NullValue() // searchParams.get answers null when there is no t
	if t, present := queryParam(r, "t"); present {
		token = js.StringValue(t)
	}
	on := false
	raw, _ := edge.Body(r)
	text := js.Slice(js.ValidUTF8(string(raw)), 0, 2000)
	if strings.Contains(r.Header.Get("Content-Type"), "application/json") {
		body, err := js.Parse([]byte(text))
		if err != nil {
			return nil, problem.BadRequest("Send JSON.")
		}
		if body.IsNull() {
			// `body.token` on null threw a TypeError in Deno: a bare 500.
			return nil, errors.New("reading token of null")
		}
		if t := body.Get("token"); !t.IsNullish() {
			token = t
		}
		b, ok := body.Get("on").Bool()
		if !ok {
			return nil, problem.BadRequest("Say on: true or false.")
		}
		on = b
	} else if !oneClick.MatchString(text) {
		// RFC 8058's one-click body is the only form POST this answers.
		return nil, problem.BadRequest("Use the link in the email.")
	}

	if !email.IsToken(token) {
		return reply(&invalid)
	}
	t, _ := token.Str()
	var status *string
	if err := d.DB.RPC(ctx, "email_set_messages_email", js.O("p_token_hash", email.TokenHashParam(t), "p_on", on), &status); err != nil {
		return nil, fmt.Errorf("update failed: %w", err)
	}
	return reply(status)
}

// queryParam is URLSearchParams.get: the first value, and whether the key is there at all.
func queryParam(r *http.Request, key string) (string, bool) {
	v, ok := r.URL.Query()[key]
	if !ok || len(v) == 0 {
		return "", false
	}
	return v[0], true
}
