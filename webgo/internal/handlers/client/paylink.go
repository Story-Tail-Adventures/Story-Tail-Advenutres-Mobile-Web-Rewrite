package client

import (
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/net/idna"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// The pay block: the one place a traveler is shown money to send, and the narrowest piece of
// this area (BRD §10, CLAUDE.md rule 4).
//
// WHAT IT DOES. It shows the advisor's own https link to the supplier's site, labelled with
// that site's HOST, and a button that says "I've paid".
//
// WHAT IT NEVER DOES. It never takes a card number — there is no field and no key for one.
// It never marks a milestone paid: "I've paid" posts a trip MESSAGE for Gyasi to check, and
// nothing else. It never writes a pay link; only the advisor's own screens do that. And
// paid_note never reaches this surface — it is the advisor's note to themselves.
//
// THE HOST IS SHOWN FOR A REASON. A swapped link could send a traveler's money to the wrong
// place, so the page names the site they are about to pay, lower-cased, without `www.`, and
// in PUNYCODE: "аpple.com" with a Cyrillic а renders as xn--80ak6aa92e.com rather than as
// something indistinguishable from the real thing.

// PaySiteName is paySiteName: the host a pay link leads to, or "" when the link is not one
// this surface will show. The rules are the strict ones — https only, a host that is really
// there — because the result is a reassurance, and a reassurance about a link that was not
// checked is worse than none.
func PaySiteName(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	// ToASCII turns a unicode host into its punycode form and refuses one that cannot be
	// encoded; either way nothing that renders as somebody else's domain gets through.
	ascii, err := idna.Lookup.ToASCII(host)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(ascii, "www.")
}

// PayButtonLabel is payButtonLabel: "Pay the deposit", from the milestone's own label.
func PayButtonLabel(label string) string {
	trimmed := strings.TrimSpace(label)
	if trimmed == "" {
		return "Pay"
	}
	return "Pay " + strings.ToLower(trimmed[:1]) + trimmed[1:]
}

// PaidNoteBody is paidNoteBody: what "I've paid" actually sends.
func PaidNoteBody(label, amountText string) string {
	return "I've paid the " + strings.ToLower(strings.TrimSpace(label)) + " (" + amountText + ")."
}

// IsOpenMilestone is isOpenMilestone: the two statuses a traveler can still be paying.
func IsOpenMilestone(status string) bool {
	return status == "scheduled" || status == "overdue"
}

// The pay block's copy (TRIP_DETAIL), word for word.
const (
	payDirect        = "Paid directly to the supplier on their secure site."
	payOpensNewTab   = "(opens the supplier's site in a new tab)"
	iPaid            = "I've paid"
	iPaidThanks      = "Thanks. Gyasi will check and mark it paid."
	iPaidFailed      = "That didn't send. Try again in a moment, or message Gyasi."
	iPaidAlreadyDone = "This one looks taken care of already. Message Gyasi if that's not right."
)

// paidFlash is shown on the page the post returns to.
var paidFlash = web.NewFlash("client.paid.sent", iPaidThanks)

// payBlockSlots are the slots a page carries for one pay block.
func payBlockSlots(prefix string) []string {
	return []string{
		prefix, prefix + "-link", prefix + "-label", prefix + "-site",
		prefix + "-form", prefix + "-milestone", prefix + "-next", prefix + "-paid-label",
	}
}

// filler is the part of a filled page one pay block needs. Both *page.Doc and *page.Row
// satisfy it, so the block fills the same way whether it is the dashboard's one card or one
// row of the trip's payment timeline.
type filler interface {
	Text(slot, text string)
	Attr(slot, name, value string)
	URL(slot, attr, raw string) bool
	PayURL(slot, raw string) bool
	Keep(slot string)
	Remove(slot string)
}

var (
	_ filler = (*page.Doc)(nil)
	_ filler = (*page.Row)(nil)
)

// fillPayBlock fills one pay block, or takes it out of the page when the milestone has no
// link to show or is no longer open. `next` is where the "I've paid" post comes back to.
func fillPayBlock(d filler, prefix string, m Milestone, next string) {
	site := PaySiteName(m.PayURL)
	if site == "" || !IsOpenMilestone(m.Status) {
		d.Remove(prefix)
		return
	}
	d.Keep(prefix)
	// PayURL is the stricter setter: absolute https:// only. A value it refuses leaves the
	// element with no href at all rather than shipping the placeholder.
	if !d.PayURL(prefix+"-link", m.PayURL) {
		d.Remove(prefix)
		return
	}
	d.Text(prefix+"-label", PayButtonLabel(m.Label))
	d.Text(prefix+"-site", site)
	// The trip is in the form's action, so a post cannot name a different one than the
	// block it was pressed in.
	d.URL(prefix+"-form", "action", "/trips/"+m.TripID+"/paid")
	d.Attr(prefix+"-milestone", "value", m.ID)
	d.Attr(prefix+"-next", "value", next)
	// Several blocks can share a page, so the button names its own payment for a screen
	// reader.
	d.Text(prefix+"-paid-label", " ("+m.Label+")")
}

// mountPaid registers the "I've paid" post. It is one route for the whole area: the
// dashboard and the trip's payment tab both show pay blocks, and both post here.
func (a *area) mountPaid(rt *gate.Router) error {
	rt.Protected("POST /trips/{tripId}/paid", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		back := gate.SafeNext(form.Get("next"), "/trips/"+tripID)
		if a.off {
			web.SeeOther(w, r, back)
			return
		}

		// The milestone is read back rather than trusted from the form: the label and the
		// amount in the message have to be the ones on file, and a milestone that has been
		// paid or waived since the page loaded must not send a note saying otherwise.
		rows, err := supa.Select[milestoneRow](r.Context(), a.Supa, v.AccessToken, "payment_milestone",
			supa.Q().Select("id,trip_id,label,amount_cents,paid_cents,currency,status").
				Eq("id", form.Get("milestoneId")).Eq("trip_id", tripID).Limit(1))
		if err != nil || len(rows) == 0 {
			a.Log.Warn("client: paid note milestone read failed", "err", err)
			web.SeeOther(w, r, back)
			return
		}
		m := rows[0]
		if !IsOpenMilestone(m.Status) {
			web.SeeOther(w, r, back)
			return
		}

		open := m.AmountCents - m.PaidCents
		if open <= 0 {
			open = m.AmountCents
		}
		body := PaidNoteBody(m.Label, FormatMoney(open, m.Currency))

		// A trip MESSAGE, and nothing else. The milestone is untouched: only the advisor
		// marks one paid (CLAUDE.md rule 4).
		res := a.API.Call(r.Context(), "trip-message", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body: paidNote{
				// A client-minted UUID v7 makes the retry after a dropped connection safe:
				// the same id cannot post the note twice.
				MessageID: uuid.New(), TripID: tripID, Body: body,
			},
		})
		if out := web.FromResult(res, iPaidFailed); out.SignIn {
			web.SeeOther(w, r, web.SignInURL(r))
			return
		} else if out.OK {
			web.SetFlash(w, paidFlash, a.SecureCookies)
		}
		web.SeeOther(w, r, back)
	}))
	return nil
}

// paidNote is trip-message's body.
type paidNote struct {
	MessageID string `json:"messageId"`
	TripID    string `json:"tripId"`
	Body      string `json:"body"`
}
