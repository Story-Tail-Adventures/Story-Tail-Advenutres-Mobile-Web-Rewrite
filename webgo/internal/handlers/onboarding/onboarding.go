// Package onboarding serves the first-run wizard: Screen Inventory §2.1.9 to §2.1.14
// (/welcome and /onboarding/...). docs/GO-MIGRATION.md Phase 4.
//
// Six screens, ported from web/app/(onboarding) case for case, copy word for word. The cover
// page and the summary are full-bleed; the four steps between them wear the wizard chrome
// (OnboardingShell): a named-step rail from md, progress bars below it.
//
// THE CURSOR IS THE POINT. platform_user.onboarding_step is what makes an abandoned wizard
// resume where it stopped, and every exit from a step moves it:
//
//	Get started        onboarding-step {step: "profile"}
//	Save & continue    the step's own function with advance: true
//	Skip for now       onboarding-step {step: <the next one>}
//	Skip the tour      onboarding-step {complete: true}   (2.1.9, and 2.1.14's Continue)
//
// Every write goes through a function and never through PostgREST: platform_user, client,
// travel_preference and companion all have SELECT-only RLS, so a browser or server-side
// .update() would match zero rows and return 204 — it would look like it worked and change
// nothing (web/lib/onboarding/api.ts says so at length).
//
// WHAT THE WIZARD NEVER DOES. It takes no passport NUMBER (Data-Model §18.2 wants column
// encryption that is not built, so the expiry — the part that drives the reminder — is all
// that is collected) and it holds nobody: every step is skippable, and a bookkeeping write
// that fails never keeps a traveler on a screen they asked to leave.
//
// NO JAVASCRIPT. Next re-labelled the address fields as you picked a country, hid the notes
// box when you ticked "none", and grew the loyalty repeater in place. Here a form post does
// each of those (§4.9: links and forms first), so the same screens work with scripting off.
// The differences that leaves are listed in the PR.
package onboarding

import (
	"context"
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Specs declares every page this area fills. The server loads them with the rest at startup.
//
// The four screens between the cover page and the summary are built in order, one PR each;
// 2.1.11, 2.1.12, 2.1.13 and 2.1.14 are not here yet, so their routes are still 404 and the
// wizard's rail links only as far as what exists.
var Specs = []page.Spec{welcomeSpec, profileSpec}

// area is the wizard's shared state.
type area struct {
	handlers.Deps
	// off is development with no Supabase: the pages still render for design work, with
	// nothing read and nothing written, as Next's authChecksDisabledForLocalDev did.
	off bool
	now func() time.Time
}

// Mount registers this area's routes. It runs once at startup; templates are taken here, so a
// missing page stops the boot.
func Mount(rt *gate.Router, d handlers.Deps) error {
	a := &area{Deps: d, off: d.Config.AuthChecksDisabledForLocalDev(), now: time.Now}
	for _, mount := range []func(*gate.Router) error{a.mountWelcome, a.mountProfile} {
		if err := mount(rt); err != nil {
			return err
		}
	}
	return nil
}

// enter is what every wizard screen does before it renders: the (onboarding) layout's gate.
// It returns the caller's session and false when it has already answered — somebody who has
// finished, or who is not a traveler at all, has no business in the wizard (an agent has no
// wizard, and 2.1.10 to 2.1.12 all have a second entry point in account settings).
func (a *area) enter(w http.ResponseWriter, r *http.Request) (session.State, bool) {
	st, _ := session.From(r.Context())
	if a.off {
		return st, true
	}
	status := shell.LoadStatus(r.Context(), a.Supa, st.AccessToken, a.Log)
	if d := shell.OnboardingDecision(status); d.Kind == shell.Redirect {
		web.SeeOther(w, r, d.To)
		return st, false
	}
	return st, true
}

// render writes a filled wizard page. Every one of them is personal and none is cached.
func (a *area) render(w http.ResponseWriter, r *http.Request, d *page.Doc, status int) {
	shell.FillOnboarding(d, web.TakeFlash(w, r, a.SecureCookies))
	web.Render(w, a.Log, d, status, web.Private)
}

// call runs an onboarding function with the visitor's own token.
func (a *area) call(ctx context.Context, st session.State, name string, body any) api.Result {
	return a.API.Call(ctx, name, st.AccessToken, api.Input{Method: http.MethodPost, Body: body})
}

// advance moves the cursor and sends the traveler on. The write is best effort on a skip,
// deliberately: if the cursor cannot be written they still reach the next screen, and the
// only cost is that an abandoned wizard resumes one step earlier than it should. Holding
// somebody on a screen they just asked to skip, over bookkeeping, would be the worse failure.
// A lost session is the one exception — that one goes to sign-in.
func (a *area) advance(w http.ResponseWriter, r *http.Request, st session.State, step, to string) {
	if !a.off {
		res := a.call(r.Context(), st, "onboarding-step", stepBody{Step: step})
		if out := web.FromResult(res, ""); out.SignIn {
			web.SeeOther(w, r, web.SignInURL(r))
			return
		}
	}
	web.SeeOther(w, r, to)
}

// stepBody is onboarding-step's body: a cursor value, or complete.
type stepBody struct {
	Step     string `json:"step,omitempty"`
	Complete bool   `json:"complete,omitempty"`
}

// selectOne reads the caller's own single row, or the zero value when there is none. A read
// that fails yields the zero value too, with only the error's kind logged: the wizard's job
// is to collect, and an empty box is recoverable where a 500 on step two is not.
func selectOne[T any](ctx context.Context, a *area, st session.State, table string, q supa.Query, what string) T {
	var zero T
	row, found, err := supa.MaybeOne[T](ctx, a.Supa, st.AccessToken, table, q)
	if err != nil {
		a.Log.Warn("onboarding: prefill read failed", "what", what, "err", err)
		return zero
	}
	if !found {
		return zero
	}
	return row
}

// trimmed is a nullable column as a trimmed string: "" for NULL and for whitespace.
func trimmed(v *string) string {
	if v == nil {
		return ""
	}
	return validate.JSTrim(*v)
}

// selectRows reads the caller's own rows, or none when the read fails.
func selectRows[T any](ctx context.Context, a *area, st session.State, table string, q supa.Query, what string) ([]T, bool) {
	rows, err := supa.Select[T](ctx, a.Supa, st.AccessToken, table, q)
	if err != nil {
		a.Log.Warn("onboarding: read failed", "what", what, "err", err)
		return nil, false
	}
	return rows, true
}
