package client

import (
	"strconv"
	"strings"
	"time"
)

// Message thread presentation, the port of web/lib/trips/thread.ts.
//
// Shared by 2.2.7 (the trip thread) and §2.6's threads, which is how it is shared in Next:
// the two screens differ in their header and in which route the compose bar posts to, and in
// nothing else.
//
// THE TRAVELER'S ZONE IS AN EXPLICIT ARGUMENT, which is the whole point of this file. The
// obvious implementation formats in the ambient zone — the SERVER'S — so on a UTC host every
// traveler would read their conversation in UTC. A message sent at 6pm in Jamaica would say
// 11:00p, and the day separator above it would be wrong for anyone whose evening crosses
// midnight UTC: most of the Caribbean, most of the day. platform_user.time_zone exists for
// exactly this and is inside the client column grant.
//
// Go needs one thing Next does not: cmd/server imports time/tzdata, because a slim container
// has no zone files and time.LoadLocation fails at RUNTIME rather than at build.
//
// WHAT IS DELIBERATELY NOT HERE, as in the TypeScript: Screen-Inventory §2.2.7 names a typing
// indicator and read receipts among its primary elements. The typing indicator needs Realtime
// presence that nothing backs. Read receipts would need message.read_by_other_at, which is
// outside the client column grant on purpose — it tells a client exactly when Gyasi opened
// their message, and an advisor who reads at 11pm should not have that on the record for
// every traveler.

// ThreadMessages is THREAD_MESSAGES, word for word. thread_copy_test.go reads the TypeScript
// and fails on any difference.
var ThreadMessages = struct {
	ComposePlaceholder string
	SendLabel          string
	AttachLabel        string
	OpenTrip           string
	Today              string
	Yesterday          string
	EmptyTitle         string
	EmptyBody          string
	SendFailed         string
	QuickSoundsGood    string
	QuickAddPartner    string
	QuickSendPassport  string
	QuickScheduleCall  string
	AutoReply          string
	ReplyWindow        string
}{
	ComposePlaceholder: "Reply to Gyasi…",
	SendLabel:          "Send",
	AttachLabel:        "Attach a file",
	OpenTrip:           "Open trip",
	Today:              "Today",
	Yesterday:          "Yesterday",
	EmptyTitle:         "No messages yet",
	EmptyBody: "This is where you and Gyasi talk about this trip. Ask anything — the " +
		"small questions are the ones worth asking.",
	SendFailed:        "That message did not send. It is still here, so try again in a moment.",
	QuickSoundsGood:   "Sounds good",
	QuickAddPartner:   "Add my partner",
	QuickSendPassport: "Send a passport",
	QuickScheduleCall: "Schedule a call",
	AutoReply:         "Automatic reply",
	ReplyWindow:       "Usually replies the same day",
}

// QuickReplies are the four chips, in order. They are parity-pinned COPY rather than data:
// nothing in the schema produces them, and offering a traveler a different set of words
// depending on which list they reached the thread from is the drift the shared thread body
// exists to prevent.
var QuickReplies = [4]string{
	ThreadMessages.QuickSoundsGood,
	ThreadMessages.QuickAddPartner,
	ThreadMessages.QuickSendPassport,
	ThreadMessages.QuickScheduleCall,
}

// FallbackTimeZone is what an unusable zone string falls back to.
//
// Not defensive padding: platform_user.time_zone is free text that onboarding wrote, and one
// bad row should cost a wrong hour, not a blank thread.
const FallbackTimeZone = "UTC"

// Location resolves the traveler's zone, falling back to UTC.
func Location(timeZone string) *time.Location {
	if timeZone == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(timeZone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// parseInstant reads a timestamptz as PostgREST writes it.
func parseInstant(iso string) (time.Time, bool) {
	s := strings.TrimSpace(iso)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// dayKeyIn is yyyy-mm-dd in the traveler's zone — the ISO order "en-CA" gives the TypeScript.
func dayKeyIn(iso string, loc *time.Location) (string, bool) {
	t, ok := parseInstant(iso)
	if !ok {
		return "", false
	}
	return t.In(loc).Format(isoDate), true
}

// FormatMessageTime is "11:14a" / "2:14p", the artboards' own format, in the traveler's zone.
func FormatMessageTime(iso string, loc *time.Location) string {
	t, ok := parseInstant(iso)
	if !ok {
		return ""
	}
	local := t.In(loc)
	// Go's "3:04" is the 12-hour clock with no leading zero, which is the format the
	// artboards draw; the design wants a bare "a"/"p" rather than AM/PM.
	suffix := "a"
	if local.Hour() >= 12 {
		suffix = "p"
	}
	return local.Format("3:04") + suffix
}

// FormatDaySeparator is "Today" / "Yesterday" / "Mar 14", all judged in the traveler's zone.
//
// Yesterday is now minus 24 hours rather than calendar arithmetic, which is what the
// TypeScript does; keeping the same rule keeps the two apps agreeing on the one day a year
// where they could differ.
func FormatDaySeparator(iso string, loc *time.Location, now time.Time) string {
	key, ok := dayKeyIn(iso, loc)
	if !ok {
		return ""
	}
	if key == now.In(loc).Format(isoDate) {
		return ThreadMessages.Today
	}
	if key == now.Add(-24*time.Hour).In(loc).Format(isoDate) {
		return ThreadMessages.Yesterday
	}
	// Off the KEY rather than off the instant, so the month and day are the zone's and not
	// the server's — the bug this whole file exists to prevent, one line from the end.
	parts := strings.SplitN(key, "-", 3)
	if len(parts) != 3 {
		return ""
	}
	month, err := strconv.Atoi(parts[1])
	if err != nil || month < 1 || month > 12 {
		return ""
	}
	day, err := strconv.Atoi(parts[2])
	if err != nil {
		return ""
	}
	return usShortMonths[month-1] + " " + strconv.Itoa(day)
}

// ThreadMessage is one bubble.
type ThreadMessage struct {
	ID     string
	Sender string
	Body   string
	// CreatedAt is the raw timestamptz. It is formatted per render, in the traveler's own
	// zone, by FormatMessageTime — never stored pre-formatted.
	CreatedAt   string
	Attachments []Document
	// AutoReply marks a reply sent for the advisor while they were away (§3.12.2).
	AutoReply bool
}

// ThreadDay is one day's bucket of messages, under one separator.
type ThreadDay struct {
	// Key is yyyy-mm-dd in the traveler's zone.
	Key      string
	Label    string
	Messages []ThreadMessage
}

// GroupMessagesByDay splits a chronological list into the buckets the date separators sit
// above.
//
// The input is oldest-first, which is how the query orders it: a thread reads top to bottom
// like a conversation, unlike the document list, which is newest-first. A run of the same day
// that is NOT adjacent opens a new bucket rather than merging into the earlier one, because
// merging would reorder somebody's messages.
func GroupMessagesByDay(messages []ThreadMessage, loc *time.Location, now time.Time) []ThreadDay {
	var days []ThreadDay
	for _, m := range messages {
		key, ok := dayKeyIn(m.CreatedAt, loc)
		if !ok {
			continue
		}
		if n := len(days); n > 0 && days[n-1].Key == key {
			days[n-1].Messages = append(days[n-1].Messages, m)
			continue
		}
		days = append(days, ThreadDay{
			Key:      key,
			Label:    FormatDaySeparator(m.CreatedAt, loc, now),
			Messages: []ThreadMessage{m},
		})
	}
	return days
}
