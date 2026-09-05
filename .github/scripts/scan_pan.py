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

# Unsplash photo ids ("photo-1500648767791-00dcc994a43e") carry a 13-digit timestamp
# followed by a hyphen and a hex hash that may start with digits — a separator-formatted
# 15-digit run that is Luhn-valid one time in ten. The public pages' placeholder photography
# (web/lib/images.ts) is built from them, so they get the same treatment as UUIDs.
UNSPLASH_RE = re.compile(r"\bphoto-\d{10,13}-[0-9a-f]{12}\b", re.I)


# A migration filename carries a fourteen-digit `YYYYMMDDHHMMSS` stamp
# (`20260902020243_auth_bridge.sql`), and one in ten is Luhn-valid by chance — one of this
# repo's nine already is. Citing a migration by full filename in a comment is the
# convention here (fifteen citations across supabase/, web/ and docs/), so without this the
# guard fires at random on correct code, and the workaround somebody reaches for is to stop
# citing the filename. A guard that punishes the house style gets designed around.
#
# WHY THIS CANNOT HIDE A REAL PAN, which is the only thing that would justify it:
# fourteen digits is Diners Club, whose IINs are 36, 38, 39 and 300-305 — every one leading
# with a 3. More generally the first digit is the Major Industry Identifier, and 2 is
# "airlines and future industry assignments"; the only payment schemes in the 2-series are
# Mastercard (2221-2720) and Mir (2200-2204), and both are SIXTEEN digits. No card number
# in issue is fourteen digits long and begins "20", so restricting the carve-out to a
# well-formed 21st-century datetime gives up no coverage at all.
#
# The lookarounds are load-bearing, and they test for DIGITS rather than using `\b`:
# the stamp is followed by an underscore in `20260902020243_auth_bridge.sql`, and `_` is a
# word character, so `\b` never matches there. What they must actually rule out is the
# stamp being recognised INSIDE a longer digit run — so a 15- or 16-digit PAN that happens
# to open with these digits is still scanned whole.
MIGRATION_TS_RE = re.compile(r"(?<!\d)20\d{12}(?!\d)")


def is_migration_timestamp(digits: str) -> bool:
    """True for a well-formed YYYYMMDDHHMMSS in 2000-2099 — see MIGRATION_TS_RE."""
    if len(digits) != 14 or not digits.startswith("20"):
        return False
    month, day = int(digits[4:6]), int(digits[6:8])
    hour, minute, second = int(digits[8:10]), int(digits[10:12]), int(digits[12:14])
    return (
        1 <= month <= 12
        and 1 <= day <= 31
        and hour <= 23
        and minute <= 59
        and second <= 59
    )


def strip_uuids(text: str) -> str:
    """Blank out UUIDs, Unsplash ids and migration stamps so they cannot form a candidate."""
    text = UUID_RE.sub(lambda m: "#" * len(m.group()), text)
    text = UNSPLASH_RE.sub(lambda m: "#" * len(m.group()), text)
    return MIGRATION_TS_RE.sub(
        lambda m: "#" * len(m.group()) if is_migration_timestamp(m.group()) else m.group(),
        text,
    )


def plausible_grouping(candidate: str) -> bool:
    """
    A formatted card number is written in groups of at least four digits (4-4-4-4,
    Amex 4-6-5) or as one solid run. SVG path data ("M3 18s2 2 5 2 5-2 5-2 2 2 5 2")
    and similar numeric sequences match the candidate regex as long strings of one- and
    two-digit groups, and one in ten of those is Luhn-valid by chance. Rejecting any
    separator-delimited group shorter than four digits removes that class without
    touching any real PAN format.
    """
    return all(len(group) >= 4 for group in re.split(r"[ -]", candidate))


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


# ── Self-test ──────────────────────────────────────────────────────────────────
#
# Every carve-out above widens the hole this guard is supposed to close, and a carve-out
# with no test is a hole with a comment on it. `--self-test` asserts both directions: the
# things that must still be caught, and the things that must not fire. CI runs it before
# the scan, so a future exclusion cannot quietly stop the guard catching 4242…
SELF_TEST_CAUGHT = [
    ("4242424242424242", "the Stripe test Visa"),
    ("4111111111111111", "the other ubiquitous test Visa"),
    ("5555555555554444", "test Mastercard"),
    ("4242 4242 4242 4242", "spaced groups of four"),
    ("4242-4242-4242-4242", "hyphenated groups of four"),
    ("30569309025904", "a real 14-digit Diners Club — the length the stamp carve-out uses"),
    ("38520000023237", "Diners Club opening 38, likewise 14 digits"),
    ("x4242424242424242x", "embedded in surrounding text"),
    # The carve-out must not extend to a longer run that merely opens with a stamp.
    # The trailing digit is chosen so the whole 15 is Luhn-valid — the first attempt at
    # this case appended a 0, which is not, so it proved nothing and the self-test said so.
    ("202609020202432", "15 digits opening with a valid stamp is NOT carved out"),
]

SELF_TEST_IGNORED = [
    ("20260902020243_auth_bridge.sql", "a Luhn-valid migration stamp, cited by filename"),
    ("see 20260902020243", "the same stamp bare"),
    ("(20260902020243)", "the same stamp parenthesised"),
    ("20269902020243", "14 digits that are NOT a valid datetime stay in scope … "),
    ("0195a2c0-1a00-7000-8000-000000000011", "a UUID"),
    ("photo-1500648767791-00dcc994a43e", "an Unsplash id"),
    ("0000000000000000", "an all-zero placeholder"),
    ("M3 18s2 2 5 2 5-2 5-2 2 2 5 2", "SVG path data"),
]


def scan_line(line: str) -> bool:
    """True if this line would be reported. The exact predicate main() applies."""
    for match in CANDIDATE.finditer(strip_uuids(line)):
        digits = re.sub(r"[ -]", "", match.group())
        if (
            13 <= len(digits) <= 19
            and plausible_grouping(match.group())
            and plausible_pan(digits)
            and luhn_ok(digits)
        ):
            return True
    return False


def self_test() -> int:
    failures = []
    for text, why in SELF_TEST_CAUGHT:
        if not scan_line(text):
            failures.append(f"MISSED  {why}: {text!r} should be reported and was not")
    for text, why in SELF_TEST_IGNORED:
        # "20269902020243" is a deliberate near-miss: month 99 is not a datetime, so it is
        # NOT carved out — it only stays quiet because it is not Luhn-valid. Assert that
        # reasoning rather than the outcome, or the case silently stops testing anything.
        if text == "20269902020243":
            assert not is_migration_timestamp(text), "month 99 must not read as a stamp"
        if scan_line(text):
            failures.append(f"FALSE+  {why}: {text!r} was reported and should not be")

    if failures:
        print("::error::scan_pan self-test failed — the guard does not do what it claims.")
        for f in failures:
            print(f"  {f}")
        return 1
    print(
        f"scan_pan self-test OK — {len(SELF_TEST_CAUGHT)} caught, "
        f"{len(SELF_TEST_IGNORED)} correctly ignored."
    )
    return 0


def tracked_files() -> list[pathlib.Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout
    return [pathlib.Path(p) for p in out.split("\0") if p]


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()

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
                    and plausible_grouping(match.group())
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
