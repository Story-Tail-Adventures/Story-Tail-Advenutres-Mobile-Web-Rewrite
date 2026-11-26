package money

import "fmt"

// §3.12 Agent Settings' words that Go CHOOSES BETWEEN (web/lib/agent/settingsCopy.ts), byte
// for byte. Copy that never varies is written into the four page files; copy_test.go holds
// both to settingsCopy.ts.

const (
	copySettingsSaved  = "Saved."
	copySettingsFailed = "That didn't save. Check your connection and try again."

	// ── 3.12.1 Profile ─────────────────────────────────────────────────────────
	copyPhotoSaved   = "Photo updated."
	copyPhotoRemoved = "Photo removed. Clients will see your initials."
	copyNameRequired = "Add the name clients will see."
	copyPreviewRole  = "Travel Advisor"

	// ── 3.12.2 Availability ────────────────────────────────────────────────────
	copyAwayNow       = "Away now"
	copyDialogNew     = "Schedule time away"
	copyDialogEdit    = "Edit time away"
	copyConfirmDelete = "Remove this time away?"
	copyConfirmBack   = "Welcome back. End your time away now? It will show as ending yesterday."
	copyAutoReplyOn   = "Automatic reply on"
	copyAwayBack      = "I'm back"

	// 3.12.3 Notifications: the two rows' words. Renamed 2026-10-21 (Screen Inventory
	// 3.12.3): the second switch covers a lead's message too (3.8). The stored key stays
	// `quote_requests`, so saved settings carry over.
	copyClientMessages     = "Client message"
	copyClientMessagesHint = "A client writes to you."
	copyQuoteRequests      = "New inquiries and messages"
	copyQuoteRequestsHint  = "A client asks for a quote, or someone without an account writes to you."
	copyAwayRemove         = "Remove"

	// Without the page module there is no square JPEG to send: the browser is the one that
	// makes it, exactly as the Next client does.
	copyPhotoNeedsBrowser = "We couldn't read that photo. Try another one."
)

// settingsTabs are §3.12's four, in order.
var settingsTabs = []struct{ ID, Label string }{
	{"profile", "Profile"},
	{"availability", "Availability"},
	{"notifications", "Notifications"},
	{"signature", "Signature"},
}

// validSettingsTab: an unknown or missing ?tab= is the first tab, never an error page.
func validSettingsTab(v string) string {
	for _, t := range settingsTabs {
		if t.ID == v {
			return t.ID
		}
	}
	return "profile"
}

// replyWithin is the profile preview's second line: "Usually replies within 24 hours".
func replyWithin(hours int) string {
	return fmt.Sprintf("Usually replies within %d hours", hours)
}

// hoursChoice is a reply-time option: "24 hours".
func hoursChoice(n int) string { return fmt.Sprintf("%d hours", n) }

// workingOn is a day switch's label for a screen reader: "Working on Monday".
func workingOn(day string) string { return "Working on " + day }

// notifySwitchLabel is "Client message by email".
func notifySwitchLabel(what, channel string) string {
	lower := channel
	if channel == "Email" {
		lower = "email"
	} else if channel == "Push" {
		lower = "push"
	}
	return what + " by " + lower
}

// autoReplyPreviewLine is what the advisor is shown their clients will read.
func autoReplyPreviewLine(text string) string {
	return "Clients will read: \"" + text + "\""
}

// signatureFrom is the preview email's From line.
func signatureFrom(name string) string {
	return "From: " + name + " at Story-Tail Adventures"
}
