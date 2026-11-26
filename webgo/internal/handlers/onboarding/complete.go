package onboarding

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/session"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.14 Onboarding Complete (web/app/(onboarding)/onboarding/complete).

var completeSpec = page.Spec{
	File:   "onboarding/complete.html",
	Layout: shell.Onboarding,
	Slots: []string{
		"title", "sub", "card-trip", "card-trip-title", "card-trip-sub",
		"card-explore-sub", "card-message", "card-message-link", "finish-error",
	},
	Repeats: map[string][]string{"checklist": {"check-mark", "check-label"}},
}

// publicTripCount is TRIPS.length (web/content/public/trips.ts), which the explore card
// counts out loud. complete_test.go reads that file and fails if the two disagree; the Go
// port of the catalogue itself belongs to the public area, not here.
const publicTripCount = 22

// The copy this screen assembles (COMPLETE_TEXT + summary.ts). The invariant sentences are
// in the page file; these are the ones that depend on what the traveler actually saved.
const (
	completeTitleNoName = "That's everything."
	completeSubNoTrip   = "I've saved your profile, how you like to travel, and who travels " +
		"with you. When a trip starts taking shape, it'll show up right here."
	completeSubNothing = "Nothing to save yet, and that's completely fine — I can plan around " +
		"a conversation. Add any of it whenever you like."
	completeError = "We couldn't finish that just now — but everything you entered is saved. " +
		"Try again, or head straight to your dashboard."
	completeCardTripTitle      = "View your upcoming trip"
	completeCardTripEmptyTitle = "Nothing on the calendar yet"
	completeCardTripEmptySub   = "Tell Gyasi where you'd like to go."
)

// completionSummary is what the four reads found.
type completionSummary struct {
	firstName      string
	hasProfile     bool
	hasPreferences bool
	hasCompanions  bool
	trip           *tripRow
}

func (a *area) mountComplete(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(completeSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, s completionSummary, failed bool) {
		d := tmpl.New()
		if s.firstName == "" {
			d.Keep("title")
		} else {
			d.Text("title", "That's everything, "+s.firstName+".")
		}
		d.Text("sub", completionSubtitle(s))

		lines := completionChecklist(s)
		d.Repeat("checklist", len(lines), func(i int, row *page.Row) {
			row.Keep("check-mark")
			row.Class("check-mark", "is-done", lines[i].done)
			row.Text("check-label", lines[i].label)
		})

		// The first card is the highlighted one: the next thing to do.
		if s.trip == nil {
			d.URL("card-trip", "href", "/explore")
			d.Text("card-trip-title", completeCardTripEmptyTitle)
			d.Text("card-trip-sub", completeCardTripEmptySub)
		} else {
			d.URL("card-trip", "href", "/dashboard")
			d.Text("card-trip-title", completeCardTripTitle)
			sub := s.trip.Title
			if when := trimmed(s.trip.StartDate); when != "" {
				sub += " · " + shortDate(when)
			}
			d.Text("card-trip-sub", sub)
		}
		d.Text("card-explore-sub", strconv.Itoa(publicTripCount)+" trips Gyasi plans often")

		if email := a.Config.InquiryEmail; email == "" {
			d.Remove("card-message")
		} else {
			d.Keep("card-message")
			d.URL("card-message-link", "href", "mailto:"+email)
		}

		if failed {
			// Reported with an escape hatch, because what failed is bookkeeping rather than
			// anything they did: being held on a screen that says "that's everything" is the
			// worse outcome, and they would simply meet the wizard again next time.
			d.Keep("finish-error")
		} else {
			d.Remove("finish-error")
		}
		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/complete", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, a.currentSummary(r, st), false)
	}))

	rt.Protected("POST /onboarding/complete", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		if _, ok := web.Form(w, r); !ok {
			return
		}
		if a.off {
			show(w, r, http.StatusServiceUnavailable, a.currentSummary(r, st), true)
			return
		}
		// The same write 2.1.9's "Skip the tour" makes: the cursor clears and
		// onboarding_completed_at is stamped, so the wizard is behind them for good.
		out := web.FromResult(a.call(r.Context(), st, "onboarding-step", stepBody{Complete: true}), completeError)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			show(w, r, out.Status, a.currentSummary(r, st), true)
		default:
			web.SeeOther(w, r, shell.ClientShellRoot)
		}
	}))
	return nil
}

// completionSubtitle ports summary.ts: what was saved, said in a sentence rather than as a
// score. Everything saved reads one way, some of it another, and none of it a third — and
// none of the three makes skipping sound like a failure.
func completionSubtitle(s completionSummary) string {
	all := s.hasProfile && s.hasPreferences && s.hasCompanions
	if all {
		if s.trip != nil {
			return "I've saved your profile, how you like to travel, and who travels with you — " +
				"and your " + s.trip.Title + " trip is linked and waiting."
		}
		return completeSubNoTrip
	}

	var saved []string
	if s.hasProfile {
		saved = append(saved, "your details")
	}
	if s.hasPreferences {
		saved = append(saved, "how you like to travel")
	}
	if s.hasCompanions {
		saved = append(saved, "who travels with you")
	}
	if len(saved) == 0 {
		if s.trip != nil {
			return "Your " + s.trip.Title + " trip is linked and waiting. Everything else can " +
				"wait — nothing here expires, and you can add it any time."
		}
		return completeSubNothing
	}
	list := listOf(saved)
	if s.trip != nil {
		return "I've saved " + list + ", and your " + s.trip.Title + " trip is linked and " +
			"waiting. The rest can wait too — nothing here expires."
	}
	return "I've saved " + list + ". The rest can wait — nothing here expires, and you can " +
		"add it any time."
}

// listOf is "a", "a and b", "a, b and c".
func listOf(parts []string) string {
	if len(parts) == 1 {
		return parts[0]
	}
	return strings.Join(parts[:len(parts)-1], ", ") + " and " + parts[len(parts)-1]
}

type checklistLine struct {
	label string
	done  bool
}

// completionChecklist ports completionChecklist: four lines, each saying in words whether it
// was done, because the tick beside it is decoration.
func completionChecklist(s completionSummary) []checklistLine {
	line := func(done bool, yes, no string) checklistLine {
		if done {
			return checklistLine{label: yes, done: true}
		}
		return checklistLine{label: no}
	}
	trip := checklistLine{label: "No trip linked yet"}
	if s.trip != nil {
		trip = checklistLine{label: "Your trip with Gyasi, linked", done: true}
	}
	return []checklistLine{
		line(s.hasProfile, "Your details", "Your details — skipped, add it any time"),
		line(s.hasPreferences, "How you like to travel", "How you like to travel — skipped, add it any time"),
		line(s.hasCompanions, "Who travels with you", "Who travels with you — skipped, add it any time"),
		trip,
	}
}

// clientSummaryRow is what "has a profile" is read from: anything the traveler actually
// filled in on 2.1.10.
type clientSummaryRow struct {
	FirstName        *string `json:"first_name"`
	PreferredName    *string `json:"preferred_name"`
	Phone            *string `json:"phone"`
	DateOfBirth      *string `json:"date_of_birth"`
	MailingAddressID *string `json:"mailing_address_id"`
}

type idRow struct {
	ID string `json:"id"`
}

func (a *area) currentSummary(r *http.Request, st session.State) completionSummary {
	var s completionSummary
	if a.off {
		return s
	}
	ctx := r.Context()
	client := selectOne[clientSummaryRow](ctx, a, st, "client",
		supa.Q().Select("first_name,preferred_name,phone,date_of_birth,mailing_address_id"), "client")
	name := trimmed(client.PreferredName)
	if name == "" {
		name = trimmed(client.FirstName)
	}
	if name != "New" {
		s.firstName = name
	}
	s.hasProfile = trimmed(client.Phone) != "" || trimmed(client.DateOfBirth) != "" ||
		trimmed(client.MailingAddressID) != ""

	if _, found, err := supa.MaybeOne[idRow](ctx, a.Supa, st.AccessToken, "travel_preference",
		supa.Q().Select("id")); err == nil {
		s.hasPreferences = found
	} else {
		a.Log.Warn("onboarding: completion read failed", "what", "travel_preference", "err", err)
	}

	if rows, err := supa.Select[idRow](ctx, a.Supa, st.AccessToken, "companion",
		supa.Q().Select("id").Is("archived_at", "null").Limit(1)); err == nil {
		s.hasCompanions = len(rows) > 0
	} else {
		a.Log.Warn("onboarding: completion read failed", "what", "companion", "err", err)
	}

	if rows, err := supa.Select[tripRow](ctx, a.Supa, st.AccessToken, "trip",
		supa.Q().Select("title,start_date").Is("archived_at", "null").
			Neq("status", "cancelled").Order("start_date", true).Limit(1)); err == nil && len(rows) > 0 {
		s.trip = &rows[0]
	} else if err != nil {
		a.Log.Warn("onboarding: completion read failed", "what", "trip", "err", err)
	}
	return s
}
