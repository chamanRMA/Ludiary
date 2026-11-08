# Code signing policy

The Windows installers are **not code-signed** yet, so Windows SmartScreen may warn on the first install. An application to the [SignPath Foundation](https://signpath.org) free program was declined in November 2026; the project may apply again later. The options are compared in [docs/code-signing.md](code-signing.md).

Every release is also signed with the project's own Ed25519 keys, which Ludiary checks before it installs an update. See [docs/release.md](release.md).

## Team roles

- **Committers and reviewers:** [@chamanRMA](https://github.com/chamanRMA)
- **Approvers:** [@chamanRMA](https://github.com/chamanRMA)

Changes from anyone else arrive as pull requests. They need a review from a team member and passing checks before they are merged. Each release is built by GitHub Actions from the `main` branch and approved by hand by an approver.

## Privacy policy

Read the [privacy policy](privacy.md). In short: Ludiary sends no telemetry, and nothing leaves your computer except calls to the stores and services you configure, and the check for new versions on GitHub. That check is on by default, and you can switch it off in **Settings > About**.
