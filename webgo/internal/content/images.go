package content

import (
	"fmt"
	"strconv"
	"strings"
)

// UnsplashHost serves every registry photo today. When owned photos replace them, Src
// becomes an /assets path and these URL builders go.
const UnsplashHost = "https://images.unsplash.com"

// The defaults web/lib/images.ts gives staImg and unsplashLoader.
const (
	defaultWidth   = 800
	defaultQuality = 80
)

// StaImg is the Unsplash URL for a registry photo, for Open Graph tags and anywhere a plain
// URL is needed. A zero width means 800, a zero height leaves the height out, and a zero
// quality means 80, as the TypeScript defaults did. The parameters are written in the same
// order (w, q, auto, fit, then h), so the URLs match the Next app's byte for byte. An
// unknown key is a programming error, so it panics.
func StaImg(key ImageKey, w, h, q int) string {
	img, ok := Get().Image(key)
	if !ok {
		panic(fmt.Sprintf("content: unknown image %q", key))
	}
	if w == 0 {
		w = defaultWidth
	}
	if q == 0 {
		q = defaultQuality
	}
	u := unsplashURL(img.Src, w, q)
	if h != 0 {
		u += "&h=" + strconv.Itoa(h)
	}
	return u
}

// UnsplashLoader is the URL for a photo id at the width a srcset asks for. A zero quality
// means 80, as next/image leaves it unset.
func UnsplashLoader(src string, width, quality int) string {
	if quality == 0 {
		quality = defaultQuality
	}
	return unsplashURL(src, width, quality)
}

// unsplashURL writes what URLSearchParams wrote for {w, q, auto: "format", fit: "crop"}.
// Every value is digits or a fixed word, so none needs escaping.
func unsplashURL(src string, w, q int) string {
	var b strings.Builder
	b.WriteString(UnsplashHost)
	b.WriteByte('/')
	b.WriteString(src)
	b.WriteString("?w=")
	b.WriteString(strconv.Itoa(w))
	b.WriteString("&q=")
	b.WriteString(strconv.Itoa(q))
	b.WriteString("&auto=format&fit=crop")
	return b.String()
}
