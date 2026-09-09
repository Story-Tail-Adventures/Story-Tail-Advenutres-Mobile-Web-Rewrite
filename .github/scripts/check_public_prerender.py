#!/usr/bin/env python3
"""
Enforce that the public marketing pages are still prerendered as static HTML.

`web/app/(public)/layout.tsx` is deliberately free of request-time APIs — no cookies(),
headers() or auth lookups — because that is what lets every marketing page be a file on a
CDN. It is a load-bearing constraint and an easy one to break by accident: one `cookies()`
anywhere in the public server tree turns the whole marketing site into per-request rendering,
the build still succeeds, and nothing says a word.

`deploy.yml` already guards the related trap (that no prerendered route may read
NEXT_PUBLIC_SUPABASE_*), but it asserts the CAUSE. This asserts the EFFECT.

Reads .next/prerender-manifest.json, so it must run after `next build`.

Run: python3 .github/scripts/check_public_prerender.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "web/.next/prerender-manifest.json"
SEO = ROOT / "web/app/seo.ts"

# The two public routes that are dynamic on purpose: both await searchParams, and both are
# `noindex`, so neither is a CDN asset to begin with.
DYNAMIC_BY_DESIGN = {"/join", "/explore/results"}

# Prerendered by generateStaticParams rather than listed in STATIC_PUBLIC_PATHS. One of each
# is enough — if the group went dynamic, every path in it would.
SLUG_ROUTES = ["/explore/", "/legal/"]


def static_public_paths() -> list[str]:
    """The marketing pages, read from the single list the sitemap is built from."""
    source = SEO.read_text(encoding="utf-8")
    block = re.search(r"export const STATIC_PUBLIC_PATHS = \[(.*?)\] as const;", source, re.S)
    if not block:
        sys.exit(f"{SEO}: could not find STATIC_PUBLIC_PATHS. Did it move or get renamed?")
    paths = re.findall(r'"([^"]+)"', block.group(1))
    if not paths:
        sys.exit(f"{SEO}: STATIC_PUBLIC_PATHS parsed as empty, which cannot be right.")
    return paths


def main() -> int:
    if not MANIFEST.exists():
        sys.exit(f"{MANIFEST} is missing. Run `npm run build -w web` first.")

    prerendered = set(json.loads(MANIFEST.read_text(encoding="utf-8")).get("routes", {}))

    failures = [path for path in static_public_paths() if path not in prerendered]

    for prefix in SLUG_ROUTES:
        if not any(route.startswith(prefix) for route in prerendered):
            failures.append(f"{prefix}* (no prerendered path in the group)")

    for route in sorted(DYNAMIC_BY_DESIGN & prerendered):
        print(
            f"note: {route} is now prerendered. That is a change, not a break — if it is "
            "intended, drop it from DYNAMIC_BY_DESIGN in this script."
        )

    if failures:
        print("::error::Public marketing routes are no longer statically prerendered:")
        for path in failures:
            print(f"::error::  {path}")
        print(
            "::error::Something in the (public) server tree started reading the request — "
            "cookies(), headers(), an auth lookup or an uncached fetch. See "
            "web/app/(public)/layout.tsx for why that is not allowed here."
        )
        return 1

    print(f"OK: {len(static_public_paths())} marketing pages + the slug groups are prerendered.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
