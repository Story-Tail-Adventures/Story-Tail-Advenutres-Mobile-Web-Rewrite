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
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/validate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.1.13 Connect Existing Trips (web/app/(onboarding)/onboarding/connect).

var connectSpec = page.Spec{
	File:   "onboarding/connect.html",
	Layout: shell.Onboarding,
	Slots: append(chromeSlots(), "linked", "linked-text", "linked-email", "none", "code",
		"code-error", "primary", "connect-form"),
	Repeats: chromeRepeats,
}

// connectFormError is CONNECT_TEXT.formError.
const connectFormError = "Something went wrong connecting your trips. Try again in a " +
	"moment — or message Gyasi and he'll sort it out."

// The primary button's two labels. Next swapped them as you typed; here the label follows
// what was posted, so it reads "Continue" on a first visit and "Connect my trips" after a
// code came back with an error still in the box.
const (
	connectPrimary      = "Connect my trips"
	connectPrimaryEmpty = "Continue"
)

var connectStep = stepIndex("connect")

func (a *area) mountConnect(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(connectSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, status int, st session.State, code, message string) {
		d := tmpl.New()
		fillChrome(d, connectStep, true)
		d.Keep("connect-form")

		trips, email := a.linkedTrips(r, st)
		if len(trips) == 0 {
			d.Remove("linked")
			d.Keep("none")
		} else {
			d.Remove("none")
			d.Keep("linked")
			d.Text("linked-text", linkedSentence(trips))
			if email == "" {
				d.Remove("linked-email")
			} else {
				d.Text("linked-email", "Linked to "+email+".")
			}
		}

		fillInput(d, "code", code, message, true)
		label := connectPrimaryEmpty
		if strings.TrimSpace(code) != "" {
			label = connectPrimary
		}
		// The icon beside the label is its own node, so only the words change.
		d.Text("primary", label)
		d.Keep("primary")

		a.render(w, r, d, status)
	}

	rt.Protected("GET /onboarding/connect", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, http.StatusOK, st, "", "")
	}))

	rt.Protected("POST /onboarding/connect", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		st, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		slug, route := nextStep(connectStep)
		if form.Get("action") == actionSkip {
			a.advance(w, r, st, slug, route)
			return
		}

		code := strings.TrimSpace(form.Get("code"))
		if a.off {
			show(w, r, http.StatusServiceUnavailable, st, code, connectFormError)
			return
		}
		// An empty box is not an error: it means "no code", and the step still advances.
		// The key is left out entirely rather than sent as "", because the function reads an
		// absent code as "nothing to redeem".
		body := connectBody{Advance: true}
		if code != "" {
			body.Code = code
		}
		out := web.FromResult(a.call(r.Context(), st, "onboarding-connect", body), connectFormError)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			show(w, r, out.Status, st, code, out.Message)
		default:
			web.SeeOther(w, r, route)
		}
	}))
	return nil
}

// connectBody is onboarding-connect's body.
type connectBody struct {
	Code    string `json:"code,omitempty"`
	Advance bool   `json:"advance,omitempty"`
}

// tripRow is a trip as this screen and the summary read it.
type tripRow struct {
	Title     string  `json:"title"`
	StartDate *string `json:"start_date"`
}

// linkedTrips are the trips already on this traveler's dashboard, and the address they are
// linked to. RLS decides what comes back: a trip Gyasi started before they signed up is
// theirs as soon as the invite points at them.
func (a *area) linkedTrips(r *http.Request, st session.State) ([]tripRow, string) {
	if a.off {
		return nil, ""
	}
	rows, err := supa.Select[tripRow](r.Context(), a.Supa, st.AccessToken, "trip",
		supa.Q().Select("title,start_date").Is("archived_at", "null").
			Neq("status", "cancelled").Order("start_date", true))
	if err != nil {
		a.Log.Warn("onboarding: linked trips read failed", "err", err)
		return nil, st.User.Email
	}
	return rows, st.User.Email
}

// linkedSentence is matchedOne or matchedMany.
func linkedSentence(trips []tripRow) string {
	if len(trips) == 1 {
		return "Already linked · " + trips[0].Title + " — " + tripWhen(trips[0]) +
			". I started this one before you signed up, and it's waiting on your dashboard."
	}
	titles := make([]string, len(trips))
	for i, t := range trips {
		titles[i] = t.Title
	}
	return "Already linked · " + strconv.Itoa(len(trips)) + " trips are on your dashboard: " +
		strings.Join(titles, ", ") + ". I started these before you signed up."
}

// tripWhen is the trip's start as "3 Apr 2027", or the phrase for a trip with no dates yet.
func tripWhen(t tripRow) string {
	start := trimmed(t.StartDate)
	if start == "" || !validate.IsRealDate(start) {
		return "dates to come"
	}
	return shortDate(start)
}
