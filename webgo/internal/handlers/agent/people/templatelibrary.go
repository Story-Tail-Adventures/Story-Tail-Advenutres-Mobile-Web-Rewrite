package people

import (
	"slices"
	"strconv"
	"strings"
)

// §3.10 Stage 2's template view model and the pure helpers over it: grouping, search, tag
// suggestions. Ported from web/lib/agent/templateLibrary.ts, with the copy from content.ts.

// messageTemplateRow is what agent_message_templates and agent_message_template answer.
type messageTemplateRow struct {
	TemplateID string   `json:"template_id"`
	Category   string   `json:"category"`
	Name       string   `json:"name"`
	Body       string   `json:"body"`
	Tags       []string `json:"tags"`
	Archived   bool     `json:"archived"`
	UpdatedAt  string   `json:"updated_at"`
}

type messageTemplate struct {
	ID              string
	Category        string
	Name            string
	Body            string
	Tags            []string
	Archived        bool
	LastEditedLabel string
}

type templateGroup struct {
	Category  string
	Label     string
	Templates []messageTemplate
}

// §3.10's copy. The library (3.10.4), the editor (3.10.5) and the picker (3.10.3) are WEB
// ONLY (Gyasi, 2026-10-14): the phone replies without a picker, so none of this has a Kotlin
// twin and the copy-parity gate does not list it.
const (
	// Library (3.10.4)
	tplTitle             = "Templates"
	tplSubtitle          = "Messages you send often, grouped by stage. Make each one your own before it goes."
	tplNewTemplate       = "New template"
	tplViewArchived      = "Archived"
	tplViewLive          = "All templates"
	tplArchivedTitle     = "Archived templates"
	tplBackToMessages    = "Messages"
	tplEmptyLibrary      = "No templates yet. Start one, and it'll be ready whenever you write to a client."
	tplEmptyArchived     = "Nothing archived."
	tplEmptyArchivedBody = "Templates you archive wait here, ready to restore."
	tplEdit              = "Edit"
	tplDuplicate         = "Duplicate"
	tplDuplicated        = "Copy made"
	tplArchive           = "Archive"
	tplRestore           = "Restore"
	tplArchivedDone      = "Archived"
	tplRestoredDone      = "Restored"
	tplActionFailed      = "That didn't save. Try again in a moment."

	// Editor (3.10.5)
	tplNewTitle       = "New template"
	tplBackToLibrary  = "Templates"
	tplNameLabel      = "Name"
	tplCategoryLabel  = "Category"
	tplBodyLabel      = "Message"
	tplBodyHint       = "Add a field from the list below. It goes in where your cursor is."
	tplFieldsLabel    = "Merge fields"
	tplTagsLabel      = "Tags"
	tplTagsHint       = "Separate tags with commas."
	tplPreviewHeading = "Preview · with sample data"
	tplSave           = "Save"
	tplSaved          = "Saved"
	tplNothingChanged = "No changes to save."
	tplUnsaved        = "Unsaved changes"
	tplLeaveUnsaved   = "You have changes that aren't saved. Leave without saving?"
	tplNameRequired   = "Give this template a name."
	tplBodyRequired   = "Write the message this template starts from."
	tplSaveFailed     = "That didn't save. Try again in a moment."
	tplNotFound       = "That template isn't in your library."

	// Picker (3.10.3)
	tplInsertTemplate    = "Insert template"
	tplPickerTitle       = "Insert a template"
	tplSearchLabel       = "Search templates"
	tplSearchPlaceholder = "Name, tag or words"
	tplNoMatch           = "No templates match."
	tplPickerEmpty       = "No templates yet."
	tplManage            = "Manage templates"
	tplPickOne           = "Pick a template to see it here."
	tplInsertAsIs        = "Insert as-is"
	tplInsertAndEdit     = "Insert & edit"
	tplCancel            = "Cancel"
	tplClose             = "Close"
	tplInserted          = "Template added. Read it over, then send."
)

// templateCategoryLabels is each category's group heading and dropdown label, in the order
// the library shows them (templateCategories).
var templateCategoryLabels = map[string]string{
	"lead_response":        "Lead response",
	"proposal":             "Proposal",
	"booking_confirmation": "Booking confirmation",
	"pre_trip":             "Pre-trip",
	"post_trip":            "Post-trip",
	"payment_reminder":     "Payment reminder",
	"other":                "Other",
}

func templateLastEdited(day string) string { return "Last edited " + day }

// templatePreviewFor is the picker's preview heading: "Preview · for Maya".
func templatePreviewFor(firstName string) string { return "Preview · for " + firstName }

// templateMissing says why "Insert as-is" is off: what the template needs that this thread
// does not have, in plain words rather than token names.
func templateMissing(fields []string) string {
	words := map[string]string{
		"client.firstName": "a first name",
		"trip.name":        "a trip",
		"trip.destination": "a destination",
		"trip.dates":       "trip dates",
		"agent.firstName":  "your first name",
		"payment.label":    "a payment",
		"payment.amount":   "a payment",
		"payment.dueDate":  "a payment",
		"payment.link":     "a pay link",
	}
	var needs once
	for _, f := range fields {
		if w, ok := words[f]; ok {
			needs.add(w)
		} else {
			needs.add(f)
		}
	}
	them := "them"
	if len(needs.list) == 1 && !strings.HasSuffix(needs.list[0], "dates") {
		them = "it"
	}
	return "This one needs " + andList(needs.list) + ", which this thread doesn't have. Use Insert & edit to fill " + them + " in yourself."
}

// templateUnknownFields is the editor's refusal, naming each unknown token.
func templateUnknownFields(tokens []string) string {
	named := make([]string, len(tokens))
	for i, t := range tokens {
		named[i] = "{{" + t + "}}"
	}
	is := "aren't merge fields"
	if len(tokens) == 1 {
		is = "isn't a merge field"
	}
	return strings.Join(named, ", ") + " " + is + ". Pick from the list under the message."
}

// templateUnfilled is the reply box's refusal, naming each field still in the message.
func templateUnfilled(fields []string) string {
	named := make([]string, len(fields))
	for i, f := range fields {
		named[i] = "{{" + f + "}}"
	}
	if len(fields) == 1 {
		return strings.Join(named, ", ") + " is still in your message, and this thread has no value for it. Fill it in before you send."
	}
	return strings.Join(named, ", ") + " are still in your message, and this thread has no values for them. Fill them in before you send."
}

// monthDayIn is "Oct 14" in a zone, off the day key rather than a time value so the month and
// the day are the advisor's and not the server's.
func monthDayIn(iso, zone string) string {
	key, ok := dayKeyIn(iso, zone)
	if !ok {
		return ""
	}
	month, _ := strconv.Atoi(key[5:7])
	day, _ := strconv.Atoi(key[8:10])
	if month < 1 || month > 12 {
		return ""
	}
	return shortMonthNames[month-1] + " " + strconv.Itoa(day)
}

// asTemplateCategory files anything the database does not name under Other, so a row added by
// a later migration shows rather than vanishing.
func asTemplateCategory(value string) string {
	if slices.Contains(templateCategories, value) {
		return value
	}
	return "other"
}

func toTemplate(row messageTemplateRow, zone string) messageTemplate {
	return messageTemplate{
		ID:              row.TemplateID,
		Category:        asTemplateCategory(row.Category),
		Name:            row.Name,
		Body:            row.Body,
		Tags:            row.Tags,
		Archived:        row.Archived,
		LastEditedLabel: templateLastEdited(monthDayIn(row.UpdatedAt, zone)),
	}
}

// byName is localeCompare(…, "en-US", {sensitivity: "base"}) as far as case goes: two names
// that differ only in case sort together, and a tie falls back to the names as written so the
// order is stable. ACCENTS ARE NOT FOLDED to their base letter, which is the one way this
// differs from the web: that shows only in a library holding two names that differ by an
// accent alone, and folding them would mean a Unicode collation table in the binary.
func byName(a, b messageTemplate) int {
	if c := strings.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)); c != 0 {
		return c
	}
	return strings.Compare(a.Name, b.Name)
}

// groupTemplates groups by category in the library's order (Lead response first, Other last),
// A to Z inside each, empty groups left out (Gyasi, 2026-10-14).
func groupTemplates(templates []messageTemplate) []templateGroup {
	var groups []templateGroup
	for _, category := range templateCategories {
		var inGroup []messageTemplate
		for _, t := range templates {
			if t.Category == category {
				inGroup = append(inGroup, t)
			}
		}
		if len(inGroup) == 0 {
			continue
		}
		slices.SortStableFunc(inGroup, byName)
		groups = append(groups, templateGroup{Category: category, Label: templateCategoryLabels[category], Templates: inGroup})
	}
	return groups
}

// matchesSearch is the picker's search: every word must appear in the name, a tag or the body.
func matchesSearch(template messageTemplate, search string) bool {
	words := strings.Fields(strings.ToLower(search))
	if len(words) == 0 {
		return true
	}
	hay := strings.ToLower(template.Name + "\n" + strings.Join(template.Tags, "\n") + "\n" + template.Body)
	for _, w := range words {
		if !strings.Contains(hay, w) {
			return false
		}
	}
	return true
}

// knownTags is every tag already used, for the editor's suggestions, A to Z, first spelling
// kept.
func knownTags(templates []messageTemplate) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range templates {
		for _, tag := range t.Tags {
			if lower := strings.ToLower(tag); !seen[lower] {
				seen[lower] = true
				out = append(out, tag)
			}
		}
	}
	slices.SortStableFunc(out, func(a, b string) int {
		if c := strings.Compare(strings.ToLower(a), strings.ToLower(b)); c != 0 {
			return c
		}
		return strings.Compare(a, b)
	})
	return out
}
