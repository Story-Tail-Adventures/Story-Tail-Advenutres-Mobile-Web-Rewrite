#!/usr/bin/env python3
"""
Fail CI if a Luhn-valid 13-19 digit number is committed to source.

The CI mirror of .claude/hooks/pan-secret-guard.py — that hook only sees Claude's writes,
this sees everyone's. Luhn-checking rather than matching "16 digits" is what keeps it from
firing on timestamps, IDs, and phone numbers.

Scans TRACKED files only (via `git ls-files`), not the working tree: build artifacts like
tsconfig.tsbuildinfo are full of Luhn-valid hashes, and they are gitignored precisely
because they are not source. Scanning the filesystem would fail on local cruft that CI
would never see.
"""
import pathlib
import re
import subprocess
import sys

# Documentation and design assets necessarily discuss card fields; generated files carry
# hashes. Neither is where a real PAN would hide.
SKIP_DIRS = {"docs", "design", ".claude", ".github"}
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf", ".zip",
    ".ttf", ".otf", ".woff", ".woff2", ".eps", ".ai", ".docx", ".tsbuildinfo",
}
SKIP_NAMES = {"package-lock.json", "pnpm-lock.yaml"}
# Generated from the schema / contract — the content is not hand-authored.
SKIP_PATHS = {"web/types/supabase.ts", "contracts/ts/types.ts"}

CANDIDATE = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")

# UUIDs are everywhere in this codebase and their hyphenated all-digit segments look like
# a separator-formatted card number to a naive scan — and an all-zero run passes Luhn
# (digit sum 0). Strip UUID-shaped text before scanning, and require some digit variety.
UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I
)

def strip_uuids(text: str) -> str:
    """Blank out UUIDs so their digit segments cannot form a false candidate."""
    return UUID_RE.sub(lambda m: "#" * len(m.group()), text)


def plausible_pan(digits: str) -> bool:
    """
    Reject only a single repeated digit (0000000000000000, a placeholder).

    Deliberately NOT stricter. An earlier version required four distinct digits and
    silently stopped catching 4242424242424242 and 4111111111111111 — the two most
    common test PANs in existence, both of which use only two. Stripping UUIDs is what
    removes the false positives; this check exists only for all-zero placeholders.
    """
    return len(set(digits)) >= 2



def luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = ord(ch) - 48
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def tracked_files() -> list[pathlib.Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout
    return [pathlib.Path(p) for p in out.split("\0") if p]


def main() -> int:
    findings = []

    for path in tracked_files():
        if path.parts and path.parts[0] in SKIP_DIRS:
            continue
        if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES:
            continue
        if path.as_posix() in SKIP_PATHS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError, FileNotFoundError):
            continue

        for lineno, line in enumerate(text.splitlines(), 1):
            for match in CANDIDATE.finditer(strip_uuids(line)):
                digits = re.sub(r"[ -]", "", match.group())
                if (
                    13 <= len(digits) <= 19
                    and plausible_pan(digits)
                    and luhn_ok(digits)
                ):
                    findings.append(
                        f"{path}:{lineno}: {len(digits)}-digit Luhn-valid number"
                    )

    if findings:
        print("::error::Possible cardholder PAN committed (CLAUDE.md rule 1).")
        for f in findings:
            print(f"  {f}")
        print("\nCard numbers are never stored, logged, or committed. For fixtures use a")
        print("Stripe token such as 'pm_card_visa' instead of a raw number.")
        return 1

    print(f"Scanned {len(tracked_files())} tracked files. No card-number candidates found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
