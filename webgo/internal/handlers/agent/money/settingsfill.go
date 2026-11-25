package money

import (
	"slices"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/uuid"
)

// The four tabs' fills. Each one draws the advisor's OWN words on a refusal (rend.draft)
// and the stored ones otherwise, so a save that comes back refused never redraws over what
// was typed.

// ── 3.12.1 Profile ──────────────────────────────────────────────────────────────────────

func fillProfile(doc *page.Doc, s *settingsViewModel, rend settingsRender) {
	p := s.Profile
	// The banner carries only what belongs to no field. A phone or a link refusal is shown
	// under the box it is about, and saying it twice reads as two different problems.
	formError(doc, pick(rend, "form"))

	doc.URL("pf-form", "action", settingsAction("profile", ""))
	doc.URL("pf-photo-form", "action", settingsAction("profile", ""))
	doc.URL("pf-remove-form", "action", settingsAction("profile", ""))
	if p.AvatarURL == "" {
		doc.Remove("pf-remove-form")
	} else {
		doc.Keep("pf-remove-form")
	}

	name := rend.drafted("displayName", p.DisplayName)
	pronouns := rend.drafted("pronouns", p.Pronouns)
	bio := rend.drafted("bio", p.Bio)

	fillAvatar(doc, "pf-avatar", "pf-avatar-img", "pf-initials", p.AvatarURL, name)
	fillAvatar(doc, "pf-prev-avatar", "pf-prev-avatar-img", "pf-prev-initials", p.AvatarURL, name)

	// The photo saves on its own, so its refusal is its own line rather than the form's. The
	// block stays in the page and is HIDDEN when there is nothing to say, because the module
	// writes its own refusals ("That photo is over 5 MB") into it without a round trip.
	photoProblem := pick(rend, "photo")
	doc.Keep("pf-photo-error")
	doc.Bool("pf-photo-error", "hidden", photoProblem == "")
	doc.Text("pf-photo-error-text", photoProblem)

	doc.Attr("pf-name", "value", name)
	fieldError(doc, "pf-name-error", "pf-name-error", "pf-name", pick(rend, "displayName"))
	doc.Attr("pf-pronouns", "value", pronouns)
	// Email is read-only: it is the address the advisor signs in with (Q7).
	doc.Attr("pf-email", "value", p.Email)
	doc.Attr("pf-phone", "value", rend.drafted("phone", p.Phone))
	fieldError(doc, "pf-phone-error", "pf-phone-error", "pf-phone", pick(rend, "phone"))
	doc.Text("pf-bio", bio)

	doc.Repeat("link", len(socialNetworks), func(i int, row *page.Row) {
		n := socialNetworks[i]
		row.Text("link-label", networkLabel[n])
		row.Attr("link-input", "name", n)
		row.Attr("link-input", "value", rend.drafted(n, p.SocialLinks[n]))
		fieldError(row, "link-error", "link-error-text", "link-input", pick(rend, n))
	})

	// The preview: the advisor's own words as they will read to a client.
	first := ""
	if parts := strings.Fields(name); len(parts) > 0 {
		first = parts[0]
	}
	doc.Text("pf-prev-name", first+" · "+copyPreviewRole)
	textOrRemove(doc, "pf-prev-pronouns", pronounsLabel(pronouns))
	doc.Text("pf-prev-reply", replyWithin(s.Availability.ResponseTimeHours))
	textOrRemove(doc, "pf-prev-bio", strings.TrimSpace(bio))

	// Only the links that are STORED: a draft that has not saved is not yet a link.
	var shown []string
	for _, n := range socialNetworks {
		if p.SocialLinks[n] != "" {
			shown = append(shown, n)
		}
	}
	if len(shown) == 0 {
		doc.Remove("pf-prev-links")
		return
	}
	doc.Keep("pf-prev-links")
	doc.Repeat("prev-link", len(shown), func(i int, row *page.Row) {
		n := shown[i]
		row.URL("prev-link-a", "href", p.SocialLinks[n])
		row.Text("prev-link-label", networkLabel[n])
	})
}

// pronounsLabel is the "(she/her)" beside the preview name, or "" when none are set.
func pronounsLabel(pronouns string) string {
	t := strings.TrimSpace(pronouns)
	if t == "" {
		return ""
	}
	return "(" + t + ")"
}

// pick is the message for one field, or "".
func pick(rend settingsRender, field string) string {
	if rend.field == field {
		return rend.message
	}
	return ""
}

// fillAvatar draws the photo, or the initials in its place.
//
// A src the page would refuse draws the INITIALS, not an <img> with no src: page.SafeURL
// allows https (and relative) only, and the local stack's Supabase origin is http://, so
// without this the photo would silently become a broken-image icon in development. The
// initials are the same fallback an advisor with no photo gets, which is a true answer.
func fillAvatar(doc *page.Doc, block, img, initials, src, name string) {
	doc.Keep(block)
	if _, ok := page.SafeURL(src); !ok {
		src = ""
	}
	if src == "" {
		doc.Remove(img)
		doc.Keep(initials)
		doc.Text(initials, initialsOf(name))
		return
	}
	doc.Remove(initials)
	doc.URL(img, "src", src)
}

// ── 3.12.2 Availability ─────────────────────────────────────────────────────────────────

func fillAvailability(doc *page.Doc, s *settingsViewModel, rend settingsRender) {
	a := s.Availability
	formError(doc, pick(rend, "availability"))
	doc.URL("av-form", "action", settingsAction("availability", ""))

	// A zone that is not on the list (set before §3.12) still shows, so saving never moves
	// it by accident; the Edge Function asks for one from the list.
	zones := northAmericanTimeZones
	chosen := rend.draftedOr("timeZone", a.TimeZone)
	if !slices.ContainsFunc(zones, func(z timeZone) bool { return z.ID == chosen }) {
		zones = append([]timeZone{{ID: chosen, Label: chosen}}, zones...)
	}
	doc.Keep("av-zone")
	doc.Repeat("zone", len(zones), func(i int, row *page.Row) {
		row.Attr("zone-option", "value", zones[i].ID)
		row.Text("zone-option", zones[i].Label)
		row.Bool("zone-option", "selected", zones[i].ID == chosen)
		row.Keep("zone-option")
	})

	reply := a.ResponseTimeHours
	if n, ok := parseIntJS(rend.drafted("responseTimeHours", "")); ok && slices.Contains(responseTimeChoices, n) {
		reply = n
	}
	doc.Keep("av-reply")
	doc.Repeat("reply", len(responseTimeChoices), func(i int, row *page.Row) {
		n := responseTimeChoices[i]
		row.Attr("reply-option", "value", itoa(n))
		row.Text("reply-option", hoursChoice(n))
		row.Bool("reply-option", "selected", n == reply)
		row.Keep("reply-option")
	})

	// The week as it will be saved: the draft on a refusal, the stored schedule otherwise.
	ws := a.WeeklySchedule
	if rend.draft != nil {
		ws = scheduleFromForm(rend.draft)
	}
	fillWeekPicture(doc, ws)

	doc.Repeat("day", len(weekdays), func(i int, row *page.Row) {
		d := weekdays[i]
		hrs := ws[d]
		row.Attr("day-on", "name", "on-"+d)
		row.Bool("day-on", "checked", hrs != nil)
		row.Attr("day-on", "aria-label", workingOn(weekdayLabel[d]))
		row.Text("day-name", weekdayLabel[d])
		start, end := "09:00", "17:00"
		if hrs != nil {
			start, end = hrs.Start, hrs.End
		}
		row.Attr("day-from", "name", "from-"+d)
		row.Attr("day-from", "value", start)
		row.Attr("day-from", "aria-label", weekdayLabel[d]+" from")
		row.Attr("day-to", "name", "to-"+d)
		row.Attr("day-to", "value", end)
		row.Attr("day-to", "aria-label", weekdayLabel[d]+" to")
		if hrs == nil {
			row.Keep("day-off")
		} else {
			row.Remove("day-off")
		}
	})

	fillTimeOff(doc, a, rend)
}

// weekWindow is the picture's span in half-hour slots: 8am to 8pm, widened to whatever the
// advisor actually works. Both ends land on a whole hour, so the hour labels line up.
func weekWindow(ws weeklySchedule) (lo, hi int) {
	lo, hi = 16, 40
	for _, d := range weekdays {
		h := ws[d]
		if h == nil {
			continue
		}
		s := slotOf(h.Start)
		lo = min(lo, s-s%2)
		e := slotOf(h.End)
		hi = max(hi, e+e%2)
	}
	return max(lo, 0), min(hi, 48)
}

func fillWeekPicture(doc *page.Doc, ws weeklySchedule) {
	lo, hi := weekWindow(ws)
	cols := hi - lo
	// The column count is DATA, and the CSP allows no inline style, so money.css carries one
	// rule per possible count and the handler only writes the attribute.
	doc.Attr("week-grid", "data-cols", itoa(cols))
	doc.Keep("week-grid")

	doc.Repeat("week-hour", cols/2, func(i int, row *page.Row) {
		h := lo/2 + i
		row.Text("week-hour-label", hourTick(h))
	})
	// Seven rows, each a day label then one box per half hour, flattened: a repeat cannot
	// hold another repeat, and the grid places them row by row on its own.
	doc.Repeat("week-cell", len(weekdays)*(cols+1), func(i int, row *page.Row) {
		d := weekdays[i/(cols+1)]
		at := i % (cols + 1)
		if at == 0 {
			row.Text("week-cell-box", weekdayShort[d])
			row.Class("week-cell-box", "mny-week-day", true)
			return
		}
		row.Text("week-cell-box", "")
		row.Class("week-cell-box", "mny-week-box", true)
		h := ws[d]
		on := h != nil && lo+at-1 >= slotOf(h.Start) && lo+at-1 < slotOf(h.End)
		row.Class("week-cell-box", "mny-week-on", on)
	})
}

// hourTick is the picture's label: "8a", "12p", "5p".
func hourTick(h int) string {
	switch {
	case h%12 == 0 && h == 12:
		return "12p"
	case h%12 == 0:
		return "12a"
	case h < 12:
		return itoa(h) + "a"
	}
	return itoa(h-12) + "p"
}

func fillTimeOff(doc *page.Doc, a availabilityView, rend settingsRender) {
	// Past blocks are not listed: time away that is over is not a setting any more.
	var blocks []timeOffView
	for _, b := range a.TimeOff {
		if timeOffPhase(b.StartsOn, b.EndsOn, a.Today) != "past" {
			blocks = append(blocks, b)
		}
	}
	doc.URL("away-new", "href", settingsHref("availability", "new"))

	if len(blocks) == 0 {
		doc.Keep("away-empty")
		doc.Remove("away-list")
	} else {
		doc.Remove("away-empty")
		doc.Keep("away-list")
		doc.Repeat("away", len(blocks), func(i int, row *page.Row) {
			b := blocks[i]
			running := timeOffPhase(b.StartsOn, b.EndsOn, a.Today) == "running"
			row.Text("away-range", dateRangeLabel(b.StartsOn, b.EndsOn, a.Today))
			var meta []string
			if running {
				meta = append(meta, copyAwayNow)
			}
			if b.Label != "" {
				meta = append(meta, b.Label)
			}
			if b.AutoReplyEnabled {
				meta = append(meta, copyAutoReplyOn)
			}
			row.Text("away-meta", strings.Join(meta, " · "))
			row.Class("away-actions", "mny-away-running", running)
			row.Keep("away-actions")
			row.Attr("away-end-id", "value", b.ID)
			// A running block can only be ENDED early; an upcoming one can be edited or
			// removed. Both go through the same write, so the words are what differ.
			if running {
				row.Remove("away-edit")
				row.Text("away-end-summary", copyAwayBack)
				row.Text("away-end-body", copyConfirmBack)
				row.Text("away-end-confirm", copyAwayBack)
				return
			}
			row.URL("away-edit", "href", settingsHref("availability", b.ID))
			row.Text("away-end-summary", copyAwayRemove)
			row.Text("away-end-body", copyConfirmDelete)
			row.Text("away-end-confirm", copyAwayRemove)
		})
	}

	if rend.away == "" {
		doc.Remove("away-form")
		return
	}
	doc.Keep("away-form")

	// An id generated once and ECHOED on a refusal: a fresh one on every render would turn
	// a refused-then-corrected save into two blocks.
	id := rend.drafted("timeOffId", "")
	isNew := rend.away == "new"
	var block timeOffView
	if !isNew {
		for _, b := range blocks {
			if b.ID == rend.away {
				block = b
			}
		}
	}
	if id == "" {
		id = block.ID
	}
	if id == "" {
		id = uuid.New()
	}
	doc.URL("away-form", "action", settingsAction("availability", rend.away))
	doc.Attr("away-id", "value", id)
	doc.Attr("away-isnew", "value", boolField(isNew))
	doc.Text("away-title", title(isNew))

	start := rend.drafted("startsOn", block.StartsOn)
	end := rend.drafted("endsOn", block.EndsOn)
	doc.Attr("away-start", "value", start)
	doc.Attr("away-start", "min", a.Today)
	doc.Attr("away-end", "value", end)
	doc.Attr("away-end", "min", firstOf(start, a.Today))
	doc.Attr("away-label", "value", rend.drafted("label", block.Label))

	on := rend.draftedBool("autoReplyEnabled", block.AutoReplyEnabled)
	doc.Bool("away-reply-on", "checked", on)
	doc.Attr("away-reply-on", "name", "autoReplyEnabled")
	// The default words wait in the box even while the reply is off, ready to turn on.
	text := rend.drafted("autoReplyText", firstOf(block.AutoReplyText, defaultAutoReply))
	doc.Text("away-reply-text", text)
	if on && end != "" {
		doc.Text("away-reply-preview", autoReplyPreviewLine(autoReplyPreview(text, end)))
	} else {
		doc.Remove("away-reply-preview")
	}
	doc.URL("away-cancel", "href", settingsHref("availability", ""))
	// The one message for this form: it can be about either date or the reply's words, so
	// it marks no single box invalid.
	if problem := pick(rend, "away"); problem == "" {
		doc.Remove("away-error")
	} else {
		doc.Keep("away-error")
		doc.Text("away-error-text", problem)
	}
}

func title(isNew bool) string {
	if isNew {
		return copyDialogNew
	}
	return copyDialogEdit
}

func boolField(v bool) string {
	if v {
		return "1"
	}
	return ""
}

func firstOf(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// ── 3.12.3 Notifications ────────────────────────────────────────────────────────────────

// notifyRow is one line of the alert matrix.
type notifyRow struct {
	Label, Hint           string
	EmailField, PushField string
	Email, Push           bool
}

func fillNotifications(doc *page.Doc, s *settingsViewModel, rend settingsRender) {
	n := s.Notifications
	formError(doc, rend.message)
	doc.URL("nt-form", "action", settingsAction("notifications", ""))

	rows := []notifyRow{
		{
			Label: copyClientMessages, Hint: copyClientMessagesHint,
			EmailField: "clientMessagesEmail", PushField: "clientMessagesPush",
			Email: rend.draftedBool("clientMessagesEmail", n.ClientMessagesEmail),
			Push:  rend.draftedBool("clientMessagesPush", n.ClientMessagesPush),
		},
		{
			Label:      "New inquiries and messages",
			Hint:       "A client asks for a quote, or someone without an account writes to you.",
			EmailField: "quoteRequestsEmail", PushField: "quoteRequestsPush",
			Email: rend.draftedBool("quoteRequestsEmail", n.QuoteRequestsEmail),
			Push:  rend.draftedBool("quoteRequestsPush", n.QuoteRequestsPush),
		},
	}
	doc.Repeat("nt-row", len(rows), func(i int, row *page.Row) {
		r := rows[i]
		row.Text("nt-label", r.Label)
		row.Text("nt-hint", r.Hint)
		row.Attr("nt-email", "name", r.EmailField)
		row.Bool("nt-email", "checked", r.Email)
		row.Attr("nt-email", "aria-label", notifySwitchLabel(r.Label, "Email"))
		row.Attr("nt-push", "name", r.PushField)
		row.Bool("nt-push", "checked", r.Push)
		row.Attr("nt-push", "aria-label", notifySwitchLabel(r.Label, "Push"))
	})
}

// ── 3.12.4 Signature ────────────────────────────────────────────────────────────────────

func fillSignature(doc *page.Doc, s *settingsViewModel, rend settingsRender) {
	formError(doc, "")
	doc.URL("sg-form", "action", settingsAction("signature", ""))
	doc.URL("sg-reset", "action", settingsAction("signature", ""))

	text := rend.drafted("signature", s.Signature.Text)
	doc.Text("sg-text", text)
	// The field itself says what is wrong; no second copy in the banner.
	problem := signatureProblem(text)
	if rend.field == "signature" && rend.message != "" {
		problem = rend.message
	}
	fieldError(doc, "sg-error", "sg-error-text", "sg-text", problem)

	first := "Your advisor"
	if parts := strings.Fields(s.Profile.DisplayName); len(parts) > 0 {
		first = parts[0]
	}
	doc.Text("sg-from", signatureFrom(first))

	// The module redraws these lines as the advisor types, from the same three values.
	doc.Keep("sg-preview")
	doc.Attr("sg-preview", "data-sig-name", s.Profile.DisplayName)
	doc.Attr("sg-preview", "data-sig-phone", s.Profile.Phone)
	doc.Attr("sg-preview", "data-sig-email", s.Profile.Email)

	lines := signatureLines(text, s.Profile.DisplayName, s.Profile.Phone, s.Profile.Email)
	doc.Repeat("sg-line", len(lines), func(i int, row *page.Row) {
		row.Text("sg-line-text", lines[i])
		row.Class("sg-line-text", "mny-sig-first", i == 0)
		row.Class("sg-line-text", "mny-sig-locked", i == len(lines)-1 && lines[i] == lockedSignatureLine)
	})
}
