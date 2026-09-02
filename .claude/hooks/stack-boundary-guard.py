#!/usr/bin/env python3
"""
PreToolUse guard for CLAUDE.md rule 7: stack directories are hard boundaries.

Kotlin lives in mobile/, React lives in web/, Deno backend lives in supabase/, shared API
types live in contracts/. Cross-contamination is the one project rule that is fully
mechanical to check, and today it is caught only by post-hoc review.

PreToolUse, not PostToolUse: PostToolUse runs after the write has already happened, so it
can only complain. Exit code 2 here denies the call before the file is touched.

Exit codes: 0 = allow, 2 = deny (stderr is shown to Claude).
"""
import json
import os
import sys

# (extension, allowed path prefixes, message)
RULES = [
    (
        (".kt", ".kts"),
        ("mobile/", "contracts/kotlin/", "design/compose-theme/"),
        "Kotlin belongs under mobile/ (or contracts/kotlin/ for generated types).",
    ),
    (
        (".tsx", ".jsx"),
        ("web/", "design/source-prototype/", "design/web-tokens/"),
        "React/JSX belongs under web/.",
    ),
    (
        (".swift",),
        ("mobile/",),
        "Swift belongs under mobile/iosApp/.",
    ),
]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # Never block on a parse failure.

    path = (payload.get("tool_input") or {}).get("file_path") or ""
    if not path:
        return 0

    cwd = payload.get("cwd") or os.getcwd()
    try:
        rel = os.path.relpath(path, cwd)
    except ValueError:
        return 0
    if rel.startswith(".."):
        return 0  # Outside the repo (scratchpad, plan file) — not our business.

    rel = rel.replace(os.sep, "/")

    for exts, allowed, message in RULES:
        if rel.endswith(exts) and not rel.startswith(allowed):
            print(
                f"Stack boundary violation (CLAUDE.md rule 7): {rel}\n"
                f"{message}\n"
                f"Allowed prefixes: {', '.join(allowed)}",
                file=sys.stderr,
            )
            return 2

    # Edge Functions run on Deno, not Node or the browser.
    if rel.startswith("supabase/functions/") and rel.endswith((".ts", ".tsx")):
        content = (payload.get("tool_input") or {}).get("content") or ""
        content += (payload.get("tool_input") or {}).get("new_string") or ""
        for bad in ('from "react"', "from 'react'", 'from "next/', "from 'next/"):
            if bad in content:
                print(
                    f"Stack boundary violation (CLAUDE.md rule 7): {rel}\n"
                    "Edge Functions run on Deno — they cannot import React or Next.js.",
                    file=sys.stderr,
                )
                return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
