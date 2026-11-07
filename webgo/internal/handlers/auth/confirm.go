package auth

import (
	"net/http"
	"regexp"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// /auth/confirm (§3.9 Login Support): where an advisor's emailed link lands, a reset, a
// sign-in link or an invite (web/app/(auth)/auth/confirm).
//
// A PAGE AND A BUTTON, NEVER A GET THAT SPENDS THE TOKEN. Mail scanners (Outlook Safe Links,
// Mimecast, Gmail's preview) open every link in a message; a GET that verified would burn the
// one-time link before the client clicked it. The GET only draws the button; the POST spends
// the hash. Admin-made links are not PKCE, so /auth/callback cannot finish them.
//
// The hash is never logged, echoed into a link or kept: it goes back into the form it came
// in on, and the page sends no Referer and asks not to be indexed.

var confirmSpec = page.Spec{
	File:   "auth/confirm.html",
	Layout: shell.Auth,
	Slots: []string{
		"confirm", "title", "sub", "token-hash", "type", "next", "button",
		"problem", "problem-title", "problem-body",
	},
}

// The link types the advisor tools send (CONFIRM_TYPES), and CONFIRM_TEXT's words for each.
var confirmText = map[string]struct{ title, sub, button string }{
	"recovery":  {"Choose a new password", "One tap and you can set a new password.", "Continue"},
	"magiclink": {"Sign in", "One tap and you're in. No password needed.", "Sign me in"},
	"invite":    {"Welcome to your trips", "One tap opens your plans, messages and travel documents.", "Open my trips"},
}

const (
	confirmFailedTitle = "That link has already been used or has run out"
	confirmFailedBody  = "Links work once, for an hour. Ask your advisor for a new one and you'll be set."
	confirmBadTitle    = "This link isn't complete"
	confirmBadBody     = "Try opening it again from the email. If that doesn't work, ask your advisor for a new one."
)

// tokenHash is GoTrue's hashed_token: lowercase hex.
var tokenHash = regexp.MustCompile(`^[0-9a-f]{32,128}$`)

func isConfirmType(v string) bool { _, ok := confirmText[v]; return ok }

func (a *area) mountConfirm(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(confirmSpec.File)
	if err != nil {
		return err
	}
	headers := func(w http.ResponseWriter) {
		// The URL carries a one-time token hash: never send it on as a referrer.
		w.Header().Set("Referrer-Policy", "no-referrer")
	}

	rt.Public("GET /auth/confirm", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		q := r.URL.Query()
		hash, typ, failed := q.Get("token_hash"), q.Get("type"), q.Get("failed") != ""
		d := tmpl.New()
		if failed || !tokenHash.MatchString(hash) || !isConfirmType(typ) {
			d.Remove("confirm")
			d.Keep("problem")
			if failed {
				d.Text("problem-title", confirmFailedTitle)
				d.Text("problem-body", confirmFailedBody)
			} else {
				d.Keep("problem-title")
				d.Keep("problem-body")
			}
			a.render(w, r, d, http.StatusOK, noIndexNoFollow)
			return
		}
		t := confirmText[typ]
		d.Remove("problem")
		d.Keep("confirm")
		d.Text("title", t.title)
		d.Text("sub", t.sub)
		d.Text("button", t.button)
		d.Attr("token-hash", "value", hash)
		d.Attr("type", "value", typ)
		// Sanitised here as well as on the POST; "" lets the POST pick the type's own default.
		d.Attr("next", "value", gate.SafeNext(q.Get("next"), ""))
		a.render(w, r, d, http.StatusOK, noIndexNoFollow)
	}))

	// A person pressed the button: spend the link.
	rt.Public("POST /auth/confirm", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headers(w)
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		hash, typ := form.Get("token_hash"), form.Get("type")
		fallback := "/dashboard"
		if typ == "recovery" {
			fallback = "/reset-password"
		}
		next := gate.SafeNext(form.Get("next"), fallback)
		if !tokenHash.MatchString(hash) || !isConfirmType(typ) || a.off {
			web.SeeOther(w, r, "/auth/confirm?failed=1")
			return
		}
		tok, err := a.Supa.VerifyTokenHash(r.Context(), hash, typ, session.Who(r))
		if err != nil {
			a.logErr("auth confirm failed", err) // the type is not logged either; code and status say enough
			web.SeeOther(w, r, "/auth/confirm?failed=1")
			return
		}
		a.Sessions.Start(w, tok)
		web.SeeOther(w, r, next)
	}))
	return nil
}
