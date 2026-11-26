package money

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// §3.12 Agent Settings: what an advisor may save — a port of web/lib/agent/settingsRules.ts.
//
// PARALLEL IMPLEMENTATION of supabase/functions/_shared/agentSettings.ts, which is the one
// that decides. This copy lets the page say what is wrong without a round trip, and it must
// stay word for word with the TypeScript: the same vectors are asserted in
// settingsRules.test.ts and agentSettings_test.ts, and now in settingsrules_test.go.

const (
	maxName           = 80
	maxPronouns       = 30
	maxPhone          = 30
	maxBio            = 600
	maxLink           = 300
	maxTimeOffLabel   = 80
	maxSignature      = 500
	maxSignatureLines = 8
	maxAutoReply      = 600
)

// socialNetworks are the four link fields, in the order the form draws them.
var socialNetworks = []string{"instagram", "facebook", "linkedin", "website"}

var networkLabel = map[string]string{
	"instagram": "Instagram",
	"facebook":  "Facebook",
	"linkedin":  "LinkedIn",
	"website":   "Website",
}

var networkHosts = map[string][]string{
	"instagram": {"instagram.com"},
	"facebook":  {"facebook.com", "fb.com"},
	"linkedin":  {"linkedin.com"},
}

func hostMatches(host string, allowed []string) bool {
	h := strings.ToLower(host)
	h = strings.TrimPrefix(h, "www.")
	h = strings.TrimPrefix(h, "m.")
	for _, a := range allowed {
		if h == a || strings.HasSuffix(h, "."+a) {
			return true
		}
	}
	return false
}

// jsSpaceClass is JavaScript's \s as an RE2 class. Go's own `\s` is only [\t\n\f\r ],
// so a regex written with it disagrees with the Edge Function about every other space —
// and a NON-BREAKING space is what a paste from Word, or Option-Space on a Mac, puts in.
// `jsSpace` (lineform.go) is the same set as a rune predicate, for the trims.
const jsSpaceClass = `[\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]`

// jsTrim and jsTrimRight are JavaScript's trim() and trimEnd(): the same set again.
func jsTrim(s string) string      { return strings.TrimFunc(s, jsSpace) }
func jsTrimRight(s string) string { return strings.TrimRightFunc(s, jsSpace) }

var (
	handleRE   = regexp.MustCompile(`^@?([A-Za-z0-9._]{1,60})$`)
	bareSiteRE = regexp.MustCompile(`(?i)^(www\.)?(instagram|facebook|fb)\.com$`)
	schemeRE   = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.\-]*:`)
	httpRE     = regexp.MustCompile(`(?i)^http://`)
	httpsRE    = regexp.MustCompile(`(?i)^https://`)
	badCharRE  = regexp.MustCompile(jsSpaceClass + `|[<>"]`)
)

// normalizeSocialLink is the server's normalizeSocialLink, word for word. It returns "" for
// an empty field, and a sentence (not an error value) for anything it refuses, because the
// sentence is what goes on the screen.
func normalizeSocialLink(network, value string) (link string, problem string) {
	label := networkLabel[network]
	t := jsTrim(value)
	if t == "" {
		return "", ""
	}

	handle := handleRE.FindStringSubmatch(t)
	// "instagram.com" alone is the site, not a handle; it falls through and is refused below.
	bareSite := bareSiteRE.MatchString(strings.TrimPrefix(t, "@"))
	switch {
	case handle != nil && !bareSite && (network == "instagram" || network == "facebook") && !strings.Contains(handle[1], ".."):
		host := "facebook.com"
		if network == "instagram" {
			host = "instagram.com"
		}
		t = "https://" + host + "/" + handle[1]
	case httpRE.MatchString(t):
		return "", "Use the https:// address for " + label + "."
	case !httpsRE.MatchString(t):
		if schemeRE.MatchString(t) {
			return "", label + " should be a web link."
		}
		t = "https://" + t
	}

	if len(t) > maxLink {
		return "", label + " link is too long."
	}
	if badCharRE.MatchString(t) {
		return "", label + " link has a space or a symbol that won't work in a link."
	}

	u, err := url.Parse(t)
	// `https://@instagram.com` has an EMPTY userinfo, which the browser's URL reads as none
	// at all; only a real username or password is the phishing disguise this refuses.
	user := ""
	if u.User != nil {
		pw, _ := u.User.Password()
		user = u.User.Username() + pw
	}
	if err != nil || u.Scheme != "https" || user != "" || !strings.Contains(u.Hostname(), ".") {
		return "", label + " doesn't look like a link."
	}
	if network != "website" && !hostMatches(u.Hostname(), networkHosts[network]) {
		return "", label + " should be a link on " + networkHosts[network][0] + "."
	}
	if network != "website" && strings.TrimRight(u.Path, "/") == "" {
		return "", "Add your handle or the link to your " + label + " page."
	}
	// The scheme as typed, lowercased: everything else is the advisor's own text.
	return "https://" + t[len("https://"):], ""
}

var phoneShapeRE = regexp.MustCompile(`^[0-9+()\-. xX]+$`)

// phoneProblem is a phone number as typed, or the sentence saying why not.
func phoneProblem(value string) string {
	t := jsTrim(value)
	if t == "" {
		return ""
	}
	if len([]rune(t)) > maxPhone {
		return fmt.Sprintf("Phone can be up to %d characters.", maxPhone)
	}
	digits := 0
	for _, c := range t {
		if c >= '0' && c <= '9' {
			digits++
		}
	}
	if !phoneShapeRE.MatchString(t) || digits < 7 {
		return "That phone number doesn't look right. Use digits, spaces, + - ( ) or ."
	}
	return ""
}

// ── Availability ────────────────────────────────────────────────────────────────────────

// timeZone is one option in the picker.
type timeZone struct{ ID, Label string }

var northAmericanTimeZones = []timeZone{
	{"America/St_Johns", "Newfoundland (St. John's)"},
	{"America/Halifax", "Atlantic (Halifax)"},
	{"America/Puerto_Rico", "Atlantic (Puerto Rico)"},
	{"America/New_York", "Eastern (New York)"},
	{"America/Toronto", "Eastern (Toronto)"},
	{"America/Cancun", "Eastern (Cancún)"},
	{"America/Chicago", "Central (Chicago)"},
	{"America/Winnipeg", "Central (Winnipeg)"},
	{"America/Mexico_City", "Central (Mexico City)"},
	{"America/Regina", "Central, no daylight saving (Regina)"},
	{"America/Denver", "Mountain (Denver)"},
	{"America/Edmonton", "Mountain (Edmonton)"},
	{"America/Phoenix", "Mountain, no daylight saving (Phoenix)"},
	{"America/Los_Angeles", "Pacific (Los Angeles)"},
	{"America/Vancouver", "Pacific (Vancouver)"},
	{"America/Tijuana", "Pacific (Tijuana)"},
	{"America/Anchorage", "Alaska (Anchorage)"},
	{"Pacific/Honolulu", "Hawaii (Honolulu)"},
}

var responseTimeChoices = []int{2, 4, 12, 24, 48}

var weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

var weekdayLabel = map[string]string{
	"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
	"fri": "Friday", "sat": "Saturday", "sun": "Sunday",
}

var weekdayShort = map[string]string{
	"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu",
	"fri": "Fri", "sat": "Sat", "sun": "Sun",
}

// dayHours is one day's working hours; a nil *dayHours is a day off.
type dayHours struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// weeklySchedule is the seven days. A missing day is not the same as a day off, so the read
// checks for all seven before it trusts the value.
type weeklySchedule map[string]*dayHours

// defaultWeeklySchedule is §3.12.2's: Monday to Saturday 7am to 9pm, Sunday off.
func defaultWeeklySchedule() weeklySchedule {
	ws := weeklySchedule{"sun": nil}
	for _, d := range []string{"mon", "tue", "wed", "thu", "fri", "sat"} {
		ws[d] = &dayHours{Start: "07:00", End: "21:00"}
	}
	return ws
}

var (
	startTimeRE = regexp.MustCompile(`^([01][0-9]|2[0-3]):(00|30)$`)
	endTimeRE   = regexp.MustCompile(`^(([01][0-9]|2[0-3]):(00|30)|24:00)$`)
)

// halfHours is every half hour as "HH:MM"; starts stop at 23:30, ends run to 24:00.
func halfHours() []string {
	out := make([]string, 0, 49)
	for i := 0; i < 49; i++ {
		m := "00"
		if i%2 == 1 {
			m = "30"
		}
		out = append(out, fmt.Sprintf("%02d:%s", i/2, m))
	}
	return out
}

// timeLabel is "07:00" → "7am", "21:30" → "9:30pm", "24:00" → "midnight", "12:00" → "noon".
func timeLabel(hhmm string) string {
	if hhmm == "24:00" || hhmm == "00:00" {
		return "midnight"
	}
	if hhmm == "12:00" {
		return "noon"
	}
	h, m, ok := splitHHMM(hhmm)
	if !ok {
		return hhmm
	}
	suffix := "pm"
	if h < 12 {
		suffix = "am"
	}
	h12 := h % 12
	if h12 == 0 {
		h12 = 12
	}
	if m == 0 {
		return fmt.Sprintf("%d%s", h12, suffix)
	}
	return fmt.Sprintf("%d:%02d%s", h12, m, suffix)
}

func splitHHMM(hhmm string) (h, m int, ok bool) {
	parts := strings.SplitN(hhmm, ":", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return h, m, true
}

// slotOf is "07:30" → 15 half-hour slots from midnight.
func slotOf(hhmm string) int {
	h, m, ok := splitHHMM(hhmm)
	if !ok {
		return 0
	}
	if m == 30 {
		return h*2 + 1
	}
	return h * 2
}

// scheduleProblem is the sentence for the first thing wrong with a schedule, or "".
func scheduleProblem(ws weeklySchedule) string {
	if len(ws) != len(weekdays) {
		return "Set hours for each day, or mark it Off."
	}
	for _, day := range weekdays {
		d, ok := ws[day]
		if !ok {
			return "Set hours for each day, or mark it Off."
		}
		if d == nil {
			continue
		}
		if !startTimeRE.MatchString(d.Start) || !endTimeRE.MatchString(d.End) {
			return "Working hours go in half-hour steps."
		}
		if d.Start >= d.End {
			return weekdayLabel[day] + "'s hours have to end after they start."
		}
	}
	return ""
}

// scheduleFromJSON reads a stored schedule. A value this screen does not recognise falls
// back to the default rather than failing the page — the same answer toSettingsView gives,
// and the Edge Function is the one that refuses a bad save.
func scheduleFromJSON(raw json.RawMessage) weeklySchedule {
	if len(raw) == 0 {
		return defaultWeeklySchedule()
	}
	// json.RawMessage, not any: a day is either null or exactly {start, end}, and anything
	// else is refused rather than coerced.
	var days map[string]json.RawMessage
	if err := json.Unmarshal(raw, &days); err != nil || len(days) != len(weekdays) {
		return defaultWeeklySchedule()
	}
	out := weeklySchedule{}
	for _, day := range weekdays {
		v, ok := days[day]
		if !ok {
			return defaultWeeklySchedule()
		}
		if string(v) == "null" {
			out[day] = nil
			continue
		}
		var d dayHours
		dec := json.NewDecoder(strings.NewReader(string(v)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&d); err != nil || d.Start == "" || d.End == "" {
			return defaultWeeklySchedule()
		}
		out[day] = &d
	}
	if scheduleProblem(out) != "" {
		return defaultWeeklySchedule()
	}
	return out
}

// ── Out of office ───────────────────────────────────────────────────────────────────────

// timeOffProblem mirrors readTimeOffDates, plus the database's "not before today".
func timeOffProblem(startsOn, endsOn, today string) string {
	if isoDate(startsOn) == "" {
		return "Pick the first day away."
	}
	if isoDate(endsOn) == "" {
		return "Pick the last day away."
	}
	if endsOn < startsOn {
		return "The last day away can't be before the first."
	}
	if startsOn < today {
		return "Time away can start today or later."
	}
	start, _ := parseDay(startsOn)
	end, _ := parseDay(endsOn)
	if int(end.Sub(start).Hours()/24)+1 > 366 {
		return "Time away can be up to a year. Check the dates."
	}
	return ""
}

// dateRangeLabel is "Jul 4 – Jul 7", "Jul 4", or "Dec 24 – Jan 2, 2027" when it crosses into
// another year.
func dateRangeLabel(startsOn, endsOn, today string) string {
	fmtDay := func(iso string) string {
		d, ok := parseDay(iso)
		if !ok {
			return iso
		}
		return fmt.Sprintf("%s %d", shortMonths[d.Month()-1], d.Day())
	}
	if startsOn == endsOn {
		return fmtDay(startsOn)
	}
	otherYear := endsOn[:4] != startsOn[:4] || startsOn[:4] != today[:4]
	out := fmtDay(startsOn) + " – " + fmtDay(endsOn)
	if otherYear {
		out += ", " + endsOn[:4]
	}
	return out
}

// timeOffPhase is "upcoming", "running" (started, not over) or "past", in the advisor's days.
func timeOffPhase(startsOn, endsOn, today string) string {
	if endsOn < today {
		return "past"
	}
	if startsOn <= today {
		return "running"
	}
	return "upcoming"
}

var longWeekdays = [...]string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}

// returnDateLabel is "Monday, July 8": the day after the last day away, as the reply says it.
func returnDateLabel(endsOn string) string {
	d, ok := parseDay(endsOn)
	if !ok {
		return ""
	}
	d = d.AddDate(0, 0, 1)
	return fmt.Sprintf("%s, %s %d", longWeekdays[int(d.Weekday())], longMonths[d.Month()-1], d.Day())
}

// ── Signature ───────────────────────────────────────────────────────────────────────────

// defaultSignature is the database's agent_default_signature(), word for word.
const defaultSignature = "{{agent.name}}, Travel Advisor\n{{agent.phone}} · {{agent.email}}\nadventures.story-tail.com\n\nMaking travel an adventure"

// lockedSignatureLine is the line under every signature (Q18). Not editable: it is the host
// agency's.
const lockedSignatureLine = "Story-Tail Adventures · Hosted by Inteletravel"

// The three Insert chips are written into settings-signature.html, not built from Go: there
// are three of them and they never move. module_test.go holds their tokens to the TypeScript.

var (
	crlfRE        = regexp.MustCompile(`\r\n?`)
	mergeFieldRE  = regexp.MustCompile(`\{\{` + jsSpaceClass + `*([^}]*?)` + jsSpaceClass + `*\}\}`)
	agentNameRE   = regexp.MustCompile(`\{\{` + jsSpaceClass + `*agent\.name` + jsSpaceClass + `*\}\}`)
	agentPhoneRE  = regexp.MustCompile(`\{\{` + jsSpaceClass + `*agent\.phone` + jsSpaceClass + `*\}\}`)
	agentEmailRE  = regexp.MustCompile(`\{\{` + jsSpaceClass + `*agent\.email` + jsSpaceClass + `*\}\}`)
	dotRunRE      = regexp.MustCompile(jsSpaceClass + `*·` + jsSpaceClass + `*(?:·` + jsSpaceClass + `*)+`)
	leadingDotRE  = regexp.MustCompile(`^` + jsSpaceClass + `*·` + jsSpaceClass + `*`)
	trailingDotRE = regexp.MustCompile(jsSpaceClass + `*·` + jsSpaceClass + `*$`)
)

var signatureTokens = []string{"agent.name", "agent.phone", "agent.email"}

// normalizeSignature is readSignature's own tidy-up: CRLF to LF, every line right-trimmed,
// and no blank lines top or bottom.
func normalizeSignature(text string) string {
	t := crlfRE.ReplaceAllString(text, "\n")
	lines := strings.Split(t, "\n")
	for i, l := range lines {
		lines[i] = jsTrimRight(l)
	}
	t = strings.Join(lines, "\n")
	return strings.Trim(t, "\n")
}

// signatureProblem mirrors readSignature in _shared/agentSettings.ts.
func signatureProblem(text string) string {
	t := normalizeSignature(text)
	if len([]rune(t)) > maxSignature {
		return fmt.Sprintf("A signature can be up to %d characters.", maxSignature)
	}
	if len(strings.Split(t, "\n")) > maxSignatureLines {
		return fmt.Sprintf("A signature can be up to %d lines.", maxSignatureLines)
	}
	for _, m := range mergeFieldRE.FindAllStringSubmatch(t, -1) {
		if !slices.Contains(signatureTokens, m[1]) {
			return "We don't have a {{" + m[1] + "}} field. You can use {{agent.name}}, {{agent.phone}} or {{agent.email}}."
		}
	}
	return ""
}

// signatureLines is renderSignature in _shared/email.ts: the preview's lines, ending with the
// blank line and the locked one.
func signatureLines(text string, name, phone, email string) []string {
	src := jsTrim(text)
	filled := agentNameRE.ReplaceAllLiteralString(src, jsTrim(name))
	filled = agentPhoneRE.ReplaceAllLiteralString(filled, jsTrim(phone))
	filled = agentEmailRE.ReplaceAllLiteralString(filled, jsTrim(email))

	sourceLines := strings.Split(src, "\n")
	var lines []string
	for i, raw := range strings.Split(filled, "\n") {
		hadField := i < len(sourceLines) && strings.Contains(sourceLines[i], "{{")
		line := dotRunRE.ReplaceAllString(raw, " · ")
		line = leadingDotRE.ReplaceAllString(line, "")
		line = trailingDotRE.ReplaceAllString(line, "")
		line = jsTrimRight(line)
		// A line that was only merge fields, all of them empty, is dropped rather than left
		// as a gap in the middle of a signature.
		if jsTrim(line) == "" && hadField {
			continue
		}
		lines = append(lines, line)
	}
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return append(lines, "", lockedSignatureLine)
}

// ── Out-of-office auto-reply ────────────────────────────────────────────────────────────

// defaultAutoReply is Q21's words (brand-voice reviewed). {{return_date}} is filled when it
// sends.
const defaultAutoReply = "Thanks for writing! I'm away resting until {{return_date}} and will answer when I'm back. Your plans are in good hands."

var returnDateRE = regexp.MustCompile(`\{\{` + jsSpaceClass + `*return_date` + jsSpaceClass + `*\}\}`)

// autoReplyProblem mirrors readAutoReply in _shared/agentSettings.ts.
func autoReplyProblem(enabled bool, text string) string {
	t := jsTrim(text)
	if len([]rune(t)) > maxAutoReply {
		return fmt.Sprintf("An automatic reply can be up to %d characters.", maxAutoReply)
	}
	for _, m := range mergeFieldRE.FindAllStringSubmatch(t, -1) {
		if m[1] != "return_date" {
			return "We don't have a {{" + m[1] + "}} field. You can use {{return_date}}."
		}
	}
	if enabled && t == "" {
		return "Add the words for your automatic reply, or turn it off."
	}
	return ""
}

// autoReplyPreview fills {{return_date}} the way the reply will when it sends.
func autoReplyPreview(text, endsOn string) string {
	return jsTrim(returnDateRE.ReplaceAllLiteralString(text, returnDateLabel(endsOn)))
}

// initialsOf is "Gyasi Story" → "GS"; the fallback when there is no photo.
func initialsOf(name string) string {
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return "?"
	}
	first := []rune(parts[0])[0:1]
	out := string(first)
	if len(parts) > 1 {
		last := []rune(parts[len(parts)-1])[0:1]
		out += string(last)
	}
	return strings.ToUpper(out)
}

// avatarSrc puts a stored PATH on the Supabase origin the browser uses. agent.avatar_url
// holds a path in the public bucket, never an absolute URL (Data-Model §7.1), so a value
// that is not one is no photo at all rather than a link somewhere else.
func avatarSrc(path, supabaseOrigin string) string {
	const prefix = "/storage/v1/object/public/agent-avatars/"
	if path == "" || !strings.HasPrefix(path, prefix) {
		return ""
	}
	base, err := url.Parse(supabaseOrigin)
	if err != nil {
		return ""
	}
	ref, err := url.Parse(path)
	if err != nil {
		return ""
	}
	return base.ResolveReference(ref).String()
}

// clockDay is today in the advisor's zone, for the one place §3.12 needs a date the read did
// not give it.
func clockDay(zone string) string {
	loc, err := time.LoadLocation(zone)
	if err != nil {
		loc = time.UTC
	}
	return clock().In(loc).Format(time.DateOnly)
}
