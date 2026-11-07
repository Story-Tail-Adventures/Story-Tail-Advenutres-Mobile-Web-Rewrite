// Package messagetemplate ports supabase/functions/_shared/messageTemplate.ts: §3.10 Stage
// 2's request checks for message templates, server-free so they are tested on their own. The
// SQL functions check all of this again; these answer in English first, so a refused save is
// a 400 with a sentence rather than a 500 off a RAISE.
//
// Nothing in messageTemplate.ts needs the database, the network or the environment; all of it
// is ported.
package messagetemplate

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/js"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/message"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/domain/problem"
)

// MergeFields are the merge fields (Data-Model §12.4). The SQL `message_template_fields()`
// and the web's `lib/agent/templateMerge.ts` carry the same list; `templateMerge.test.ts` on
// the web side reads the migration and messageTemplate.ts to prove all three agree. Keep this
// copy in step with messageTemplate.ts.
var MergeFields = []string{
	"client.firstName",
	"trip.name",
	"trip.destination",
	"trip.dates",
	"agent.firstName",
	"payment.label",
	"payment.amount",
	"payment.dueDate",
	// Added 2026-10-16 (§3.6): the milestone's pay_url. Unfilled, and flagged, when it has none.
	"payment.link",
}

// TemplateCategories are the message_template.category values.
var TemplateCategories = []string{
	"lead_response",
	"proposal",
	"booking_confirmation",
	"pre_trip",
	"post_trip",
	"payment_reminder",
	"other",
}

// Limits on a template's name and tags.
const (
	MaxTemplateName = 80
	MaxTags         = 10
	MaxTag          = 30
)

// token is the same shape the SQL matches: `{{`, anything but braces, `}}`.
var token = regexp.MustCompile(`\{\{([^{}]*)\}\}`)

// UnknownTokens is unknownTokens: every `{{ … }}` whose inside is not a merge field, in
// order, once each.
func UnknownTokens(body string) []string {
	return tokens(body, false)
}

// UnfilledFields is unfilledFields: every merge field still sitting in a body as a raw
// `{{token}}`, in order, once each.
func UnfilledFields(body string) []string {
	return tokens(body, true)
}

func tokens(body string, known bool) []string {
	out := []string{}
	for _, m := range token.FindAllStringSubmatch(body, -1) {
		inner := js.Trim(m[1])
		if slices.Contains(MergeFields, inner) == known && !slices.Contains(out, inner) {
			out = append(out, inner)
		}
	}
	return out
}

// RefuseUnfilledFields is refuseUnfilledFields: refuse a message that still carries a merge
// field (Screen Inventory §3.10.3). "Insert & edit" leaves the raw token in the box, and a
// client must never read `{{trip.dates}}`. Only the known fields count, so a client's own
// `{{` in a quoted message is not caught by mistake.
func RefuseUnfilledFields(body string) error {
	left := UnfilledFields(body)
	if len(left) == 0 {
		return nil
	}
	return problem.BadRequest("Fill in " + braced(left) + " before sending. It came from the template and has no value here.")
}

// ReadCategory is readCategory.
func ReadCategory(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok || !slices.Contains(TemplateCategories, s) {
		return "", problem.BadRequest("Pick a category for this template.")
	}
	return s, nil
}

// ReadTemplateName is readTemplateName: trimmed, something in it, at most MaxTemplateName.
func ReadTemplateName(value js.Value) (string, error) {
	name := ""
	if s, ok := value.Str(); ok {
		name = js.Trim(s)
	}
	if name == "" {
		return "", problem.BadRequest("A template needs a name.")
	}
	if js.Len(name) > MaxTemplateName {
		return "", problem.BadRequest("Keep the name to " + strconv.Itoa(MaxTemplateName) + " characters.")
	}
	return name, nil
}

// ReadTemplateBody is readTemplateBody: the body as written (not trimmed: a template's blank
// lines are its shape), checked.
func ReadTemplateBody(value js.Value) (string, error) {
	s, ok := value.Str()
	if !ok || js.Trim(s) == "" {
		return "", problem.BadRequest("A template needs something in it.")
	}
	if js.Len(s) > message.MaxMessageBody {
		return "", problem.BadRequest("Keep it under " + thousands(message.MaxMessageBody) + " characters, one message's worth.")
	}
	if unknown := UnknownTokens(s); len(unknown) > 0 {
		verb := "aren't merge fields"
		if len(unknown) == 1 {
			verb = "isn't a merge field"
		}
		return "", problem.BadRequest(braced(unknown) + " " + verb + ". Pick from the list under the message.")
	}
	return s, nil
}

// ReadTags is readTags: tags trimmed, blanks and repeats dropped (ignoring case, first
// spelling kept), then checked. Absent or null is no tags.
func ReadTags(value js.Value) ([]string, error) {
	if value.IsNullish() {
		return []string{}, nil
	}
	items, ok := value.Array()
	if !ok {
		return nil, problem.BadRequest("Tags must be a list of words.")
	}
	raw := make([]string, len(items))
	for i, item := range items {
		s, ok := item.Str()
		if !ok {
			return nil, problem.BadRequest("Tags must be a list of words.")
		}
		raw[i] = s
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, r := range raw {
		tag := js.Trim(r)
		key := lowerCase(tag)
		if tag != "" && !seen[key] {
			seen[key] = true
			tags = append(tags, tag)
		}
	}
	if len(tags) > MaxTags {
		return nil, problem.BadRequest("Up to " + strconv.Itoa(MaxTags) + " tags.")
	}
	for _, tag := range tags {
		if js.Len(tag) > MaxTag {
			return nil, problem.BadRequest("Keep each tag to " + strconv.Itoa(MaxTag) + " characters.")
		}
	}
	return tags, nil
}

// braced writes each name as {{name}}, joined with ", ".
func braced(names []string) string {
	parts := make([]string, len(names))
	for i, n := range names {
		parts[i] = "{{" + n + "}}"
	}
	return strings.Join(parts, ", ")
}

// thousands is n.toLocaleString("en-US") for a non-negative integer: 8000 is "8,000".
func thousands(n int) string {
	s := strconv.Itoa(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// lowerCase is toLowerCase where it differs from Go's per-character mapping (js.ToLower):
// "İ" (U+0130) becomes "i" plus a combining dot, and a capital sigma at the end of a word
// becomes the final form "ς". Both matter to ReadTags, which folds repeats by this key:
// JavaScript keeps "İstanbul" and "istanbul" apart and folds "ΟΔΟΣ" into "οδος".
func lowerCase(s string) string {
	ascii := true
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if ascii {
		return strings.ToLower(s)
	}
	rs := []rune(s)
	var b strings.Builder
	for i, r := range rs {
		switch r {
		case 0x130:
			b.WriteString("i\U00000307")
		case 0x3a3:
			if finalSigma(rs, i) {
				b.WriteRune(0x3c2)
			} else {
				b.WriteRune(0x3c3)
			}
		default:
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// finalSigma is Unicode's Final_Sigma condition: a cased letter (then any case-ignorables)
// before, and no cased letter (after any case-ignorables) after.
func finalSigma(rs []rune, i int) bool {
	j := i - 1
	for j >= 0 && caseIgnorable(rs[j]) {
		j--
	}
	if j < 0 || !cased(rs[j]) {
		return false
	}
	k := i + 1
	for k < len(rs) && caseIgnorable(rs[k]) {
		k++
	}
	return k >= len(rs) || !cased(rs[k])
}

func cased(r rune) bool {
	return unicode.IsUpper(r) || unicode.IsLower(r) || unicode.IsTitle(r) ||
		unicode.Is(unicode.Other_Lowercase, r) || unicode.Is(unicode.Other_Uppercase, r)
}

// caseIgnorable is Case_Ignorable: marks, format characters, modifiers, and the Word_Break
// MidLetter, MidNumLet and Single_Quote characters.
func caseIgnorable(r rune) bool {
	switch r {
	case 0x27, 0x2e, 0x3a, 0xb7, 0x387, 0x55f, 0x5f4, 0x2018, 0x2019, 0x2024, 0x2027,
		0xfe13, 0xfe52, 0xfe55, 0xff07, 0xff0e, 0xff1a:
		return true
	}
	return unicode.In(r, unicode.Mn, unicode.Me, unicode.Cf, unicode.Lm, unicode.Sk)
}
