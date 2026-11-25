package money

import (
	"errors"
	"mime"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.12's writes, all through `agent-settings`, which audits each one in its own SQL
// transaction. The Edge Function decides; these only check what the page can check without a
// round trip, carry the form across, and put the refusal back on the field it belongs to.

var (
	flashSettingsSaved = web.NewFlash("agent.settings.saved", copySettingsSaved)
	flashPhotoSaved    = web.NewFlash("agent.settings.photo-saved", copyPhotoSaved)
	flashPhotoRemoved  = web.NewFlash("agent.settings.photo-removed", copyPhotoRemoved)
)

// settingsOps maps a form's op to the tab it belongs to, so an op cannot be posted from one
// tab and re-render another.
var settingsOps = map[string]string{
	"update_profile":       "profile",
	"set_avatar":           "profile",
	"remove_avatar":        "profile",
	"update_availability":  "availability",
	"save_time_off":        "availability",
	"end_time_off":         "availability",
	"update_notifications": "notifications",
	"update_signature":     "signature",
}

// maxAvatarPost caps the photo's own form. The prepared JPEG is 400x400, which the Edge
// Function accepts up to 1 MiB DECODED; base64 is a third larger again, and the multipart
// wrapper adds a little. web.MaxFormBytes is 64 KiB — right for a form of text fields, and
// about 46 KB of JPEG once base64 and urlencoding have had their share, which a detailed
// 400x400 photo passes easily. So the photo posts as multipart with a cap of its own.
const maxAvatarPost = 2 << 20

// settingsForm reads the posted form. Everything on these four tabs is urlencoded text
// except the photo, which carries a base64 image and needs a cap web.Form cannot give it.
func settingsForm(w http.ResponseWriter, r *http.Request) (url.Values, bool) {
	ct, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || ct != "multipart/form-data" {
		return web.Form(w, r)
	}
	form, err := web.ParseMultipart(w, r, maxAvatarPost)
	if err != nil {
		var formErr *web.FormError
		status := http.StatusBadRequest
		if errors.As(err, &formErr) {
			status = formErr.Status
		}
		web.Error(w, status)
		return nil, false
	}
	defer func() { _ = form.RemoveAll() }()
	// Values only: the photo arrives as a field, not a file, because the browser made it.
	return url.Values(form.Value), true
}

func (a *app) saveSettings(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	form, ok := settingsForm(w, r)
	if !ok {
		return
	}
	op := form.Get("op")
	tab, known := settingsOps[op]
	if !known {
		// Not a form this page draws: send them back to it rather than guessing.
		web.SeeOther(w, r, settingsPath)
		return
	}
	away := readAway(r.URL.Query().Get("away"))

	refuse := func(field, message string) {
		a.renderSettings(w, r, v, settingsRender{
			tab: tab, away: away, message: message, field: field,
			draft: form, status: http.StatusUnprocessableEntity,
		})
	}
	// done sends the advisor back to the tab they were on, with the one-time flash.
	finish := func(f web.Flash, to string) {
		web.SetFlash(w, f, a.d.SecureCookies)
		web.SeeOther(w, r, to)
	}
	// send runs the write and maps its answer. field is where a refusal belongs.
	send := func(body map[string]any, field string, f web.Flash, to string) {
		res := a.call(r, v, "agent-settings", body)
		out := web.FromResult(res, copySettingsFailed)
		if out.OK {
			finish(f, to)
			return
		}
		if out.SignIn {
			web.SeeOther(w, r, "/login?next="+url.QueryEscape(to))
			return
		}
		refuse(field, out.Message)
	}

	switch op {
	case "update_profile":
		body, field, problem := profileBody(form)
		if problem != "" {
			refuse(field, problem)
			return
		}
		send(body, "form", flashSettingsSaved, settingsHref("profile", ""))

	case "set_avatar":
		image := strings.TrimSpace(form.Get("image"))
		if image == "" {
			// With the module absent nothing was prepared, so there is nothing to send.
			refuse("photo", copyPhotoNeedsBrowser)
			return
		}
		send(map[string]any{"op": "set_avatar", "image": image}, "photo", flashPhotoSaved, settingsHref("profile", ""))

	case "remove_avatar":
		send(map[string]any{"op": "remove_avatar"}, "photo", flashPhotoRemoved, settingsHref("profile", ""))

	case "update_availability":
		ws := scheduleFromForm(form)
		if problem := scheduleProblem(ws); problem != "" {
			refuse("availability", problem)
			return
		}
		hours, ok := parseIntJS(form.Get("responseTimeHours"))
		if !ok || !slices.Contains(responseTimeChoices, hours) {
			hours = 24
		}
		send(map[string]any{
			"op":                "update_availability",
			"timeZone":          form.Get("timeZone"),
			"weeklySchedule":    ws,
			"responseTimeHours": hours,
		}, "availability", flashSettingsSaved, settingsHref("availability", ""))

	case "save_time_off":
		body, problem := timeOffBody(form, a.settingsToday(r, v))
		if problem != "" {
			refuse("away", problem)
			return
		}
		send(body, "away", flashSettingsSaved, settingsHref("availability", ""))

	case "end_time_off":
		id := uuidOrEmpty(form.Get("timeOffId"))
		if id == "" {
			refuse("away", copySettingsFailed)
			return
		}
		send(map[string]any{"op": "end_time_off", "timeOffId": id},
			"away", flashSettingsSaved, settingsHref("availability", ""))

	case "update_notifications":
		send(map[string]any{
			"op":                  "update_notifications",
			"clientMessagesPush":  form.Get("clientMessagesPush") != "",
			"clientMessagesEmail": form.Get("clientMessagesEmail") != "",
			"quoteRequestsPush":   form.Get("quoteRequestsPush") != "",
			"quoteRequestsEmail":  form.Get("quoteRequestsEmail") != "",
		}, "form", flashSettingsSaved, settingsHref("notifications", ""))

	case "update_signature":
		text := form.Get("signature")
		if problem := signatureProblem(text); problem != "" {
			refuse("signature", problem)
			return
		}
		// Empty means "use the default", so a better default later still reaches an advisor
		// who never wrote their own.
		send(map[string]any{"op": "update_signature", "signature": normalizeSignature(text)},
			"signature", flashSettingsSaved, settingsHref("signature", ""))
	}
}

// settingsToday is the advisor's own day, which "time away can start today" is measured in.
// The read gives it; this is the fallback for a write made while that read is failing.
func (a *app) settingsToday(r *http.Request, v visit) string {
	if s := a.loadSettings(r.Context(), v, a.d.Config.SupabaseURL); s != nil {
		return s.Availability.Today
	}
	return clockDay(v.zoneName)
}

// profileBody reads §3.12.1's form. The links are normalised here exactly as the function
// normalises them, so the boxes come back holding what was stored.
func profileBody(form url.Values) (body map[string]any, field, problem string) {
	name := strings.TrimSpace(form.Get("displayName"))
	if name == "" {
		return nil, "displayName", copyNameRequired
	}
	if p := phoneProblem(form.Get("phone")); p != "" {
		return nil, "phone", p
	}
	links := map[string]string{}
	for _, n := range socialNetworks {
		link, p := normalizeSocialLink(n, form.Get(n))
		if p != "" {
			return nil, n, p
		}
		if link != "" {
			links[n] = link
		}
	}
	return map[string]any{
		"op":          "update_profile",
		"displayName": name,
		"pronouns":    strings.TrimSpace(form.Get("pronouns")),
		"phone":       strings.TrimSpace(form.Get("phone")),
		"bio":         strings.TrimSpace(form.Get("bio")),
		"socialLinks": links,
	}, "", ""
}

// timeOffBody reads the time-away editor. The id comes from the form and is echoed on a
// refusal, so one block cannot become two.
func timeOffBody(form url.Values, today string) (map[string]any, string) {
	id := uuidOrEmpty(form.Get("timeOffId"))
	if id == "" {
		id = uuid.New()
	}
	startsOn, endsOn := form.Get("startsOn"), form.Get("endsOn")
	if p := timeOffProblem(startsOn, endsOn, today); p != "" {
		return nil, p
	}
	enabled := form.Get("autoReplyEnabled") != ""
	text := form.Get("autoReplyText")
	// The reply's words are checked only while it is on: hidden words never block a save.
	if enabled {
		if p := autoReplyProblem(true, text); p != "" {
			return nil, p
		}
	}
	// Kept while off (so turning it back on brings them back), unless they would be refused.
	keep := ""
	if enabled || autoReplyProblem(true, text) == "" {
		keep = strings.TrimSpace(text)
	}
	return map[string]any{
		"op":               "save_time_off",
		"timeOffId":        id,
		"isNew":            form.Get("isNew") != "",
		"startsOn":         startsOn,
		"endsOn":           endsOn,
		"label":            strings.TrimSpace(form.Get("label")),
		"autoReplyEnabled": enabled,
		"autoReplyText":    keep,
	}, ""
}

// scheduleFromForm reads the seven days: a ticked "on-<day>" with a From and a To, or the
// day off. The times are read as typed and checked by scheduleProblem, so "Working hours go
// in half-hour steps." is the advisor's answer rather than a silent correction.
func scheduleFromForm(form url.Values) weeklySchedule {
	ws := weeklySchedule{}
	for _, d := range weekdays {
		if form.Get("on-"+d) == "" {
			ws[d] = nil
			continue
		}
		ws[d] = &dayHours{Start: strings.TrimSpace(form.Get("from-" + d)), End: strings.TrimSpace(form.Get("to-" + d))}
	}
	return ws
}
