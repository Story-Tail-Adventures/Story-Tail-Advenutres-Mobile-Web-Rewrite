package static

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
)

// tokens.css is the design tokens' contract (docs/Design-System.md §12.4). The Go copy is
// byte for byte web/styles/tokens.css, and both mirror design/web-tokens/tokens.css, the
// canonical one. Like web/lib/mui/tokens.test.ts, this parses the canonical file and fails
// on any token missing from either side or any value that disagrees, in both schemes.

func repoFile(t *testing.T, rel string) (string, bool) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "..", rel))
	if os.IsNotExist(err) {
		return "", false
	}
	if err != nil {
		t.Fatal(err)
	}
	return string(b), true
}

var (
	comment = regexp.MustCompile(`(?s)/\*.*?\*/`)
	decl    = regexp.MustCompile(`(--[\w-]+)\s*:\s*([^;]+);`)
)

// block returns the custom properties declared in the first top-level `selector { ... }`.
func block(t *testing.T, css, selector string) map[string]string {
	t.Helper()
	css = comment.ReplaceAllString(css, "")
	start := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(selector) + `\s*\{`).FindStringIndex(css)
	if start == nil {
		t.Fatalf("no %s block", selector)
	}
	body := css[start[1]:]
	body = body[:strings.Index(body, "\n}")]
	out := map[string]string{}
	for _, m := range decl.FindAllStringSubmatch(body, -1) {
		out[m[1]] = strings.ToUpper(strings.Join(strings.Fields(m[2]), ""))
	}
	return out
}

func TestTokensMatchTheCanonicalSource(t *testing.T) {
	canonical, ok := repoFile(t, "design/web-tokens/tokens.css")
	if !ok {
		t.Fatal("design/web-tokens/tokens.css is missing; it is the canonical token source")
	}
	ours, err := assets.FS.ReadFile("css/tokens.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, sel := range []string{":root", ".scheme-dark"} {
		want := block(t, canonical, sel)
		got := block(t, string(ours), sel)
		// The canonical file also declares the three --font-* stacks, which live in base.css
		// here (built on the self-hosted families), as they live in globals.css in Next.
		for k := range want {
			if strings.HasPrefix(k, "--font-") {
				delete(want, k)
			}
		}
		for k, v := range want {
			if got[k] != v {
				t.Errorf("%s %s = %q, canonical %q", sel, k, got[k], v)
			}
		}
		for k := range got {
			if _, ok := want[k]; !ok {
				t.Errorf("%s %s is not in the canonical tokens", sel, k)
			}
		}
	}
}

// While Next.js exists, the two web copies are one file. Phase 6 deletes web/; this test
// then has nothing to compare and passes.
func TestTokensAreByteForByteTheWebCopy(t *testing.T) {
	web, ok := repoFile(t, "web/styles/tokens.css")
	if !ok {
		t.Skip("web/ is gone (Phase 6)")
	}
	ours, err := assets.FS.ReadFile("css/tokens.css")
	if err != nil {
		t.Fatal(err)
	}
	if string(ours) != web {
		t.Error("webgo/assets/css/tokens.css differs from web/styles/tokens.css; copy it again")
	}
}
