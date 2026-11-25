package client

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/api"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/gate"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/supa"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// Screen 2.2.7 Past Trip / Memories (web/app/(client)/trips/[tripId]/memories).
//
// Where a completed trip lands. The reflection is the traveler's own words: saved as a
// draft, or sent to Gyasi. Neither publishes anything — the copy says so, and the
// `testimonial` function is what enforces it.

var memoriesSpec = page.Spec{
	File:   "client/memories.html",
	Layout: shell.Client,
	Slots: []string{
		"not-found", "body", "hero", "hero-photo", "hero-title", "hero-meta",
		"note", "photos-heading", "photos-empty", "photos",
		"reflection-heading", "reflection-body", "reflection-error", "reflection-error-text",
		"reflection-form", "reflection-id", "reflection-text", "reflection-sent",
		"link-documents", "link-itinerary", "again-cta",
	},
	Repeats: map[string][]string{
		"photos":   {"photo-form", "photo-next", "photo-button", "photo-name"},
		"snapshot": {"snap-label", "snap-value"},
	},
}

// The copy this screen assembles (MEMORIES_MESSAGES).
const (
	memNoteScript     = "You took the rest. That matters."
	memSaveFailed     = "That did not save. Your words are still here, so try again in a moment."
	memSavedFlashText = "Saved. Come back to it whenever."
)

var memSavedFlash = web.NewFlash("client.reflection.saved", memSavedFlashText)

// testimonialRow is the traveler's reflection on one trip.
type testimonialRow struct {
	ID     string  `json:"id"`
	Body   *string `json:"body"`
	Rating *int    `json:"rating"`
	Status string  `json:"status"`
}

func (a *area) mountMemories(rt *gate.Router) error {
	tmpl, err := a.Pages.Template(memoriesSpec.File)
	if err != nil {
		return err
	}

	show := func(w http.ResponseWriter, r *http.Request, v visitor, tripID string, draft, errMsg string, status int) {
		d := tmpl.New()
		detail, found, err := a.loadTripDetail(r.Context(), v.AccessToken, tripID, a.today())
		if err != nil || !found {
			if err != nil {
				a.Log.Warn("client: memories read failed", "err", err)
				status = http.StatusServiceUnavailable
			} else {
				status = http.StatusNotFound
			}
			d.Keep("not-found")
			d.Remove("body")
			a.render(w, r, v, d, status)
			return
		}
		t := detail.Trip
		d.Remove("not-found")
		d.Keep("body")
		d.Keep("hero")
		photo := PhotoForTrip(t.ID, t.TripType, t.Destinations)
		d.URL("hero-photo", "src", PhotoURL(photo, detailHeroWidth))
		d.Attr("hero-photo", "alt", "")
		d.Text("hero-title", t.Title)
		meta := FormatTripDates(t.StartDate, t.EndDate)
		if len(t.Destinations) > 0 && t.Destinations[0] != "" {
			meta += " · " + t.Destinations[0]
		}
		d.Text("hero-meta", meta)

		// Gyasi's closing note if he wrote one, his introduction if not, and the house line
		// if neither — the screen is about what the trip was, so it always says something.
		note := detail.ClosingNote
		if note == "" {
			note = detail.IntroNote
		}
		if note == "" {
			note = memNoteScript
		}
		d.Text("note", note)

		photos, err := a.loadTripDocuments(r.Context(), v.AccessToken, tripID)
		if err != nil {
			a.Log.Warn("client: memories photos read failed", "err", err)
		}
		var images []Document
		for _, doc := range photos {
			if doc.Kind == "photo" {
				images = append(images, doc)
			}
		}
		d.Text("photos-heading", "Your photos · "+strconv.Itoa(len(images)))
		if len(images) == 0 {
			d.Keep("photos-empty")
			d.Remove("photos")
		} else {
			d.Remove("photos-empty")
			d.Keep("photos")
			d.Repeat("photos", len(images), func(i int, row *page.Row) {
				row.URL("photo-form", "action", "/documents/"+images[i].ID+"/open")
				row.Attr("photo-next", "value", "/trips/"+tripID+"/memories")
				row.Keep("photo-next")
				row.Keep("photo-button")
				row.Attr("photo-button", "aria-label", "Open "+images[i].Filename)
				row.Text("photo-name", images[i].Filename)
			})
		}

		rows := [][2]string{}
		if nights, ok := NightsBetween(t.StartDate, t.EndDate); ok {
			rows = append(rows, [2]string{"Nights", plural(nights, "1 night", "nights")})
		}
		rows = append(rows,
			[2]string{"Travelers", plural(t.TravelerCount, "1 traveler", "travelers")},
			[2]string{"Total value", FormatMoney(t.TotalValueCents, t.Currency) + " all-in"},
		)
		d.Repeat("snapshot", len(rows), func(i int, row *page.Row) {
			row.Text("snap-label", rows[i][0])
			row.Text("snap-value", rows[i][1])
		})

		if detail.ItineraryReady {
			d.URL("link-itinerary", "href", "/trips/"+tripID+"/itinerary")
		} else {
			d.Remove("link-itinerary")
		}
		d.URL("link-documents", "href", "/trips/"+tripID+"/documents")
		d.URL("again-cta", "href", "/trips/"+tripID+"/messages")

		// The reflection: the form while it is a draft, the thank-you once it is sent.
		reflection, found, err := supa.MaybeOne[testimonialRow](r.Context(), a.Supa, v.AccessToken,
			"testimonial", supa.Q().Select("id,body,rating,status").Eq("trip_id", tripID))
		if err != nil {
			a.Log.Warn("client: reflection read failed", "err", err)
		}
		sent := found && reflection.Status != "draft"
		if sent {
			d.Keep("reflection-sent")
			d.Remove("reflection-form")
			d.Remove("reflection-error")
			d.Remove("reflection-heading")
			d.Remove("reflection-body")
		} else {
			d.Remove("reflection-sent")
			d.Keep("reflection-form")
			d.Keep("reflection-heading")
			d.Keep("reflection-body")
			d.URL("reflection-form", "action", "/trips/"+tripID+"/memories")
			id := ""
			if found {
				id = reflection.ID
			}
			d.Attr("reflection-id", "value", id)
			d.Keep("reflection-id")
			// What they typed wins over what is stored: a refused save must not throw away
			// the words it refused.
			body := draft
			if body == "" && found {
				body = text(reflection.Body)
			}
			d.Text("reflection-text", body)
			if errMsg == "" {
				d.Remove("reflection-error")
			} else {
				d.Keep("reflection-error")
				d.Text("reflection-error-text", errMsg)
			}
		}
		a.render(w, r, v, d, status)
	}

	rt.Protected("GET /trips/{tripId}/memories", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		show(w, r, v, r.PathValue("tripId"), "", "", http.StatusOK)
	}))

	rt.Protected("POST /trips/{tripId}/memories", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		v, ok := a.enter(w, r)
		if !ok {
			return
		}
		form, ok := web.Form(w, r)
		if !ok {
			return
		}
		tripID := r.PathValue("tripId")
		body := strings.TrimSpace(form.Get("body"))
		if body == "" {
			// Nothing typed is not an error: the page comes back as it was.
			show(w, r, v, tripID, "", "", http.StatusOK)
			return
		}
		if a.off {
			show(w, r, v, tripID, body, memSaveFailed, http.StatusServiceUnavailable)
			return
		}

		id := form.Get("testimonialId")
		if id == "" {
			// A client-minted UUID v7, so a retry after a dropped connection edits the same
			// reflection rather than leaving two.
			id = uuid.New()
		}
		res := a.API.Call(r.Context(), "testimonial", v.AccessToken, api.Input{
			Method: http.MethodPost,
			Body: reflectionBody{
				TestimonialID: id, TripID: tripID, Body: body,
				Submit: form.Get("intent") == "submit",
			},
		})
		out := web.FromResult(res, memSaveFailed)
		switch {
		case out.SignIn:
			web.SeeOther(w, r, web.SignInURL(r))
		case !out.OK:
			// The screen's own sentence for an outage, not the shared one: the words are
			// still in the box, and "your words are still here" is what the traveler needs
			// to read. A rejection keeps the function's own `detail`, as everywhere else.
			msg := out.Message
			if out.Status == http.StatusServiceUnavailable {
				msg = memSaveFailed
			}
			show(w, r, v, tripID, body, msg, out.Status)
		default:
			web.SetFlash(w, memSavedFlash, a.SecureCookies)
			web.SeeOther(w, r, "/trips/"+tripID+"/memories")
		}
	}))
	return nil
}

// reflectionBody is the testimonial function's body.
type reflectionBody struct {
	TestimonialID string `json:"testimonialId"`
	TripID        string `json:"tripId"`
	Body          string `json:"body"`
	Submit        bool   `json:"submit"`
}
