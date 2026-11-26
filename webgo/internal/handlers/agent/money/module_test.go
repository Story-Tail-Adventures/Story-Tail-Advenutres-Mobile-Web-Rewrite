package money

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/pages"
)

// The one piece of copy that lives in a SCRIPT rather than in a page or a Go constant: the
// prefill note, which only exists once a supplier has been chosen. Nothing else would catch
// it drifting from content.ts, because copy_test reads the pages and the constants.
//
// The module's arithmetic is checked here too, in the only way Go can: by reading that it
// still uses the same expressions the TypeScript does. A browser is what actually runs it,
// and the figures it shows are previews the server recomputes — so this guards the words and
// the shape, and the save guards the number.

// mustPage reads one page file out of the embedded pages FS.
func mustPage(t *testing.T, name string) []byte {
	t.Helper()
	b, err := fs.ReadFile(pages.FS, name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func moduleSource(t *testing.T) string {
	t.Helper()
	b, err := fs.ReadFile(assets.FS, "js/agent/money/line-form.js")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestModuleCarriesTheSameCopy(t *testing.T) {
	src := moduleSource(t)
	content := readWebFile(t, "lib/agent/content.ts")

	// commissionPrefilledFrom and commissionGapLine, as the TypeScript writes them, with the
	// template holes taken out so the fixed words have to match.
	for _, fragment := range []string{
		"Gross and rate filled in from this trip's ",
		" bookings. Change them if the final figures differ.",
		"Matches expected, once the fee is taken out.",
		" short of expected, after the fee. Record it as Disputed to chase it.",
		" more than expected, after the fee.",
	} {
		if !strings.Contains(content, fragment) {
			t.Errorf("content.ts no longer says %q; the module is now the odd one out", fragment)
		}
		if !strings.Contains(src, fragment) {
			t.Errorf("line-form.js does not say %q byte for byte", fragment)
		}
	}

	// The gap sentences are Go's too, for the server-rendered first paint.
	if commissionGapLine(0, "$8") != "Matches expected, once the fee is taken out." {
		t.Error("Go and the module disagree about a settled line")
	}
	if !strings.HasPrefix(commissionGapLine(800, "$8"), "$8 short of expected") {
		t.Errorf("Go says %q", commissionGapLine(800, "$8"))
	}
	if !strings.HasPrefix(commissionGapLine(-800, "$8"), "$8 more than expected") {
		t.Errorf("Go says %q", commissionGapLine(-800, "$8"))
	}
}

func TestModuleKeepsTheTypeScriptArithmetic(t *testing.T) {
	src := moduleSource(t)
	for _, want := range []string{
		// payments.ts dollarsToCents, byte for byte.
		`replace(/[$,\s]/g, "")`,
		`/^\d+(\.\d{1,2})?$/`,
		"Math.round(Number(cleaned) * 100)",
		// commissionForm.ts parseRate.
		`replace(/[%\s]/g, "")`,
		`/^\d{1,3}(\.\d{1,2})?$/`,
		// previewExpectedCents and previewGapCents.
		"Math.round((cents * pct) / 100)",
		"expected - f - r",
		// formatTripMoney shows cents only where there are any.
		"cents % 100 === 0 ? 0 : 2",
		// And an em dash for a null, never $0 — CommissionLineForm's own answer.
		`cents === null || pct === null ? "\u2014"`,
	} {
		if !strings.Contains(src, want) {
			t.Errorf("line-form.js no longer contains %q", want)
		}
	}
	// A preview is never trusted: the module must not post anything itself.
	for _, forbidden := range []string{"fetch(", "XMLHttpRequest", ".submit()"} {
		if strings.Contains(src, forbidden) {
			t.Errorf("line-form.js uses %q; it is a preview, not a writer", forbidden)
		}
	}
}

// readWebFile reads one file out of the Next app, which sits beside webgo in the repo.
func readWebFile(t *testing.T, rel string) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		p := filepath.Join(dir, "web", rel)
		if b, err := os.ReadFile(p); err == nil {
			return string(b)
		}
		dir = filepath.Dir(dir)
	}
	t.Skipf("web/%s is not here; the Next app has been deleted", rel)
	return ""
}

// The module finds its fields by id and by class. An id dropped from a page file breaks the
// enhancement SILENTLY — getElementById answers null, the listener is never attached, and the
// page still renders perfectly. That is how the payment form shipped for an afternoon with no
// Disputed suggestion: the two radios had data-slots and no ids. So every handle the module
// reaches for is checked against the pages that have to provide it.
func TestModuleHandlesExistInThePages(t *testing.T) {
	src := moduleSource(t)
	line := string(mustPage(t, "agent/money/line.html"))
	add := string(mustPage(t, "agent/money/add.html"))

	// Every id the module looks up, taken from the module itself rather than from a list
	// here, so a new lookup is checked the day it is written.
	ids := map[string]bool{}
	for _, call := range []string{`$("`, `getElementById("`} {
		rest := src
		for {
			i := strings.Index(rest, call)
			if i < 0 {
				break
			}
			rest = rest[i+len(call):]
			if j := strings.Index(rest, `"`); j > 0 {
				ids[rest[:j]] = true
			}
		}
	}
	if len(ids) < 7 {
		t.Fatalf("only found %d ids in the module; the scan is wrong", len(ids))
	}
	for id := range ids {
		attr := `id="` + id + `"`
		if !strings.Contains(line, attr) && !strings.Contains(add, attr) {
			t.Errorf("the module looks up %q, which neither page defines", id)
		}
	}

	// And the handles each page must carry itself.
	for _, c := range []struct {
		page, name, want string
	}{
		{line, "line.html", `id="line-gross"`},
		{line, "line.html", `id="line-rate"`},
		{line, "line.html", `id="pay-received"`},
		{line, "line.html", `id="pay-fee"`},
		{line, "line.html", `id="pay-status-received"`},
		{line, "line.html", `id="pay-status-disputed"`},
		{line, "line.html", `class="type-body2 mny-gap"`},
		{line, "line.html", `data-expected=`},
		{add, "add.html", `id="line-supplier"`},
		{add, "add.html", `id="line-terms"`},
		{add, "add.html", `id="line-lag"`},
		{add, "add.html", `id="line-prefill-note"`},
	} {
		if !strings.Contains(c.page, c.want) {
			t.Errorf("%s no longer carries %s, which the module reaches for", c.name, c.want)
		}
	}
	// The read-out is found by class on both pages.
	for name, page := range map[string]string{"line.html": line, "add.html": add} {
		if !strings.Contains(page, `class="mny-expected"`) {
			t.Errorf("%s has no .mny-expected for the module to fill", name)
		}
	}
}

// §3.11.8's module has the same silent failure mode: it finds the form's parts by id and by
// data attribute, and a handle dropped from the page file breaks the enhancement with
// nothing to show for it — querySelector answers null, no listener is attached, and the page
// still renders. So every selector the module reaches for is read out of the module itself
// and checked against the page that has to provide it.
func TestExportCenterModuleHandlesExistInThePage(t *testing.T) {
	b, err := fs.ReadFile(assets.FS, "js/agent/money/export-center.js")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	exportPage := string(mustPage(t, "agent/money/reports-export.html"))

	var selectors []string
	rest := src
	for {
		i := strings.Index(rest, `querySelector`)
		if i < 0 {
			break
		}
		rest = rest[i+len(`querySelector`):]
		j := strings.Index(rest, `"`)
		if j < 0 {
			break
		}
		rest = rest[j+1:]
		k := strings.Index(rest, `"`)
		if k < 0 {
			break
		}
		selectors = append(selectors, rest[:k])
	}
	if len(selectors) < 6 {
		t.Fatalf("only found %d selectors in the module; the scan is wrong", len(selectors))
	}
	for _, sel := range selectors {
		var want string
		switch {
		case strings.HasPrefix(sel, "#"):
			want = `id="` + sel[1:] + `"`
		case strings.HasPrefix(sel, "."):
			want = `class="` + sel[1:]
		case strings.HasPrefix(sel, "["):
			want = strings.Trim(sel, "[]")
		default:
			continue // a tag selector (input[type=checkbox]) the page is free to shape
		}
		if !strings.Contains(exportPage, want) {
			t.Errorf("export-center.js looks for %q, and reports-export.html has no %s", sel, want)
		}
	}

	// It shows and hides; it never exports by itself. The form's own GET is the download.
	for _, forbidden := range []string{"fetch(", "XMLHttpRequest", ".submit()", "location ="} {
		if strings.Contains(src, forbidden) {
			t.Errorf("export-center.js uses %q; it only shows and hides", forbidden)
		}
	}
	// A hidden field must also be DISABLED, or the browser sends it and the download URL
	// claims an export nobody asked for.
	if !strings.Contains(src, "field.disabled = !shown") {
		t.Error("export-center.js hides fields without disabling them")
	}
	// The page carries the module, inside <main> so the layout picks it up and hashes it.
	if !strings.Contains(exportPage, `src="/assets/js/agent/money/export-center.js"`) {
		t.Error("reports-export.html does not load its module")
	}
}

// §3.12's module does two jobs the server cannot: it makes the square JPEG in the browser
// (the function stores what the browser hands it) and it keeps the signature preview live.
// Both are held to the TypeScript they are ported from, and every handle is checked against
// the page that has to provide it — the silent failure that shipped the payment radios
// without ids.
func TestSettingsModule(t *testing.T) {
	b, err := fs.ReadFile(assets.FS, "js/agent/money/settings.js")
	if err != nil {
		t.Fatal(err)
	}
	src := string(b)
	profile := string(mustPage(t, "agent/money/settings-profile.html"))
	signature := string(mustPage(t, "agent/money/settings-signature.html"))

	// avatarImage.ts, byte for byte: the size, the crop, the white under a transparent PNG,
	// and the quality. A different number here is a different photo from the Next app's.
	avatar := readWebFile(t, "lib/agent/avatarImage.ts")
	for _, want := range []string{
		"const AVATAR_SIZE = 400",
		"5 * 1024 * 1024",
		`"image/jpeg", "image/png", "image/webp"`,
		"const side = Math.min(w, h);",
		"Math.floor((w - side) / 2), Math.floor((h - side) / 2), side",
		`ctx.fillStyle = "#FFFFFF";`,
		`canvas.toBlob(resolve, "image/jpeg", 0.88)`,
	} {
		if !strings.Contains(src, want) {
			t.Errorf("settings.js no longer contains %q", want)
		}
		if avatar != "" && !strings.Contains(avatar, strings.TrimPrefix(want, "const ")) &&
			!strings.Contains(avatar, want) {
			t.Errorf("avatarImage.ts no longer contains %q; the module is now the odd one out", want)
		}
	}

	// renderSignature's own tidying, so the live preview and the server agree line for line.
	rules := readWebFile(t, "lib/agent/settingsRules.ts")
	for _, want := range []string{
		`.replace(/\s*·\s*(?:·\s*)+/g, " · ")`,
		`.replace(/^\s*·\s*/, "")`,
		`.replace(/\s*·\s*$/, "")`,
		`if (line.trim() === "" && hadField) continue;`,
	} {
		if !strings.Contains(src, want) {
			t.Errorf("settings.js no longer contains %q", want)
		}
		if rules != "" && !strings.Contains(rules, want) {
			t.Errorf("settingsRules.ts no longer contains %q", want)
		}
	}
	// Go renders the same lines on every load, so the two must agree about the locked line.
	if !strings.Contains(src, lockedSignatureLine) {
		t.Errorf("settings.js no longer carries %q", lockedSignatureLine)
	}

	// The photo's three refusals are the module's to say: no round trip makes them.
	for _, want := range []string{
		"That photo is over 5 MB. Try a smaller one.",
		"Use a JPG, PNG or WebP photo.",
		"We couldn't read that photo. Try another one.",
	} {
		if !strings.Contains(src, want) {
			t.Errorf("settings.js no longer says %q", want)
		}
	}

	// Every handle it reaches for, against the page that provides it.
	for _, c := range []struct{ page, name, want string }{
		{profile, "settings-profile.html", "data-avatar-form"},
		{profile, "settings-profile.html", "data-avatar-file"},
		{profile, "settings-profile.html", "data-avatar-image"},
		{profile, "settings-profile.html", "data-avatar-pick"},
		{profile, "settings-profile.html", "data-photo-error"},
		{profile, "settings-profile.html", "data-photo-error-text"},
		{signature, "settings-signature.html", "data-signature-text"},
		{signature, "settings-signature.html", "data-signature-preview"},
		{signature, "settings-signature.html", "data-signature-insert"},
	} {
		if !strings.Contains(src, c.want) {
			t.Errorf("settings.js no longer uses %s", c.want)
		}
		if !strings.Contains(c.page, c.want) {
			t.Errorf("%s has no %s for the module to find", c.name, c.want)
		}
	}
	// The preview's three values ride on data attributes the handler fills; the module reads
	// them through `dataset`, which is the same attribute under its camel name.
	for attr, prop := range map[string]string{
		"data-sig-name": "dataset.sigName", "data-sig-phone": "dataset.sigPhone", "data-sig-email": "dataset.sigEmail",
	} {
		if !strings.Contains(src, prop) {
			t.Errorf("settings.js no longer reads %s", prop)
		}
		if !strings.Contains(signature, attr) {
			t.Errorf("settings-signature.html has no %s for the module to read", attr)
		}
	}

	// The three Insert chips carry the TypeScript's own tokens.
	for _, token := range []string{"{{agent.name}}", "{{agent.phone}}", "{{agent.email}}"} {
		if !strings.Contains(signature, `data-signature-insert="`+token+`"`) {
			t.Errorf("settings-signature.html has no Insert chip for %s", token)
		}
		if rules != "" && !strings.Contains(rules, `token: "`+token+`"`) {
			t.Errorf("settingsRules.ts no longer lists %s", token)
		}
	}

	// The preview writes the advisor's own words, so it uses textContent, never innerHTML.
	if strings.Contains(src, "innerHTML") {
		t.Error("settings.js writes innerHTML; a signature is plain text")
	}
	// Both pages load it, inside <main> so the layout hashes its URL.
	for name, page := range map[string]string{"settings-profile.html": profile, "settings-signature.html": signature} {
		if !strings.Contains(page, `src="/assets/js/agent/money/settings.js"`) {
			t.Errorf("%s does not load its module", name)
		}
	}
}
