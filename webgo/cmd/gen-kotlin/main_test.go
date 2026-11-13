package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// committed is the Kotlin file in the repository, from this package's directory.
var committed = filepath.Join("..", "..", "..", filepath.FromSlash(defaultOut))

// firstDiff describes the first line where got and want differ.
func firstDiff(got, want []byte) string {
	g := strings.Split(string(got), "\n")
	w := strings.Split(string(want), "\n")
	for i := 0; i < len(g) || i < len(w); i++ {
		var gl, wl string
		if i < len(g) {
			gl = g[i]
		}
		if i < len(w) {
			wl = w[i]
		}
		if gl != wl || i >= len(g) || i >= len(w) {
			return "line " + strconv.Itoa(i+1) + ":\n got  " + quote(gl, i < len(g)) + "\n want " + quote(wl, i < len(w))
		}
	}
	return "no line differs"
}

func quote(line string, present bool) string {
	if !present {
		return "(end of file)"
	}
	return "`" + line + "`"
}

// The generator must write what web/scripts/export-public-content.mts wrote, byte for byte,
// before CI switches to it (docs/GO-MIGRATION.md §4.11).
func TestGenerateMatchesTheCommittedFile(t *testing.T) {
	want, err := os.ReadFile(committed)
	if err != nil {
		t.Fatal(err)
	}
	got := Generate(content.Get())
	if !bytes.Equal(got, want) {
		t.Fatalf("Generate differs from %s at %s", committed, firstDiff(got, want))
	}
	if again := Generate(content.Get()); !bytes.Equal(again, got) {
		t.Fatalf("a second run differs at %s", firstDiff(again, got))
	}
}

func TestFirstDiffNamesTheLine(t *testing.T) {
	tests := []struct{ got, want, report string }{
		{"a\nb\nc\n", "a\nX\nc\n", "line 2:\n got  `b`\n want `X`"},
		{"a\n", "a\nb\n", "line 2:\n got  ``\n want `b`"},
		{"a\nb", "a", "line 2:\n got  `b`\n want (end of file)"},
	}
	for _, tt := range tests {
		if r := firstDiff([]byte(tt.got), []byte(tt.want)); r != tt.report {
			t.Errorf("firstDiff(%q, %q) = %q, want %q", tt.got, tt.want, r, tt.report)
		}
	}
}

func TestRunWritesTheFileAndTheSummary(t *testing.T) {
	out := filepath.Join(t.TempDir(), "nested", "Generated.kt")
	var stdout bytes.Buffer
	if err := run([]string{"-o", out}, &stdout); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, Generate(content.Get())) {
		t.Error("the written file is not Generate's output")
	}
	c := content.Get()
	want := fmt.Sprintf("wrote %s\n  %d trips · %d islands · %d legal docs · %d claims · %d testimonials\n",
		out, len(c.Trips), len(c.Islands), len(c.Legal), len(c.Claims), len(c.Testimonials))
	if stdout.String() != want {
		t.Errorf("summary:\n got %q\nwant %q", stdout.String(), want)
	}
}

func TestRepoRootFindsTheRepository(t *testing.T) {
	root, err := repoRoot()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(defaultOut))); err != nil {
		t.Errorf("repoRoot = %s, but the Kotlin file is not under it: %v", root, err)
	}
}

func TestKotlinEmitters(t *testing.T) {
	strs := []struct{ in, want string }{
		{`plain`, `"plain"`},
		{`a "quote"`, `"a \"quote\""`},
		{`back\slash`, `"back\\slash"`},
		{`$5 and ${x}`, `"\$5 and \${x}"`},
		{"line\nbreak\r\ttab", `"line\nbreak\r\ttab"`},
		{`\"`, `"\\\""`},
	}
	for _, s := range strs {
		if got := kstr(s.in); got != s.want {
			t.Errorf("kstr(%q) = %s, want %s", s.in, got, s.want)
		}
	}
	if got := knullableStr[string](nil); got != "null" {
		t.Errorf("knullableStr(nil) = %s", got)
	}
	if got := kenum("all-inclusive"); got != "ALL_INCLUSIVE" {
		t.Errorf("kenum = %s", got)
	}
	if got := klist(nil, "  "); got != "emptyList()" {
		t.Errorf("klist(nil) = %s", got)
	}
	if got := klist([]string{"a", "b"}, "  "); got != "listOf(\n      a,\n      b,\n  )" {
		t.Errorf("klist = %q", got)
	}
	for band, want := range map[content.PriceBand]string{"$": "ONE", "$$": "TWO", "$$$": "THREE"} {
		if got := bandEnum(band); got != want {
			t.Errorf("bandEnum(%q) = %s, want %s", band, got, want)
		}
	}
}
