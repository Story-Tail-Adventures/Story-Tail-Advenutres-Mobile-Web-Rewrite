package onboarding

import (
	"net/http"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.9 Welcome / First Login (web/app/(onboarding)/welcome).

var welcomeSpec = page.Spec{
	File:   "onboarding/welcome.html",
	Layout: shell.Onboarding,
	Slots:  []string{"greeting", "skip-error", "welcome-actions"},
}

// The two exits, as the two submit buttons post them.
const (
	actionStart = "start"
	actionSkip  = "skip"
)

func (a *area) mountWelcome(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(welcomeSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, name string, skipFailed bool) {
		d := tmpl.New()
		if name == "" {
			// Greeting somebody as nobody in particular, which is better than greeting them
			// by a placeholder. The HTML carries titleNoName, so there is nothing to fill.
			d.Keep("greeting")
		} else {
			d.Text("greeting", "So glad you're here, "+name+".")
		}
		d.Keep("welcome-actions")
		if skipFailed {
			// Reported rather than swallowed: if this silently failed they would be greeted
			// by this screen again on every single sign-in, with no idea why.
			d.Keep("skip-error")
		} else {
			d.Remove("skip-error")
		}
		a.render(w, r, d, status)
	}

	rt.Protected("GET /welcome", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, a.greetableFirstName(r, st), false)
	}))

	rt.Protected("POST /welcome", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		if form.Get("action") == actionSkip {
			// Skipping and finishing are the same write on purpose: Screen Inventory §2.1.9
			// offers skipping as a real choice, not a deferral, and somebody who declines
			// the wizard must not be asked again on every sign-in.
			if !a.off {
				out := web.FromResult(a.call(r.Context(), st, "onboarding-step", stepBody{Complete: true}), "")
				if out.SignIn {
					web.SeeOther(w, r, web.SignInURL(r))
					return
				}
				if !out.OK {
					show(w, r, out.Status, a.greetableFirstName(r, st), true)
					return
				}
			}
			web.SeeOther(w, r, shell.ClientShellRoot)
			return
		}
		// "Get started" sets the cursor to the first step so an abandoned wizard resumes
		// there rather than back here. Best effort: holding somebody on this page over a
		// bookkeeping write would be the worse failure, and here is where they already are.
		slug, route := nextStep(0)
		a.advance(w, r, st, slug, route)
	}))
	return nil
}

// clientNameRow is the traveler's own name, for the greeting.
type clientNameRow struct {
	FirstName     *string `json:"first_name"`
	PreferredName *string `json:"preferred_name"`
}

// greetableFirstName is the name to greet them by, or "".
//
// handle_new_user() falls back to the literal 'New' when a sign-up carried no name at all —
// a social provider that sends none, which Apple does on every authorization after the
// first. Greeting somebody as "New" is worse than greeting them as nobody in particular, so
// the placeholder is treated as absent. preferred_name wins: if a traveler has told Gyasi
// they go by something, this is the screen that should use it.
func (a *area) greetableFirstName(r *http.Request, st session.State) string {
	if a.off {
		return ""
	}
	row := selectOne[clientNameRow](r.Context(), a, st, "client",
		supa.Q().Select("first_name,preferred_name"), "client name")
	name := trimmed(row.PreferredName)
	if name == "" {
		name = trimmed(row.FirstName)
	}
	if name == "New" {
		return ""
	}
	return name
}
