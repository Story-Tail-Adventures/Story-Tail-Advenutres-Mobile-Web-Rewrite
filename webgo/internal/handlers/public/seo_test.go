package public

import (
	"bytes"
	"os"
	"strconv"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// testdata/ holds what the Next app served for /sitemap.xml and /robots.txt with its default
// site URL, http://localhost:3000. Go must write the same bytes from the same content.
const nextBase = "http://localhost:3000"

func TestSitemapMatchesNext(t *testing.T) {
	want, err := os.ReadFile("testdata/sitemap.xml")
	if err != nil {
		t.Fatal(err)
	}
	got := sitemapXML(publicSitemap(nextBase, content.Get()))
	if !bytes.Equal(got, want) {
		t.Errorf("sitemap differs from Next's:\n%s", firstDiff(got, want))
	}
}

func TestRobotsMatchesNext(t *testing.T) {
	want, err := os.ReadFile("testdata/robots.txt")
	if err != nil {
		t.Fatal(err)
	}
	if got := robotsTxt(nextBase); !bytes.Equal(got, want) {
		t.Errorf("robots.txt differs from Next's:\n%s", firstDiff(got, want))
	}
}

func TestSitemapLeavesOutNoindexPages(t *testing.T) {
	out := string(sitemapXML(publicSitemap(nextBase, content.Get())))
	for _, p := range []string{"/join", "/explore/results", "/message", "/quote", "/login"} {
		if bytes.Contains([]byte(out), []byte("<loc>"+nextBase+p+"</loc>")) {
			t.Errorf("%s is in the sitemap", p)
		}
	}
}

// firstDiff names the first line where got and want part.
func firstDiff(got, want []byte) string {
	g, w := bytes.Split(got, []byte("\n")), bytes.Split(want, []byte("\n"))
	for i := 0; i < len(g) || i < len(w); i++ {
		var gl, wl []byte
		if i < len(g) {
			gl = g[i]
		}
		if i < len(w) {
			wl = w[i]
		}
		if !bytes.Equal(gl, wl) {
			return "line " + strconv.Itoa(i+1) + "\n got: " + string(gl) + "\nwant: " + string(wl)
		}
	}
	return "lengths differ"
}
