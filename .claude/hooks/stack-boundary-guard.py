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


def _git_root(start: str) -> str | None:
    """Walk up for a .git directory. Used when CLAUDE_PROJECT_DIR is not set."""
    current = os.path.abspath(start)
    while True:
        if os.path.exists(os.path.join(current, ".git")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0  # Never block on a parse failure.

    path = (payload.get("tool_input") or {}).get("file_path") or ""
    if not path:
        return 0

    # Relative to the REPO ROOT, not the session's cwd. Getting this wrong inverts the
    # guard: a session rooted at mobile/ writing a correct mobile/shared/....kt path sees it
    # relativized to shared/....kt, which fails the `mobile/` prefix test and is denied —
    # so the rule blocks exactly the writes it exists to permit. That cost a batch of
    # subagents their Write tool, and each one worked around it with a shell heredoc.
    root = (
        os.environ.get("CLAUDE_PROJECT_DIR")
        or _git_root(payload.get("cwd") or os.getcwd())
        or payload.get("cwd")
        or os.getcwd()
    )
    try:
        rel = os.path.relpath(os.path.abspath(path), os.path.abspath(root))
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
