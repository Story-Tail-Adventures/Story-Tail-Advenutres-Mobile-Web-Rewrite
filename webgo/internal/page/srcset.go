package page

import (
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html/atom"
)

// Candidate is one entry of an <img srcset>: a URL and its width ("640w") or density ("2x")
// descriptor.
type Candidate struct {
	URL, Descriptor string
}

var descriptor = regexp.MustCompile(`^(?:[1-9][0-9]*w|([0-9]+(?:\.[0-9]+)?)x)$`)

// validDescriptor reports whether d is a width ("640w") or a density ("2x", "1.5x"). A
// density must be above zero: "0x" parses as a descriptor but is invalid per the HTML spec,
// and a browser drops the whole candidate rather than the one entry.
func validDescriptor(d string) bool {
	m := descriptor.FindStringSubmatch(d)
	if m == nil {
		return false
	}
	if m[1] == "" {
		return true // a width descriptor; the pattern already rules out 0w
	}
	density, err := strconv.ParseFloat(m[1], 64)
	return err == nil && density > 0
}

// SrcSet sets srcset on an <img> or <source> slot, and reports whether it did. Every URL
// goes through SafeURL, and a URL with whitespace or a comma in it is refused too, since
// either would split the list where the browser reads it. One refused candidate drops the
// whole attribute: the img's src still shows the photo. It only adjusts the slot (set src
// with URL). It handles the slot, so a <source>, which holds no text and often carries no
// src of its own, is complete once its srcset is set.
func (s *scope) SrcSet(slot string, set []Candidate) bool {
	n := s.node(slot, true)
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
		if !ok || strings.ContainsAny(v, " \t\n\f\r,") || !validDescriptor(c.Descriptor) {
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
