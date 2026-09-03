#!/usr/bin/env python3
"""
Enforce that the user-facing strings duplicated across web and mobile stay identical.

`web/` and `mobile/` deliberately hold parallel implementations of the same validation
rules and error taxonomy — CLAUDE.md makes the stack directories a hard boundary, and the
KMP shared module does not run on the web. That duplication is the right call, but nothing
stops the two copies drifting apart, and drift means a traveler sees one wording on their
phone and another in the browser.

The unit tests on each side cover behaviour. This covers wording.

Run: python3 .github/scripts/check_copy_parity.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

VALIDATION_DIR = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/domain/validation"
WEB_ERRORS = ROOT / "web/lib/auth-errors.ts"
KMP_ERRORS = ROOT / "mobile/shared/src/commonMain/kotlin/com/storytail/adventures/api/AuthError.kt"

# Each entry is one pair of parallel modules. The key map is the whole point: this script
# only compares what it is told about, so a message added on one side and left out of the
# map is a SILENT gap, not a failure. Add the row when you add the string.
MESSAGE_TABLES = [
    {
        "label": "auth validation",
        "web_file": ROOT / "web/lib/validation/auth.ts",
        "web_const": "AUTH_MESSAGES",
        "kmp_file": VALIDATION_DIR / "AuthValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "emailRequired": "EMAIL_REQUIRED",
            "emailInvalid": "EMAIL_INVALID",
            "passwordRequired": "PASSWORD_REQUIRED",
            "passwordTooShort": "PASSWORD_TOO_SHORT",
            "passwordNeedsDigit": "PASSWORD_NEEDS_DIGIT",
            "passwordNeedsUppercase": "PASSWORD_NEEDS_UPPERCASE",
            "passwordNeedsLowercase": "PASSWORD_NEEDS_LOWERCASE",
        },
    },
    {
        "label": "registration",
        "web_file": ROOT / "web/lib/validation/registration.ts",
        "web_const": "REGISTRATION_MESSAGES",
        "kmp_file": VALIDATION_DIR / "RegistrationValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "nameRequired": "NAME_REQUIRED",
            "nameTooLong": "NAME_TOO_LONG",
            "nameInvalid": "NAME_INVALID",
            "termsRequired": "TERMS_REQUIRED",
            "confirmRequired": "CONFIRM_REQUIRED",
            "confirmMismatch": "CONFIRM_MISMATCH",
        },
    },
    {
        "label": "mfa",
        "web_file": ROOT / "web/lib/validation/mfa.ts",
        "web_const": "MFA_MESSAGES",
        "kmp_file": VALIDATION_DIR / "MfaValidation.kt",
        "kmp_object": "Messages",
        "keys": {
            "codeRequired": "CODE_REQUIRED",
            "codeShape": "CODE_SHAPE",
        },
    },
    {
        "label": "password rule labels",
        "web_file": ROOT / "web/lib/validation/password-strength.ts",
        "web_const": "PASSWORD_RULE_LABELS",
        "kmp_file": VALIDATION_DIR / "PasswordStrength.kt",
        "kmp_object": "Labels",
        "keys": {
            "length": "LENGTH",
            "uppercase": "UPPERCASE",
            "lowercase": "LOWERCASE",
            "digit": "DIGIT",
        },
    },
    {
        "label": "password strength",
        "web_file": ROOT / "web/lib/validation/password-strength.ts",
        "web_const": "STRENGTH_MESSAGES",
        "kmp_file": VALIDATION_DIR / "PasswordStrength.kt",
        "kmp_object": "Messages",
        "keys": {
            "strong": "STRONG",
            "stillNeedsPrefix": "STILL_NEEDS_PREFIX",
        },
    },
]

# web BY_KIND key -> kotlin data object
ERROR_KINDS = {
    "invalid_credentials": "InvalidCredentials",
    "email_not_confirmed": "EmailNotConfirmed",
    "rate_limited": "RateLimited",
    "account_locked": "AccountLocked",
    "network": "Network",
    "not_configured": "NotConfigured",
    "weak_password": "WeakPassword",
    "session_expired": "SessionExpired",
    "unknown": "Unknown",
}

# A string literal on a single line — never spanning newlines.
STRING = r'"((?:[^"\\\n]|\\.)*)"'


def unescape(s: str) -> str:
    return s.replace('\\"', '"').replace("\\\\", "\\")


def web_messages(path: pathlib.Path, const_name: str) -> dict[str, str]:
    """`export const NAME = { key: "value", ... } as const;`"""
    body = re.search(rf"{re.escape(const_name)} = \{{(.*?)\n\}} as const;", path.read_text(), re.S)
    if not body:
        return {}
    return {k: unescape(v) for k, v in re.findall(rf"(\w+):\s*{STRING}", body.group(1))}


def kmp_messages(path: pathlib.Path, object_name: str) -> dict[str, str]:
    """`object NAME { const val KEY = "value" ... }`, at any indentation."""
    body = re.search(rf"object {re.escape(object_name)} \{{(.*?)\n    \}}", path.read_text(), re.S)
    if not body:
        return {}
    return {k: unescape(v) for k, v in re.findall(rf"const val (\w+) = {STRING}", body.group(1))}


def web_errors() -> dict[str, str]:
    """Each BY_KIND entry's `message`, which may be a multi-line string concatenation."""
    text = WEB_ERRORS.read_text()
    body = re.search(r"const BY_KIND[^=]*= \{(.*?)\n\};", text, re.S).group(1)
    out: dict[str, str] = {}
    for kind in ERROR_KINDS:
        entry = re.search(rf"\n  {kind}: \{{(.*?)\n  \}},", body, re.S)
        if not entry:
            continue
        # `,\n` alone misses entries where `message` is the last field — the captured
        # block ends right after the comma with no newline.
        msg = re.search(r"message:\s*(.*?),\s*(?:\n|$)", entry.group(1), re.S)
        if msg:
            out[kind] = "".join(unescape(p) for p in re.findall(STRING, msg.group(1)))
    return out


def kmp_errors() -> dict[str, str]:
    text = KMP_ERRORS.read_text()
    out: dict[str, str] = {}
    for kind, obj in ERROR_KINDS.items():
        entry = re.search(
            rf"data object {obj} : AuthError \{{(.*?)\n    \}}", text, re.S
        )
        if not entry:
            continue
        msg = re.search(r"override val message\s*=\s*(.*?)(?:\n\s*override|\n\s*\}|$)", entry.group(1), re.S)
        if msg:
            out[kind] = "".join(unescape(p) for p in re.findall(STRING, msg.group(1)))
    return out


def compare(label: str, pairs: list[tuple[str, str | None, str | None]]) -> list[str]:
    problems = []
    for name, web, kmp in pairs:
        if web is None:
            problems.append(f"{label}: '{name}' missing on web")
        elif kmp is None:
            problems.append(f"{label}: '{name}' missing on mobile")
        elif web != kmp:
            problems.append(
                f"{label}: '{name}' differs\n    web:    {web!r}\n    mobile: {kmp!r}"
            )
    return problems


def main() -> int:
    problems: list[str] = []
    checked = 0

    for table in MESSAGE_TABLES:
        web = web_messages(table["web_file"], table["web_const"])
        kmp = kmp_messages(table["kmp_file"], table["kmp_object"])
        if not web:
            problems.append(
                f"{table['label']}: could not read {table['web_const']} from "
                f"{table['web_file'].relative_to(ROOT)} — did it get renamed?"
            )
        if not kmp:
            problems.append(
                f"{table['label']}: could not read object {table['kmp_object']} from "
                f"{table['kmp_file'].relative_to(ROOT)} — did it get renamed?"
            )
        problems += compare(
            table["label"],
            [(w, web.get(w), kmp.get(k)) for w, k in table["keys"].items()],
        )
        checked += len(table["keys"])

    we, ke = web_errors(), kmp_errors()
    problems += compare(
        "auth error",
        [(kind, we.get(kind), ke.get(kind)) for kind in ERROR_KINDS],
    )

    if problems:
        print("::error::User-facing copy has drifted between web and mobile.")
        for p in problems:
            print(f"  {p}")
        print(
            "\nThese strings are intentionally duplicated (see the header comments in "
            "each file).\nChange them together, or the same person sees different wording "
            "on phone and web."
        )
        return 1

    print(
        f"Copy parity OK — {checked} messages across {len(MESSAGE_TABLES)} modules and "
        f"{len(ERROR_KINDS)} auth errors match between web and mobile."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
