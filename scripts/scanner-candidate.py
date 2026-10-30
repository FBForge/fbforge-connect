"""Retain optional ClamAV binary, dated databases, licenses and corresponding source together.

Only a successful signing run for the exact application source may provide this
artifact. The app independently checks pinned engine hashes and CVD signatures.
"""
import hashlib
import io
import json
from pathlib import Path
import zipfile

from candidate import api, gh, require, REPOSITORY, verified_run

LIMIT = 512 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]


def read_distribution(content, spec, key):
    require(len(content) <= LIMIT, 'scanner_artifact_too_large')
    component = f"FBForge-Connect-ClamAV-{spec['version']}-windows-x64.zip"
    source = f"clamav-{spec['version']}.tar.gz"
    licenses = {'third-party-licenses/' + item['path'].split('/')[-1]
                for item in spec['files']
                if item['path'] == 'COPYING.txt' or item['path'].startswith('COPYING/')}
    names = licenses | {component, source, source + '.sig', 'SOURCE-NOTICE.txt',
                        'component-manifest.json', 'talos-public-key.asc'}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        files = [item for item in archive.infolist() if not item.is_dir()]
        require({item.filename for item in files} == names and len(files) == len(names),
                'scanner_artifact_files_invalid')
        require(sum(item.file_size for item in files) <= LIMIT, 'scanner_artifact_too_large')
        require(archive.getinfo('component-manifest.json').file_size <= 16384,
                'scanner_manifest_too_large')
        require(json.loads(archive.read('component-manifest.json')) == spec,
                'scanner_manifest_mismatch')
        require(archive.getinfo('talos-public-key.asc').file_size <= 16384
                and archive.read('talos-public-key.asc') == key, 'scanner_signer_mismatch')
        require(archive.getinfo(source).file_size == spec['source']['bytes'],
                'scanner_source_size_mismatch')
        require(hashlib.sha256(archive.read(source)).hexdigest() == spec['source']['sha256'],
                'scanner_source_hash_mismatch')
        # Each license must match a file from the pinned, unmodified upstream engine.
        for item in spec['files']:
            if item['path'] == 'COPYING.txt' or item['path'].startswith('COPYING/'):
                name = 'third-party-licenses/' + item['path'].split('/')[-1]
                require(archive.getinfo(name).file_size == item['bytes']
                        and hashlib.sha256(archive.read(name)).hexdigest() == item['sha256'],
                        'scanner_license_mismatch')
        require(archive.getinfo(component).file_size <= LIMIT, 'scanner_package_too_large')
        with zipfile.ZipFile(io.BytesIO(archive.read(component))) as package:
            entries = package.infolist()
            require(len(entries) <= 100 and sum(x.file_size for x in entries) <= LIMIT,
                    'scanner_package_too_large')
            actual = [x.filename for x in entries]
            require(len(actual) == len(set(actual)) and all(
                '\\' not in name and not name.startswith('/') and '..' not in name.split('/')
                for name in actual), 'scanner_package_paths_invalid')
            engine = {'engine/' + item['path'] for item in spec['files']}
            require({name for name in actual if name.startswith('engine/')} == engine,
                    'scanner_engine_files_mismatch')
            for item in spec['files']:
                name = 'engine/' + item['path']
                require(package.getinfo(name).file_size == item['bytes']
                        and hashlib.sha256(package.read(name)).hexdigest() == item['sha256'],
                        'scanner_engine_hash_mismatch')
            databases = [name for name in actual if name not in engine]
            require(len(databases) == 6, 'scanner_database_files_mismatch')
            for stem in ('main', 'daily', 'bytecode'):
                name = 'database/' + stem + '.cvd'
                require(name in databases and 512 <= package.getinfo(name).file_size <= LIMIT,
                        'scanner_database_missing')
                with package.open(name) as stream:
                    header = stream.read(512).decode('ascii').split(':')
                require(header[0] == 'ClamAV-VDB' and header[2].isdigit(),
                        'scanner_database_invalid')
                signature = f'database/{stem}-{header[2]}.cvd.sign'
                require(signature in databases and package.getinfo(signature).file_size <= 65536,
                        'scanner_database_signature_missing')
    return component


def download_distribution(run_id, commit):
    base = f'repos/{REPOSITORY}'
    run = api(f'{base}/actions/runs/{run_id}')
    verified_run(run, commit, '.github/workflows/sign-windows.yml')
    listing = api(f'{base}/actions/runs/{run_id}/artifacts?per_page=100')
    require(listing.get('total_count', 0) <= 100, 'artifact_limit')
    matches = [item for item in listing['artifacts'] if item['name'] == 'windows-scanner-component']
    require(len(matches) == 1 and not matches[0]['expired'], 'scanner_artifact_missing')
    artifact = matches[0]
    require(artifact['size_in_bytes'] <= LIMIT, 'scanner_artifact_too_large')
    content = gh('api', f"{base}/actions/artifacts/{artifact['id']}/zip")
    require(len(content) == artifact['size_in_bytes'] and artifact['digest'] ==
            'sha256:' + hashlib.sha256(content).hexdigest(), 'scanner_artifact_digest_mismatch')
    spec = json.loads((ROOT / 'desktop/scanner-component.json').read_text())
    key = (ROOT / 'scripts/scanner/talos-public-key.asc').read_bytes()
    read_distribution(content, spec, key)
    return {f"FBForge-Connect-ClamAV-{spec['version']}-windows-x64-distribution.zip": content}
