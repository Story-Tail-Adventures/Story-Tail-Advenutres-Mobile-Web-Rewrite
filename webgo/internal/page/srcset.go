package page

import (
	"regexp"
	"strings"

	"golang.org/x/net/html/atom"
)

// Candidate is one entry of an <img srcset>: a URL and its width ("640w") or density ("2x")
// descriptor.
type Candidate struct {
	URL, Descriptor string
}

var descriptor = regexp.MustCompile(`^(?:[1-9][0-9]*w|[0-9]+(?:\.[0-9]+)?x)$`)

// SrcSet sets srcset on an <img> or <source> slot, and reports whether it did. Every URL
// goes through SafeURL, and a URL with whitespace or a comma in it is refused too, since
// either would split the list where the browser reads it. One refused candidate drops the
// whole attribute: the img's src still shows the photo. It only adjusts the slot (set src
// with URL); like URL, it handles a placeholder srcset the HTML carries.
func (s *scope) SrcSet(slot string, set []Candidate) bool {
	n := s.node(slot, false)
	if n == nil {
		return false
	}
	if n.DataAtom != atom.Img && n.DataAtom != atom.Source {
		s.fail("SrcSet sets srcset on <img> or <source> only, not <%s> (slot %q)", n.Data, slot)
		return false
	}
	s.markURL(slot, "srcset")
	parts := make([]string, 0, len(set))
	for _, c := range set {
		v, ok := SafeURL(c.URL)
		if !ok || strings.ContainsAny(v, " \t\n\f\r,") || !descriptor.MatchString(c.Descriptor) {
			removeAttr(n, "srcset")
			return false
		}
		parts = append(parts, v+" "+c.Descriptor)
	}
	if len(parts) == 0 {
		removeAttr(n, "srcset")
		return false
	}
	setAttr(n, "srcset", strings.Join(parts, ", "))
	return true
}
