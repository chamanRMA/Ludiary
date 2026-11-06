# Ludiary — unified video game library manager

**Ludiary** is a local web application to view and launch, from a single place, the games from several stores: **Steam, GOG, Epic, Ubisoft and EA**. It is an open-source project for the general public, licensed GPL-3.0-only (text in `LICENSE`), with contributions under the DCO.

The source of truth for the design is the **ADR** (`docs/adr/ADR.md`). This file summarizes what every agent must know. Each agent in `.claude/agents/` expands on its own area.

## Scope

- **MVP:** localhost mode on **Windows**. A lightweight executable with a tray icon starts the server, and a shortcut opens the web in the default browser. It includes the unified library, folder scanning, direct launching from the executable, favorites, tags, collections, play time, a Spanish and English interface, backups and exportable logs.
- **Phase 2:** home server mode in Docker, local agent and preparation for multi-user.
- **Phase 3:** price comparator with IsThereAnyDeal (plus direct store prices where it does not cover).
- **Phase 4:** price history and lowest-price alerts.
- **No phase assigned:** manual games (interface) and user customization of metadata.

## Invariants

They are not broken without going through the `architect` and leaving a new decision in the ADR.

1. The core does not depend on the execution mode (localhost or Docker), the operating system or the packaging. Anything that depends on the OS goes behind our own interfaces: launching processes, scanning installations, tray, key store and installer.
2. Each store is an isolated connector with a common interface. If one fails, the others keep working.
3. Games are launched **only by the ID of a game stored in the database**, never by commands or paths received through the API.
4. In localhost mode the server listens only on the loopback interface (`127.0.0.1` and `[::1]`, same port; the web opens at `ludiary.localhost`, ADR 66), validates `Origin` and `Host`, requires the installation token proof (HMAC, without the token being transmitted; ADR 63) on actions that change data or launch processes, and authorizes the browser with a one-time link that is exchanged for an `HttpOnly` cookie. No browser API route that changes data, launches processes, shows or accepts secrets or exports files is authorized by the cookie alone: it also requires the origin key (ADR 67).
5. Tokens, sessions and third-party keys are stored encrypted. The encryption key lives outside the database. No secret or personal data goes into the repository, the logs or the test files.
6. No interface text is written in the code: everything goes through translation files (Spanish and English).
7. The data model carries `user_id` from the start. A canonical game groups several ownerships (one per store, or manual). User data (favorites, tags, collections, play time) hangs from the canonical game.
8. The official channels of the stores are used whenever they exist. The project is not affiliated with any store.
9. No telemetry and no server of our own. Nothing leaves the user's machine except calls to the stores, to the services the user configures and the check for new versions on GitHub, active by default and can be disabled in Settings (ADR 90).
10. Nothing is improvised on an open decision: stop and escalate to the `architect`.

## Agent team

| Agent | When to use it |
|---|---|
| `architect` | Design, contracts, data model, repository structure, open decisions and ADR changes. |
| `developer` | Implement features, API, interface, migrations and fix bugs. |
| `connectors` | Connectors for Steam, GOG, Epic, Ubisoft and EA: library, scanning, launching, connection wizards and prices. |
| `packager` | Executable, installer, shortcut, tray, updates, signing and Docker image. |
| `tester` | Automated tests, recorded responses and the manual test guide against real stores. |
| `auditor` | Read-only review: ADR conformance, security, secrets, licenses and dependencies. |
| `docs-writer` | README, user guides, procedures, issue templates and ADR clarity. |

Agents do not invoke each other: the main session coordinates.

## Workflow

1. If the task touches design, contracts or an open decision, the main session consults the `architect` first.
2. The agent for the area implements it: `developer`, `connectors` or `packager`.
3. The `tester` adds and runs the tests.
4. The `auditor` reviews before any change touching security, secrets, connectors, packaging or updates is considered closed.
5. The `docs-writer` updates the affected documentation.

When an agent detects that a task contradicts the ADR or needs an open decision, it **stops and reports it** with the options it sees. It does not decide on its own.

## Recommended starting order

1. **Installer prototype** on Windows: shortcut, running-server check, tray icon, SQLite and the system key store working. It is the biggest technical risk.
2. **Steam connector** end to end: sync, display and launch a game.
3. **GOG connector**: validates command-line launching, the most different case.

## Conventions

- Project name: **Ludiary**. Scoped packages under `@ludiary/`, all with `"private": true` (ADR, decision 44).
- Code identifiers, comments, ADR, agent definitions and documentation are in English. The README has translations in `docs/readme/` (decision 49).
- Small, descriptive commits, with the ADR decision they respond to when applicable, and with `Signed-off-by` (DCO, decision 60): `git commit -s`.
- Any store data that may change (APIs, URIs, formats) is verified before depending on it and recorded as an assumption.

## References

- Full ADR: `docs/adr/ADR.md`
- Agents: `.claude/agents/`
