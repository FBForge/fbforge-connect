"""Choose small, explicit checks; installer validation remains a separate workflow."""

import json
import os
from pathlib import Path
import re
import subprocess

NAMES = ('frontend', 'engine', 'native')


def documentation(path):
    return path.endswith('.md') or path.startswith(('docs/', '.github/ISSUE_TEMPLATE/')) or path == 'LICENSE'


def components(paths):
    checks = dict.fromkeys(NAMES, False)
    for path in paths:
        if documentation(path):
            continue
        if path.startswith(('.github/workflows/', 'scripts/ci/')) or path in (
            'package.json', 'package-lock.json', '.gitattributes', '.npmrc',
        ):
            return dict.fromkeys(NAMES, True)
        if path.startswith(('frontend/', 'tests/', 'licenses/')) or path.endswith('.config.js') or path in (
            '.prettierrc.json', '.prettierignore', '.editorconfig',
        ):
            checks['frontend'] = True
        if path.startswith('engine/'):
            checks['engine'] = checks['frontend'] = True
        if path.startswith('desktop/'):
            checks['native'] = checks['frontend'] = True
        if path.startswith('scripts/'):
            return dict.fromkeys(NAMES, True)
    return checks


def exists(commit):
    return subprocess.run(['git', 'cat-file', '-e', commit + '^{commit}'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def changed_paths(event):
    base = event.get('pull_request', {}).get('base', {}).get('sha') or event.get('before')
    if base and base != '0' * 40:
        if not re.fullmatch(r'[a-f0-9]{40}', base):
            raise RuntimeError('invalid_base_commit')
        if not exists(base):
            # Amended commits are absent from a fresh clone. Fetch the exact old object
            # instead of turning every documentation amend into a full rebuild.
            subprocess.run(['git', 'fetch', '--no-tags', '--depth=1', 'origin', base],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if not exists(base):
            return None
    else:
        # A new branch is compared with main, including its earlier feature commits.
        result = subprocess.run(['git', 'merge-base', 'origin/main', 'HEAD'],
                                capture_output=True, text=True, check=False)
        if result.returncode:
            return None
        base = result.stdout.strip()
        if not re.fullmatch(r'[a-f0-9]{40}', base):
            return None
        if base == subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip():
            return None
    changed = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', '-z', base, 'HEAD'])
    return [path for path in changed.decode('utf-8', errors='replace').split('\0') if path]


def plan(event, event_name, ref, paths, repository):
    message = event.get('head_commit', {}).get('message', '')
    if event_name == 'pull_request':
        pr = event.get('pull_request', {})
        message = str(pr.get('title', '')) + '\n' + str(pr.get('body') or '')
    message = message.lower()
    release = (event_name == 'push' and repository == 'FBForge/fbforge-connect'
               and bool(re.fullmatch(r'refs/heads/(main|(?:release|fix)/.+)', ref))
               and '[release-check]' in message)
    requested_full = ('[ci full]' in message or '[release-check]' in message)
    manual_full = event_name == 'workflow_dispatch' and str(event.get('inputs', {}).get('full', 'true')).lower() == 'true'
    full = requested_full or manual_full
    mode = 'affected'
    if full:
        selected = dict.fromkeys(NAMES, True)
        mode = 'full'
    else:
        selected = components(paths) if paths is not None else dict.fromkeys(NAMES, True)
        if paths is not None and not any(selected.values()):
            mode = 'documentation-only'
    guide = paths is not None and any(path.startswith('docs/guide/') for path in paths)
    return {**selected, 'documentation': guide and not selected['frontend'], 'release': release, 'mode': mode}


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    selected = plan(event, os.environ.get('GITHUB_EVENT_NAME', ''), os.environ.get('GITHUB_REF', ''),
                    changed_paths(event), os.environ.get('GITHUB_REPOSITORY', ''))
    with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
        for name, value in selected.items():
            output.write(f'{name}={str(value).lower() if isinstance(value, bool) else value}\n')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as output:
            output.write('### CI-Auswahl\n\n')
            output.write(f"Modus: `{selected['mode']}`.\n\n")
            for name in (*NAMES, 'documentation', 'release'):
                output.write(f"- {name}: {'angefordert' if selected[name] else 'nicht angefordert'}\n")
            output.write('\nOhne angeforderte Tests bestätigt dieser Status nur die CI-Auswahl, keine vollständige Funktionsabnahme.\n')


if __name__ == '__main__':
    main()
