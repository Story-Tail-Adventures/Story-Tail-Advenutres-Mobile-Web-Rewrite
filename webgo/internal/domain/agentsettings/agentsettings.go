// Package agentsettings ports supabase/functions/_shared/agentSettings.ts: §3.12 Agent
// Settings, the rules for what an advisor may save (Screens 3.12.1, 3.12.2). Rulings:
// docs/Screen-Inventory.md §3.12 (2026-10-17).
//
// PARALLEL IMPLEMENTATION. `web/lib/agent/settingsRules.ts` holds the same rules so the form
// can say what is wrong before a round trip, and the same vectors are asserted in
// agentSettings_test.ts, settingsRules.test.ts and here; change one, change all. The database
// checks the shapes too (agent_weekly_schedule_valid, agent_social_links_valid), so a
// disagreement fails loudly rather than storing junk.
//
// Nothing in agentSettings.ts needs the database, the network or the environment; all of it
// is ported. Two JavaScript built-ins are reproduced by hand: atob (forgivingBase64, exact)
// and the parts of `new URL()` that normalizeSocialLink reads (link.go, exact for ASCII host
// names; see the note there for the one approximation).
package agentsettings

import (
	"encoding/base64"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// ── Profile ──────────────────────────────────────────────────────────────────

// Length limits on the profile's text fields.
const (
	MaxName     = 80
	MaxPronouns = 30
	MaxPhone    = 30
	MaxBio      = 600
	MaxLink     = 300
)

// SocialNetwork is one of the four links a profile can carry.
type SocialNetwork string

// The networks, in the order SOCIAL_NETWORKS lists them.
const (
	Instagram SocialNetwork = "instagram"
	Facebook  SocialNetwork = "facebook"
	LinkedIn  SocialNetwork = "linkedin"
	Website   SocialNetwork = "website"
)

// SocialNetworks is SOCIAL_NETWORKS; ReadSocialLinks keeps this order.
var SocialNetworks = []SocialNetwork{Instagram, Facebook, LinkedIn, Website}

var networkLabel = map[SocialNetwork]string{
	Instagram: "Instagram",
	Facebook:  "Facebook",
	LinkedIn:  "LinkedIn",
	Website:   "Website",
}

// networkHosts are the hosts a link for each named network must live on. Website may be
// anywhere.
var networkHosts = map[SocialNetwork][]string{
	Instagram: {"instagram.com"},
	Facebook:  {"facebook.com", "fb.com"},
	LinkedIn:  {"linkedin.com"},
}

// ReadOptionalText is readOptionalText: trimmed text, or nil when absent or empty. Refuses
// anything longer than max.
func ReadOptionalText(value js.Value, max int, label string) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(label + " didn't come through. Reload and try again.")
	}
	t := js.Trim(s)
	if t == "" {
		return nil, nil
	}
	if js.Len(t) > max {
		return nil, problem.BadRequest(label + " can be up to " + strconv.Itoa(max) + " characters.")
	}
	return &t, nil
}

// ReadDisplayName is readDisplayName: the name clients see, required.
func ReadDisplayName(value js.Value) (string, error) {
	t, err := ReadOptionalText(value, MaxName, "Your name")
	if err != nil {
		return "", err
	}
	if t == nil {
		return "", problem.BadRequest("Add the name clients will see.")
	}
	return *t, nil
}

var (
	phoneChars = regexp.MustCompile(`^[0-9+()\-. xX]+$`)
	digit      = regexp.MustCompile(`[0-9]`)
)

// ReadPhone is readPhone: digits and the usual phone punctuation only, at least seven
// digits. It is printed as typed in the signature.
func ReadPhone(value js.Value) (*string, error) {
	t, err := ReadOptionalText(value, MaxPhone, "Phone")
	if err != nil || t == nil {
		return nil, err
	}
	if !phoneChars.MatchString(*t) || len(digit.FindAllStringIndex(*t, -1)) < 7 {
		return nil, problem.BadRequest("That phone number doesn't look right. Use digits, spaces, + - ( ) or .")
	}
	return t, nil
}

func hostMatches(host string, allowed []string) bool {
	h := strings.TrimPrefix(strings.TrimPrefix(host, "www."), "m.")
	for _, a := range allowed {
		if h == a || strings.HasSuffix(h, "."+a) {
			return true
		}
	}
	return false
}

var (
	handle        = regexp.MustCompile(`^@?([A-Za-z0-9._]{1,60})$`)
	bareSite      = regexp.MustCompile(`^(www\.)?(instagram|facebook|fb)\.com$`)
	scheme        = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9+.\-]*:`)
	spaceOrSymbol = js.Regexp(`[\s<>"]`, "")
)

// NormalizeSocialLink is normalizeSocialLink: one social link, normalised to a full https
// URL, or nil when left empty.
//
//   - "@name" or a bare "name" for Instagram becomes https://instagram.com/name; Facebook the
//     same.
//   - A link with no scheme ("story-tail.com", "linkedin.com/in/x") gets https:// in front.
//   - http:// is refused rather than upgraded: a silent upgrade can point at a page that is
//     not there, and the advisor would never know.
//   - Instagram, Facebook and LinkedIn links must be on that network's own site, so a link
//     labelled "Instagram" can never send a client somewhere else.
func NormalizeSocialLink(network SocialNetwork, value js.Value) (*string, error) {
	label := networkLabel[network]
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest(label + " didn't come through. Reload and try again.")
	}
	t := js.Trim(s)
	if t == "" {
		return nil, nil
	}

	h := handle.FindStringSubmatch(t)
	// "instagram.com" alone is the site, not a handle; it falls through and is refused below.
	// (The Deno pattern carries the i flag; lower-casing ASCII first matches it exactly, where
	// Go's (?i) would also fold "ſ" and the Kelvin sign.)
	isBareSite := bareSite.MatchString(asciiLower(strings.TrimPrefix(t, "@")))
	switch {
	case h != nil && !isBareSite && (network == Instagram || network == Facebook) && !strings.Contains(h[1], ".."):
		// A bare word with a dot in it ("story.tail") is still a handle on these two
		// networks; a domain needs the scheme or a slash to be read as one.
		site := "facebook.com"
		if network == Instagram {
			site = "instagram.com"
		}
		t = "https://" + site + "/" + h[1]
	case hasPrefixFold(t, "http://"):
		return nil, problem.BadRequest("Use the https:// address for " + label + ".")
	case !hasPrefixFold(t, "https://"):
		if scheme.MatchString(t) {
			return nil, problem.BadRequest(label + " should be a web link.")
		}
		t = "https://" + t
	}

	if js.Len(t) > MaxLink {
		return nil, problem.BadRequest(label + " link is too long.")
	}
	if spaceOrSymbol.MatchString(t) {
		return nil, problem.BadRequest(label + " link has a space or a symbol that won't work in a link.")
	}

	// new URL(t) failing, or a URL with credentials or a host without a dot, are one answer.
	// (Its protocol is always "https:" here: t starts with https:// by now.)
	link, ok := parseHTTPS(t)
	if !ok || !strings.Contains(link.hostname, ".") {
		return nil, problem.BadRequest(label + " doesn't look like a link.")
	}
	if network != Website && !hostMatches(link.hostname, networkHosts[network]) {
		return nil, problem.BadRequest(label + " should be a link on " + networkHosts[network][0] + ".")
	}
	if network != Website && link.pathOnlySlashes {
		return nil, problem.BadRequest("Add your handle or the link to your " + label + " page.")
	}
	out := "https://" + t[len("https://"):]
	return &out, nil
}

// SocialLink is one entry of a saved profile's links.
type SocialLink struct {
	Network SocialNetwork
	URL     string
}

// SocialLinks is the Record<string, string> readSocialLinks returns: the networks that have a
// link, in SocialNetworks order. It marshals as that JSON object.
type SocialLinks []SocialLink

// MarshalJSON writes the links as one object, keys in order.
func (l SocialLinks) MarshalJSON() ([]byte, error) {
	o := make(js.Ordered, 0, len(l))
	for _, link := range l {
		o = append(o, js.Field{Key: string(link.Network), Value: link.URL})
	}
	return o.MarshalJSON()
}

// ReadSocialLinks is readSocialLinks: every known network's link normalised, empties dropped,
// an unknown network refused.
func ReadSocialLinks(value js.Value) (SocialLinks, error) {
	if value.IsNullish() {
		return SocialLinks{}, nil
	}
	o, ok := value.Object()
	if !ok {
		return nil, problem.BadRequest("Your links didn't come through. Reload and try again.")
	}
	for _, key := range o.Keys() {
		if !slices.Contains(SocialNetworks, SocialNetwork(key)) {
			return nil, problem.BadRequest("We don't have a spot for that link yet.")
		}
	}
	out := SocialLinks{}
	for _, n := range SocialNetworks {
		link, err := NormalizeSocialLink(n, o.Get(string(n)))
		if err != nil {
			return nil, err
		}
		if link != nil {
			out = append(out, SocialLink{Network: n, URL: *link})
		}
	}
	return out, nil
}

// ── Availability ─────────────────────────────────────────────────────────────

// TimeZone is one entry of the picker.
type TimeZone struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// NorthAmericanTimeZones is §3.12.2 (Q9): North American zones only (USD / North America
// business). The label is what the picker shows. Order is east to west, then the islands.
var NorthAmericanTimeZones = []TimeZone{
	{ID: "America/St_Johns", Label: "Newfoundland (St. John's)"},
	{ID: "America/Halifax", Label: "Atlantic (Halifax)"},
	{ID: "America/Puerto_Rico", Label: "Atlantic (Puerto Rico)"},
	{ID: "America/New_York", Label: "Eastern (New York)"},
	{ID: "America/Toronto", Label: "Eastern (Toronto)"},
	{ID: "America/Cancun", Label: "Eastern (Canc\U000000FAn)"},
	{ID: "America/Chicago", Label: "Central (Chicago)"},
	{ID: "America/Winnipeg", Label: "Central (Winnipeg)"},
	{ID: "America/Mexico_City", Label: "Central (Mexico City)"},
	{ID: "America/Regina", Label: "Central, no daylight saving (Regina)"},
	{ID: "America/Denver", Label: "Mountain (Denver)"},
	{ID: "America/Edmonton", Label: "Mountain (Edmonton)"},
	{ID: "America/Phoenix", Label: "Mountain, no daylight saving (Phoenix)"},
	{ID: "America/Los_Angeles", Label: "Pacific (Los Angeles)"},
	{ID: "America/Vancouver", Label: "Pacific (Vancouver)"},
	{ID: "America/Tijuana", Label: "Pacific (Tijuana)"},
	{ID: "America/Anchorage", Label: "Alaska (Anchorage)"},
	{ID: "Pacific/Honolulu", Label: "Hawaii (Honolulu)"},
}

// ReadTimeZone is readTimeZone: a zone from the list, nothing else.
func ReadTimeZone(value js.Value) (string, error) {
	s, ok := value.Str()
	if ok {
		for _, z := range NorthAmericanTimeZones {
			if z.ID == s {
				return s, nil
			}
		}
	}
	return "", problem.BadRequest("Pick a time zone from the list.")
}

// ResponseTimeChoices are the hours the "usually replies within" picker offers.
var ResponseTimeChoices = []int{2, 4, 12, 24, 48}

// ReadResponseTime is readResponseTime: one of ResponseTimeChoices, sent as a number.
func ReadResponseTime(value js.Value) (int, error) {
	n, ok := value.Num()
	if ok {
		for _, c := range ResponseTimeChoices {
			if float64(c) == n {
				return c, nil
			}
		}
	}
	return 0, problem.BadRequest("Pick how soon you usually reply from the list.")
}

// Weekdays is WEEKDAYS, the schedule's keys in order.
var Weekdays = []string{"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

var dayName = map[string]string{
	"mon": "Monday",
	"tue": "Tuesday",
	"wed": "Wednesday",
	"thu": "Thursday",
	"fri": "Friday",
	"sat": "Saturday",
	"sun": "Sunday",
}

// DayHours is one working day's From and To, "HH:MM" on the half hour ("24:00" may end one).
type DayHours struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// WeeklySchedule is the week, a nil day being Off. It marshals as the Deno object did, days
// in order.
type WeeklySchedule struct {
	Mon *DayHours `json:"mon"`
	Tue *DayHours `json:"tue"`
	Wed *DayHours `json:"wed"`
	Thu *DayHours `json:"thu"`
	Fri *DayHours `json:"fri"`
	Sat *DayHours `json:"sat"`
	Sun *DayHours `json:"sun"`
}

func (w *WeeklySchedule) day(name string) **DayHours {
	switch name {
	case "mon":
		return &w.Mon
	case "tue":
		return &w.Tue
	case "wed":
		return &w.Wed
	case "thu":
		return &w.Thu
	case "fri":
		return &w.Fri
	case "sat":
		return &w.Sat
	default:
		return &w.Sun
	}
}

var (
	startTime = regexp.MustCompile(`^([01][0-9]|2[0-3]):(00|30)$`)
	endTime   = regexp.MustCompile(`^(([01][0-9]|2[0-3]):(00|30)|24:00)$`)
)

// ReadWeeklySchedule is readWeeklySchedule: exactly the database's
// agent_weekly_schedule_valid(), with a sentence for the advisor.
func ReadWeeklySchedule(value js.Value) (WeeklySchedule, error) {
	o, ok := value.Object()
	// The keys are compared as the Deno version compares them, sorted and joined with commas,
	// so even a key with a comma in it is judged the same way.
	if !ok || sortedJoin(o.Keys()) != sortedJoin(Weekdays) {
		return WeeklySchedule{}, problem.BadRequest("Set hours for each day, or mark it Off.")
	}
	var out WeeklySchedule
	for _, day := range Weekdays {
		d := o.Get(day)
		if d.IsNull() {
			continue
		}
		dd, ok := d.Object()
		if !ok || sortedJoin(dd.Keys()) != "end,start" {
			return WeeklySchedule{}, problem.BadRequest("Each day is either off or a From and To time.")
		}
		start, okStart := dd.Get("start").Str()
		end, okEnd := dd.Get("end").Str()
		if !okStart || !okEnd || !startTime.MatchString(start) || !endTime.MatchString(end) {
			return WeeklySchedule{}, problem.BadRequest("Working hours go in half-hour steps.")
		}
		if start >= end {
			return WeeklySchedule{}, problem.BadRequest(dayName[day] + "'s hours have to end after they start.")
		}
		*out.day(day) = &DayHours{Start: start, End: end}
	}
	return out, nil
}

// sortedJoin is `keys.sort().join()`: sorted by UTF-16 code units, joined with commas.
func sortedJoin(keys []string) string {
	sorted := slices.Clone(keys)
	slices.SortFunc(sorted, func(a, b string) int {
		return slices.Compare(utf16.Encode([]rune(a)), utf16.Encode([]rune(b)))
	})
	return strings.Join(sorted, ",")
}

// ── Out of office ────────────────────────────────────────────────────────────

// MaxTimeOffLabel caps a time-off block's label.
const MaxTimeOffLabel = 80

// MaxTimeOffDays caps one block: longer than a year is almost certainly a typo in the year.
const MaxTimeOffDays = 366

var calendarDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ReadDate is readDate: a calendar date "YYYY-MM-DD" that really exists (no 2026-02-30).
func ReadDate(value js.Value, label string) (string, error) {
	s, ok := value.Str()
	if !ok || !calendarDate.MatchString(s) {
		return "", problem.BadRequest(label + " should be a date.")
	}
	d, ok := js.ParseDate(s + "T00:00:00Z")
	if !ok || js.ISOString(d)[:10] != s {
		return "", problem.BadRequest(label + " isn't a real date.")
	}
	return s, nil
}

// TimeOffDates is a checked time-off block.
type TimeOffDates struct {
	StartsOn string `json:"startsOn"`
	EndsOn   string `json:"endsOn"`
}

// ReadTimeOffDates is readTimeOffDates: real dates, in order, at most MaxTimeOffDays.
func ReadTimeOffDates(startsOn, endsOn js.Value) (TimeOffDates, error) {
	s, err := ReadDate(startsOn, "The first day away")
	if err != nil {
		return TimeOffDates{}, err
	}
	e, err := ReadDate(endsOn, "The last day away")
	if err != nil {
		return TimeOffDates{}, err
	}
	if e < s {
		return TimeOffDates{}, problem.BadRequest("The last day away can't be before the first.")
	}
	st, _ := js.ParseDate(s + "T00:00:00Z")
	et, _ := js.ParseDate(e + "T00:00:00Z")
	days := float64(et.UnixMilli()-st.UnixMilli())/86_400_000 + 1
	if days > MaxTimeOffDays {
		return TimeOffDates{}, problem.BadRequest("Time away can be up to a year. Check the dates.")
	}
	return TimeOffDates{StartsOn: s, EndsOn: e}, nil
}

// ── Photo ────────────────────────────────────────────────────────────────────

// MaxAvatarBytes is generous headroom for the 400×400 image the browser makes and sends.
const MaxAvatarBytes = 1_048_576

// AvatarImage is a photo whose type was read from its own bytes.
type AvatarImage struct {
	Bytes       []byte
	ContentType string // "image/jpeg", "image/png" or "image/webp"
	Ext         string // "jpg", "png" or "webp"
}

// SniffImage is sniffImage: the type by the file's own first bytes, never by what the sender
// says it is. Nil for anything but JPEG, PNG and WebP.
func SniffImage(b []byte) *AvatarImage {
	switch {
	case len(b) >= 3 && b[0] == 0xff && b[1] == 0xd8 && b[2] == 0xff:
		return &AvatarImage{Bytes: b, ContentType: "image/jpeg", Ext: "jpg"}
	case len(b) >= 8 && string(b[:8]) == "\x89PNG\r\n\x1a\n":
		return &AvatarImage{Bytes: b, ContentType: "image/png", Ext: "png"}
	case len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		return &AvatarImage{Bytes: b, ContentType: "image/webp", Ext: "webp"}
	}
	return nil
}

// ReadAvatar is readAvatar: a base64 photo, decoded as atob decodes it, at most
// MaxAvatarBytes, and a JPEG, PNG or WebP by its first bytes.
func ReadAvatar(value js.Value) (AvatarImage, error) {
	s, ok := value.Str()
	if !ok || s == "" {
		return AvatarImage{}, problem.BadRequest("Choose a photo first.")
	}
	// base64 is 4/3 the size; refuse before decoding something huge.
	if float64(js.Len(s)) > math.Ceil(float64(MaxAvatarBytes)/3)*4+4 {
		return AvatarImage{}, problem.BadRequest("That photo is too large. Try a smaller one.")
	}
	b, ok := forgivingBase64(s)
	if !ok {
		return AvatarImage{}, problem.BadRequest("That photo didn't come through. Try again.")
	}
	if len(b) > MaxAvatarBytes {
		return AvatarImage{}, problem.BadRequest("That photo is too large. Try a smaller one.")
	}
	img := SniffImage(b)
	if img == nil {
		return AvatarImage{}, problem.BadRequest("Use a JPG, PNG or WebP photo.")
	}
	return *img, nil
}

// forgivingBase64 is atob: the HTML standard's forgiving-base64 decode. ASCII whitespace
// (tab, LF, FF, CR, space) anywhere is dropped; then, when the length is a multiple of four,
// one "=" or a final "==" is removed; a length of 1 mod 4 is refused, as is any character
// outside A-Z a-z 0-9 + / (so "=" anywhere else, "-" and "_" too); bits left over in the last
// character are ignored. encoding/base64 alone would refuse unpadded input, tolerate CR and
// LF only, and accept "AA=" (Deno refuses it). Checked against Deno 2.9.6.
func forgivingBase64(s string) ([]byte, bool) {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		switch c := s[i]; c {
		case '\t', '\n', '\f', '\r', ' ':
		default:
			b.WriteByte(c)
		}
	}
	data := b.String()
	if len(data)%4 == 0 {
		if strings.HasSuffix(data, "==") {
			data = data[:len(data)-2]
		} else if strings.HasSuffix(data, "=") {
			data = data[:len(data)-1]
		}
	}
	if len(data)%4 == 1 {
		return nil, false
	}
	for i := 0; i < len(data); i++ {
		c := data[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/') {
			return nil, false
		}
	}
	out, err := base64.RawStdEncoding.DecodeString(data)
	if err != nil {
		return nil, false
	}
	return out, true
}

// AvatarBucket is the Storage bucket avatars live in.
const AvatarBucket = "agent-avatars"

var avatarPath = regexp.MustCompile(`^/storage/v1/object/public/agent-avatars/([0-9a-f-]{36})/([0-9a-f-]{36}\.(?:jpg|png|webp))$`)

// AvatarKeyFromURL is avatarKeyFromUrl: the object key inside the bucket for a stored avatar
// path of ours in this advisor's folder; false for anything else. "" stands for null.
func AvatarKeyFromURL(url string, agentID string) (string, bool) {
	if url == "" {
		return "", false
	}
	m := avatarPath.FindStringSubmatch(url)
	if m == nil || m[1] != agentID {
		return "", false
	}
	return m[1] + "/" + m[2], true
}

// ── Notifications (3.12.3) ───────────────────────────────────────────────────

// ReadSwitch is readSwitch: a boolean, never defaulted.
func ReadSwitch(value js.Value, label string) (bool, error) {
	b, ok := value.Bool()
	if !ok {
		return false, problem.BadRequest(label + " didn't come through. Reload and try again.")
	}
	return b, nil
}

// ── Signature (3.12.4) ───────────────────────────────────────────────────────

// Signature limits.
const (
	MaxSignature      = 500
	MaxSignatureLines = 8
)

// SignatureFields are the only merge fields a signature may use.
var SignatureFields = []string{"agent.name", "agent.phone", "agent.email"}

var mergeField = js.Regexp(`\{\{\s*([^}]*?)\s*\}\}`, "")

// UnknownSignatureFields is unknownSignatureFields: the merge fields a signature names that
// are not one of the three, as typed inside the braces, once each, in order.
func UnknownSignatureFields(text string) []string {
	out := []string{}
	for _, m := range mergeField.FindAllStringSubmatch(text, -1) {
		if !slices.Contains(SignatureFields, m[1]) && !slices.Contains(out, m[1]) {
			out = append(out, m[1])
		}
	}
	return out
}

// ReadSignature is readSignature: plain text (Q19), at most 8 lines and 500 characters, only
// the three merge fields. Empty (or missing) is nil, "use the default". Trailing spaces and
// blank lines at either end are dropped.
func ReadSignature(value js.Value) (*string, error) {
	if value.IsNullish() {
		return nil, nil
	}
	s, ok := value.Str()
	if !ok {
		return nil, problem.BadRequest("Your signature didn't come through. Reload and try again.")
	}
	s = strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = js.TrimEnd(l)
	}
	t := strings.Trim(strings.Join(lines, "\n"), "\n")
	if js.Trim(t) == "" {
		return nil, nil
	}
	if js.Len(t) > MaxSignature {
		return nil, problem.BadRequest("A signature can be up to " + strconv.Itoa(MaxSignature) + " characters.")
	}
	if strings.Count(t, "\n")+1 > MaxSignatureLines {
		return nil, problem.BadRequest("A signature can be up to " + strconv.Itoa(MaxSignatureLines) + " lines.")
	}
	if unknown := UnknownSignatureFields(t); len(unknown) > 0 {
		return nil, problem.BadRequest("We don't have a {{" + unknown[0] + "}} field. You can use {{agent.name}}, {{agent.phone}} or {{agent.email}}.")
	}
	return &t, nil
}

// ── Out-of-office auto-reply ─────────────────────────────────────────────────

// MaxAutoReply caps the automatic reply's words.
const MaxAutoReply = 600

// AutoReply is the out-of-office reply: on or off, and the words (nil when there are none).
type AutoReply struct {
	Enabled bool    `json:"enabled"`
	Text    *string `json:"text"`
}

// ReadAutoReply is readAutoReply: on or off, and the words when on (Q21). Only
// `{{return_date}}` may be filled.
func ReadAutoReply(enabled, text js.Value) (AutoReply, error) {
	on := enabled.IsTrue()
	if _, isBool := enabled.Bool(); !enabled.IsNullish() && !isBool {
		return AutoReply{}, problem.BadRequest("The automatic reply didn't come through. Reload and try again.")
	}
	s, isString := text.Str()
	if !text.IsNullish() && !isString {
		return AutoReply{}, problem.BadRequest("The automatic reply didn't come through. Reload and try again.")
	}
	t := ""
	if isString {
		t = js.Trim(s)
	}
	if js.Len(t) > MaxAutoReply {
		return AutoReply{}, problem.BadRequest("An automatic reply can be up to " + strconv.Itoa(MaxAutoReply) + " characters.")
	}
	for _, m := range mergeField.FindAllStringSubmatch(t, -1) {
		if m[1] != "return_date" {
			return AutoReply{}, problem.BadRequest("We don't have a {{" + m[1] + "}} field. You can use {{return_date}}.")
		}
	}
	if on && t == "" {
		return AutoReply{}, problem.BadRequest("Add the words for your automatic reply, or turn it off.")
	}
	if t == "" {
		return AutoReply{Enabled: on}, nil
	}
	return AutoReply{Enabled: on, Text: &t}, nil
}
