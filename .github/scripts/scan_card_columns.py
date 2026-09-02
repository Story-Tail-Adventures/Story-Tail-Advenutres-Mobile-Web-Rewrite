#!/usr/bin/env python3
"""
Fail CI if a migration defines a cardholder-data column. CLAUDE.md rule 1.

The naive version of this — `grep -i 'cvv' supabase/migrations/` — fires on the initial
migration's own documentation:

    COMMENT ON TABLE payment_card IS 'Tokenized cards only. NEVER store PAN, CVV, ...'

That comment states the rule; it does not break it. A guard that fails on the text
describing the policy is a guard people delete, so SQL comments and string literals are
stripped before the scan. What is left is executable SQL, where these identifiers can
only be column or table names.
"""
import pathlib
import re
import subprocess
import sys

FORBIDDEN = re.compile(
    r"\b(card_number|cardnumber|card_no|raw_pan|pan_encrypted|"
    r"card_cvv|cvv|cvc|card_security_code|full_pan|track_data)\b",
    re.IGNORECASE,
)

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT = re.compile(r"--[^\n]*")
# Single-quoted SQL string, honouring '' as an escaped quote.
SQL_STRING = re.compile(r"'(?:[^']|'')*'", re.DOTALL)
DOLLAR_QUOTED = re.compile(r"\$\$.*?\$\$", re.DOTALL)


def strip_non_code(sql: str) -> str:
    """Blank comments and literals, preserving line numbering."""
    def blank(m: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", m.group())

    sql = BLOCK_COMMENT.sub(blank, sql)
    sql = DOLLAR_QUOTED.sub(blank, sql)
    sql = SQL_STRING.sub(blank, sql)
    sql = LINE_COMMENT.sub(blank, sql)
    return sql


def migration_files() -> list[pathlib.Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z", "supabase/migrations"],
        capture_output=True, text=True, check=True,
    ).stdout
    return [pathlib.Path(p) for p in out.split("\0") if p.endswith(".sql")]


def main() -> int:
    findings: list[str] = []
    files = migration_files()

    for path in files:
        code = strip_non_code(path.read_text(encoding="utf-8"))
        for lineno, line in enumerate(code.splitlines(), 1):
            for m in FORBIDDEN.finditer(line):
                findings.append(f"{path}:{lineno}: '{m.group()}'")

    if findings:
        print("::error::Cardholder-data column in a migration (CLAUDE.md rule 1).")
        for f in findings:
            print(f"  {f}")
        print("\nThe database stores Stripe PaymentMethod IDs plus brand, last 4 and")
        print("expiry — nothing else. See docs/Data-Model.md §18.")
        return 1

    print(f"Scanned {len(files)} migration(s). No cardholder-data columns.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
