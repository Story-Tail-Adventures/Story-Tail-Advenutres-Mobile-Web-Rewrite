package client

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// The zone the thread is read in is the TRAVELER'S, and these tests are mostly about that
// one fact. Kingston is UTC-5 with no daylight saving, so an instant late in the UTC evening
// belongs to the previous day there — the case that makes an ambient-zone implementation
// wrong for most of the Caribbean, most of the day.
var (
	kingston = Location("America/Jamaica")
	utc      = Location("UTC")
)

func instant(t *testing.T, iso string) time.Time {
	t.Helper()
	got, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestAnUnusableZoneFallsBackToUTCRatherThanFailing(t *testing.T) {
	// platform_user.time_zone is free text that onboarding wrote. One bad row costs a wrong
	// hour, not a blank thread.
	for _, bad := range []string{"", "Mars/Olympus", "EST5EDT4", "../../etc/passwd"} {
		if got := Location(bad); got != time.UTC {
			t.Errorf("Location(%q) = %v", bad, got)
		}
	}
}

func TestATimeIsFormattedInTheTravelersZone(t *testing.T) {
	// 2026-03-14T23:14Z is 6:14p the same evening in Kingston.
	const evening = "2026-03-14T23:14:00Z"
	if got := FormatMessageTime(evening, kingston); got != "6:14p" {
		t.Errorf("Kingston = %q", got)
	}
	if got := FormatMessageTime(evening, utc); got != "11:14p" {
		t.Errorf("UTC = %q", got)
	}
	for _, tc := range []struct{ iso, want string }{
		{"2026-03-14T00:05:00Z", "12:05a"}, // midnight is 12, not 0
		{"2026-03-14T12:00:00Z", "12:00p"}, // noon is p
		{"2026-03-14T11:59:00Z", "11:59a"},
		{"2026-03-14T09:07:00Z", "9:07a"}, // no leading zero on the hour
	} {
		if got := FormatMessageTime(tc.iso, utc); got != tc.want {
			t.Errorf("%s = %q, want %q", tc.iso, got, tc.want)
		}
	}
	if got := FormatMessageTime("not a time", utc); got != "" {
		t.Errorf("a junk timestamp = %q; it must not render as an hour", got)
	}
}

func TestTheDaySeparatorIsJudgedInTheTravelersZone(t *testing.T) {
	now := instant(t, "2026-03-15T02:00:00Z") // still the 14th in Kingston
	for _, tc := range []struct {
		name, iso string
		loc       *time.Location
		want      string
	}{
		{"same evening there, Today", "2026-03-14T23:14:00Z", kingston, "Today"},
		{"same instant in UTC is already the 15th", "2026-03-14T23:14:00Z", utc, "Yesterday"},
		{"the day before there", "2026-03-13T20:00:00Z", kingston, "Yesterday"},
		{"older than that is a date", "2026-03-08T20:00:00Z", kingston, "Mar 8"},
		{"and the date is the zone's", "2026-03-09T02:00:00Z", kingston, "Mar 8"},
		{"junk renders as nothing", "", kingston, ""},
	} {
		if got := FormatDaySeparator(tc.iso, tc.loc, now); got != tc.want {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestMessagesAreGroupedByTheTravelersDay(t *testing.T) {
	now := instant(t, "2026-03-15T02:00:00Z")
	messages := []ThreadMessage{
		{ID: "m1", CreatedAt: "2026-03-13T18:00:00Z"},
		{ID: "m2", CreatedAt: "2026-03-14T14:00:00Z"},
		// 02:00Z on the 15th is still the 14th in Kingston, so this joins the bucket above
		// rather than opening a new one.
		{ID: "m3", CreatedAt: "2026-03-15T02:30:00Z"},
		{ID: "m4", CreatedAt: "not a time"},
	}
	days := GroupMessagesByDay(messages, kingston, now)
	if len(days) != 2 {
		t.Fatalf("%d buckets, want 2: %+v", len(days), days)
	}
	if days[0].Label != "Yesterday" || len(days[0].Messages) != 1 {
		t.Errorf("first = %q with %d", days[0].Label, len(days[0].Messages))
	}
	if days[1].Label != "Today" || len(days[1].Messages) != 2 {
		t.Errorf("second = %q with %d", days[1].Label, len(days[1].Messages))
	}
	if days[1].Messages[0].ID != "m2" || days[1].Messages[1].ID != "m3" {
		t.Error("the order inside a day changed")
	}
	// The same list in UTC splits differently, which is the whole point.
	if got := len(GroupMessagesByDay(messages, utc, now)); got != 3 {
		t.Errorf("%d buckets in UTC, want 3", got)
	}
}

// A day that is not adjacent opens its own bucket. Merging it into the earlier one would
// reorder somebody's messages.
func TestARepeatedDayDoesNotMergeBackwards(t *testing.T) {
	now := instant(t, "2026-03-20T12:00:00Z")
	days := GroupMessagesByDay([]ThreadMessage{
		{ID: "a", CreatedAt: "2026-03-14T10:00:00Z"},
		{ID: "b", CreatedAt: "2026-03-15T10:00:00Z"},
		{ID: "c", CreatedAt: "2026-03-14T11:00:00Z"},
	}, utc, now)
	if len(days) != 3 {
		t.Fatalf("%d buckets, want 3", len(days))
	}
	if days[0].Key != days[2].Key {
		t.Error("the two Mar 14 buckets do not share a key")
	}
}

// The copy is the Next app's, word for word (docs/GO-MIGRATION.md §4.10). Comparing it to
// itself would pass forever while the two apps drifted, so this reads the TypeScript.
func TestThreadCopyMatchesTheNextApp(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "web", "lib", "trips", "thread.ts")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading %s: %v", path, err)
	}
	join := regexp.MustCompile(`['"]\s*\+\s*\n?\s*['"]`)
	src := strings.NewReplacer(`\'`, "'", `\"`, `"`).Replace(join.ReplaceAllString(string(raw), ""))

	m := ThreadMessages
	for name, message := range map[string]string{
		"composePlaceholder": m.ComposePlaceholder, "sendLabel": m.SendLabel,
		"attachLabel": m.AttachLabel, "openTrip": m.OpenTrip,
		"today": m.Today, "yesterday": m.Yesterday,
		"emptyTitle": m.EmptyTitle, "emptyBody": m.EmptyBody,
		"sendFailed": m.SendFailed, "autoReply": m.AutoReply, "replyWindow": m.ReplyWindow,
		"quickSoundsGood": m.QuickSoundsGood, "quickAddPartner": m.QuickAddPartner,
		"quickSendPassport": m.QuickSendPassport, "quickScheduleCall": m.QuickScheduleCall,
	} {
		if !strings.Contains(src, message) {
			t.Errorf("%s is not in web/lib/trips/thread.ts word for word:\n  %q", name, message)
		}
	}

	// And in the order the chips are drawn, which is its own decision: the four are offered
	// identically on 2.2.7 and on §2.6's threads.
	if QuickReplies != [4]string{m.QuickSoundsGood, m.QuickAddPartner,
		m.QuickSendPassport, m.QuickScheduleCall} {
		t.Errorf("the quick replies drifted: %v", QuickReplies)
	}
}
