package client

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// §2.6's copy is the Next app's, word for word (docs/GO-MIGRATION.md §4.10). Comparing it to
// itself would pass forever while the two apps drifted, so this reads the TypeScript.
//
// Two of these strings are load-bearing beyond their screen, which is why they are named
// rather than swept up in a loop:
//
//   - replyWindow is the settled authenticated-surface promise. The desktop artboard carries
//     three different ones; §2.1 and §2.2 settled on this wording, and the competing "< 2h"
//     lives in the public proof table behind a strict-mode flag so it cannot ship
//     unexamined. One string, the settled one, everywhere.
//   - newSubtitle must NOT promise a quote. BRD §6.5 routes structured intake through
//     quote-request, which creates a Trip in `inquiry`. 2.6.3 is prose that lands in the
//     inbox, and wording it as a quote would make it a second intake queue bypassing the
//     pipeline that decision consolidated onto.
func TestMessagesCopyMatchesTheNextApp(t *testing.T) {
	read := func(parts ...string) string {
		path := filepath.Join(append([]string{"..", "..", "..", ".."}, parts...)...)
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("reading %s: %v", path, err)
		}
		join := regexp.MustCompile(`['"]\s*\+\s*\n?\s*['"]`)
		return strings.NewReplacer(`\'`, "'", `\"`, `"`).
			Replace(join.ReplaceAllString(string(raw), ""))
	}

	m := MessagesCopy
	shared := read("web", "lib", "messages", "content.ts")
	for name, message := range map[string]string{
		"title": m.Title, "subtitle": m.Subtitle,
		"advisorName": m.AdvisorName, "advisorInitials": m.AdvisorInitials,
		"replyWindow":       m.ReplyWindow,
		"searchPlaceholder": m.SearchPlaceholder, "searchEmpty": m.SearchEmpty,
		"generalThreadTitle": m.GeneralThreadTitle,
		"emptyTitle":         m.EmptyTitle, "emptyBody": m.EmptyBody, "emptyCta": m.EmptyCta,
		"newCta": m.NewCta, "backToMessages": m.BackToMessages,
		"threadEmptyBody": m.ThreadEmptyBody,
		"newTitle":        m.NewTitle, "newBodyLabel": m.NewBodyLabel,
		"newSubtitle": m.NewSubtitle, "newPlaceholder": m.NewPlaceholder,
		"newSend": m.NewSend, "newSending": m.NewSending, "newFailed": m.NewFailed,
		"attachDeferred": m.AttachDeferred,
	} {
		if !strings.Contains(shared, message) {
			t.Errorf("%s is not in web/lib/messages/content.ts word for word:\n  %q", name, message)
		}
	}

	// The two-pane chrome has no mobile counterpart at all, so it lives beside the route
	// rather than in the shared table — §2.2.7 splits its copy the same way.
	web := read("web", "app", "(client)", "messages", "content.ts")
	for name, message := range map[string]string{
		"selectTitle": m.SelectTitle, "selectBody": m.SelectBody,
	} {
		if !strings.Contains(web, message) {
			t.Errorf("%s is not in the §2.6 web chrome word for word:\n  %q", name, message)
		}
	}

	// The settled promise is ONE string: §2.6 and §2.2.7 must not drift apart on it.
	if m.ReplyWindow != ThreadMessages.ReplyWindow {
		t.Errorf("two reply promises: %q and %q", m.ReplyWindow, ThreadMessages.ReplyWindow)
	}
}
