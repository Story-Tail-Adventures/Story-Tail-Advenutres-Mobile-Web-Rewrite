package people

import (
	"html"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// Copy moves byte for byte (CLAUDE.md; check_copy_parity.py's idea). While web/ exists, this
// reads the Next sources' copy objects and checks each string is in the Go page that shows it
// (or in a Go constant). Static copy lives in the page files; copy Go chooses between lives
// in Go. Either way it must equal the content.ts value exactly.

// copyCase: the TS object key in file must appear verbatim in page (or equal goValue).
type copyCase struct {
	file    string // under web/
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
		want := tsString(t, sources[c.file], c.key)
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
			pageText[c.page] = html.UnescapeString(string(b))
		}
		if !strings.Contains(pageText[c.page], want) {
			t.Errorf("%s does not carry %s %q byte for byte", c.page, c.key, want)
		}
	}
}
