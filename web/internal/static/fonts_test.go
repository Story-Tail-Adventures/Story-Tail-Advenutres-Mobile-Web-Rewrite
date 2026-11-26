package static

import (
	"encoding/binary"
	"fmt"
	"io/fs"
	"math"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/web/assets"
)

// The metric-matched fallback faces in fonts.css are Arial reshaped to each real font's
// metrics (the three next/font generates). They decide how a character the font does not
// contain is drawn — Poppins has no arrows — so if a TTF here is replaced by one with
// different metrics and the percentages are left behind, text silently changes width against
// the Next app and nothing else notices.
//
// So this recomputes every percentage from the TTF's own head and hhea tables:
//
//	ascent-override   = ascender / (unitsPerEm * size-adjust)
//	descent-override  = |descender| / (unitsPerEm * size-adjust)
//	line-gap-override = lineGap / (unitsPerEm * size-adjust)
//
// size-adjust itself comes from the average character width against Arial's, which is not in
// the font file, so it is taken as given and the other three are checked against it.

// fallbackFonts maps a fallback family in fonts.css to the TTFs it stands in for. Every file
// listed must agree, which is what catches one weight being swapped on its own.
var fallbackFonts = map[string][]string{
	"Poppins Fallback": {
		"fonts/poppins_regular.ttf", "fonts/poppins_italic.ttf", "fonts/poppins_medium.ttf",
		"fonts/poppins_semibold.ttf", "fonts/poppins_bold.ttf", "fonts/poppins_extrabold.ttf",
	},
	"Caveat Fallback":         {"fonts/caveat_variable.ttf"},
	"JetBrains Mono Fallback": {"fonts/jetbrains_mono_variable.ttf"},
}

type faceMetrics struct {
	unitsPerEm               int
	ascender, descender, gap int
}

// readTTF pulls unitsPerEm from head and the three vertical metrics from hhea.
func readTTF(b []byte) (faceMetrics, error) {
	var m faceMetrics
	if len(b) < 12 {
		return m, fmt.Errorf("not a font file")
	}
	numTables := int(binary.BigEndian.Uint16(b[4:6]))
	offsets := map[string]int{}
	for i := range numTables {
		rec := 12 + 16*i
		if rec+16 > len(b) {
			return m, fmt.Errorf("table directory runs past the file")
		}
		offsets[string(b[rec:rec+4])] = int(binary.BigEndian.Uint32(b[rec+8 : rec+12]))
	}
	head, ok := offsets["head"]
	if !ok || head+20 > len(b) {
		return m, fmt.Errorf("no head table")
	}
	hhea, ok := offsets["hhea"]
	if !ok || hhea+10 > len(b) {
		return m, fmt.Errorf("no hhea table")
	}
	m.unitsPerEm = int(binary.BigEndian.Uint16(b[head+18 : head+20]))
	m.ascender = int(int16(binary.BigEndian.Uint16(b[hhea+4 : hhea+6])))
	m.descender = int(int16(binary.BigEndian.Uint16(b[hhea+6 : hhea+8])))
	m.gap = int(int16(binary.BigEndian.Uint16(b[hhea+8 : hhea+10])))
	if m.unitsPerEm == 0 {
		return m, fmt.Errorf("unitsPerEm is zero")
	}
	return m, nil
}

var (
	faceBlock = regexp.MustCompile(`(?s)@font-face\s*\{([^}]*)\}`)
	fontDecl  = regexp.MustCompile(`([a-z-]+)\s*:\s*([^;]+);`)
)

type fallbackFace struct {
	family                     string
	ascent, descent, gap, size float64
	src                        string
}

// parseFallbacks reads the fallback @font-face rules out of fonts.css.
func parseFallbacks(t *testing.T) map[string]fallbackFace {
	t.Helper()
	b, err := assets.FS.ReadFile("css/fonts.css")
	if err != nil {
		t.Fatal(err)
	}
	css := comment.ReplaceAllString(string(b), "")
	out := map[string]fallbackFace{}
	for _, block := range faceBlock.FindAllStringSubmatch(css, -1) {
		f := fallbackFace{}
		pct := func(v string) float64 {
			n, err := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSpace(v), "%"), 64)
			if err != nil {
				t.Fatalf("fonts.css: %q is not a percentage", v)
			}
			return n
		}
		for _, d := range fontDecl.FindAllStringSubmatch(block[1], -1) {
			value := strings.TrimSpace(d[2])
			switch d[1] {
			case "font-family":
				f.family = strings.Trim(value, `"'`)
			case "ascent-override":
				f.ascent = pct(value)
			case "descent-override":
				f.descent = pct(value)
			case "line-gap-override":
				f.gap = pct(value)
			case "size-adjust":
				f.size = pct(value)
			case "src":
				f.src = value
			}
		}
		if strings.HasSuffix(f.family, "Fallback") {
			out[f.family] = f
		}
	}
	return out
}

func TestFallbackFacesMatchTheBundledFonts(t *testing.T) {
	faces := parseFallbacks(t)
	if len(faces) != len(fallbackFonts) {
		t.Fatalf("fonts.css declares %d fallback faces, want %d (%v)", len(faces), len(fallbackFonts), faces)
	}
	for family, files := range fallbackFonts {
		face, ok := faces[family]
		if !ok {
			t.Errorf("fonts.css has no %q face", family)
			continue
		}
		// It must stand in for a font already on the machine, never fetch one.
		if !strings.HasPrefix(face.src, "local(") {
			t.Errorf("%s: src is %q, want a local() face", family, face.src)
		}
		if face.size <= 0 {
			t.Errorf("%s: no size-adjust", family)
			continue
		}
		scale := face.unitsScale()
		for _, file := range files {
			b, err := fs.ReadFile(assets.FS, file)
			if err != nil {
				t.Errorf("%s: %v", family, err)
				continue
			}
			m, err := readTTF(b)
			if err != nil {
				t.Errorf("%s: %s: %v", family, file, err)
				continue
			}
			em := float64(m.unitsPerEm) * scale
			for _, c := range []struct {
				name        string
				got, metric float64
			}{
				{"ascent-override", face.ascent, float64(m.ascender)},
				{"descent-override", face.descent, math.Abs(float64(m.descender))},
				{"line-gap-override", face.gap, float64(m.gap)},
			} {
				want := c.metric / em * 100
				// next/font rounds to two decimals, so allow half of the last place.
				if math.Abs(want-c.got) > 0.005 {
					t.Errorf("%s (%s): %s is %.2f%%, the font's metrics give %.2f%%",
						family, file, c.name, c.got, want)
				}
			}
		}
	}
}

// Every font variable names its fallback after the real family, as next/font declares them.
func TestFontVariablesCarryTheirFallback(t *testing.T) {
	b, err := assets.FS.ReadFile("css/fonts.css")
	if err != nil {
		t.Fatal(err)
	}
	css := comment.ReplaceAllString(string(b), "")
	for _, c := range []struct{ variable, want string }{
		{"--font-poppins", `"Poppins", "Poppins Fallback"`},
		{"--font-caveat", `"Caveat", "Caveat Fallback"`},
		{"--font-jetbrains-mono", `"JetBrains Mono", "JetBrains Mono Fallback"`},
	} {
		m := regexp.MustCompile(regexp.QuoteMeta(c.variable) + `\s*:\s*([^;]+);`).FindStringSubmatch(css)
		if m == nil {
			t.Errorf("fonts.css does not declare %s", c.variable)
			continue
		}
		if got := strings.TrimSpace(m[1]); got != c.want {
			t.Errorf("%s = %s, want %s", c.variable, got, c.want)
		}
	}
}

func (f fallbackFace) unitsScale() float64 { return f.size / 100 }
