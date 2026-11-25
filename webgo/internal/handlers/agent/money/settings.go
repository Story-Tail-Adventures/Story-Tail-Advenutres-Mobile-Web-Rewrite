package money

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/shell"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/web"
)

// §3.12 Agent Profile & Settings — a port of web/app/(agent)/agent/settings/ and the four
// forms in web/components/agent/.
//
// ONE PAGE, ONE TAB PER URL (?tab=), reached from the avatar menu; not on the nav rail
// (§6.4 settled the rail's seven entries). Each tab is its own page FILE here, because the
// four screens share only the heading and the tab strip.
//
// THE TAB IS URL STATE, so every form action on a tab carries it: a refused save re-renders
// the page the POST was sent to, and an action that dropped ?tab= would land the advisor on
// Profile with their words gone and the sentence nowhere to show. Time away goes further —
// its editor is ?away=new or ?away=<id>, and its form action carries that too.
//
// WHAT NEEDS JAVASCRIPT, and what happens without it: the photo (a browser makes the square
// 400x400 JPEG, exactly as the Next client does) and the signature's Insert chips and live
// preview. Everything else is a plain form post. With the module absent the photo controls
// do nothing, the signature preview is of the SAVED text, and every other setting still saves.

const settingsPath = "/agent/settings"

// settingsHref is the URL for one tab, with the time-away editor when it is open. Defaults
// are left out, so the bare URL is canonical.
func settingsHref(tab, away string) string {
	var q query
	if tab != "" && tab != "profile" {
		q.add("tab", tab)
	}
	if away != "" {
		q.add("away", away)
	}
	return q.on(settingsPath)
}

// settingsAction is a form's target: ALWAYS with the tab on it, and the time-away editor's
// block where there is one. A refused save re-renders the page the POST was sent to, so an
// action that dropped the query would land the advisor on another tab with their words gone
// and the sentence nowhere to show.
func settingsAction(tab, away string) string {
	var q query
	q.add("tab", tab)
	if away != "" {
		q.add("away", away)
	}
	return q.on(settingsPath)
}

// settingsFrameSlots are the heading and tab strip every §3.12 page carries.
func settingsSlots(s ...string) []string {
	return withFrame(append([]string{"form-error", "form-error-text"}, s...)...)
}

func settingsSpec(file string, slots []string, repeats map[string][]string) page.Spec {
	all := map[string][]string{"tab": {"tab-link", "tab-label"}}
	for k, v := range repeats {
		all[k] = v
	}
	return page.Spec{File: file, Layout: shell.Agent, Slots: settingsSlots(slots...), Repeats: all}
}

var profileSpec = settingsSpec("agent/money/settings-profile.html",
	[]string{
		"pf-form", "pf-photo-form", "pf-remove-form", "pf-photo-error", "pf-photo-error-text",
		"pf-avatar", "pf-avatar-img", "pf-initials",
		"pf-name", "pf-name-error", "pf-pronouns", "pf-email", "pf-phone", "pf-phone-error", "pf-bio",
		"pf-prev-avatar", "pf-prev-avatar-img", "pf-prev-initials",
		"pf-prev-name", "pf-prev-pronouns", "pf-prev-reply", "pf-prev-bio", "pf-prev-links",
	},
	map[string][]string{
		"link":      {"link-label", "link-input", "link-error", "link-error-text"},
		"prev-link": {"prev-link-a", "prev-link-label"},
	})

var availabilitySpec = settingsSpec("agent/money/settings-availability.html",
	[]string{
		"av-form", "av-zone", "av-reply", "week-grid",
		"away-empty", "away-list", "away-new", "away-form", "away-id", "away-isnew", "away-title",
		"away-start", "away-end", "away-label", "away-reply-on", "away-reply-text",
		"away-reply-preview", "away-error", "away-error-text", "away-cancel",
	},
	map[string][]string{
		"zone":      {"zone-option"},
		"reply":     {"reply-option"},
		"week-hour": {"week-hour-label"},
		"week-cell": {"week-cell-box"},
		"day":       {"day-on", "day-name", "day-off", "day-from", "day-to"},
		"away":      {"away-range", "away-meta", "away-edit", "away-actions", "away-end-id", "away-end-summary", "away-end-body", "away-end-confirm"},
	})

var notificationsSpec = settingsSpec("agent/money/settings-notifications.html",
	[]string{"nt-form"},
	map[string][]string{"nt-row": {"nt-label", "nt-hint", "nt-email", "nt-push"}})

var signatureSpec = settingsSpec("agent/money/settings-signature.html",
	[]string{"sg-form", "sg-text", "sg-error", "sg-error-text", "sg-from", "sg-reset", "sg-preview"},
	map[string][]string{"sg-line": {"sg-line-text"}})

// settingsRender is everything one render of a §3.12 page needs beyond the read.
type settingsRender struct {
	tab string
	// away is the time-away editor's block: "new", an id, or "".
	away string
	// message is a refusal to show above the form, and field is the one field it belongs to.
	message string
	field   string
	// draft is what the advisor just typed, echoed back on a refusal so nothing is lost.
	draft  url.Values
	status int
}

func (a *app) serveSettings(w http.ResponseWriter, r *http.Request) {
	v, done := begin(w, r, a.d)
	if done {
		return
	}
	q := r.URL.Query()
	a.renderSettings(w, r, v, settingsRender{
		tab:    validSettingsTab(q.Get("tab")),
		away:   readAway(q.Get("away")),
		status: http.StatusOK,
	})
}

// readAway keeps "new" or a uuid; anything else closes the editor rather than opening one
// over a block that does not exist.
func readAway(v string) string {
	if v == "new" || uuidOrEmpty(v) != "" {
		return v
	}
	return ""
}

func (a *app) renderSettings(w http.ResponseWriter, r *http.Request, v visit, rend settingsRender) {
	var s *settingsViewModel
	if v.canRead() {
		s = a.loadSettings(r.Context(), v, a.d.Config.SupabaseURL)
	}
	st := reportState(v, s != nil)
	code := statusFor(st)

	tmpl := a.settingsProfile
	switch rend.tab {
	case "availability":
		tmpl = a.settingsAvailability
	case "notifications":
		tmpl = a.settingsNotifications
	case "signature":
		tmpl = a.settingsSignature
	}
	doc := tmpl.New()
	show := fillFrame(doc, r, v, st)
	if !v.noAccess {
		fillSettingsTabs(doc, rend.tab)
		if show {
			switch rend.tab {
			case "availability":
				fillAvailability(doc, s, rend)
			case "notifications":
				fillNotifications(doc, s, rend)
			case "signature":
				fillSignature(doc, s, rend)
			default:
				fillProfile(doc, s, rend)
			}
			code = rend.status
		}
	}
	web.Render(w, a.d.Log, doc, code, web.Private)
}

func fillSettingsTabs(doc *page.Doc, active string) {
	doc.Repeat("tab", len(settingsTabs), func(i int, row *page.Row) {
		t := settingsTabs[i]
		row.URL("tab-link", "href", settingsHref(t.ID, ""))
		row.Text("tab-label", t.Label)
		row.Class("tab-link", "chip-secondary", t.ID == active)
		row.Class("tab-link", "chip-outlined", t.ID != active)
		if t.ID == active {
			row.Attr("tab-link", "aria-current", "page")
		}
	})
}

// formError shows the one sentence above a form, or takes the block away.
func formError(doc *page.Doc, message string) {
	if message == "" {
		doc.Remove("form-error")
		return
	}
	doc.Keep("form-error")
	doc.Text("form-error-text", message)
}

// fieldError fills a field's own message, and marks the input invalid for a screen reader.
func fieldError(f interface {
	Text(slot, text string)
	Keep(slot string)
	Remove(slot string)
	Attr(slot, name, value string)
}, block, text, input, message string) {
	if message == "" {
		f.Remove(block)
		f.Attr(input, "aria-invalid", "false")
		return
	}
	f.Keep(block)
	f.Text(text, message)
	f.Attr(input, "aria-invalid", "true")
}

// drafted is what to show in a field: the advisor's own words on a refusal, the stored value
// otherwise. A refused save must never redraw the saved value over what was typed.
func (rend settingsRender) drafted(name, stored string) string {
	if rend.draft == nil {
		return stored
	}
	if _, ok := rend.draft[name]; !ok {
		return stored
	}
	return rend.draft.Get(name)
}

// draftedBool is the same for a checkbox: an absent key in a submitted form means unticked,
// which is different from "no draft at all".
func (rend settingsRender) draftedBool(name string, stored bool) bool {
	if rend.draft == nil {
		return stored
	}
	return rend.draft.Get(name) != ""
}

// draftedOr is drafted with a fallback when the draft holds nothing for the field.
func (rend settingsRender) draftedOr(name, stored string) string {
	if v := rend.drafted(name, stored); strings.TrimSpace(v) != "" {
		return v
	}
	return stored
}
