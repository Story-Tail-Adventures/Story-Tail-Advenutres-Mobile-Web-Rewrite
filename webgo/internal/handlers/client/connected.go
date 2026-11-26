package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
)

// Screen 2.5.8 Connected Accounts (web/app/(client)/account/connected).

// ConnectedCopy is CONNECTED, word for word.
var ConnectedCopy = struct {
	Title, Subtitle              string
	Linked, NotLinked            string
	LinkCta, UnlinkCta           string
	LinkDeferred, UnlinkDeferred string
	EmailAccountNote, OAuthNote  string
	SafetyNote                   string
}{
	Title:          "Connected accounts",
	Subtitle:       "How you sign in.",
	Linked:         "Connected",
	NotLinked:      "Not connected",
	LinkCta:        "Link",
	UnlinkCta:      "Unlink",
	LinkDeferred:   "Coming with the next release",
	UnlinkDeferred: "Coming with the next release",
	EmailAccountNote: "You sign in with an email address and password. Linking Google or " +
		"Apple would let you skip the password — that is coming.",
	OAuthNote: "You sign in through the provider above, so there is no password on this " +
		"account. Changing it is done in that account, not here.",
	// Doing real work: it answers the question a disabled Unlink button provokes ("so am I
	// stuck?") and states the thing that is actually true.
	SafetyNote: "Unlinking never deletes anything. Your trips, documents and messages stay " +
		"exactly where they are.",
}

// oauthProviders are the two auth_provider can hold besides email, in the order the screen
// draws them. The artboard's Facebook row is absent: a provider the enum cannot hold is not
// "available", and drawing it as such is a promise nothing keeps.
var oauthProviders = []struct{ id, label string }{
	{"google", "Google"},
	{"apple", "Apple"},
}

var connectedSpec = page.Spec{
	File:   "client/account-connected.html",
	Layout: shell.Client,
	Slots:  []string{"title", "subtitle", "account-note", "safety-note"},
	Repeats: map[string][]string{
		"providers": {"provider-name", "provider-state", "provider-action-wrap", "provider-action"},
	},
}

type authProviderRow struct {
	AuthProvider *string `json:"auth_provider"`
}

func (a *area) mountConnected(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(connectedSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /account/connected", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}

		// A FAILED read is not the same as "no provider". Defaulting to null would draw
		// every row as "Not connected" and tell somebody who signs in with Google that they
		// do not — so a failure leaves the rows unstated and keeps the email note, which is
		// the only one that is safe to say without knowing.
		known := false
		provider := ""
		if !a.off {
			row, found, err := supa.MaybeOne[authProviderRow](r.Context(), a.Supa, v.AccessToken,
				"account", supa.Q().Select("auth_provider"))
			if err != nil {
				a.Log.Warn("client: auth_provider read failed", "err", err)
			} else if found {
				known, provider = true, text(row.AuthProvider)
			}
		}

		d := tmpl.New()
		d.Text("title", ConnectedCopy.Title)
		d.Text("subtitle", ConnectedCopy.Subtitle)
		d.Repeat("providers", len(oauthProviders), func(i int, row *page.Row) {
			p := oauthProviders[i]
			linked := known && provider == p.id
			row.Text("provider-name", p.label)
			state := ConnectedCopy.NotLinked
			cta, reason := ConnectedCopy.LinkCta, ConnectedCopy.LinkDeferred
			if linked {
				state, cta, reason = ConnectedCopy.Linked, ConnectedCopy.UnlinkCta, ConnectedCopy.UnlinkDeferred
			}
			row.Text("provider-state", state)
			row.Text("provider-action", cta)
			row.Attr("provider-action", "title", reason)
			row.Attr("provider-action-wrap", "title", reason)
			row.Keep("provider-action-wrap")
			row.Keep("provider-action")
		})

		note := ConnectedCopy.EmailAccountNote
		if known && provider != "" && provider != "email" {
			note = ConnectedCopy.OAuthNote
		}
		d.Text("account-note", note)
		d.Text("safety-note", ConnectedCopy.SafetyNote)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}
