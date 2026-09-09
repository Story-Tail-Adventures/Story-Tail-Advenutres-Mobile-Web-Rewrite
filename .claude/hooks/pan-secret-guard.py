#!/usr/bin/env python3
"""
PreToolUse guard for CLAUDE.md rule 1: cardholder PANs never live anywhere but Stripe.

Rule 1 is the one rule where a mistake is a compliance incident rather than a bug, so it is
worth a mechanical block rather than a review catch. Also blocks live/test Stripe secret
keys, which must live in Supabase's secret store and nowhere else.

Why Luhn rather than "16 digits": bare digit-matching fires constantly on timestamps, UUID
fragments, and phone numbers. Luhn cuts the false-positive rate to near zero while still
catching every real card number, because real PANs are Luhn-valid by construction.

Exit codes: 0 = allow, 2 = deny (stderr is shown to Claude).
"""
import json
import os
import re
import sys

# Files that legitimately discuss card fields: the PCI skill's own grep patterns, the
# reviewer checklists, and the data-model docs describing what NOT to store.
EXEMPT_PREFIXES = (".claude/", "docs/", "design/")

PAN_CANDIDATE = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")

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


def strip_uuids(text: str) -> str:
    """Blank out UUIDs and Unsplash ids so their digit segments cannot form a false candidate."""
    text = UUID_RE.sub(lambda m: "#" * len(m.group()), text)
    return UNSPLASH_RE.sub(lambda m: "#" * len(m.group()), text)


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

STRIPE_SECRET = re.compile(r"\bsk_(?:live|test)_[A-Za-z0-9]{8,}")
CARD_FIELD = re.compile(
    r"\b(card_number|cardnumber|raw_pan|\bpan\b|card_cvv|\bcvv\b|\bcvc\b)\b",
    re.IGNORECASE,
)


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


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_input = payload.get("tool_input") or {}
    path = tool_input.get("file_path") or ""
    if not path:
        return 0

    cwd = payload.get("cwd") or os.getcwd()
    try:
        rel = os.path.relpath(path, cwd).replace(os.sep, "/")
    except ValueError:
        return 0
    if rel.startswith("..") or rel.startswith(EXEMPT_PREFIXES):
        return 0

    content = (tool_input.get("content") or "") + (tool_input.get("new_string") or "")
    if not content:
        return 0

    for match in PAN_CANDIDATE.finditer(strip_uuids(content)):
        digits = re.sub(r"[ -]", "", match.group())
        if (
                13 <= len(digits) <= 19
                and plausible_grouping(match.group())
                and plausible_pan(digits)
                and luhn_ok(digits)
            ):
            print(
                f"Possible cardholder PAN in {rel} (CLAUDE.md rule 1).\n"
                f"A {len(digits)}-digit Luhn-valid number was found. Card numbers are never "
                f"stored, logged, or committed — only Stripe PaymentMethod IDs plus brand, "
                f"last 4, and expiry.\n"
                f"If this is a Stripe test card in a fixture, use a token like "
                f"'pm_card_visa' instead of the raw number.",
                file=sys.stderr,
            )
            return 2

    if STRIPE_SECRET.search(content):
        print(
            f"Stripe secret key literal in {rel}.\n"
            "Secret keys belong in Supabase's secret store (`supabase secrets set`), never "
            "in the repo, CI config, or an .env file that could be committed.",
            file=sys.stderr,
        )
        return 2

    match = CARD_FIELD.search(content)
    if match and (rel.startswith("supabase/migrations/") or rel.endswith(".sql")):
        print(
            f"Card-data column name '{match.group()}' in {rel} (CLAUDE.md rule 1).\n"
            "The database stores Stripe PaymentMethod IDs and non-sensitive metadata only. "
            "See docs/Data-Model.md §18.",
            file=sys.stderr,
        )
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
