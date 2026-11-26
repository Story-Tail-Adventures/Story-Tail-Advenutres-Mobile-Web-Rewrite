package content

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"io/fs"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
	"unicode/utf16"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/assets"
)

// Ports of web/content/public/catalog.test.ts, plus the lookups and the load-time checks.

var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// spriteIcons is every <symbol id> in webgo/assets/icons.svg, the icons a page can draw.
func spriteIcons(t *testing.T) []string {
	t.Helper()
	b, err := assets.FS.ReadFile("icons.svg")
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	dec := xml.NewDecoder(bytes.NewReader(b))
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("icons.svg: %v", err)
		}
		if el, ok := tok.(xml.StartElement); ok && el.Name.Local == "symbol" {
			for _, a := range el.Attr {
				if a.Name.Local == "id" {
					ids = append(ids, a.Value)
				}
			}
		}
	}
	if len(ids) == 0 {
		t.Fatal("icons.svg has no symbols")
	}
	return ids
}

func TestTripSlugsAreUniqueAndURLSafe(t *testing.T) {
	slugRE := regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	seen := map[string]bool{}
	for _, tr := range Get().Trips {
		if seen[tr.Slug] {
			t.Errorf("slug %q is listed twice", tr.Slug)
		}
		seen[tr.Slug] = true
		if !slugRE.MatchString(tr.Slug) {
			t.Errorf("slug %q is not URL-safe", tr.Slug)
		}
	}
}

func TestReferencesOnlyRegisteredImagesAndIcons(t *testing.T) {
	c := Get()
	icons := spriteIcons(t)
	for _, tr := range c.Trips {
		if !c.IsImageKey(string(tr.ImageKey)) {
			t.Errorf("%s: image %q is not registered", tr.Slug, tr.ImageKey)
		}
		if tr.HeroImageKey != nil && !c.IsImageKey(string(*tr.HeroImageKey)) {
			t.Errorf("%s: hero image %q is not registered", tr.Slug, *tr.HeroImageKey)
		}
		for _, h := range tr.Highlights {
			if !slices.Contains(icons, h.Icon) {
				t.Errorf("%s: icon %q is not in icons.svg", tr.Slug, h.Icon)
			}
		}
	}
	for _, i := range c.Islands {
		if !c.IsImageKey(string(i.ImageKey)) {
			t.Errorf("island %s: image %q is not registered", i.Slug, i.ImageKey)
		}
	}
	for _, tile := range c.Inspiration {
		if !c.IsImageKey(string(tile.ImageKey)) {
			t.Errorf("tile %s: image %q is not registered", tile.Slug, tile.ImageKey)
		}
	}
}

// CLAUDE.md rule 5: integer cents (int64 by type here) in USD, with an ISO as-of date.
func TestMoneyIsCentsInUSDWithAnAsOfDate(t *testing.T) {
	for _, tr := range Get().Trips {
		if tr.From.AmountCents <= 0 {
			t.Errorf("%s: amountCents %d, want more than 0", tr.Slug, tr.From.AmountCents)
		}
		if tr.From.Currency != "USD" {
			t.Errorf("%s: currency %q, want USD", tr.Slug, tr.From.Currency)
		}
		if !isoDate.MatchString(tr.PriceAsOf) {
			t.Errorf("%s: priceAsOf %q is not an ISO date", tr.Slug, tr.PriceAsOf)
		}
	}
}

func TestCopyNeverHardCodesADollarFigure(t *testing.T) {
	dollar := regexp.MustCompile(`\$\d`)
	for _, tr := range Get().Trips {
		parts := []string{tr.Name, tr.Tagline, tr.Overline, tr.Description, tr.PriceNote}
		parts = append(parts, tr.SampleItinerary...)
		for _, h := range tr.Highlights {
			parts = append(parts, h.Text)
		}
		if text := strings.Join(parts, " "); dollar.MatchString(text) {
			t.Errorf("%s: copy contains a dollar figure: %q", tr.Slug, dollar.FindString(text))
		}
	}
}

func TestTopicTileCountsAndPositions(t *testing.T) {
	c := Get()
	tests := []struct {
		topic Topic
		count int
	}{
		{Caribbean, 9},
		{Cruises, 9},
		{Honeymoons, 6},
	}
	for _, tt := range tests {
		t.Run(string(tt.topic), func(t *testing.T) {
			var orders []int
			for _, tr := range c.Trips {
				if p, ok := tr.Topics.Placement(tt.topic); ok {
					orders = append(orders, p.Order)
				}
			}
			if len(orders) != tt.count {
				t.Fatalf("%d trips placed, want %d", len(orders), tt.count)
			}
			unique := slices.Clone(orders)
			slices.Sort(unique)
			if len(slices.Compact(unique)) != tt.count {
				t.Errorf("positions %v are not unique", orders)
			}
			if m := slices.Max(orders); m != tt.count {
				t.Errorf("highest position %d, want %d", m, tt.count)
			}

			// TripsFor returns the same trips, in tile order.
			placed := c.TripsFor(tt.topic)
			if len(placed) != tt.count {
				t.Fatalf("TripsFor: %d trips, want %d", len(placed), tt.count)
			}
			for i, tr := range placed {
				p, _ := tr.Topics.Placement(tt.topic)
				if p.Order != i+1 {
					t.Errorf("TripsFor[%d] = %s at position %d, want position %d", i, tr.Slug, p.Order, i+1)
				}
			}
		})
	}
}

func TestEveryTripHasDetailPageContent(t *testing.T) {
	for _, tr := range Get().Trips {
		// The TypeScript measured .length, which counts UTF-16 code units.
		if n := len(utf16.Encode([]rune(tr.Description))); n <= 40 {
			t.Errorf("%s: description is %d long, want more than 40", tr.Slug, n)
		}
		if len(tr.Highlights) != 4 {
			t.Errorf("%s: %d highlights, want 4", tr.Slug, len(tr.Highlights))
		}
		if len(tr.SampleItinerary) < 4 {
			t.Errorf("%s: %d itinerary days, want at least 4", tr.Slug, len(tr.SampleItinerary))
		}
	}
}

func TestReviewFiguresBelongToRealTrips(t *testing.T) {
	c := Get()
	for _, r := range c.TripReviews {
		if _, ok := c.Trip(r.Slug); !ok {
			t.Errorf("review %q names no trip", r.Slug)
		}
	}
}

func TestImageURLs(t *testing.T) {
	u, err := url.Parse(StaImg("turks", 1200, 630, 0))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if u.Host != "images.unsplash.com" || q.Get("w") != "1200" || q.Get("h") != "630" || q.Get("fit") != "crop" {
		t.Errorf("StaImg = %s", u)
	}
	loaded, err := url.Parse(UnsplashLoader("photo-abc", 640, 75))
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Path != "/photo-abc" || loaded.Query().Get("w") != "640" || loaded.Query().Get("q") != "75" {
		t.Errorf("UnsplashLoader = %s", loaded)
	}

	// The exact strings, parameter order included: URLSearchParams wrote w, q, auto, fit, then h.
	turks, _ := Get().Image("turks")
	exact := []struct{ got, want string }{
		{StaImg("turks", 0, 0, 0), UnsplashHost + "/" + turks.Src + "?w=800&q=80&auto=format&fit=crop"},
		{StaImg("turks", 1200, 630, 0), UnsplashHost + "/" + turks.Src + "?w=1200&q=80&auto=format&fit=crop&h=630"},
		{StaImg("turks", 400, 0, 60), UnsplashHost + "/" + turks.Src + "?w=400&q=60&auto=format&fit=crop"},
		{UnsplashLoader("photo-abc", 640, 75), "https://images.unsplash.com/photo-abc?w=640&q=75&auto=format&fit=crop"},
		{UnsplashLoader("photo-abc", 1080, 0), "https://images.unsplash.com/photo-abc?w=1080&q=80&auto=format&fit=crop"},
	}
	for _, e := range exact {
		if e.got != e.want {
			t.Errorf("got  %s\nwant %s", e.got, e.want)
		}
	}
}

func TestStaImgPanicsOnAnUnknownKey(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("StaImg with an unknown key did not panic")
		}
	}()
	StaImg("nope", 0, 0, 0)
}

func TestLegalDocumentsCoverTheFourPages(t *testing.T) {
	c := Get()
	want := []LegalSlug{"privacy", "terms", "cookies", "accessibility"}
	if got := c.LegalSlugs(); !slices.Equal(got, want) {
		t.Fatalf("LegalSlugs = %v, want %v", got, want)
	}
	for _, slug := range want {
		d, ok := c.LegalDoc(slug)
		if !ok {
			t.Fatalf("LegalDoc(%q) not found", slug)
		}
		if d.Slug != slug {
			t.Errorf("LegalDoc(%q).Slug = %q", slug, d.Slug)
		}
		if !isoDate.MatchString(d.LastUpdated) {
			t.Errorf("%s: lastUpdated %q is not an ISO date", slug, d.LastUpdated)
		}
		if len(d.Sections) == 0 {
			t.Errorf("%s: no sections", slug)
		}
	}
}

func TestLookups(t *testing.T) {
	c := Get()
	if tr, ok := c.Trip("sandals-royal-bahamian"); !ok || tr.Name != "Sandals Royal Bahamian" {
		t.Errorf("Trip(sandals-royal-bahamian) = %q, %v", tr.Name, ok)
	}
	if _, ok := c.Trip("no-such-trip"); ok {
		t.Error("Trip found a trip that does not exist")
	}
	if img, ok := c.Image("turks"); !ok || img.Key != "turks" || img.Src == "" {
		t.Errorf("Image(turks) = %+v, %v", img, ok)
	}
	if _, ok := c.Image("nope"); ok || c.IsImageKey("nope") {
		t.Error("an unknown image key was found")
	}
	if _, ok := c.LegalDoc("dpa"); ok {
		t.Error("LegalDoc found a page that does not exist")
	}
	if r, ok := c.TripRating("sandals-royal-bahamian"); !ok || r != 4.9 {
		t.Errorf("TripRating(sandals-royal-bahamian) = %v, %v; want 4.9", r, ok)
	}
	if _, ok := c.TripRating("hamanasi-resort"); ok {
		t.Error("TripRating found a rating for a trip without one")
	}
	if rv, ok := c.TripReview("sandals-royal-bahamian"); !ok || rv.Count != 312 {
		t.Errorf("TripReview(sandals-royal-bahamian) = %+v, %v", rv, ok)
	}
	if got := len(c.UnlicensedImages()); got != len(c.Images) {
		t.Errorf("UnlicensedImages: %d, want all %d (none is licensed yet)", got, len(c.Images))
	}
	if got := len(c.DraftLegalDocs()); got != 4 {
		t.Errorf("DraftLegalDocs: %d, want 4", got)
	}
}

// dataFS copies the embedded files so a test can break one.
func dataFS(t *testing.T) fstest.MapFS {
	t.Helper()
	m := fstest.MapFS{}
	err := fs.WalkDir(data, "data", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, err := data.ReadFile(path)
		m[path] = &fstest.MapFile{Data: b}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestLoadRefusesBrokenData(t *testing.T) {
	if _, err := load(dataFS(t)); err != nil {
		t.Fatalf("the shipped data does not load: %v", err)
	}
	tests := []struct {
		name    string
		file    string
		old     string
		new     string
		wantErr string
	}{
		{"unknown field", "islands.json", `"name": "BVI"`, `"name": "BVI", "nmae": "x"`, "unknown field"},
		{"unknown placement field", "trips.json", `"order": 1,`, `"order": 1, "ordr": 1,`, "unknown field"},
		{"fractional cents", "trips.json", `"amountCents": 264000`, `"amountCents": 2640.5`, "amountCents"},
		{"unregistered image", "trips.json", `"imageKey": "turks"`, `"imageKey": "turkz"`, `image "turkz" is not in the registry`},
		{"unknown topic", "trips.json", `"caribbean": {`, `"carribean": {`, `unknown topic "carribean"`},
		{"unknown price band", "trips.json", `"band": "$$",`, `"band": "$$$$",`, "unknown price band"},
		{"duplicate trip", "trips.json", `"slug": "sandals-royal-bahamian"`, `"slug": "beaches-turks-and-caicos"`, "listed twice"},
		{"missing claim the code uses", "proof.json", `"id": "bioParent"`, `"id": "bioParentX"`, `claim "bioParent" is missing`},
		// An empty old appends new to the end of the file.
		{"trailing data", "contact.json", "", "{}\n", "after the value"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fsys := dataFS(t)
			f := fsys["data/"+tt.file]
			switch {
			case tt.old == "":
				f.Data = append(f.Data, tt.new...)
			case bytes.Contains(f.Data, []byte(tt.old)):
				f.Data = bytes.Replace(f.Data, []byte(tt.old), []byte(tt.new), 1)
			default:
				t.Fatalf("%s does not contain %q", tt.file, tt.old)
			}
			_, err := load(fsys)
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("load error = %v, want one containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestMustLoadPanicsOnBrokenData(t *testing.T) {
	fsys := dataFS(t)
	delete(fsys, "data/images.json")
	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("mustLoad did not panic")
		}
		if s, _ := r.(string); !strings.HasPrefix(s, "content: ") {
			t.Errorf("panic = %v", r)
		}
	}()
	mustLoad(fsys)
}

func TestLoadNamesEveryBrokenFile(t *testing.T) {
	fsys := dataFS(t)
	delete(fsys, "data/images.json")
	delete(fsys, "data/legal.json")
	_, err := load(fsys)
	for _, name := range []string{"images.json", "legal.json"} {
		if err == nil || !strings.Contains(err.Error(), name) {
			t.Errorf("load error = %v, want it to name %s", err, name)
		}
	}
	if !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("load error = %v, want fs.ErrNotExist", err)
	}
}
