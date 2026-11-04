# Backups and restoring

A backup keeps your library, favorites, tags, collections and play time. The connections to your stores are in it too, but encrypted: they can only be used on this computer.

Without backups, if your disk fails you lose your favorites, tags, collections and play time. The library of each store comes back by reconnecting it.

Contents: [Make backups](#make-backups) · [Where they are](#where-they-are) · [What is not in a backup](#what-is-not-in-a-backup) · [Restore](#restore) · [Another computer](#restoring-on-another-computer) · [If Ludiary does not start](#if-ludiary-does-not-start-after-a-restore) · [Problems](#problems)

## Make backups

Open **Settings > Backups**.

**Automatic backups** are off by default. To turn them on:

1. Switch on **Automatic backups**. Ludiary makes a backup from time to time and keeps the latest ones.
2. If Ludiary cannot find a folder, it asks you to choose one (**Choose a folder for the backups**).
3. The first backup is made right away.

How they work:

- Ludiary makes one when it starts, if the latest is more than 24 hours old, and then about once a day while it runs.
- It keeps the 7 most recent automatic backups plus the most recent of each of the 4 weeks before.
- Backups marked **Manual** are never deleted by Ludiary.
- There is no delete button in the app. To free space, delete old files in File Explorer.

**Manual backup:** press **Create backup**. It works with automatic backups on or off. Next to it you see when the last one was made (**Last backup**) or **No backups yet.**

If a backup fails (the drive is not connected, the disk is full) Ludiary says so in this section (*The last backup failed*) and tries again later. Nothing else breaks.

## Where they are

By default: `Documents\Ludiary\Copias` (the folder is called `Copias` in every language). If your Documents folder is in OneDrive, it is there. The folder is created when you turn on automatic backups or make the first one.

To use another folder:

1. In **Settings > Backups**, find **Backup folder**.
2. Press **Change…** and choose a folder in the window that opens. A USB drive, a network folder or another disk work.

The file names look like `ludiary-20261104T101500123Z-1a2b3c4d-auto.sqlite` (date and time in UTC, a code for this installation, and `auto` or `manual`). Do not rename them: Ludiary only shows files with this format.

Ludiary also keeps two kinds of backup of its own in `%LOCALAPPDATA%\Ludiary\backups`. They appear in the same list:

- **Before updating**: made before a Ludiary update changes the database. The last 3 are kept.
- **Before restoring**: made before every restore. The last 3 are kept.

**Cloud folders.** If you choose a folder synchronized by OneDrive, Dropbox or similar, your backups leave your computer. They contain your library and game folder paths, but no store connection that can be read. It is your decision.

## What is not in a backup

- **The encryption key.** It stays in the Windows Credential Manager of your Windows user. It is not in the backup on purpose: a copy that someone finds cannot open your store connections.
- The login token of the installation, the port in use, the logs and the game covers (your browser keeps those).

What this means:

- **Same computer, same Windows user:** after restoring, your stores stay connected.
- **Another computer or user:** Ludiary cannot decrypt your store connections. The stores show as needing to be reconnected. You reconnect them with the wizard in **Settings > Stores**, and your library and your own data stay.

The text in Ludiary says the same: *When restoring on another computer you will need to reconnect the stores.*

## Restore

1. Open **Settings > Backups**. The list is under **Available backups**.
2. Find the backup. Each line shows its date, its kind (**Automatic**, **Manual**, **Before updating**, **Before restoring**) and its size. Backups from other computers are marked **From another computer**.
3. Press **Restore** on that line.
4. A window asks **Restore this backup?** and explains: *A backup of your current data is saved first. Ludiary will restart and open in a new tab. If the backup comes from another computer, you will have to reconnect your stores and review your folders.*
5. Press **Restore and restart** (or **Cancel**).
6. The page says *Ludiary is restarting; it will open in a new tab. You can close this one.* Close the old tab and use the new one.
7. In the new tab, **Settings > Backups** says *The backup from {date} was restored.*

What Ludiary does:

1. Checks the file before touching anything: that it is a Ludiary backup, that it is not damaged and that it is not from a newer Ludiary. Files over 512 MiB are refused. If the check fails, nothing changes and you see one of these messages:
   - *That file is damaged or is not a database. Nothing was changed.*
   - *That file is not a Ludiary backup. Nothing was changed.*
   - *That backup was made by a newer version of Ludiary. Update Ludiary to restore it.*
   - *That file is too large to be a Ludiary backup.*
   - *That backup is no longer in the folder.*
   - *Another backup or restoration is running. Wait for it to finish.*
2. Saves a **Before restoring** backup of your current data.
3. Restarts, replaces the data and updates it if the backup is from an older Ludiary.

**If it fails,** Ludiary goes back to your previous data by itself and says: *The backup could not be restored. Your previous data was kept.*

**To undo a restore,** restore the **Before restoring** backup. Restoring an old backup removes what you did after it, so this is your safety net.

After restoring:

- The browser session is lost, hence the new tab.
- Installed games appear again after the next scan.
- Your **Automatic backups** setting, backup folder and the wait times between syncs stay as they were before, not as in the backup.
- Game folders you added by hand are switched off unless they were already on before. You see: *{count} folders that came from the backup were switched off. Review them and switch them on if they are yours.* Review them in **Settings > Game folders**. This is a safety measure: a backup may come from another computer and point to folders there. Folders Ludiary detected by itself are found again.

## Restoring on another computer

1. Copy the backup file to the other computer (USB, network...).
2. In Ludiary, **Settings > Backups > Change…** and choose the folder with the file. There is no file picker or upload: you choose the folder.
3. The backup appears marked **From another computer**. Press **Restore**.
4. After restoring, reconnect your stores (see [What is not in a backup](#what-is-not-in-a-backup)) and review your game folders.

To export, do the reverse: choose a USB drive or a synchronized folder as the backup folder.

## If Ludiary does not start after a restore

Normally you do not need this. If the data in use turns out to be damaged, Ludiary moves it aside without opening it, restores the backup you asked for and keeps the old data in a folder named `-raw`. Use this procedure only if you want to get that old data back, or if Ludiary does not start after a power cut during a restore.

The folder is in `%LOCALAPPDATA%\Ludiary\backups\` and is called `pre-restore-<numbers>-raw`, for example `pre-restore-001762250000000-raw`. It does not appear in the Ludiary list. Inside, it can have `ludiary.db`, `ludiary.db-wal` and `ludiary.db-shm`.

Before you start, copy the whole `%LOCALAPPDATA%\Ludiary` folder somewhere else, just in case.

1. Close Ludiary: right-click its icon in the tray (near the clock) and choose to quit. Check in Task Manager that it is not running.
2. Open `%LOCALAPPDATA%\Ludiary` in File Explorer (paste that in the address bar).
3. Look for files that start with `restore-pending`. If there are any, delete **all** of them (`restore-pending.json`, `restore-pending.sqlite` and the ones that end with `-wal` or `-shm`). This stops Ludiary from trying the restore again.
4. In that folder, move `ludiary.db`, `ludiary.db-wal` and `ludiary.db-shm` (the ones that exist) to your own safe folder. They are the restored data.
5. Open `backups\pre-restore-<numbers>-raw` and move the files that are in it (`ludiary.db` and, if present, `ludiary.db-wal` and `ludiary.db-shm`) to `%LOCALAPPDATA%\Ludiary`. **Move them together**: the `-wal` file belongs to its `ludiary.db`.
6. Open Ludiary again with the shortcut.

If your data was damaged, Ludiary may still not open this database. Then use a normal backup instead: delete `ludiary.db`, `ludiary.db-wal` and `ludiary.db-shm`, copy a `.sqlite` backup to `%LOCALAPPDATA%\Ludiary` and rename it `ludiary.db`. Start Ludiary. [POR VERIFICAR: this manual route has not been tried on a real installation]

If nothing works, export the logs and report it (see below).

## Problems

| Message | Meaning |
|---|---|
| Choose a folder for your backups first. | Ludiary cannot find your Documents folder. Press **Change…** and choose one. |
| The backup folder is not available. Check that the drive is connected. | The folder does not exist or its drive is unplugged. |
| The backup could not be written. Check the free space and the permissions of the folder. | Disk full or no permission. |

If something is not clear, export the logs from Settings and open an issue on GitHub. [POR VERIFICAR: name of the logs button and issue template, not in this branch] Logs never contain folder paths.
