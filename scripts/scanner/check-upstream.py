"""Read-only reminder: a new official ClamAV release requires a reviewed app change."""
import json
from pathlib import Path
import re
import subprocess


def check(pinned, release):
    tag = release.get('tag_name', '')
    if (release.get('draft') or release.get('prerelease')
            or not re.fullmatch(r'clamav-[0-9]+[.][0-9]+[.][0-9]+', tag)):
        raise RuntimeError('scanner_upstream_response_invalid')
    latest = tag.removeprefix('clamav-')
    if tuple(map(int, latest.split('.'))) > tuple(map(int, pinned.split('.'))):
        raise RuntimeError(f'ClamAV {latest} is available; review signatures, source, hashes and acceptance before updating {pinned}')


if __name__ == '__main__':
    manifest = json.loads((Path(__file__).resolve().parents[2] / 'desktop/scanner-component.json').read_text())
    response = subprocess.run(['gh', 'api', 'repos/Cisco-Talos/clamav/releases/latest'],
                              capture_output=True, text=True, check=True)
    check(manifest['version'], json.loads(response.stdout))
    print('Pinned ClamAV version is current. No component was downloaded or published.')
