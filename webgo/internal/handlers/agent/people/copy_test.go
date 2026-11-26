package people

import (
	"bytes"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	xhtml "golang.org/x/net/html"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// Copy moves byte for byte (CLAUDE.md; check_copy_parity.py's idea). While web/ exists, this
// reads the Next sources' copy objects and checks each string is in the Go page that shows it
// (or in a Go constant). Static copy lives in the page files; copy Go chooses between lives
// in Go. Either way it must equal the content.ts value exactly.

// copyCase: the TS object key in file must appear verbatim in page (or equal goValue).
type copyCase struct {
	file    string // under web/
	object  string // the exported object holding key, when the file has more than one
	key     string // the key, written `key: "value"` in the TS object
	page    string // under pages/, "" when Go holds the string
	goValue string
}

var copyCases = []copyCase{
	// §3.2.1 worklist (AGENT_COPY, LEAD_COPY)
	{file: "lib/agent/content.ts", key: "proposalsTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "proposalsEmpty", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "paymentsTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "paymentsEmpty", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "inquiriesTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "inquiriesEmpty", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "departingTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "departingEmpty", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "messagesTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "messagesEmpty", page: "agent/people/worklist.html"},
	{file: "lib/agent/content.ts", key: "greetingZero", goValue: copyGreetingZero},
	{file: "lib/agent/content.ts", key: "greetingZeroSub", goValue: copyGreetingZeroSub},
	{file: "lib/agent/content.ts", key: "greetingOne", goValue: copyGreetingOne},
	{file: "lib/agent/content.ts", key: "cycleTimeUnavailable", goValue: copyCycleUnavailable},
	{file: "lib/agent/leadsCopy.ts", key: "worklistTitle", page: "agent/people/worklist.html"},
	{file: "lib/agent/leadsCopy.ts", key: "worklistEmpty", page: "agent/people/worklist.html"},
	// §3.2.3 calendar
	{file: "lib/agent/content.ts", key: "calendarEmpty", page: "agent/people/calendar.html"},
	{file: "lib/agent/content.ts", key: "calendarMonthLabel", page: "agent/people/calendar.html"},
	{file: "lib/agent/content.ts", key: "calendarAgendaLabel", page: "agent/people/calendar.html"},
	{file: "lib/agent/content.ts", key: "availabilityDeferred", page: "agent/people/calendar.html"},
	// §3.3.1 roster
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "searchPlaceholder", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "colClient", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "colLastTrip", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "colNextTrip", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "colLifetime", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "bulkLegend", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "bulkTagPlaceholder", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "bulkAdd", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "bulkRemove", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "bulkSelectAll", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "paginationPrev", page: "agent/people/clients.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "paginationNext", page: "agent/people/clients.html"},
	// §3.3.3 / §3.3.4 new and edit
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "newClientTitle", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "newClientSub", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "groupBasics", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "groupContact", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "groupAddress", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "groupDates", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "groupNotes", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "hintPreferredName", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "hintDates", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "hintTags", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "hintNotes", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "saveAndTrip", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "addDate", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "newTagPlaceholder", page: "agent/people/client-new.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "editClientSub", goValue: copyEditClientSub},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "notFoundTitle", page: "agent/people/client-not-found.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "notFoundBody", page: "agent/people/client-not-found.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "notFoundAction", page: "agent/people/client-not-found.html"},
	// §3.3.2 client detail
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "archivedBanner", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "snapshotTitle", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "preferencesTitle", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "householdTitle", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "emergencyTitle", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "statLifetime", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "statCommission", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "statLastContact", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "noPreferences", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "noHousehold", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "noAddress", goValue: copyNoAddress},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "passportExpiringSoon", goValue: copyPassportSoon},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "tripsEmpty", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "threadsEmpty", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "documentsEmpty", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "noteComposerEyebrow", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "noteComposerPlaceholder", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "notesEmpty", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "activityEmpty", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "activityNote", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "archiveEyebrow", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "archiveReasonLabel", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "archiveReasonPlaceholder", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "restoreEyebrow", goValue: copyRestoreEyebrow},
	{file: "lib/agent/content.ts", object: "CLIENT_COPY", key: "restoreBody", goValue: copyRestoreBody},
	// §3.9.7 / §3.3.11 merge
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "title", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "sub", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "pickHeading", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "searchLabel", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "searchPlaceholder", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "searchButton", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "keeping", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "mergingIn", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "swap", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "pickAnother", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "notMergeable", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "pickerHeading", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "pickerSub", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "colField", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "pinned", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "review", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "cancel", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "confirmResult", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "confirm", page: "agent/people/client-merge.html"},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "noCandidates", goValue: mergeNoCandidates},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "noResults", goValue: mergeNoResults},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "reasonEmail", goValue: mergeReasonEmail},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "reasonPhone", goValue: mergeReasonPhone},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "reasonName", goValue: mergeReasonName},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "reasonSearch", goValue: mergeReasonSearch},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "choose", goValue: mergeChoose},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "noSignIn", goValue: mergeNoSignIn},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "blank", goValue: mergeBlank},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "allSame", goValue: mergeAllSame},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "blockedArchived", goValue: mergeBlockedArchived},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "blockedCompanions", goValue: mergeBlockedCompanions},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "stale", goValue: mergeStale},
	{file: "lib/agent/content.ts", object: "MERGE_COPY", key: "failed", goValue: mergeFailed},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateTitle", page: "agent/people/client.html"},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "mfaStale", goValue: accMfaStale},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateBodyVerify", goValue: accGateBodyVerify},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateBodyNoFactor", goValue: accGateBodyNoFactor},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateVerify", goValue: accGateVerify},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateSetUp", goValue: accGateSetUp},
	{file: "lib/agent/content.ts", object: "ACCOUNT_ADMIN_COPY", key: "gateTitle", page: "agent/people/client-merge.html"},
	// §3.8 leads
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "title", page: "agent/people/leads.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "intro", page: "agent/people/leads.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "addLead", page: "agent/people/leads.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "back", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "detailsTitle", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "notesTitle", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "reply", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "replyHint", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "markContacted", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "invite", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "close", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "reopen", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "deleteSpam", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "openClient", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteTitle", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteBody", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteLastNameHint", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteSend", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closeTitle", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closeBody", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closeReasonLabel", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closeNoteLabel", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closeConfirm", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "deleteTitle", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "deleteBody", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "deleteConfirm", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "cancel", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "addedToExisting", page: "agent/people/lead.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "notFoundTitle", page: "agent/people/lead-not-found.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "notFoundBody", page: "agent/people/lead-not-found.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "back", page: "agent/people/lead-not-found.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "back", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "addTitle", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "addIntro", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "firstName", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "lastName", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "email", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "phone", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "source", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "note", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "save", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "openClient", page: "agent/people/lead-new.html"},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "filterOpen", goValue: leadFilterOpen},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "filterConverted", goValue: leadFilterConverted},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "filterClosed", goValue: leadFilterClosed},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "filterAll", goValue: leadFilterAll},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "emptyOpen", goValue: leadEmptyOpen},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "emptyOther", goValue: leadEmptyOther},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "alreadyClient", goValue: leadAlreadyClient},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "emailLabel", goValue: leadEmailLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "phoneLabel", goValue: leadPhoneLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "sourceLabel", goValue: leadSourceLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "firstNoteLabel", goValue: leadFirstNoteLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "contactedLabel", goValue: leadContactedLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "convertedLabel", goValue: leadConvertedLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "closedLabel", goValue: leadClosedLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "campaignLabel", goValue: leadCampaignLabel},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "addedByYou", goValue: leadAddedByYou},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "aboutPrefix", goValue: leadAboutPrefix},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "stale", goValue: leadStale},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "failed", goValue: leadFailed},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteExisting", goValue: leadInviteExisting},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "inviteCreatedNotSent", goValue: leadInviteNotSent},
	{file: "lib/agent/leadsCopy.ts", object: "LEAD_COPY", key: "clientExists", goValue: leadClientExists},
}

// tsString finds `key: "value"` (the value may start on the next line) and unquotes it.
func tsString(t *testing.T, src, key string) string {
	t.Helper()
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(key) + `:\s*\n?\s*("(?:[^"\\]|\\.)*")`)
	m := re.FindStringSubmatch(src)
	if m == nil {
		t.Errorf("%s: no string key %q", "content", key)
		return ""
	}
	v, err := strconv.Unquote(m[1])
	if err != nil {
		t.Errorf("%s: %v", key, err)
	}
	return v
}

// visibleText is every text node and attribute value in a page file, one per line, so a
// string in a comment (which the loader strips anyway) does not count as shipped copy.
func visibleText(t *testing.T, b []byte) string {
	t.Helper()
	doc, err := xhtml.Parse(bytes.NewReader(b))
	if err != nil {
		t.Fatal(err)
	}
	var out strings.Builder
	var walk func(*xhtml.Node)
	walk = func(n *xhtml.Node) {
		switch n.Type {
		case xhtml.TextNode:
			out.WriteString(n.Data + "\n")
		case xhtml.ElementNode:
			for _, a := range n.Attr {
				out.WriteString(a.Val + "\n")
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return out.String()
}

func TestCopyMatchesTheNextSources(t *testing.T) {
	webDir := filepath.Join("..", "..", "..", "..", "..", "web")
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6); the Go pages are the source of truth now")
	}
	sources := map[string]string{}
	pageText := map[string]string{}
	for _, c := range copyCases {
		if _, ok := sources[c.file]; !ok {
			b, err := os.ReadFile(filepath.Join(webDir, c.file))
			if err != nil {
				t.Fatal(err)
			}
			sources[c.file] = string(b)
		}
		src := sources[c.file]
		if c.object != "" {
			i := strings.Index(src, "export const "+c.object+" = {")
			if i < 0 {
				t.Fatalf("%s: no object %s", c.file, c.object)
			}
			src = src[i:]
		}
		want := tsString(t, src, c.key)
		if c.page == "" {
			if c.goValue != want {
				t.Errorf("%s %s: Go has %q, Next has %q", c.file, c.key, c.goValue, want)
			}
			continue
		}
		if _, ok := pageText[c.page]; !ok {
			b, err := fs.ReadFile(pages.FS, c.page)
			if err != nil {
				t.Fatal(err)
			}
			pageText[c.page] = visibleText(t, b)
		}
		if !strings.Contains(pageText[c.page], want) {
			t.Errorf("%s does not carry %s %q byte for byte", c.page, c.key, want)
		}
	}
}

// The label maps Go keeps for §3.8 match leadsCopy.ts entry for entry.
func TestLeadLabelMapsMatchTheNextSources(t *testing.T) {
	b, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "web", "lib", "agent", "leadsCopy.ts"))
	if os.IsNotExist(err) {
		t.Skip("web/ is gone (Phase 6)")
	}
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	for object, m := range map[string]map[string]string{
		"LEAD_STATUS_LABEL":  leadStatusLabel,
		"LEAD_STATUS_KIND":   leadStatusKind,
		"LEAD_SOURCE_LABEL":  leadSourceLabels,
		"CLOSE_REASON_LABEL": closeReasonLabel,
		"PAGE_LABEL":         leadPageLabels,
	} {
		i := strings.Index(src, object+": Record<")
		if i < 0 {
			i = strings.Index(src, "const "+object+" ")
		}
		if i < 0 {
			t.Fatalf("no %s in leadsCopy.ts", object)
		}
		body := src[i : i+strings.Index(src[i:], "};")]
		if n := strings.Count(body, ": \""); n != len(m) {
			t.Errorf("%s: Next has %d entries, Go has %d", object, n, len(m))
		}
		for k, v := range m {
			key := k
			if strings.ContainsRune(k, '-') {
				key = strconv.Quote(k)
			}
			if !strings.Contains(body, key+": "+strconv.Quote(v)) {
				t.Errorf("%s[%s] = %q is not Next's", object, k, v)
			}
		}
	}
}
