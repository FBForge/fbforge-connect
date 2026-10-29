"""Read signed Actions artifacts without executing or extracting untrusted paths."""

import hashlib
import io
import json
import re
import subprocess
import zipfile
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_spec = spec_from_file_location('update_release', Path(__file__).with_name('update-release.py'))
_updater = module_from_spec(_spec)
_spec.loader.exec_module(_updater)

REPOSITORY = "FBForge/fbforge-connect"
LIMIT = 160 * 1024 * 1024


def application_binary(version):
    # Signed 0.1 packages are immutable upgrade baselines. New packages must use
    # the new filename, rather than accepting either name in a signature report.
    return "fit-connect-integration-client.exe" if version.startswith("0.1.") else "fbforge-connect.exe"


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def gh(*arguments):
    result = subprocess.run(["gh", *arguments], capture_output=True, check=False)
    if result.returncode != 0:
        status = re.search(rb"\bHTTP ([1-5][0-9]{2})\b", result.stderr)
        suffix = "_http_" + status[1].decode("ascii") if status else ""
        raise RuntimeError("github_operation_failed" + suffix)
    return result.stdout


def api(path):
    return json.loads(gh("api", path))


def verified_run(run, commit, workflow, events=("workflow_dispatch",)):
    require(
        run.get("head_sha") == commit
        and run.get("status") == "completed"
        and run.get("conclusion") == "success",
        "unverified_source",
    )
    require(run.get("path") == workflow, "wrong_workflow")
    require(
        run.get("head_repository", {}).get("full_name") == REPOSITORY
        and run.get("event") in events
        # Historical signed Develop artifacts remain valid upgrade baselines.
        and run.get("head_branch") in ("main", "develop"),
        "untrusted_run",
    )


def read_candidate(archive_bytes, commit, checksum, version, run_id):
    require(bool(re.fullmatch(r"[a-f0-9]{40}", commit)), "invalid_commit")
    require(bool(re.fullmatch(r"[a-f0-9]{64}", checksum)), "invalid_checksum")
    require(bool(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version)), "invalid_version")
    require(len(archive_bytes) <= LIMIT, "artifact_too_large")
    installer = f"FBForge Connect_{version}_x64-setup.exe"
    names = {installer, "SHA256SUMS.txt", "build-info.json", "signature-info.json"}
    with_updates = tuple(map(int, version.split('-')[0].split('.'))) >= (0, 3, 0)
    if with_updates:
        names |= {installer + '.sig', 'latest.json'}
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        require(set(archive.namelist()) == names and len(archive.namelist()) == len(names), "unexpected_archive_files")
        require(sum(item.file_size for item in archive.infolist()) <= LIMIT, "candidate_too_large")
        files = {name: archive.read(name) for name in names}
    manifest = json.loads(files["build-info.json"].decode("utf-8-sig"))
    expected = {
        "repository": REPOSITORY, "version": version, "commit": commit,
        "platform": "windows-x64", "installer": installer, "sha256": checksum,
        "signing": "authenticode",
    }
    require(all(manifest.get(key) == value for key, value in expected.items()), "manifest_mismatch")
    require(str(manifest.get("runId")) == run_id, "manifest_run_mismatch")
    require(bool(re.fullmatch(r"[1-9][0-9]{0,18}", str(manifest.get("validationRunId", "")))), "invalid_validation_run")
    thumbprint = manifest.get("certificateThumbprint", "")
    require(bool(re.fullmatch(r"[a-fA-F0-9]{40}", thumbprint)), "invalid_certificate")
    require(len(files[installer]) == manifest.get("bytes"), "installer_size_mismatch")
    require(files[installer][:2] == b"MZ", "installer_format_invalid")
    require(hashlib.sha256(files[installer]).hexdigest() == checksum, "installer_digest_mismatch")
    require(files["SHA256SUMS.txt"].decode("utf-8-sig").strip() == checksum + "  " + installer, "checksum_file_mismatch")
    signatures = json.loads(files["signature-info.json"].decode("utf-8-sig"))
    signed_files = {installer, application_binary(version), "uninstall.exe"}
    require(isinstance(signatures, list) and len(signatures) == 3, "signature_report_incomplete")
    require({entry.get("file") for entry in signatures} == signed_files, "signature_files_mismatch")
    for entry in signatures:
        require(entry.get("verified") is True, "signature_not_verified")
        require(entry.get("certificateThumbprint", "").lower() == thumbprint.lower(), "signature_signer_mismatch")
        require(bool(re.fullmatch(r"[a-fA-F0-9]{40}", entry.get("timestampCertificateThumbprint", ""))), "signature_timestamp_missing")
        require(bool(re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", ""))), "signature_digest_invalid")
        if entry["file"] == installer:
            require(entry["sha256"] == checksum, "signature_installer_mismatch")
    if with_updates:
        try:
            _updater.validate(files, manifest)
        except (ValueError, KeyError, TypeError, UnicodeDecodeError):
            raise RuntimeError('update_manifest_mismatch') from None
    return files, manifest


def download_candidate(run_id, commit=None, checksum=None, version=None):
    require(bool(re.fullmatch(r"[1-9][0-9]{0,18}", run_id)), "invalid_run")
    base = f"repos/{REPOSITORY}"
    run = api(f"{base}/actions/runs/{run_id}")
    commit = commit or run.get("head_sha", "")
    verified_run(run, commit, ".github/workflows/sign-windows.yml")
    jobs = api(f"{base}/actions/runs/{run_id}/jobs?filter=latest&per_page=100")
    require(jobs.get("total_count", 0) <= 100, "job_limit")
    checks = [job for job in jobs["jobs"] if job.get("name") == "verify-package"]
    require(len(checks) == 1 and checks[0].get("conclusion") == "success", "package_verification_missing")
    artifacts = api(f"{base}/actions/runs/{run_id}/artifacts?per_page=100")
    require(artifacts.get("total_count", 0) <= 100, "artifact_limit")
    candidates = [item for item in artifacts["artifacts"] if item["name"] == "windows-alpha-signed-setup"]
    require(len(candidates) == 1 and not candidates[0]["expired"], "candidate_artifact_missing")
    artifact = candidates[0]
    require(artifact["size_in_bytes"] <= LIMIT, "artifact_too_large")
    archive_bytes = gh("api", f"{base}/actions/artifacts/{artifact['id']}/zip")
    require(len(archive_bytes) == artifact["size_in_bytes"], "artifact_size_mismatch")
    require("sha256:" + hashlib.sha256(archive_bytes).hexdigest() == artifact["digest"], "artifact_digest_mismatch")
    # Read bounded metadata to discover the baseline version. The full manifest
    # and every archive entry are validated below before any file is written.
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        info = archive.getinfo("build-info.json")
        require(info.file_size <= 16384, "manifest_too_large")
        manifest = json.loads(archive.read(info).decode("utf-8-sig"))
    files, manifest = read_candidate(archive_bytes, commit, checksum or manifest.get("sha256", ""), version or manifest.get("version", ""), run_id)
    validation = api(f"{base}/actions/runs/{manifest['validationRunId']}")
    verified_run(validation, commit, ".github/workflows/windows.yml", ("push", "workflow_dispatch"))
    return archive_bytes, files, manifest
