package emailinbox

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// docs/IMAP-Go-Library-Security-Review.md §5, "One importer": only this package imports go-imap,
// and no non-test code anywhere imports its server half. (This package's tests run go-imap's
// in-memory server, as the review's probe did; that never reaches the binary.)
func TestOnlyThisPackageImportsGoIMAP(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", "..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	const lib = "github.com/emersion/go-imap"
	checked := 0
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if path != root && (d.Name() == "testdata" || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)
		test := strings.HasSuffix(rel, "_test.go")
		f, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		checked++
		for _, imp := range f.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if !strings.HasPrefix(p, lib) {
				continue
			}
			if !strings.HasPrefix(rel, "internal/api/fn/emailinbox/") {
				t.Errorf("%s imports %s; only internal/api/fn/emailinbox may", rel, p)
			}
			if strings.Contains(p, "/imapserver") && !test {
				t.Errorf("%s imports %s; nothing ships the IMAP server", rel, p)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked < 20 {
		t.Fatalf("only %d Go files checked; the walk is not seeing the module", checked)
	}
}
