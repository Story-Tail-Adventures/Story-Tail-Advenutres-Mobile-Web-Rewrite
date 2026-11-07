package api

import (
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const module = "github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/"

// Ruling 14: the service-role key reaches nothing outside internal/api. The key lives in the
// service client, so the client may only be imported from internal/api/... . A page handler
// that imported it could read any row past RLS; this test fails the build instead.
//
// Also guarded here: internal/audit and the domain packages stay free of the client (audit
// takes an Inserter), and no package outside internal/api imports internal/api/edge, which
// hands out the service client through Deps.
func TestOnlyInternalAPIImportsTheServiceClient(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	guarded := []string{module + "internal/api/service", module + "internal/api/edge"}
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
		inside := strings.HasPrefix(rel, "internal/api/")
		f, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		checked++
		for _, imp := range f.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			for _, g := range guarded {
				if (p == g || strings.HasPrefix(p, g+"/")) && !inside {
					t.Errorf("%s imports %s; only internal/api/... may (ruling 14)", rel, p)
				}
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
