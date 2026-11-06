# Privacy

Ludiary runs on your PC. It has no server of its own and no telemetry: no usage statistics, no crash reports, no analytics.

## What Ludiary stores

Everything stays on your PC, under your Windows user:

| What | Where |
|---|---|
| Your library, favorites, tags, collections, play time, settings and the name of each connected account | Database in `%LOCALAPPDATA%\Ludiary` |
| Tokens, sessions and API keys | Same database, encrypted |
| The encryption key | Windows Credential Manager, never in the database |
| Logs | `%LOCALAPPDATA%\Ludiary\logs` |
| Automatic safety copies made before an update | `%LOCALAPPDATA%\Ludiary\backups` |
| Your own backups | `Documents\Ludiary\Copias`, or the folder you choose. See [backups](guides/backups.md) |

Backups do not contain the encryption key, so nobody can read your store connections from a backup alone. If your backup folder is synced to the cloud, your library and paths go there with it.

**Steam Web API keys are your own.** Ludiary does not include one. You create yours, and it is stored encrypted and sent only to Steam. The same applies to the IsThereAnyDeal key, which is sent only to IsThereAnyDeal.

When you uninstall, the installer asks whether to delete your data. If you say yes, it deletes `%LOCALAPPDATA%\Ludiary` and the stored credentials. Your own backups are left in place.

## What leaves your PC, and to whom

| To whom | What | When |
|---|---|---|
| **The stores** (Valve, GOG, Epic Games, Ubisoft, EA) | Your IP address and the store IDs of your games, to get titles and covers. If you connect an account, also what the sign-in needs and the requests that read your library | When you scan, sync or view covers |
| **IsThereAnyDeal** | Identifiers and titles of the games you look up, your searches, your country and your key. See the [price guide](guides/prices.md#privacy-what-leaves-your-computer) | Only if you configure it |
| **GitHub** | Your IP address and the installed version. Nothing from your library | At startup and every 24 hours, on by default. Switch it off in **Settings > About**, under **Updates**, with **Do not check**. See [updates](guides/updates.md) |

A few details:

- **Sign-in.** You type your password on the store's own page, never in Ludiary. For Steam, GOG, Epic and EA that page opens in your browser.
- **Ubisoft.** The sign-in page opens in a small Ludiary window, which is Microsoft Edge WebView2. The page is Ubisoft's, and it loads third parties (such as a captcha and analytics) that Ludiary does not control. Windows may show a SmartScreen warning.
- **GOG.** When you connect, GOG's reply also includes your email and account ID. Ludiary keeps only the name and discards the rest.
- **Covers.** Your browser loads most covers directly from the stores' image servers, so those servers see your IP address.

See [stores and risks](guides/stores-and-risks.md) for how each store is reached.

## Logs

Logs stay on your PC. Ludiary never sends them. They leave only if you export them from **Settings > Privacy and logs** and share the file yourself. They are filtered, but filtering is not perfect, so read the file before sharing it. See [troubleshooting](guides/troubleshooting.md).
