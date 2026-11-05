# Troubleshooting

## Export the logs

1. Open Ludiary and go to **Settings > Privacy and logs**.
2. In the **Export logs** row, press **Export**.
3. Your browser saves a file called `ludiary-logs-<version>-<date>-<time>.txt`.
4. Open it and read it before sharing.

### What is inside

- The Ludiary version, Windows version, the language, the updater state and, for each store, whether it is connected and the code of the last sync error.
- The server, launcher and crash logs, and the installer log of the last update.

### What is not inside

- Tokens, API keys, passwords or sessions.
- Account names.
- Your Windows user name: it is filtered (replaced by `~` in paths), but filtering is not perfect, so read the file before sharing it.
- The database, your settings and your backups.

Logs are filtered when they are written and again when they are exported. If you still see something private, remove it before sharing.

## Open an issue

1. Go to <https://github.com/chamanRMA/Ludiary/issues/new>. The same link is in **Settings > Privacy and logs**.
2. Fill in the form: Ludiary version (**Settings > About**), Windows version, affected store, what happened and the steps.
3. Drag the exported `.txt` into the form.

Ludiary sends nothing by itself: you attach the file yourself. Never paste tokens, keys or passwords.

## Ludiary does not start

If Ludiary cannot start, it shows a message with the folder of the logs (`%LOCALAPPDATA%\Ludiary\logs`). The usual ones. You can also attach by hand the files in that folder: they are filtered when written, except the installer log (`install.log`), which is not.

| Message | What to do |
|---|---|
| This database was created by a newer version of Ludiary (error 14) | You installed an older version than the one you had. Install the latest version. If you cannot, restore a backup: see [backups](backups.md). |
| Ludiary could not open its database | Check the free disk space. If it continues, see [backups](backups.md). |
| Ludiary's stored keys use a format this version does not recognize | Update Ludiary to the latest version. Nothing was changed. |
| Ludiary could not use the Windows Credential Manager | Try again. If it keeps failing, report it. |
| Ludiary could not find a free port | Close other programs and try again. |
| The Ludiary server is taking too long to start | Wait a moment and open it again. |

For anything else, open an issue with the logs.
