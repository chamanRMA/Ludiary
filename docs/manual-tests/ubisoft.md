# Manual test: Ubisoft Connect first cut (ADR decision 79, point 9)

Goal: close assumptions U1 to U11 of ADR 79 on a real Windows PC. Automatic tests cannot do this (they use invented fixtures; the connector makes no network request).
Same format as `gog.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). The 12 steps below are the 12 checks of ADR 79, point 9, in the same order, plus a step 0 for the setup.

Time: about 1 hour plus download time. Needs: internet, a free Ubisoft account, Ludiary built and running, about 20 GB of disk for Trackmania (size not verified; Brawlhalla is smaller, about 1 to 2 GB from low-quality sources, also not verified).

Texts: Spanish interface texts are quoted from `packages/i18n/locales/web/es.json`. The Ubisoft connector texts do not exist yet; they are quoted from ADR 79 and may change when the code lands. If a text differs, note the real one.

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\ubisoft-notes.txt`).
- Before copying anything into the ADR, sanitize it: replace the Windows user name with `<user>`, remove the account name and e-mail, keep only relative paths. Example: `F:\Juegos Ubisoft ñ\Trackmania`. Never paste tokens, cookies, session data or the full log.
- Do not commit screenshots that show your Ubisoft account name or e-mail.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.
- Game IDs are numbers and are not personal: write them.

## Step 0. Install Ubisoft Connect and the test game

1. Download Ubisoft Connect from ubisoft.com and install it with defaults. Create a free account if you have none, and sign in.
2. Add **Trackmania** (free "Starter" access) to your account. Alternative if disk space matters: **Brawlhalla** (free).
3. In Ubisoft Connect, go to Settings > Downloads (wording may vary) and set the game installation folder to `F:\Juegos Ubisoft ñ` (a folder with spaces and an "ñ"; use another drive letter if you have no `F:`). Create the folder first if asked.
4. Install the game from Ubisoft Connect. Wait until it finishes. Close the game if it opens by itself, and leave Ubisoft Connect signed in.

**Expect:** the folder `F:\Juegos Ubisoft ñ\<game folder>` exists and contains the game files.
**Note:** the real default installation path Ubisoft Connect proposed (sanitized), and the exact folder name it created (needed for U5).

## Step 1. Registry: launcher and installed game (U1, U2, U3)

**Do:** in a terminal run:

```
reg query "HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher" /s
```

If it finds nothing, repeat with `HKLM\SOFTWARE\Ubisoft\Launcher` (64-bit view).
**Expect:** a value `InstallDir` in `...\Launcher` with the Ubisoft Connect folder (U3), and a subkey `...\Launcher\Installs\<id>` with a value `InstallDir` pointing to the game folder (U1).
**Note**, sanitized:

- The game ID (the subkey name): a small integer? (U2). Write the number.
- The format of `InstallDir` of the game: `/` or `\` as separator, trailing slash or not, drive letter case (U1). Example: `F:/Juegos Ubisoft ñ/Trackmania/`.
- Which view held the key: 32-bit (`WOW6432Node`) or 64-bit.
- How many subkeys exist under `Installs` and whether any is not a game you installed (U10, DLC).
- `InstallDir` of the launcher, relative form only (U3).

## Step 2. Launcher executables (U3)

**Do:** open the Ubisoft Connect folder from step 1 (the `InstallDir` of the launcher) in Explorer.
**Expect:** both `upc.exe` and `UbisoftConnect.exe` exist.
**Note:** which of the two exist (names only). Closes U3.

## Step 3. The `uplay` scheme (U4)

**Do:** in a terminal run:

```
reg query "HKCR\uplay\shell\open\command"
```

**Expect:** the scheme is registered and the command points to Ubisoft Connect (`upc.exe` or `UbisoftConnect.exe`).
**Note:** registered yes/no; which executable name the command uses (no path). Closes U4.

## Step 4. Desktop shortcut made by Ubisoft Connect (U6)

**Do:** in Ubisoft Connect open the game, then its properties/settings (the gear or "..." next to Play) and create a desktop shortcut ("Create shortcut" or similar). Right-click the new shortcut on the desktop > Properties (or "Open file location" > Properties). Read the **Target** or **URL** field. Do not edit or run it.
**Expect:** a target of the form `uplay://launch/<id>/0`, with the same ID as step 1.
**Note:** the target with the number kept and nothing else: does it end in `/0`, in another number, or has no suffix? (U6). Also whether the shortcut is a `.url` file or a `.lnk`. If the target has no `/0`, the connector switches to the Playnite form `uplay://launch/<id>` (one line and its test). Delete the shortcut afterward.

## Step 5. Folder name against the Windows name (U5)

**Do:** in a terminal run (replace `<id>` with the ID from step 1):

```
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install <id>" /v DisplayName
```

**Expect:** a `DisplayName` with the human name of the game.
**Note:** the `DisplayName` and the last component of the game folder (from step 0): same, or different? Is the folder name readable for a person (spaces, capitals, no code names)? Closes U5. If the folder name is a bad title, ADR 79 point 3 says it is decided separately.

## Step 6. Automatic detection in Ludiary (U1, U5, U10)

**Do:** start Ludiary. In Settings > "Carpetas de juegos", under "Cómo se detectan los juegos instalados" choose "Automática y carpetas manuales". Press "Escanear ahora". Open the Library.
**Expect:**

- Settings > "Ubicaciones" lists the game folder (`F:\Juegos Ubisoft ñ\<game folder>`) as "Detectada automáticamente". One entry per Ubisoft game (ADR 79, point 2).
- The library shows the game under Ubisoft with the **name of its folder** as title and the gradient fallback, **not** a cover (covers are out of this cut, point 5).
- There is no extra Ubisoft entry that is not a game (U10). The Ubisoft card in Settings > "Tiendas" shows no warning about automatic detection.

**Note:** the title shown, as it appears (a game name is not personal); gradient yes/no; number of Ubisoft entries against the number of subkeys counted in step 1 (U10); the folder path shown by Settings, sanitized.

## Step 7. Play with the launcher closed, then open (U7)

**Do:**
1. Close Ubisoft Connect fully (also from the tray; check Task Manager for `upc.exe` and `UbisoftConnect.exe`). Press "Jugar" on the game in Ludiary.
2. Close the game. Leave Ubisoft Connect open and signed in. Press "Jugar" again.

**Expect (both times):** the toast says "Abriendo en Ubisoft…" (`game.launching`); Ubisoft Connect opens (it may ask you to sign in the first time) and the game starts; its window is visible. No error from Ludiary.
**Note:** per run: launcher started by itself yes/no; did it ask for login; game started yes/no; any message from Windows or from the launcher. A 2015 guide said the URI failed with the launcher open: write whether that is still true (U7). Closes U6 (the game really starts with `/0`) and U7.

## Step 8. Only manual folders

**Do:** Settings > "Carpetas de juegos" > choose "Solo las carpetas que yo indique". Press "Escanear ahora". Look at the Library and at the Ubisoft card in Settings > "Tiendas". Then press "Añadir carpeta" and add the game folder (see the note below), and scan again. Finally go back to "Automática y carpetas manuales" and scan.
**Expect:**

- After the first scan the Ubisoft game **disappears** and the Ubisoft card shows the warning: «Ubisoft Connect guarda sus juegos en el registro de Windows. Para verlos, activa la detección automática» (`connectors.ubisoft.needsAutoDetection`, text from ADR 79).
- After adding the game folder by hand the game still does **not** appear (without ID there is no Play; U9).
- After going back to automatic the game appears again, same title.

**Note:** warning shown yes/no and its real text; game gone yes/no; game appeared again yes/no. Also try the mode "Configurarlo más tarde" (the onboarding option) if you can reach it: expect the same.

> In the current simulated build "Añadir carpeta" may add a sample path instead of a picker (`settings.folders.simulatedPicker`: «En esta versión simulada, «Añadir carpeta» añade una ruta de ejemplo...»). If so, mark the manual-folder part NOT CHECKED and report it to the programmer; the mode switch and the warning still can be checked.

## Step 9. Uninstall from Ubisoft Connect (U8)

**Do:**
1. Uninstall the game from Ubisoft Connect. Wait until it finishes.
2. Run again `reg query "HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs" /s`.
3. In Ludiary press "Escanear ahora" and open the Library.

**Expect:** the `Installs\<id>` subkey is gone (U8); the game disappears from the library. If you press "Jugar" before scanning: no crash (either Ubisoft Connect opens its page for the game, or a clear message).
**Note:** subkey removed yes/no (U8); folder left on disk yes/no; game gone yes/no; what happened with "Jugar" before the scan. Reinstall the game afterward for steps 10 and 11.

## Step 10. Exported log has no paths or titles

**Do:** after steps 6 to 9, go to Settings > "Privacidad y registros" > "Exportar registros" > "Exportar". If the web export is still simulated, read the real files in `%LOCALAPPDATA%\Ludiary\logs` instead, read-only, in a text editor. Search for: the game title, the folder name, `Juegos Ubisoft`, `ñ`, `F:\`, `F:/`, `C:\Users`, the Windows user name, `Ubisoft Game Launcher`, `upc.exe`, `UbisoftConnect.exe`, `.exe`, `uplay://`.
**Expect:** none of those appear. Only numbers: game IDs, counters (`invalidIds`, `invalidPaths`, `duplicates`), result codes. The Play entry names the connector and the result, never a path or a title (ADR 79, point 3 and 4).
**Note:** OK or FAIL. If FAIL, report the file name pattern (`ludiary-YYYYMMDD`), the line number and the kind of leak (path, title, user name), never the leaked text. Do not share the file. Closes the log privacy requirement (ADR 35).

## Step 11. `uplay_install.state` (U9, optional)

**Do:** with the game installed, look in its folder for `uplay_install.state`. If it exists, in PowerShell run:

```
Format-Hex -Path "<game folder>\uplay_install.state" | Select-Object -First 4
```

Do not edit it.
**Expect:** the file exists in the root, is binary, and its first byte is `0x0A` (installed). Whether the game ID appears in the first bytes is unknown.
**Note:** exists yes/no; first byte; is the ID visible in the first bytes, and in which encoding (little-endian integer, text)? Write only the bytes that carry the ID, not the rest. If the ID is clearly there, manual folders could be allowed by a separate decision. Closes U9. Mark NOT CHECKED if the file does not exist.

## Step 12. Play without Ubisoft Connect (optional)

**Do:** with the game saved in Ludiary and the folder still on disk, remove the launcher in one of two ways:
- uninstall Ubisoft Connect (the game stays registered in Ludiary until the next scan; do **not** scan), or
- rename the launcher folder from step 1 to something else (for example add `-old`), and undo it afterwards.

Then press "Jugar" on the game in Ludiary.
**Expect:** the message «No se encuentra Ubisoft Connect. Instálalo desde ubisoft.com y vuelve a intentarlo» (`connectors.ubisoft.errors.launcherMissing`, text from ADR 79), and no crash and no empty Windows dialog.
**Note:** message shown yes/no and its real text; what Windows did (nothing, an "open with" dialog, an error); if you only renamed the folder, the `uplay` key still points to it: write that. Mark NOT CHECKED if you skip it. Undo the rename afterwards, or reinstall Ubisoft Connect.

## Extra check while you are here

- **U11:** only if you own a Ubisoft game on Steam or Epic and have it installed. Scan with automatic detection. Expect it to appear twice (once per store); Play works on both. NOT CHECKED if you have none (very likely).

## Closing the test

1. Fill one line per assumption U1 to U11: OK, FAIL or NOT CHECKED, with the sanitized note.
2. Give the lines to the architect to update the assumptions list in ADR 79.
3. If a step FAILS because Ubisoft changed something (registry layout, URI form, folder naming), the connector and its fixtures (`connectors/ubisoft/fixtures/`) must be updated together (ADR 19). If U5 fails (bad titles) or U6 fails (no `/0`), see ADR 79 points 3 and 4.
4. Delete the scratch notes file. No credential, log or screenshot with personal data goes into the repository.

## Summary table

| Step | Closes |
|---|---|
| 0 | setup; folder name for U5 |
| 1 | U1, U2, U3, U10 (count of subkeys) |
| 2 | U3 |
| 3 | U4 |
| 4 | U6 |
| 5 | U5 |
| 6 | U1, U5, U10 (end to end in Ludiary) |
| 7 | U6 (game really starts), U7 |
| 8 | manual-only mode and warning (ADR 42, 79 point 3), U9 (no ID in manual folders) |
| 9 | U8, uninstall behavior |
| 10 | log privacy (ADR 35) |
| 11 | U9 |
| 12 | launcher missing message (ADR 79 point 4) |
| extra | U11 |
