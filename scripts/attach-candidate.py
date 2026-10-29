"""Attach an independently verified Windows candidate to an existing draft only.

Runs on a trusted, manually dispatched Actions runner. It never publishes a
release, creates a tag, executes the installer, or changes an existing asset.
"""

import hashlib
import os
from pathlib import Path
import re
import tempfile
from importlib.util import module_from_spec, spec_from_file_location

from candidate import api, download_candidate, gh, require


def check_draft(release, commit, version):
    require(release["draft"] is True, "release_is_not_a_draft")
    require(release["prerelease"] is ("-" in version), "release_channel_mismatch")
    require(release["published_at"] is None, "release_is_published")
    require(release["target_commitish"] == commit, "draft_source_mismatch")
    require(release["tag_name"] == "v" + version, "draft_version_mismatch")


def main():
    repo = os.environ["GITHUB_REPOSITORY"]
    run_id, draft_id = os.environ["RC_RUN"], os.environ["RC_DRAFT"]
    commit, checksum, version = (
        os.environ["RC_COMMIT"],
        os.environ["RC_SHA256"],
        os.environ["RC_VERSION"],
    )
    require(repo == "FBForge/fbforge-connect", "repository_mismatch")
    require(bool(re.fullmatch(r"[1-9][0-9]*", run_id)), "invalid_run")
    require(bool(re.fullmatch(r"[1-9][0-9]*", draft_id)), "invalid_draft")
    require(bool(re.fullmatch(r"[a-f0-9]{40}", commit)), "invalid_commit")
    require(bool(re.fullmatch(r"[a-f0-9]{64}", checksum)), "invalid_checksum")
    require(
        bool(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version)),
        "invalid_version",
    )
    base = "repos/" + repo
    release = api(f"{base}/releases/{draft_id}")
    check_draft(release, commit, version)
    archive_bytes, files, _ = download_candidate(run_id, commit, checksum, version)
    # GitHub replaces spaces in release asset names with dots. Keep the original
    # ZIP as well, so its manifest and checksum filenames still match after extraction.
    files = {name.replace(" ", "."): content for name, content in files.items()}
    files[f"FBForge-Connect_{version}_windows-x64.zip"] = archive_bytes
    if tuple(map(int, version.split('-')[0].split('.'))) >= (0, 3, 0):
        spec = spec_from_file_location('scanner_candidate', Path(__file__).with_name('scanner-candidate.py'))
        scanner = module_from_spec(spec)
        spec.loader.exec_module(scanner)
        files.update(scanner.download_distribution(run_id, commit))
    with tempfile.TemporaryDirectory(prefix="fbforge-candidate-") as temporary:
        for name, content in files.items():
            # Recheck before every write; reject a published or retargeted draft.
            release = api(f"{base}/releases/{draft_id}")
            check_draft(release, commit, version)
            matches = [asset for asset in release["assets"] if asset["name"] == name]
            digest = "sha256:" + hashlib.sha256(content).hexdigest()
            if matches:
                require(
                    len(matches) == 1
                    and matches[0].get("digest") == digest
                    and matches[0]["size"] == len(content),
                    "existing_asset_mismatch",
                )
                continue
            path = Path(temporary) / name
            path.write_bytes(content)
            gh("release", "upload", release["tag_name"], str(path), "--repo", repo)
        release = api(f"{base}/releases/{draft_id}")
        check_draft(release, commit, version)
        for name, content in files.items():
            matches = [asset for asset in release["assets"] if asset["name"] == name]
            require(
                len(matches) == 1
                and matches[0].get("digest")
                == "sha256:" + hashlib.sha256(content).hexdigest()
                and matches[0]["size"] == len(content),
                "uploaded_asset_mismatch",
            )
    print(
        "Verified signed installer, signatures, checksums and original ZIP attached. "
        "Optional scanner source and license distribution included for 0.3+. Release remains an unpublished draft."
    )


if __name__ == "__main__":
    main()
