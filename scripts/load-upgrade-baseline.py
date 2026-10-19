"""Load a successful signed build as an explicit Windows upgrade baseline."""

import os
from pathlib import Path
import tempfile

from candidate import REPOSITORY, download_candidate, require


def main():
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY, "repository_mismatch")
    _, files, manifest = download_candidate(os.environ.get("UPGRADE_RUN", ""))
    directory = Path(tempfile.mkdtemp(prefix="fbforge-upgrade-", dir=os.environ["RUNNER_TEMP"]))
    installer = directory / manifest["installer"]
    installer.write_bytes(files[manifest["installer"]])
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        output.write(f"FITCONNECT_PREVIOUS_INSTALLER={installer}\n")
        output.write(f"FITCONNECT_PREVIOUS_SIGNER={manifest['certificateThumbprint']}\n")
    print("Verified signed upgrade baseline downloaded. Authenticode verification follows on Windows.")


if __name__ == "__main__":
    main()
