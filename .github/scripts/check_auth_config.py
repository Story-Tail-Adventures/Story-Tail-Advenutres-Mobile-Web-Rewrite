#!/usr/bin/env python3
"""
Guard the auth settings that other code silently depends on.

Some of supabase/config.toml is preference. These are not: turning one of them off does not
produce an error anywhere, it produces a security hole or a screen that quietly stops
working. Each check below names the thing that breaks.

Run: python3 .github/scripts/check_auth_config.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = ROOT / "supabase/config.toml"

# setting -> (required value, what breaks if it changes)
REQUIRED = {
    "enable_confirmations": (
        "true",
        "public.handle_user_email_confirmed() adopts a pre-created client record — with the "
        "traveler's name, phone and trips — on the NULL -> NOT NULL transition of "
        "email_confirmed_at. With confirmations off, GoTrue performs that transition itself "
        "milliseconds after signup, so the adoption happens for anyone who merely knows the "
        "address. See docs/Data-Model.md §5.1.1.",
    ),
    "minimum_password_length": (
        "12",
        "Screen Inventory 2.1.2 / 2.1.5 promise 12 characters, and web/lib/validation/auth.ts "
        "plus AuthValidation.kt both enforce it client-side. A lower server value means the "
        "two disagree about what is acceptable.",
    ),
    "password_requirements": (
        '"lower_upper_letters_digits"',
        "newPasswordSchema and the 2.1.2 strength meter check for a digit, an uppercase and a "
        "lowercase letter. A weaker server rule makes the meter a liar; a stronger one makes "
        "it reject passwords the meter called strong.",
    ),
    "enable_manual_linking": (
        "true",
        "Screen 2.1.8 Social Login / Account Linking calls supabase.auth.linkIdentity(), which "
        "is refused outright when this is off.",
    ),
    "double_confirm_changes": (
        "true",
        "Screen 2.1.3's change-email flow tells people we mailed BOTH addresses so nobody can "
        "move their account without them. With this off, that copy is untrue and the "
        "protection is gone.",
    ),
}


def read_setting(body: str, key: str) -> str | None:
    """First uncommented `key = value` in the file."""
    match = re.search(rf"^{re.escape(key)}\s*=\s*(\S+)", body, re.M)
    return match.group(1) if match else None


def main() -> int:
    body = CONFIG.read_text()
    failures = []

    for key, (expected, why) in REQUIRED.items():
        actual = read_setting(body, key)
        if actual is None:
            failures.append(f"{key} is not set in supabase/config.toml.\n    {why}")
        elif actual != expected:
            failures.append(
                f"{key} = {actual}, expected {expected}.\n    {why}"
            )

    if failures:
        print("supabase/config.toml has drifted from what the app assumes:\n", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}\n", file=sys.stderr)
        return 1

    print(f"Auth config OK — {len(REQUIRED)} load-bearing settings match what the app assumes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
