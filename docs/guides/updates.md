# Updates

Ludiary looks for new versions by itself. You decide when to install them.

## What Ludiary checks

- By default, Ludiary asks GitHub for the latest published version when it starts and then every 24 hours.
- Only your IP address and the installed version are sent. Nothing from your library.
- Every version is signed by the project. Ludiary checks the signature before it tells you about a version and again before installing it.

## Turn the check off or change it

Open **Settings > About**. Under **Updates** choose one of:

- **Let me know (recommended)**: you get a notice when there is a new version. This is the default.
- **Update automatically**: Ludiary downloads it in the background and installs it the next time you open Ludiary.
- **Do not check**: no automatic requests. **Check now** still works when you press it.

## The notice

When a new signed version is out, a notice appears at the top of Ludiary: *A new version of Ludiary is available*. It has a link to what is new and three buttons:

- **Apply**: asks you to confirm, downloads the version, restarts Ludiary and opens the new one. Games you have open stay open.
- **Later**: hides the notice for 24 hours (or until Ludiary restarts). It comes back after that, or if an even newer version appears.
- **Ignore**: asks you to confirm and turns the check off. You can turn it back on in **Settings > About**.

## After an update

The first time you open the new version, a small banner at the top says *Ludiary has been updated to X.Y.Z* and links to the changes (*What is new in X.Y.Z*, opens on GitHub). Press **Close** and it does not come back.

## If an update fails

If the new version does not start, Ludiary goes back to the previous one by itself and restores the database it had before the update. Your data is intact. You see *The update to X did not start and Ludiary went back to Y*, with a link to export the logs. That version is not tried again; the next one is.

If that also fails, install Ludiary again with the installer. Your data and backups stay in place (see [Backups](backups.md)).

`[POR VERIFICAR]` Screenshots: `[CAPTURA: the update notice with Apply, Later and Ignore]` and `[CAPTURA: the banner after updating]`.
