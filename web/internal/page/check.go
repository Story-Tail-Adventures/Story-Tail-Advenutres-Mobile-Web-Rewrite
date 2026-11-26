package page

import (
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// slotName keeps names boring: they appear in HTML attributes and Go string literals.
var slotName = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)

// noSlotTags are elements that change how the whole page loads or runs. Filling one from
// data (a <base href>, a <link> stylesheet, a <meta http-equiv>) is never a page's job.
var noSlotTags = map[atom.Atom]bool{
	atom.Base: true, atom.Link: true, atom.Meta: true, atom.Object: true, atom.Embed: true,
	atom.Param: true, atom.Frame: true, atom.Frameset: true, atom.Template: true,
}

// check is the startup stand-in for a template compiler's type check. Both directions:
// every slot and repeat in the HTML is declared in Go (an undeclared one would ship its
// placeholder text), and everything declared in Go is in the HTML exactly once (a renamed
// one would fail quietly at fill time).
func check(root *html.Node, file string, declared []string, repeats map[string][]string) error {
	var errs []error
	fail := func(format string, a ...any) {
		errs = append(errs, fmt.Errorf("%s: "+format, append([]any{file}, a...)...))
	}

	top := map[string]int{}
	rows := map[string]map[string]int{}
	repeatCount := map[string]int{}

	var walk func(n *html.Node, repeat string, raw bool)
	walk = func(n *html.Node, repeat string, raw bool) {
		if n.Type == html.ElementNode {
			raw = raw || rawText[n.DataAtom]
			slot, isSlot := attrValue(n, attrSlot)
			rep, isRepeat := attrValue(n, attrRepeat)

			if (isSlot || isRepeat) && raw {
				fail("<%s> carries a slot or repeat inside raw text, where values are written unescaped", n.Data)
			}
			if (isSlot || isRepeat) && noSlotTags[n.DataAtom] {
				fail("<%s> may not be a slot or repeat: it changes how the whole page loads", n.Data)
			}
			if isSlot || isRepeat {
				for _, a := range n.Attr {
					if a.Namespace != "" || strings.Contains(a.Key, ":") {
						// setAttr and removeAttr only see plain attributes, so an
						// xlink:href placeholder could never be replaced or removed.
						fail("<%s data-slot> carries the namespaced attribute %s:%s, which the setters cannot replace", n.Data, a.Namespace, a.Key)
					}
				}
			}
			if isRepeat {
				if !slotName.MatchString(rep) {
					fail("repeat name %q must match %s", rep, slotName)
				}
				repeatCount[rep]++
				if rows[rep] == nil {
					rows[rep] = map[string]int{}
				}
				repeat = rep
			}
			// A slot on the repeat's own element belongs to each row: an <option> holds no
			// elements, so a <select> or <datalist> row is filled on the row itself.
			if isSlot {
				if !slotName.MatchString(slot) {
					fail("slot name %q must match %s", slot, slotName)
				}
				if repeat != "" {
					rows[repeat][slot]++
				} else {
					top[slot]++
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c, repeat, raw)
		}
	}
	walk(root, "", false)

	// Declared names must be unique across the page and every repeat, so a slot name always
	// means one element.
	owner := map[string]string{}
	claim := func(name, where string) {
		if prev, dup := owner[name]; dup {
			fail("slot %q is declared twice (%s and %s)", name, prev, where)
			return
		}
		owner[name] = where
	}
	for _, s := range declared {
		claim(s, "the page")
	}
	for _, name := range slices.Sorted(maps.Keys(repeats)) {
		for _, s := range repeats[name] {
			claim(s, fmt.Sprintf("repeat %q", name))
		}
	}

	for _, s := range declared {
		if n := top[s]; n != 1 {
			fail("slot %q appears %d times outside repeats, want exactly once", s, n)
		}
	}
	for _, s := range slices.Sorted(maps.Keys(top)) {
		if !slices.Contains(declared, s) {
			fail("slot %q is in the HTML but not declared in Go; its placeholder would ship", s)
		}
	}

	for _, name := range slices.Sorted(maps.Keys(repeats)) {
		if n := repeatCount[name]; n != 1 {
			fail("repeat %q appears %d times, want exactly once", name, n)
			continue
		}
		for _, s := range repeats[name] {
			if n := rows[name][s]; n != 1 {
				fail("slot %q appears %d times in repeat %q, want exactly once", s, n, name)
			}
		}
		for _, s := range slices.Sorted(maps.Keys(rows[name])) {
			if !slices.Contains(repeats[name], s) {
				fail("slot %q is in repeat %q but not declared in Go; its placeholder would ship", s, name)
			}
		}
	}
	for _, name := range slices.Sorted(maps.Keys(repeatCount)) {
		if _, ok := repeats[name]; !ok {
			fail("repeat %q is in the HTML but not declared in Go; its sample row would ship", name)
		}
	}

	return errors.Join(errs...)
}
