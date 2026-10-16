# Contributing

Contributions to the FIT-Connect Testclient are welcome. Start with README.md for setup and build instructions. Describe the problem or intended behavior in an issue before proposing a larger change.

- Keep API v2 and API v3 behavior explicit and separately covered.
- Use the existing SDKs for cryptography and FIT-Connect protocol handling.
- Do not add production environments, embedded credentials or automatic acceptance/rejection.
- Reuse frontend/src/site.css for colors, fonts, controls and statuses. Page styles describe layout only.
- Use synthetic data and keys in tests. Never contribute real customer payloads, credentials or private certificates.
- Add behavioral tests and document contract changes. Use the exact verification commands in README.md.
- Keep changes small and describe what was tested and what remains unverified.
- By contributing, confirm that you have permission to submit the code under this project's EUPL-1.2 license. Retain upstream copyright and license notices.

Security issues belong in private reports as described in SECURITY.md, not public tickets.
