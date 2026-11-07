// Command gen-kotlin writes the mobile app's GeneratedPublicContent.kt from the public
// content in internal/content (docs/GO-MIGRATION.md §4.11).
//
// It replaces web/scripts/export-public-content.mts and writes the same file byte for byte,
// so the phone and the browser show a traveler the same words and prices. Run from webgo/:
//
//	go run ./cmd/gen-kotlin            # writes mobile/.../GeneratedPublicContent.kt
//	go run ./cmd/gen-kotlin -o out.kt  # writes somewhere else
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/Story-Tail-Adventures/Story-Tail-Advenutres-Mobile-Web-Rewrite/webgo/internal/content"
)

// defaultOut is the Kotlin file, relative to the repository root.
const defaultOut = "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/content/public/GeneratedPublicContent.kt"

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "gen-kotlin:", err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	fl := flag.NewFlagSet("gen-kotlin", flag.ContinueOnError)
	out := fl.String("o", "", "the file to write (default: "+defaultOut+" under the repository root)")
	if err := fl.Parse(args); err != nil {
		return err
	}
	path := *out
	if path == "" {
		root, err := repoRoot()
		if err != nil {
			return err
		}
		path = filepath.Join(root, defaultOut)
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	c := content.Get()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, Generate(c), 0o644); err != nil {
		return err
	}
	_, err = fmt.Fprintf(stdout, "wrote %s\n  %d trips · %d islands · %d legal docs · %d claims · %d testimonials\n",
		path, len(c.Trips), len(c.Islands), len(c.Legal), len(c.Claims), len(c.Testimonials))
	return err
}

// repoRoot walks up from the working directory to the folder that holds webgo/go.mod.
func repoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "webgo", "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("cannot find the repository root (no webgo/go.mod above the working directory); pass -o")
		}
		dir = parent
	}
}

// emDash is the dash the generated header and the IMAGES comment use. It is an escape so
// the character is easy to see in review.
const emDash = "\u2014"

const header = "// GENERATED FILE " + emDash + ` DO NOT EDIT.
//
// Written by web/scripts/export-public-content.mts from web/content/public/*.ts, which is
// the single source of truth for Screen Inventory §2.0's curated catalog and copy.
// Regenerate with:  npm run generate:public-content
//
// CI fails when this file is stale, so the phone and the browser cannot show a traveler
// different words or a different price for the same trip.
@file:Suppress("MaxLineLength", "LargeClass")

package com.storytail.adventures.content.public

internal object PublicCatalog {

`

// Generate is the Kotlin file for a catalog. It walks only the catalog's ordered slices,
// never a map, so the output is the same on every run.
func Generate(c *content.Catalog) []byte {
	var b strings.Builder
	b.WriteString(header)

	list(&b, "TRIPS: List<Trip>", mapEach(c.Trips, emitTrip))
	b.WriteString("\n")
	list(&b, "ISLANDS: List<Island>", mapEach(c.Islands, func(i content.Island) string {
		return "        Island(slug = " + kstr(string(i.Slug)) + ", name = " + kstr(i.Name) +
			", imageKey = " + kstr(string(i.ImageKey)) + ")"
	}))
	b.WriteString("\n")
	list(&b, "CRUISE_LINES: List<CruiseLine>", mapEach(c.CruiseLines, func(l content.CruiseLine) string {
		return "        CruiseLine(slug = " + kstr(l.Slug) + ", name = " + kstr(l.Name) + ")"
	}))
	b.WriteString("\n")
	list(&b, "INSPIRATION_TILES: List<InspirationTile>", mapEach(c.Inspiration, emitTile))
	b.WriteString("\n")
	list(&b, "HOW_IT_WORKS_FAQ: List<FaqItem>", mapEach(c.HowItWorksFAQ, emitFaq))
	b.WriteString("\n")
	list(&b, "GYASI_FAQ: List<FaqItem>", mapEach(c.GyasiFAQ, emitFaq))
	b.WriteString("\n")
	list(&b, "LEGAL_DOCS: List<LegalDoc>", mapEach(c.Legal, emitLegal))
	b.WriteString("\n")
	list(&b, "CLAIMS: List<Claim>", mapEach(c.Claims, func(cl content.Claim) string {
		return "        Claim(id = " + kstr(cl.ID) + ", display = " + kstr(cl.Display) +
			", detail = " + knullableStr(cl.Detail) + ", verified = " + strconv.FormatBool(cl.Verified) + ")"
	}))
	b.WriteString("\n")
	list(&b, "TESTIMONIALS: List<Testimonial>", mapEach(c.Testimonials, func(t content.Testimonial) string {
		return "        Testimonial(quote = " + kstr(t.Quote) + ", who = " + kstr(t.Who) + ", trip = " +
			kstr(t.Trip) + ", initials = " + kstr(t.Initials) + ", consented = " +
			strconv.FormatBool(t.Consented) + ")"
	}))
	b.WriteString("\n")
	b.WriteString("    /** The design's photography registry. None of it is licensed yet " + emDash + " see PublicPhoto. */\n")
	list(&b, "IMAGES: List<RegisteredImage>", mapEach(c.Images, func(img content.Image) string {
		return "        RegisteredImage(key = " + kstr(string(img.Key)) + ", alt = " + kstr(img.Alt) +
			", licensed = " + strconv.FormatBool(img.Licensed) + ")"
	}))
	b.WriteString("}\n")
	return []byte(b.String())
}

// list writes one `val NAME: Type = listOf(...)` block.
func list(b *strings.Builder, decl string, items []string) {
	b.WriteString("    val " + decl + " = listOf(\n")
	b.WriteString(strings.Join(items, ",\n"))
	b.WriteString(",\n    )\n")
}

func mapEach[T any](items []T, f func(T) string) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = f(it)
	}
	return out
}

// kstr is a Kotlin string literal. `$` starts a template in Kotlin, so it is escaped too.
// The replacements run in the TypeScript's order, backslash first.
func kstr(value string) string {
	s := strings.ReplaceAll(value, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	s = strings.ReplaceAll(s, `$`, `\$`)
	s = strings.ReplaceAll(s, "\n", `\n`)
	s = strings.ReplaceAll(s, "\r", `\r`)
	s = strings.ReplaceAll(s, "\t", `\t`)
	return `"` + s + `"`
}

// knullableStr is kstr, or null when the value is absent.
func knullableStr[S ~string](value *S) string {
	if value == nil {
		return "null"
	}
	return kstr(string(*value))
}

// kenum turns "all-inclusive" into ALL_INCLUSIVE, the Kotlin enum spelling.
func kenum[S ~string](value S) string {
	return strings.ReplaceAll(strings.ToUpper(string(value)), "-", "_")
}

// klist is a Kotlin listOf(...) with one item per line, or emptyList().
func klist(items []string, indent string) string {
	if len(items) == 0 {
		return "emptyList()"
	}
	lines := make([]string, len(items))
	for i, it := range items {
		lines[i] = indent + "    " + it + ","
	}
	return "listOf(\n" + strings.Join(lines, "\n") + "\n" + indent + ")"
}

// bandEnum is the Kotlin PriceBand for "$", "$$" and "$$$". The content package refuses any
// other band when it loads.
func bandEnum(b content.PriceBand) string {
	switch b {
	case "$":
		return "ONE"
	case "$$":
		return "TWO"
	case "$$$":
		return "THREE"
	}
	panic(fmt.Sprintf("gen-kotlin: unknown price band %q", b))
}

func emitTrip(t content.Trip) string {
	topics := "emptyMap()"
	if len(t.Topics) > 0 {
		lines := make([]string, len(t.Topics))
		for i, e := range t.Topics {
			p := e.Placement
			lines[i] = "                Topic." + kenum(e.Topic) + " to TopicPlacement(order = " +
				strconv.Itoa(p.Order) + ", overline = " + knullableStr(p.Overline) + ", tagline = " +
				knullableStr(p.Tagline) + ", badge = " + knullableStr(p.Badge) + "),"
		}
		topics = "mapOf(\n" + strings.Join(lines, "\n") + "\n            )"
	}
	nights := "null"
	if t.Nights != nil {
		nights = strconv.Itoa(*t.Nights)
	}
	vibes := mapEach(t.Vibes, func(v content.Vibe) string { return "Vibe." + kenum(v) })
	highlights := mapEach(t.Highlights, func(h content.TripHighlight) string {
		return "TripHighlight(icon = " + kstr(h.Icon) + ", text = " + kstr(h.Text) + ")"
	})

	var b strings.Builder
	field := func(name, value string) {
		b.WriteString("            " + name + " = " + value + ",\n")
	}
	b.WriteString("        Trip(\n")
	field("slug", kstr(t.Slug))
	field("name", kstr(t.Name))
	field("tagline", kstr(t.Tagline))
	field("overline", kstr(t.Overline))
	field("type", "TripType."+kenum(t.Type))
	field("vibes", klist(vibes, "            "))
	field("topics", topics)
	field("destination", "Destination(place = "+kstr(t.Destination.Place)+", region = "+
		kstr(t.Destination.Region)+", island = "+knullableStr(t.Destination.Island)+")")
	field("nights", nights)
	field("band", "PriceBand."+bandEnum(t.Band))
	field("from", "Money(amountCents = "+strconv.FormatInt(t.From.AmountCents, 10)+"L, currency = "+
		kstr(t.From.Currency)+")")
	field("priceAsOf", kstr(t.PriceAsOf))
	field("pricePlaceholder", strconv.FormatBool(t.PricePlaceholder))
	field("priceNote", kstr(t.PriceNote))
	field("badge", knullableStr(t.Badge))
	field("imageKey", kstr(string(t.ImageKey)))
	field("heroImageKey", knullableStr(t.HeroImageKey))
	field("description", kstr(t.Description))
	field("highlights", klist(highlights, "            "))
	field("sampleItinerary", klist(mapEach(t.SampleItinerary, kstr), "            "))
	field("line", knullableStr(t.Line))
	b.WriteString("        )")
	return b.String()
}

// emitTile writes one inspiration tile. An absent or empty topic, type or vibe is null, as
// the TypeScript's truthiness check made it; dest is null only when absent.
func emitTile(t content.InspirationTile) string {
	q := t.Query
	topic, typ, vibe := "null", "null", "null"
	if q.Topic != nil && *q.Topic != "" {
		topic = "Topic." + kenum(*q.Topic)
	}
	if q.Type != nil && *q.Type != "" {
		typ = "TripType." + kenum(*q.Type)
	}
	if q.Vibe != nil && *q.Vibe != "" {
		vibe = "Vibe." + kenum(*q.Vibe)
	}
	return "        InspirationTile(\n" +
		"            slug = " + kstr(t.Slug) + ",\n" +
		"            title = " + kstr(t.Title) + ",\n" +
		"            imageKey = " + kstr(string(t.ImageKey)) + ",\n" +
		"            query = InspirationQuery(topic = " + topic + ", type = " + typ + ", vibe = " + vibe +
		", dest = " + knullableStr(q.Dest) + "),\n" +
		"        )"
}

func emitFaq(f content.FaqItem) string {
	return "        FaqItem(q = " + kstr(f.Q) + ", a = " + kstr(f.A) + ")"
}

func emitLegal(d content.LegalDoc) string {
	sections := mapEach(d.Sections, func(s content.LegalSection) string {
		return "            LegalSection(\n" +
			"                heading = " + kstr(s.Heading) + ",\n" +
			"                paragraphs = " + klist(mapEach(s.Paragraphs, kstr), "                ") + ",\n" +
			"                bullets = " + klist(mapEach(s.Bullets, kstr), "                ") + ",\n" +
			"            )"
	})
	return "        LegalDoc(\n" +
		"            slug = LegalSlug." + kenum(d.Slug) + ",\n" +
		"            title = " + kstr(d.Title) + ",\n" +
		"            navLabel = " + kstr(d.NavLabel) + ",\n" +
		"            description = " + kstr(d.Description) + ",\n" +
		"            lastUpdated = " + kstr(d.LastUpdated) + ",\n" +
		"            status = " + kstr(d.Status) + ",\n" +
		"            sections = listOf(\n" +
		strings.Join(sections, ",\n") + ",\n" +
		"            ),\n" +
		"        )"
}
