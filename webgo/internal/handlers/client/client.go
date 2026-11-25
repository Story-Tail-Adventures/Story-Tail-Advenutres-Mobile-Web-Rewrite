// Package client serves the traveler's pages: Screen Inventory §2.2 to §2.6 (dashboard,
// trips, itinerary, documents, messages, account). docs/GO-MIGRATION.md Phase 4.
//
// Every route is mounted with rt.Protected and wears the (client) shell. Before any of them
// renders, this package does what app/(client)/layout.tsx does, in the same order:
//
//	LoadStatus          the caller's own platform_user row
//	OnboardingRedirect  an unfinished wizard goes back to it (and the wizard's own layout
//	                    is what stops that being a loop)
//	ClientDecision      an agent goes to their worklist; an admin gets the no-access state
//	initials            from the traveler's own client row, for the avatar
//
// THE TRAVELER NEVER WRITES MONEY. Payment milestones are read-only here: the pay link is
// the advisor's, shown through the https-only setter and labelled with its host so a
// look-alike domain cannot pass as the real one, and "I've paid" posts a trip MESSAGE and
// marks nothing (CLAUDE.md rule 4). There is no card field anywhere on this surface and no
// key for one.
//
// A FAILED READ IS NOT AN EMPTY RESULT. "No trips yet" when the read actually errored is a
// lie to somebody who has six trips, so each loader says which happened and the pages show
// the error state where Next showed its RetryState.
package client

import (
	"net/http"
	"time"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/handlers"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Specs declares every page this area fills.
var Specs = []page.Spec{
	noAccessSpec, dashboardSpec, tripsSpec, tripSpec, itinerarySpec, itineraryDaySpec,
}

// noAccessSpec is the shell's state for an admin, who has no traveler pages at all.
var noAccessSpec = page.Spec{File: "client/no-access.html", Layout: shell.Client}

type area struct {
	handlers.Deps
	// noAccess is rendered in place of any page when the caller is an admin.
	noAccess *page.Template
	// off is development with no Supabase: the pages render with nothing read, as Next's
	// authChecksDisabledForLocalDev did, so the shell can be worked on without a stack.
	off bool
	now func() time.Time
}

// Mount registers this area's routes.
func Mount(rt *gate.Router, d handlers.Deps) error {
	a := &area{Deps: d, off: d.Config.AuthChecksDisabledForLocalDev(), now: time.Now}
	var err error
	if a.noAccess, err = d.Pages.Template(noAccessSpec.File); err != nil {
		return err
	}
	for _, mount := range []func(*gate.Router) error{
		a.mountDashboard, a.mountTrips, a.mountTrip,
		a.mountItinerary, a.mountItineraryDay, a.mountPaid,
	} {
		if err := mount(rt); err != nil {
			return err
		}
	}
	return nil
}

// visitor is the signed-in traveler, and what the shell needs to draw itself.
type visitor struct {
	session.State
	initials string
}

// enter is the (client) layout's gate. ok is false when it has already answered.
func (a *area) enter(w http.ResponseWriter, r *http.Request) (visitor, bool) {
	st, _ := session.From(r.Context())
	v := visitor{State: st}
	if a.off {
		return v, true
	}
	status := shell.LoadStatus(r.Context(), a.Supa, st.AccessToken, a.Log)
	if to := shell.OnboardingRedirect(status); to != "" {
		web.SeeOther(w, r, to)
		return v, false
	}
	switch d := shell.ClientDecision(status); d.Kind {
	case shell.Redirect:
		web.SeeOther(w, r, d.To)
		return v, false
	case shell.Unauthorized:
		// An admin: Story-Tail has no admin area, and neither the traveler's side nor the
		// advisor's worklist is theirs. One page says so, in place of whichever they asked
		// for, rather than every screen growing an empty state for a case that is not empty.
		a.render(w, r, v, a.noAccess.New(), http.StatusForbidden)
		return v, false
	}
	v.initials = a.initials(r, st)
	return v, true
}

// clientNameRow is the traveler's own name, for the avatar.
type clientNameRow struct {
	FirstName     *string `json:"first_name"`
	LastName      *string `json:"last_name"`
	PreferredName *string `json:"preferred_name"`
}

func (a *area) initials(r *http.Request, st session.State) string {
	row, found, err := supa.MaybeOne[clientNameRow](r.Context(), a.Supa, st.AccessToken, "client",
		supa.Q().Select("first_name,last_name,preferred_name"))
	if err != nil || !found {
		if err != nil {
			a.Log.Warn("client: name read failed", "err", err)
		}
		return ""
	}
	first := text(row.PreferredName)
	if first == "" {
		first = text(row.FirstName)
	}
	return shell.InitialsFor(first, text(row.LastName))
}

// render writes a filled traveler page. None of them is ever cached.
func (a *area) render(w http.ResponseWriter, r *http.Request, v visitor, d *page.Doc, status int) {
	shell.FillClient(d, r.URL.Path, shell.Chrome{
		Initials: v.initials,
		Flash:    web.TakeFlash(w, r, a.SecureCookies),
	})
	web.Render(w, a.Log, d, status, web.Private)
}

// today is the date these pages compare against, in UTC.
func (a *area) today() string { return todayISO(a.now()) }
