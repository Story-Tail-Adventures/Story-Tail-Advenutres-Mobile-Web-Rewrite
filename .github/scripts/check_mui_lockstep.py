#!/usr/bin/env python3
"""
The web app and the design prototype must run the same MUI.

design/source-prototype/ (the Claude Design project's local mirror) loads MUI from a
bundle built by design/mui-vendor/, a separate npm package that is NOT part of the root
workspace. web/ installs MUI through the root workspace. Nothing ties the two together:
Dependabot only watches the root, so a routine bump moves web/ and leaves the prototype
behind, and then "visually faithful to the prototype" (CLAUDE.md) compares two different
versions of every component.

This fails when any shared package differs, in the manifests or in what the lockfiles
actually resolved, and prints the command that brings the prototype up to date.

Exit 0 = in step, 1 = drift.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Packages both sides depend on. @mui/system is not a direct dependency on either side,
# but it is the one MUI resolves its theming through, so the lockfiles must agree on it too.
DIRECT = ["@mui/material", "@emotion/react", "@emotion/styled", "react", "react-dom"]
RESOLVED = DIRECT + ["@mui/system"]


def manifest(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text())
    return {**data.get("dependencies", {}), **data.get("devDependencies", {})}


def resolved(lock: Path) -> dict[str, str]:
    packages = json.loads(lock.read_text()).get("packages", {})
    return {
        name: packages[f"node_modules/{name}"]["version"]
        for name in RESOLVED
        if f"node_modules/{name}" in packages
    }


def main() -> int:
    web = manifest(ROOT / "web/package.json")
    vendor = manifest(ROOT / "design/mui-vendor/package.json")
    web_lock = resolved(ROOT / "package-lock.json")
    vendor_lock = resolved(ROOT / "design/mui-vendor/package-lock.json")

    problems = []
    for name in DIRECT:
        if name not in web or name not in vendor:
            problems.append(f"{name}: web/ has {web.get(name)!r}, design/mui-vendor/ has {vendor.get(name)!r}")
        elif web[name] != vendor[name]:
            problems.append(f"{name}: web/ pins {web[name]}, design/mui-vendor/ pins {vendor[name]}")
    for name in RESOLVED:
        if web_lock.get(name) != vendor_lock.get(name):
            problems.append(
                f"{name}: package-lock.json resolves {web_lock.get(name)}, "
                f"design/mui-vendor/package-lock.json resolves {vendor_lock.get(name)}"
            )

    if not problems:
        print("MUI lockstep OK: " + ", ".join(f"{n} {web_lock.get(n)}" for n in RESOLVED))
        return 0

    print("web/ and the design prototype are on different MUI / React versions:\n")
    for p in problems:
        print(f"  - {p}")
    pins = " ".join(f"{n}@{web[n]}" for n in DIRECT if n in web)
    print(
        "\nBring the prototype up to web/'s versions, rebuild its bundle, and commit both:\n\n"
        f"  cd design/mui-vendor && npm install -E {pins} && npm run build\n\n"
        "then push design/source-prototype/shared/vendor/ to the Claude Design project\n"
        "(docs/Tech-Recommendations.md §2.3.1). Chunk names are content hashes, so push the\n"
        "whole folder."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
