package page

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

const htmlxPath = "github.com/mdigger/htmlx"

// moduleRoot is webgo/, two levels up from this package.
func moduleRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func goFiles(t *testing.T, root string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() && (d.Name() == "testdata" || strings.HasPrefix(d.Name(), ".")) && path != root {
			return filepath.SkipDir
		}
		if !d.IsDir() && strings.HasSuffix(path, ".go") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}

// Only internal/page may import htmlx, so the rules about using it live in one place and
// replacing it is a change to one package (docs/HTMLX-Library-Security-Review.md §6).
func TestOnlyThisPackageImportsHtmlx(t *testing.T) {
	root := moduleRoot(t)
	here := filepath.Join(root, "internal", "page")
	fset := token.NewFileSet()
	for _, path := range goFiles(t, root) {
		f, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range f.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if p == htmlxPath && filepath.Dir(path) != here {
				rel, _ := filepath.Rel(root, path)
				t.Errorf("%s imports htmlx; only internal/page may", rel)
			}
		}
	}
}

// htmlx's writers are broken or unsafe (review findings 1 to 8), so this package never
// calls them. Package-qualified names are banned outright, including every way to make an
// htmlx.Node value (Node, New, Parse, String, Load, Get): with no Node value in the package,
// none of its methods (SetHTML, Text, ...) can be reached on any receiver, which a purely
// syntactic scan could not otherwise prove. The method names stay banned as a backstop.
func TestNoBannedHtmlxCalls(t *testing.T) {
	bannedFuncs := map[string]bool{
		"SetHTML": true, "SetText": true, "SetAttr": true, "RemoveAttr": true,
		"AddAttrWord": true, "Rename": true, "Get": true, "Load": true, "Text": true,
		"WriteText": true, "Stats": true, "HTML": true,
		"Node": true, "New": true, "Parse": true, "String": true,
	}
	bannedMethods := map[string]bool{
		"SetHTML": true, "SetText": true, "SetAttr": true, "RemoveAttr": true,
		"AddClass": true, "Rename": true, "Stats": true,
	}

	root := moduleRoot(t)
	here := filepath.Join(root, "internal", "page")
	fset := token.NewFileSet()
	for _, path := range goFiles(t, here) {
		if filepath.Base(path) == "boundary_test.go" {
			continue // this file names the banned calls in order to ban them
		}
		f, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		alias := "htmlx"
		for _, imp := range f.Imports {
			if p, _ := strconv.Unquote(imp.Path.Value); p == htmlxPath && imp.Name != nil {
				alias = imp.Name.Name
			}
		}
		ast.Inspect(f, func(n ast.Node) bool {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			name := sel.Sel.Name
			if id, ok := sel.X.(*ast.Ident); ok && id.Name == alias && bannedFuncs[name] {
				t.Errorf("%s: htmlx.%s is banned (docs/HTMLX-Library-Security-Review.md §6)", fset.Position(sel.Pos()), name)
			} else if bannedMethods[name] {
				t.Errorf("%s: .%s is banned (htmlx's writer; use this package's setters)", fset.Position(sel.Pos()), name)
			}
			return true
		})
	}
}
