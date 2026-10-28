"""Select checks from committed changes. A new branch or manual run checks all."""

import json
import os
import re
import subprocess


def components(paths):
    checks = {"frontend": False, "engine": False, "native": False}
    for path in paths:
        if path.startswith((".github/workflows/", "scripts/ci/")) or path in (
            "package.json", "package-lock.json", ".gitattributes", ".npmrc",
        ):
            return dict.fromkeys(checks, True)
        if path.startswith(("frontend/", "tests/", "licenses/", "docs/guide/")) or path.endswith(".config.js") or path in (
            ".prettierrc.json", ".prettierignore", ".editorconfig", "LICENSE", "THIRD_PARTY_NOTICES.md",
        ):
            checks["frontend"] = True
        if path.startswith("engine/"):
            checks["engine"] = checks["frontend"] = True
        if path.startswith("desktop/"):
            checks["native"] = checks["frontend"] = True
        if path.startswith("scripts/"):
            return dict.fromkeys(checks, True)
    return checks


def main():
    event = json.load(open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8"))
    base = event.get("pull_request", {}).get("base", {}).get("sha") or event.get("before")
    if base and base != "0" * 40:
        if not re.fullmatch(r"[a-f0-9]{40}", base):
            raise RuntimeError("invalid_base_commit")
        available = subprocess.run(
            ["git", "cat-file", "-e", base + "^{commit}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        ).returncode == 0
        if available:
            changed = subprocess.check_output(["git", "diff", "--name-only", "--no-renames", "-z", base, "HEAD"])
            selected = components(changed.decode("utf-8", errors="replace").split("\0"))
        else:
            # A rewritten history may no longer contain the previous push head.
            # Run every check instead of guessing which components changed.
            selected = dict.fromkeys(("frontend", "engine", "native"), True)
    else:
        selected = dict.fromkeys(("frontend", "engine", "native"), True)
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        for name, required in selected.items():
            output.write(f"{name}={str(required).lower()}\n")


if __name__ == "__main__":
    main()
