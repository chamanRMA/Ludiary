<p align="right"><b>English</b> · <a href="docs/readme/README.es.md">Español</a></p>

# Ludiary

**One library for all your PC games — Steam, GOG, Epic, Ubisoft and EA — launched from a single local web app.**

![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0--only-blue)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D6)
[![Latest release](https://img.shields.io/github/v/release/chamanRMA/Ludiary)](https://github.com/chamanRMA/Ludiary/releases/latest)

Ludiary runs on your own PC. A small tray app starts a local server, and you use it in your normal browser. You see every game you own in one place, and you press **Play**; Ludiary starts it through the right store.

> Ludiary is not affiliated with Steam, GOG, Epic Games, Ubisoft or EA. See the [disclaimer](#disclaimer).

<!-- TODO: screenshots -->

## Why Ludiary

- **Local-first and private.** No telemetry and no Ludiary server. Nothing leaves your PC except calls to the stores, to services you configure yourself, and the check for new versions on GitHub, which you can switch off in Settings.
- **Official store paths where they exist.** Where a store has no official way, Ludiary says so and the connection is marked as unofficial (GOG's account login and wishlist, and Epic's, are examples; they can break if the store changes).
- **Not affiliated with any store.** It is an independent open-source project.
- **Your secrets stay encrypted.** Tokens, sessions and API keys are stored encrypted; the key lives outside the database, in the Windows key store.

## Features

- **Unified library.** One entry per game, even if you own it in several stores. Ludiary scans the installed games of each store and, where the store allows it, reads your account to show games you own but have not installed.
- **Play.** Launch a game from Ludiary by its saved entry. For GOG, Play goes through GOG Galaxy by default (a setting lets you open the game directly).
- **Favorites, tags and collections**, plus **play time** reported by Steam. Steam collections are imported and refreshed on each sync.
- **DLC** shown inside the page of its base game.
- **Price comparison** with [IsThereAnyDeal](https://isthereanydeal.com): best price, historical low and a list of games you follow. You bring your own free key. You can import your **Steam and GOG wishlists** into that list. See the [price guide](docs/guides/prices.md).
- **Backups and restore** of your library and your data, automatic or manual. See the [backups guide](docs/guides/backups.md).
- **Signed automatic updates** (Ed25519) with rollback if the new version does not start. See the [updates guide](docs/guides/updates.md).
- **Log export** from Settings, to attach to a bug report. Ludiary never sends it by itself. See [troubleshooting](docs/guides/troubleshooting.md).
- **Interface in Spanish and English.**

### Stores

What each connector does today. Details change as the stores change.

| Store | Installed games and Play | Account (owned, not installed) | Notes |
|---|---|---|---|
| Steam | Yes (`steam://`) | Yes: sign-in plus your own API key | Covers, play time, DLC, collections, wishlist import |
| GOG | Yes, through GOG Galaxy or directly | Yes: official login, you paste the code (unofficial flow) | DLC, wishlist import (unofficial) |
| Epic Games | Yes | Yes: official login, you paste the code (unofficial flow) | Install button for games you own |
| Ubisoft Connect | Yes (`uplay://`), found in the Windows registry | Yes: sign-in in a built-in window | Covers from the local cache |
| EA app | Yes (`origin2://`), found from the EA app's files | Yes: sign-in in your browser and paste a token | |

Each store is an isolated connector: if one fails, the others keep working.

## Install

Windows only for now.

1. Go to the [latest release](https://github.com/chamanRMA/Ludiary/releases/latest).
2. Download `Ludiary-Setup-X.Y.Z.exe` (the current version is 0.1.1).
3. Run it and follow the installer.
4. Open **Ludiary** from the shortcut. It starts the tray app and the server if they are not running, and opens the web in your default browser.

**SmartScreen.** The installer is not code-signed yet, so Windows may show "Windows protected your PC". If you downloaded it from this project's releases page, press **More info** and then **Run anyway**. This appears only on the first manual install; updates made by Ludiary do not trigger it. Updates are still protected by their own Ed25519 signature. Every release also lists a `SHA256SUMS.txt` you can check.

## How it works

```
 Browser  ──>  http://ludiary.localhost:<port>
                     │
                     ▼
 Tray app (Ludiary.exe) ── starts ──> Local server (127.0.0.1 / [::1] only)
                                          │
              ┌───────────────┬───────────┴──────────┬────────────────┐
              ▼               ▼                      ▼                ▼
        Store connectors    SQLite database     Windows key store   Game launcher
   (Steam GOG Epic Ubisoft EA)  (your data)    (encryption key)    (by saved game ID)
```

Security in short: the server listens only on the loopback interface and checks `Origin` and `Host`. The browser is authorized with a one-time link that becomes an `HttpOnly` cookie, and actions that change data or start games need a second proof tied to the installation. Games are started only by the ID of a game stored in the database, never by a command or path sent through the API. See ADR decisions 23, 29, 63, 66 and 67.

## Build from source

You need:

- Node 24 (see [`.node-version`](.node-version)) and pnpm through Corepack
- Go (for the tray helper and the launcher)
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) (only to build the installer)

```
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build:desktop
corepack pnpm build:installer
```

To work on the web interface with simulated data, no server needed:

```
corepack pnpm --filter @ludiary/web dev
```

This runs `vite --mode simulator`. How releases are made and signed: [docs/release.md](docs/release.md) and [docs/code-signing.md](docs/code-signing.md).

## Project structure

```
apps/
  desktop/       tray app, launcher, installer and release scripts
  web/           React interface
packages/        core, db, api, contracts, i18n, itad, runtime, platform-* ...
connectors/      steam, gog, epic, ubisoft, ea
docs/
  adr/           design decisions (the source of truth)
  guides/        user guides (prices, backups, updates, troubleshooting)
  manual-tests/  checks against real stores
```

## Roadmap

- **Phase 2:** home-server mode in Docker, a local agent, and groundwork for several users.
- **Phase 4:** price history and alerts for lows. (Phase 3, the price comparator, is already available.)
- **No phase yet:** manual games added from the interface, and editing game metadata yourself.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

- Sign off every commit (DCO): `git commit -s`.
- The design lives in the [ADR](docs/adr/ADR.md). Changes that touch it need a new decision there.
- The project is developed with the help of [Claude Code](https://claude.com/claude-code); the agent team and their rules are in [`.claude/agents/`](.claude/agents/).

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

[GPL-3.0-only](LICENSE).

## Disclaimer

Ludiary is an independent project. It is not affiliated with, endorsed by or sponsored by Valve/Steam, GOG, Epic Games, Ubisoft, Electronic Arts, or IsThereAnyDeal. All trademarks and logos belong to their owners.
