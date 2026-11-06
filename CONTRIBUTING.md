# Contributing to Ludiary

Thanks for your interest. Ludiary is a small GPL-3.0-only project with a single maintainer, so clear and small pull requests get reviewed fastest.

To report a vulnerability, do not open an issue: see [SECURITY.md](SECURITY.md). All participation falls under the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need:

- **Node** in the version given in [`.node-version`](.node-version), and **pnpm through Corepack** (the version is pinned in `package.json`). Run it as `corepack pnpm`.
- **Go**, in the version given in `apps/desktop/launcher/go.mod`, for the tray helper and the launcher.
- **[Inno Setup 6](https://jrsoftware.org/isinfo.php)**, only to build the installer.

The desktop app and the installer build on Windows only.

```
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:desktop
corepack pnpm build:installer
```

### The simulator

To work on the web interface you do not need a server or any store account:

```
corepack pnpm --filter @ludiary/web dev
```

This runs `vite --mode simulator`, with simulated data.

### Tests

- Run `corepack pnpm typecheck` and `corepack pnpm test` before opening a pull request.
- New behavior comes with tests. Connector tests use recorded responses, never real accounts. Recorded responses must be cleaned of any secret or personal data.
- Checks that need a real store are described in [`docs/manual-tests/`](docs/manual-tests/). If your change needs one, say in the pull request whether you ran it.

## Branches and pull requests

1. Branch from `main`, for example `fix/gog-expired-session` or `docs/backup-guide`.
2. Make small, descriptive commits. Name the ADR decision a commit responds to, when there is one.
3. Open a pull request against `main` and fill in the template.
4. Every change comes in through a pull request with CI green.
5. Changes to connectors, security or packaging also go through an audit review before merging (ADR decision 60).

New dependencies must have a license compatible with GPL-3.0: MIT, BSD, ISC, Apache-2.0, MPL-2.0, LGPL or GPL-3.0.

## The ADR is the design source

[`docs/adr/ADR.md`](docs/adr/ADR.md) records every design decision and why it was made.

- Read the decisions that touch your area before you start.
- If your change alters the design, a contract between modules, the data model or the security model, it needs a decision in the ADR. Open an issue first and propose it, or include the new decision in your pull request. A decision that revises an older one says so in both places.
- If you run into an open decision, or the task contradicts the ADR, stop and ask. Do not settle it in the code.
- Store data that can change (APIs, URIs, formats) is verified before anything depends on it, and recorded as an assumption in the ADR.

## Invariants

The full text is in [`CLAUDE.md`](CLAUDE.md). They are not broken without a new ADR decision. In short:

1. The core does not depend on the execution mode, the operating system or the packaging. OS-specific code sits behind our own interfaces.
2. Each store is an isolated connector with a common interface. If one fails, the others keep working.
3. Games are launched only by the ID of a game stored in the database, never by commands or paths received through the API.
4. In localhost mode the server listens only on loopback, validates `Origin` and `Host`, and sensitive browser routes need more than the session cookie (ADR decisions 63, 66 and 67).
5. Tokens, sessions and third-party keys are stored encrypted, with the key outside the database. No secret or personal data goes into the repository, the logs or the test files.
6. No interface text is written in the code: it all goes through translation files, in Spanish and English.
7. The data model carries `user_id` from the start. User data hangs from the canonical game.
8. The stores' official channels are used whenever they exist. The project is not affiliated with any store.
9. No telemetry and no server of our own.
10. Nothing is improvised on an open decision.

## Language and translations

- Code identifiers, comments, documentation and the ADR are in **English**. The README also has a translation in [`docs/readme/`](docs/readme/); keep both in sync.
- Every interface text goes through `packages/i18n`, and every new text is added in **both Spanish and English** in the same change.

## Sign your commits (DCO)

Ludiary uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), with no CLA. Every commit needs a sign-off:

```
git commit -s
```

This adds a line with the name and email from your Git configuration:

```
Signed-off-by: Your Name <you@example.com>
```

That line is a statement, not a cryptographic signature. By adding it you certify that you wrote the contribution, or otherwise have the right to submit it under the project's license, and that you understand the contribution and that sign-off are public and kept permanently. The text at the link above is what counts.

You keep the copyright of your work. Since there is no CLA, your contribution stays under GPL-3.0-only, and changing the project's license would need the agreement of its contributors.

Forgot it? Fix the last commit with `git commit --amend -s --no-edit`, or a whole branch with `git rebase --signoff main`.

## Never paste secrets

Never paste tokens, API keys, passwords, session cookies or pasted login codes in issues, pull requests, commits or test files. This includes screenshots.

Exported logs are filtered, but filtering is not perfect. Read a log before you share it, and never share one you have not reviewed. See [troubleshooting](docs/guides/troubleshooting.md).

## AI-assisted contributions

AI tools are allowed. The project itself is developed with the help of [Claude Code](https://claude.com/claude-code).

Whoever signs off answers for the code. Your `Signed-off-by` means the same whether you typed the code or a tool did: you have read it, you understand it, you tested it, and you have the right to submit it. An AI tool cannot sign off for you. "The AI wrote it" is not an answer to a review comment.

### The agent team

[`.claude/agents/`](.claude/agents/) holds the agent definitions used to develop Ludiary. You can use them or ignore them.

| Agent | Area |
|---|---|
| `architect` | Design, contracts, data model, open decisions and ADR changes |
| `developer` | Features, API, interface, migrations and bug fixes |
| `connectors` | The store connectors |
| `packager` | Executable, installer, tray, updates and signing |
| `tester` | Automated tests, recorded responses and the manual test guides |
| `auditor` | Read-only review: ADR conformance, security, secrets, licenses and dependencies |
| `docs-writer` | README, user guides and procedures |

Agents do not invoke each other: the main session coordinates them. The workflow is in [`CLAUDE.md`](CLAUDE.md).
