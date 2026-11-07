package public

import (
	"regexp"
	"slices"
	"strconv"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/page"
)

// The port of web/components/public/Photo.tsx with web/lib/image-loader.ts behind it: every
// public photo is a registry key, and Unsplash's CDN does the resizing. The src and srcset
// are the ones next/image wrote with the default image config (Next 16), so a browser picks
// the same file from either app.

// deviceSizes and imageSizes are next/image's defaults (next/dist/shared/lib/image-config.js).
var (
	deviceSizes = []int{640, 750, 828, 1080, 1200, 1920, 2048, 3840}
	imageSizes  = []int{32, 48, 64, 96, 128, 256, 384}
	allSizes    = func() []int { s := slices.Concat(imageSizes, deviceSizes); slices.Sort(s); return s }()
)

var viewportWidth = regexp.MustCompile(`(^|\s)(1?\d?\d)vw`)

// photoWidths ports getWidths from next/dist/shared/lib/get-img-props.js: with sizes, every
// configured width from the smallest vw share of the first device size up ("w" descriptors);
// with a fixed width, that width and its double, each rounded up to a configured size ("x").
func photoWidths(width int, sizes string) (widths []int, kind string) {
	if sizes != "" {
		smallest := -1
		for _, m := range viewportWidth.FindAllStringSubmatch(sizes, -1) {
			if n, err := strconv.Atoi(m[2]); err == nil && (smallest < 0 || n < smallest) {
				smallest = n
			}
		}
		if smallest < 0 {
			return allSizes, "w"
		}
		floor := float64(deviceSizes[0]) * float64(smallest) * 0.01
		for _, s := range allSizes {
			if float64(s) >= floor {
				widths = append(widths, s)
			}
		}
		return widths, "w"
	}
	if width <= 0 {
		return deviceSizes, "w"
	}
	for _, w := range []int{width, width * 2} {
		pick := allSizes[len(allSizes)-1]
		for _, s := range allSizes {
			if s >= w {
				pick = s
				break
			}
		}
		if !slices.Contains(widths, pick) {
			widths = append(widths, pick)
		}
	}
	return widths, "x"
}

// photoOpts is what a page passes Photo: Sizes for a fill photo (with the CSS covering its
// box), or Width for a fixed one. Alt overrides the registry's alt; nil keeps it, and a
// pointer to "" marks the photo decorative.
type photoOpts struct {
	Sizes   string
	Width   int
	Quality int
	Alt     *string
}

// photoSlot is the part of *page.Doc and *page.Row a photo fill uses.
type photoSlot interface {
	URL(slot, attr, raw string) bool
	SrcSet(slot string, set []page.Candidate) bool
	Attr(slot, name, value string)
}

// decorative is the alt for a photo whose meaning is in the text beside it.
var decorative = ptr("")

func ptr[T any](v T) *T { return &v }

// fillPhoto points an <img> slot at a registry photo: src, srcset, sizes and alt, exactly as
// next/image wrote them through the Unsplash loader. An unknown key is a programming error
// the catalog test catches; here it leaves the slot handled with no src.
func fillPhoto(d photoSlot, slot string, key content.ImageKey, o photoOpts) {
	img, ok := content.Get().Image(key)
	if !ok {
		d.URL(slot, "src", "")
		d.Attr(slot, "alt", "")
		return
	}
	alt := img.Alt
	if o.Alt != nil {
		alt = *o.Alt
	}
	widths, kind := photoWidths(o.Width, o.Sizes)
	set := make([]page.Candidate, len(widths))
	for i, w := range widths {
		desc := strconv.Itoa(w) + "w"
		if kind == "x" {
			desc = strconv.Itoa(i+1) + "x"
		}
		set[i] = page.Candidate{URL: content.UnsplashLoader(img.Src, w, o.Quality), Descriptor: desc}
	}
	d.URL(slot, "src", set[len(set)-1].URL)
	d.SrcSet(slot, set)
	if o.Sizes != "" {
		d.Attr(slot, "sizes", o.Sizes)
	}
	d.Attr(slot, "alt", alt)
}
