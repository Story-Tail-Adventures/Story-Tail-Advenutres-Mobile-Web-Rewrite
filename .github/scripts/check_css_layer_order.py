#!/usr/bin/env python3
"""
Enforce that the BUILT CSS declares the cascade layer order before it names any layer.

A layer's rank is fixed by the first time the browser sees its name. The order is
`base, mui, components`: MUI's emotion rules sit in `mui`, above the element reset and below
the CSS gates in `components` (the theme-toggle icons, the pre-paint auth gates, print). If
`components` is named first, `mui` lands on top and every gate silently loses to MUI's own
`display`.

The source can be right while the bundle is wrong. globals.css once opened with the order
statement ahead of its @imports, which is correct CSS, and lib/mui/layers.test.ts checked
exactly that; but the bundler emits every @import'ed file BEFORE the importing file's own
rules, so the statement arrived after reset.css and components.css had named their layers,
and both theme icons showed in dark mode (2026-10-12). The order now lives in
web/styles/layers.css, imported first. This asserts the EFFECT, in the files a browser loads.

Reads web/.next/static, so it must run after `next build`.

Run: python3 .github/scripts/check_css_layer_order.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
STATIC = ROOT / "web/.next/static"
ORDER = ["base", "mui", "components"]

COMMENT = re.compile(r"/\*.*?\*/", re.S)
# The first `@layer` in a file, statement (`@layer a, b;`) or block (`@layer a {`).
FIRST_LAYER = re.compile(r"@layer\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*([;{])")


def main() -> int:
    if not STATIC.exists():
        sys.exit(f"{STATIC} is missing. Run `npm run build -w web` first.")

    layered = 0
    failures: list[str] = []
    for css in sorted(STATIC.rglob("*.css")):
        text = COMMENT.sub("", css.read_text(encoding="utf-8"))
        first = FIRST_LAYER.search(text)
        if not first:
            continue  # next/font and the like: no layers, nothing to rank
        layered += 1
        names = [n.strip() for n in first.group(1).split(",")]
        rel = css.relative_to(ROOT)
        if first.group(2) == "{":
            failures.append(
                f"{rel}: `@layer {names[0]}` opens a block at byte {first.start()} before any "
                f"order statement, so it is ranked by where it appears."
            )
        elif names != ORDER:
            failures.append(f"{rel}: the first layer statement is `{', '.join(names)}`, not `{', '.join(ORDER)}`.")

    if layered == 0:
        # The build moved its CSS, or the layers went: either way this check is checking nothing.
        sys.exit(f"No built CSS under {STATIC} names a layer. Has the build output moved?")

    if failures:
        print("Cascade layer order is wrong in the built CSS:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "web/styles/layers.css must be the FIRST @import in web/app/globals.css, and no "
            "other stylesheet may name a layer before it is imported.",
            file=sys.stderr,
        )
        return 1

    print(f"ok: {layered} built stylesheet(s) declare `{', '.join(ORDER)}` before naming any layer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
