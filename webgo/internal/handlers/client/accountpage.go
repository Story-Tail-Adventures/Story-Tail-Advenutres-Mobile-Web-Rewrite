package client

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
)

// Screen 2.5.1 Account Overview (web/app/(client)/account).

var accountSpec = page.Spec{
	File:   "client/account.html",
	Layout: shell.Client,
	Slots: []string{
		"initials", "name", "since",
		"notifications", "notifications-label", "notifications-sub",
		"personal", "personal-label", "personal-sub", "personal-off", "personal-off-label", "personal-off-sub",
		"preferences", "preferences-label", "preferences-sub", "preferences-off", "preferences-off-label", "preferences-off-sub",
		"documents", "documents-label", "documents-sub", "documents-off", "documents-off-label", "documents-off-sub",
		"security", "security-label", "security-sub", "security-off", "security-off-label", "security-off-sub",
		"connected", "connected-label", "connected-sub", "connected-off", "connected-off-label", "connected-off-sub",
		"help", "help-label", "help-sub", "help-off", "help-off-label", "help-off-sub",
		"privacy", "privacy-label", "privacy-sub", "privacy-off", "privacy-off-label", "privacy-off-sub",
		"signout-form", "signout",
	},
}

// accountTile is one destination on the hub.
type accountTile struct {
	slot, label, sub string
	// built is false while the destination does not exist yet. The tile is drawn the way
	// the notifications tile is — plainly unavailable, with a reason — rather than linking
	// to a 404.
	built bool
}

func (a *area) mountAccount(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(accountSpec.File)
	if err != nil {
		return err
	}

	rt.Protected("GET /account", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		overview := a.loadAccountOverview(r.Context(), v.AccessToken)

		d := tmpl.New()
		initials := overview.Initials
		if initials == "" {
			initials = v.initials
		}
		d.Text("initials", initials)
		d.Text("name", overview.DisplayName)
		if overview.MemberSince == "" {
			d.Remove("since")
		} else {
			d.Text("since", MemberSince(overview.MemberSince))
		}

		documentsSub := AccountCopy.DocumentsEmptySub
		// A failed count must not render as "0 files" — that is a statement about their
		// documents, and a wrong one. It falls back to the neutral subtitle.
		if overview.FileCount > 0 {
			documentsSub = DocumentsSub(overview.FileCount)
		}

		// Notifications is never a link: notification_preference has RLS with no policy
		// and no row-creation path, so 2.5.6 would read zero rows forever.
		d.Text("notifications-label", AccountCopy.Notifications)
		d.Text("notifications-sub", AccountCopy.ComingSoon)
		d.Keep("notifications")

		for _, tile := range []accountTile{
			{"personal", AccountCopy.Personal, AccountCopy.PersonalSub, false},
			{"preferences", AccountCopy.Preferences, AccountCopy.PreferencesSub, false},
			{"documents", AccountCopy.Documents, documentsSub, true},
			{"security", AccountCopy.Security, AccountCopy.SecuritySub, false},
			{"connected", AccountCopy.Connected, AccountCopy.ConnectedSub, true},
			{"help", AccountCopy.Help, AccountCopy.HelpSub, false},
			{"privacy", AccountCopy.Privacy, AccountCopy.PrivacySub, false},
		} {
			// An anchor cannot have its href taken away, so each tile is drawn twice and
			// one of the two is removed: the link, or the plainly-unavailable twin. A hub
			// that links to a 404 is worse than one that says what is not ready.
			live, off := tile.slot, tile.slot+"-off"
			if !tile.built {
				live, off = off, live
			}
			d.Remove(off)
			d.Keep(live)
			d.Text(live+"-label", tile.label)
			sub := tile.sub
			if !tile.built {
				sub = AccountCopy.ComingSoon
			}
			d.Text(live+"-sub", sub)
		}

		d.Keep("signout-form")
		d.Text("signout", AccountCopy.SignOut)
		a.render(w, r, v, d, http.StatusOK)
	}))
	return nil
}
