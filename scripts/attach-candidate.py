"""Attach an independently verified Windows candidate to an existing draft only.

Runs on a trusted, manually dispatched Actions runner. It never publishes a
release, creates a tag, executes the installer, or changes an existing asset.
"""

import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def gh(*arguments):
    result = subprocess.run(["gh", *arguments], capture_output=True, check=False)
    # Keep authentication details and temporary download URLs out of CI logs.
    require(result.returncode == 0, "github_operation_failed")
    return result.stdout


def api(path):
    return json.loads(gh("api", path))


def check_draft(release, commit, version):
    require(release["draft"] is True, "release_is_not_a_draft")
    require(release["prerelease"] is True, "release_is_not_a_prerelease")
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
    run = api(f"{base}/actions/runs/{run_id}")
    require(
        run["head_sha"] == commit and run["conclusion"] == "success",
        "unverified_source",
    )
    require(run["path"] == ".github/workflows/windows.yml", "wrong_workflow")
    require(
        run["event"] == "push" and run["head_branch"] in ("main", "develop"),
        "untrusted_run",
    )
    release = api(f"{base}/releases/{draft_id}")
    check_draft(release, commit, version)
    artifacts = api(f"{base}/actions/runs/{run_id}/artifacts")["artifacts"]
    candidates = [
        item for item in artifacts if item["name"] == "windows-alpha-unsigned-setup"
    ]
    require(
        len(candidates) == 1 and not candidates[0]["expired"],
        "candidate_artifact_missing",
    )
    artifact = candidates[0]
    require(artifact["size_in_bytes"] <= 160 * 1024 * 1024, "artifact_too_large")
    archive_bytes = gh("api", f"{base}/actions/artifacts/{artifact['id']}/zip")
    require(len(archive_bytes) == artifact["size_in_bytes"], "artifact_size_mismatch")
    require(
        "sha256:" + hashlib.sha256(archive_bytes).hexdigest() == artifact["digest"],
        "artifact_digest_mismatch",
    )
    installer_name = f"FBForge Connect_{version}_x64-setup.exe"
    names = {installer_name, "SHA256SUMS.txt", "build-info.json"}
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        require(
            set(archive.namelist()) == names and len(archive.namelist()) == 3,
            "unexpected_archive_files",
        )
        require(
            sum(item.file_size for item in archive.infolist()) <= 160 * 1024 * 1024,
            "candidate_too_large",
        )
        files = {name: archive.read(name) for name in names}
    manifest = json.loads(files["build-info.json"].decode("utf-8-sig"))
    expected = {
        "repository": repo,
        "version": version,
        "commit": commit,
        "platform": "windows-x64",
        "installer": installer_name,
        "sha256": checksum,
        "signing": "unsigned",
    }
    require(
        all(manifest.get(key) == value for key, value in expected.items()),
        "manifest_mismatch",
    )
    require(str(manifest["runId"]) == run_id, "manifest_run_mismatch")
    require(len(files[installer_name]) == manifest["bytes"], "installer_size_mismatch")
    require(files[installer_name][:2] == b"MZ", "installer_format_invalid")
    require(
        hashlib.sha256(files[installer_name]).hexdigest() == checksum,
        "installer_digest_mismatch",
    )
    require(
        files["SHA256SUMS.txt"].decode("utf-8-sig").strip()
        == checksum + "  " + installer_name,
        "checksum_file_mismatch",
    )
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
        "Verified installer, checksum and manifest attached. "
        "Release remains an unpublished draft."
    )


if __name__ == "__main__":
    main()
