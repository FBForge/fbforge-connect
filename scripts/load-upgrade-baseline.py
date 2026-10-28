"""Load a successful signed build as an explicit Windows upgrade baseline."""

import os
from pathlib import Path
import tempfile

from candidate import REPOSITORY, api, application_binary, download_candidate, require


def main():
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "repository_mismatch")
    run_id = os.environ.get("UPGRADE_RUN", "")
    if not run_id and os.environ.get("UPGRADE_LATEST") == "true":
        # Select only the baseline here. download_candidate checks the exact run,
        # independent package validation, artifact digest and all signed files.
        runs = api(f"repos/{REPOSITORY}/actions/workflows/sign-windows.yml/runs?status=success&per_page=20")
        # Keep historical Develop releases usable after that branch is removed.
        candidates = [run for run in runs.get("workflow_runs", [])
                      if run.get("head_branch") in ("main", "develop")
                      and run.get("event") == "workflow_dispatch"
                      and run.get("status") == "completed"
                      and run.get("conclusion") == "success"]
        require(bool(candidates), "upgrade_baseline_missing")
        run_id = str(candidates[0]["id"])
    _, files, manifest = download_candidate(run_id)
    directory = Path(tempfile.mkdtemp(prefix="fbforge-upgrade-", dir=os.environ["RUNNER_TEMP"]))
    installer = directory / manifest["installer"]
    installer.write_bytes(files[manifest["installer"]])
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        output.write(f"FITCONNECT_PREVIOUS_INSTALLER={installer}\n")
        output.write(f"FITCONNECT_PREVIOUS_SIGNER={manifest['certificateThumbprint']}\n")
        output.write(f"FITCONNECT_PREVIOUS_BINARY={application_binary(manifest['version'])}\n")
    print("Verified signed upgrade baseline downloaded. Authenticode verification follows on Windows.")


if __name__ == "__main__":
    main()
