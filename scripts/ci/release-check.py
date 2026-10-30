"""Dispatch only the existing Windows validation, bound to the requesting commit."""
import json
import os
import re
import subprocess
import sys

REPOSITORY = 'FBForge/fbforge-connect'


def source(env):
    ref, commit = env.get('GITHUB_REF', ''), env.get('GITHUB_SHA', '')
    if (env.get('GITHUB_REPOSITORY') != REPOSITORY
            or not re.fullmatch(r'refs/heads/(main|feature/local-scanner-0[.]3[.]0|(?:release|fix)/[A-Za-z0-9][A-Za-z0-9._/-]*)', ref)
            or not re.fullmatch(r'[a-f0-9]{40}', commit)):
        raise RuntimeError('release_check_source_denied')
    return ref.removeprefix('refs/heads/'), commit


def dispatch(env, run=subprocess.run):
    branch, commit = source(env)
    if env.get('GITHUB_EVENT_NAME') != 'push':
        raise RuntimeError('release_check_event_denied')
    payload = json.dumps({'ref': branch, 'inputs': {'expected_commit': commit}})
    result = run(['gh', 'api', '--method', 'POST',
                  f'repos/{REPOSITORY}/actions/workflows/windows.yml/dispatches', '--input', '-'],
                 input=payload, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError('release_check_dispatch_failed')
    print(f'Windows release validation requested for {branch} at {commit}. No signing or publication requested.')


def verify(env):
    _, commit = source(env)
    if env.get('GITHUB_EVENT_NAME') != 'workflow_dispatch':
        raise RuntimeError('release_check_event_denied')
    expected = env.get('RELEASE_EXPECTED_COMMIT', '')
    if expected and (not re.fullmatch(r'[a-f0-9]{40}', expected) or expected != commit):
        raise RuntimeError('release_check_commit_changed')
    print('Windows validation source verified.')


if __name__ == '__main__':
    if sys.argv[1:] == ['--verify-source']:
        verify(os.environ)
    elif len(sys.argv) == 1:
        dispatch(os.environ)
    else:
        raise RuntimeError('invalid_release_check_arguments')
