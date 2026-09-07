/**
 * Generate the mobile app's §2.0 content from web/content/public/*.ts.
 *
 * web/ is the single source of truth for the curated catalog and the marketing copy.
 * Hand-copying 22 trips, four legal documents and the claims registry into Kotlin would
 * guarantee drift — check_copy_parity.py exists because that has already happened once for
 * validation strings, and it only catches what it is explicitly told about.
 *
 * So the Kotlin is generated instead. `npm run generate:public-content` writes
 * GeneratedPublicContent.kt; CI regenerates and diffs, exactly like the contracts codegen
 * job, so a change to the TypeScript that is not carried across fails the build.
 *
 * Run from web/:  ../node_modules/.bin/vite-node --config vitest.config.ts scripts/export-public-content.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CRUISE_LINES } from "@/content/public/cruise-lines";
import { INSPIRATION_TILES } from "@/content/public/inspiration";
import { ISLANDS } from "@/content/public/islands";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/content/public/legal";
import { CLAIMS, TESTIMONIALS } from "@/content/public/proof";
import { GYASI_FAQ } from "@/content/public/faq/gyasi";
import { HOW_IT_WORKS_FAQ } from "@/content/public/faq/how-it-works";
import { TRIPS } from "@/content/public/trips";
import { STA_IMAGES } from "@/lib/images";
import type { Claim, FaqItem, LegalDoc, Trip } from "@/content/public/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  HERE,
  "../../mobile/shared/src/commonMain/kotlin/com/storytail/adventures/content/public/GeneratedPublicContent.kt",
);

// ── Kotlin emitters ──────────────────────────────────────────────────────────

/** A Kotlin string literal. `$` starts a template, so it has to be escaped too. */
function kstr(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

function knullableStr(value: string | undefined): string {
  return value === undefined ? "null" : kstr(value);
}

/** "all-inclusive" -> ALL_INCLUSIVE, matching the Kotlin enum spelling. */
function kenum(value: string): string {
  return value.toUpperCase().replace(/-/g, "_");
}

function klist(items: string[], indent: string): string {
  if (items.length === 0) return "emptyList()";
  const inner = items.map((item) => `${indent}    ${item},`).join("\n");
  return `listOf(\n${inner}\n${indent})`;
}

const BAND_TO_ENUM: Record<string, string> = { $: "ONE", $$: "TWO", $$$: "THREE" };

function emitTrip(trip: Trip): string {
  const topics = Object.entries(trip.topics).map(([topic, placement]) => {
    if (!placement) return "";
    return `Topic.${kenum(topic)} to TopicPlacement(order = ${placement.order}, overline = ${knullableStr(placement.overline)}, tagline = ${knullableStr(placement.tagline)}, badge = ${knullableStr(placement.badge)})`;
  }).filter(Boolean);

  const highlights = trip.highlights.map(
    (h) => `TripHighlight(icon = ${kstr(h.icon)}, text = ${kstr(h.text)})`,
  );

  return `        Trip(
            slug = ${kstr(trip.slug)},
            name = ${kstr(trip.name)},
            tagline = ${kstr(trip.tagline)},
            overline = ${kstr(trip.overline)},
            type = TripType.${kenum(trip.type)},
            vibes = ${klist(trip.vibes.map((v) => `Vibe.${kenum(v)}`), "            ")},
            topics = ${topics.length === 0 ? "emptyMap()" : `mapOf(\n${topics.map((t) => `                ${t},`).join("\n")}\n            )`},
            destination = Destination(place = ${kstr(trip.destination.place)}, region = ${kstr(trip.destination.region)}, island = ${knullableStr(trip.destination.island)}),
            nights = ${trip.nights ?? "null"},
            band = PriceBand.${BAND_TO_ENUM[trip.band]},
            from = Money(amountCents = ${trip.from.amountCents}L, currency = ${kstr(trip.from.currency)}),
            priceAsOf = ${kstr(trip.priceAsOf)},
            pricePlaceholder = ${trip.pricePlaceholder},
            priceNote = ${kstr(trip.priceNote)},
            badge = ${knullableStr(trip.badge)},
            imageKey = ${kstr(trip.imageKey)},
            heroImageKey = ${knullableStr(trip.heroImageKey)},
            description = ${kstr(trip.description)},
            highlights = ${klist(highlights, "            ")},
            sampleItinerary = ${klist(trip.sampleItinerary.map(kstr), "            ")},
            line = ${knullableStr(trip.line)},
        )`;
}

function emitLegal(doc: LegalDoc): string {
  const sections = doc.sections.map(
    (s) => `            LegalSection(
                heading = ${kstr(s.heading)},
                paragraphs = ${klist(s.paragraphs.map(kstr), "                ")},
                bullets = ${klist((s.bullets ?? []).map(kstr), "                ")},
            )`,
  );
  return `        LegalDoc(
            slug = LegalSlug.${kenum(doc.slug)},
            title = ${kstr(doc.title)},
            navLabel = ${kstr(doc.navLabel)},
            description = ${kstr(doc.description)},
            lastUpdated = ${kstr(doc.lastUpdated)},
            status = ${kstr(doc.status)},
            sections = listOf(
${sections.join(",\n")},
            ),
        )`;
}

function emitFaq(items: readonly FaqItem[]): string {
  return items.map((i) => `        FaqItem(q = ${kstr(i.q)}, a = ${kstr(i.a)})`).join(",\n");
}

// ── The file ─────────────────────────────────────────────────────────────────

const claims = Object.entries(CLAIMS) as [string, Claim][];

const body = `// GENERATED FILE — DO NOT EDIT.
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

    val TRIPS: List<Trip> = listOf(
${TRIPS.map(emitTrip).join(",\n")},
    )

    val ISLANDS: List<Island> = listOf(
${ISLANDS.map((i) => `        Island(slug = ${kstr(i.slug)}, name = ${kstr(i.name)}, imageKey = ${kstr(i.imageKey)})`).join(",\n")},
    )

    val CRUISE_LINES: List<CruiseLine> = listOf(
${CRUISE_LINES.map((c) => `        CruiseLine(slug = ${kstr(c.slug)}, name = ${kstr(c.name)})`).join(",\n")},
    )

    val INSPIRATION_TILES: List<InspirationTile> = listOf(
${INSPIRATION_TILES.map((t) => `        InspirationTile(
            slug = ${kstr(t.slug)},
            title = ${kstr(t.title)},
            imageKey = ${kstr(t.imageKey)},
            query = InspirationQuery(topic = ${t.query.topic ? `Topic.${kenum(t.query.topic)}` : "null"}, type = ${t.query.type ? `TripType.${kenum(t.query.type)}` : "null"}, vibe = ${t.query.vibe ? `Vibe.${kenum(t.query.vibe)}` : "null"}, dest = ${knullableStr(t.query.dest)}),
        )`).join(",\n")},
    )

    val HOW_IT_WORKS_FAQ: List<FaqItem> = listOf(
${emitFaq(HOW_IT_WORKS_FAQ)},
    )

    val GYASI_FAQ: List<FaqItem> = listOf(
${emitFaq(GYASI_FAQ)},
    )

    val LEGAL_DOCS: List<LegalDoc> = listOf(
${LEGAL_SLUGS.map((slug) => emitLegal(LEGAL_DOCS[slug])).join(",\n")},
    )

    val CLAIMS: List<Claim> = listOf(
${claims.map(([id, c]) => `        Claim(id = ${kstr(id)}, display = ${kstr(c.display)}, detail = ${knullableStr(c.detail)}, verified = ${c.verified})`).join(",\n")},
    )

    val TESTIMONIALS: List<Testimonial> = listOf(
${TESTIMONIALS.map((t) => `        Testimonial(quote = ${kstr(t.quote)}, who = ${kstr(t.who)}, trip = ${kstr(t.trip)}, initials = ${kstr(t.initials)}, consented = ${t.consented})`).join(",\n")},
    )

    /** The design's photography registry. None of it is licensed yet — see PublicPhoto. */
    val IMAGES: List<RegisteredImage> = listOf(
${Object.entries(STA_IMAGES).map(([key, img]) => `        RegisteredImage(key = ${kstr(key)}, alt = ${kstr(img.alt)}, licensed = ${img.licensed})`).join(",\n")},
    )
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body, "utf8");
console.log(
  `wrote ${OUT}\n  ${TRIPS.length} trips · ${ISLANDS.length} islands · ${LEGAL_SLUGS.length} legal docs · ${claims.length} claims · ${TESTIMONIALS.length} testimonials`,
);
