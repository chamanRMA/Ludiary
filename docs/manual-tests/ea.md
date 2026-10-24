# Manual test: EA app first cut (ADR decision 81, point 9)

Goal: close assumptions EAD1 to EAD14 of ADR 81 on a real Windows PC. Automatic tests cannot do this (they use invented fixtures; the connector makes no network request).
Same format as `ubisoft.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). The 12 steps below are the 12 checks of ADR 81, point 9, in the same order, plus a step 0 for the setup.

Time: about 1 hour plus download time. Needs: internet, a free EA account, Ludiary built and running, and disk space: The Sims 4 base game is large (size not verified). If space matters, use an older small game already in your EA account (for example an "On the House" gift from Origin); it also tests the old file format (EAD4).

Texts: Spanish interface texts are quoted from `packages/i18n/locales/web/es.json`. The EA connector texts are quoted from ADR 81 and may change. If a text differs, note the real one.

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\ea-notes.txt`).
- Before copying anything into the ADR, sanitize it: replace the Windows user name with `<user>`, remove the EA account name, e-mail and account IDs, keep only relative paths. Example: `F:\Juegos EA ñ\The Sims 4`. Never paste tokens, cookies, session data or the full log.
- Do not commit screenshots that show your EA account name or e-mail.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.
- Offer IDs (`contentID`) are product identifiers, not personal: write them. Account IDs are personal: never.

## Step 0. Install the EA app and the test game

1. Download the EA app from ea.com and install it with defaults (it does not let you choose a folder; EAD7). Create a free EA account if you have none, and sign in.
2. Add **The Sims 4** (free base game) to your account. Alternative: a small old game already in your account.
3. Install **the first game in the default folder** (`C:\Program Files\EA Games`) when the app proposes it. This is the one used by steps 1 to 7.
4. If you have disk for a second game (or a small one), install it with a custom folder with spaces and an "ñ": in the EA app go to Settings > Downloads (wording may vary) and set the library folder to `F:\Juegos EA ñ` (use another drive letter if you have no `F:`). Create the folder first if asked. If you can only install one game, install it in `F:\Juegos EA ñ` instead and use that folder wherever the steps say "default folder", noting that step 6 then tests the manual folder.
5. Wait until the downloads finish. Close the game if it opens by itself, and leave the EA app signed in.

**Expect:** `C:\Program Files\EA Games\<game folder>` (and, if installed, `F:\Juegos EA ñ\<game folder>`) exists with the game files.
**Note:** the real default installation path the app proposed (sanitized) and the exact folder names it created.

## Step 1. EA app in the registry and on disk (EAD7)

**Do:** in a terminal run:

```
reg query "HKLM\SOFTWARE\Electronic Arts\EA Desktop"
reg query "HKLM\SOFTWARE\WOW6432Node\Electronic Arts\EA Desktop"
```

Then open `C:\Program Files\Electronic Arts\EA Desktop\EA Desktop` in Explorer.
**Expect:** the folder exists and contains `EADesktop.exe` and `EALauncher.exe` (EAD7). The registry keys may or may not exist.
**Note:** which of the two keys exists; the **value names** only (not the data if it has your name); both executables present yes/no. If the folder is different, the "app not found" message would appear by mistake with the app installed: a registry source would be needed (ADR 81 EAD7).

## Step 2. URI schemes (EAD9)

**Do:** in a terminal run:

```
reg query "HKCR\origin2\shell\open\command"
reg query "HKCR\link2ea\shell\open\command"
reg query "HKCR\origin\shell\open\command"
```

**Expect:** `origin2` is registered and points to the EA app (EAD9). `link2ea` is probably registered too.
**Note:** per scheme, registered yes/no and the executable name (no path). Closes EAD9 (first part).

## Step 3. `installerdata.xml` of the game (EAD1, EAD2, EAD3, EAD4)

**Do:** open the game folder from step 0 and look for `__Installer\installerdata.xml` (the `__Installer` folder may be hidden: enable "Hidden items" in Explorer). In PowerShell run, with your real path:

```
Format-Hex -Path "<game folder>\__Installer\installerdata.xml" -Count 4
```

Then open the file in a text editor, read only. If it does not open as readable text, it is UTF-16 (see below).
**Expect:** the file exists (EAD1).
**Note**, sanitized, copy **no** account or machine data:

- The first 4 bytes: `EF BB BF` (UTF-8 with BOM), `FF FE` (UTF-16 LE), `FE FF` (UTF-16 BE), or plain text (UTF-8 without BOM). Closes EAD3. If UTF-16, Ludiary should still read it (ADR 81 point 2).
- The root tag: `DiPManifest` (current, EAD1) or `game` (old Origin, EAD4).
- How many `contentID` elements there are and their shape (for example 8 digits, or `Origin.SFT.…`, or `OFB-EAST:…`). Write the IDs: they are product IDs (EAD2). Is the first one the base game?
- The `locale` values of each `gameTitle` (for example `en_US`) and whether the title text has `&amp;`, `&#8482;` or similar entities.
- What `runtime/launcher/filePath` contains: a plain path, or a registry reference in brackets like `[HKEY_LOCAL_MACHINE\…]file.exe`. Replace the folder part with `<path>`.
- Whether the file contains anything personal (user name, e-mail, machine name). If yes, write only "yes" and the tag name, never the value. If a `<!DOCTYPE` or `CDATA` appears, write it.

## Step 4. `Origin Games` in the registry (EAD6)

**Do:** in a terminal run:

```
reg query "HKLM\SOFTWARE\WOW6432Node\Origin Games" /s
```

**Expect:** it may not exist, or have a subkey per `contentID` (also for DLC).
**Note:** subkey exists for the game yes/no; does any value carry the game folder (value name only, and the path form with `<user>` or `<path>`); are there subkeys of games you do not have installed (they would show that the key is not cleaned on uninstall). Closes EAD6 (first part).

## Step 5. Files that give a non-default library folder (EAD6)

**Do:** check whether these exist (Explorer or `dir`):

- `C:\ProgramData\EA Desktop\machine.ini` (or `machine.inf`)
- `%LOCALAPPDATA%\Electronic Arts\EA Desktop\user_*.ini`

If they exist, open them read only and look for `downloadinplacedir`.
**Expect:** unknown (EAD6 has no source tested on a machine).
**Note:** only: which files exist; whether the key `downloadinplacedir` exists (yes/no, exact key name); the **shape** of the path value (for example `F:\Juegos EA ñ`, drive and form only). Do not copy the rest of the file: it may hold account data.

## Step 6. Automatic detection in Ludiary (EAD1, EAD5)

**Do:** start Ludiary. In Settings > "Carpetas de juegos", under "Cómo se detectan los juegos instalados" choose "Automática y carpetas manuales". Press "Escanear ahora". Open the Library.
**Expect:**

- Settings > "Ubicaciones" lists `C:\Program Files\EA Games` as "Detectada automáticamente" (EAD5).
- The library shows the game under EA with the **title of the file** (not the folder name) and the gradient fallback, **not** a cover (covers are out of this cut, point 5; EAD14).
- One EA entry per game. No extra EA entry that is not a game, and no DLC entry (EAD10).
- If the second game is in `F:\Juegos EA ñ`, it does **not** appear yet (not a default folder).

**Note:** the title as shown (a game name is not personal); gradient yes/no; number of EA entries against the number of games installed; the folder path shown by Settings, sanitized. The title is the one from `en_US` even if the interface is in Spanish.

## Step 7. Play with the EA app closed, then open (EAD8, EAD9, EAD11)

**Do:**
1. Close the EA app fully (also from the tray; check Task Manager for `EADesktop.exe` and `EALauncher.exe`). Press "Jugar" on the game in Ludiary.
2. Close the game. Leave the EA app open and signed in. Press "Jugar" again.
3. If the file had **several** `contentID` (step 3), this is the key test of EAD8: the URI sent has all of them (stored one first). Both runs above already use that form.

**Expect (both times):** the toast says "Abriendo en EA…" (`game.launching`); the EA app opens (it may ask you to sign in the first time) and the game starts; its window is visible. No error from Ludiary.
**Note:** per run: app started by itself yes/no; did it ask for login; game started yes/no; any message from Windows or from the app (for example "you do not own this", "access denied"). Closes EAD11 (works closed and open).

**If it fails** (nothing happens, error in the EA app, wrong game): press Win+R and try, one at a time, with the first ID of step 3:

```
origin2://game/launch?offerIds=<first ID>
origin2://game/launch?offerIds=<ID 1>,<ID 2>
```

Write which works and which fails, and whether the order of the IDs matters. If only one ID works, the connector must pass one ID (ADR 81 point 4: one-line change, assertion and test in the same commit). Closes EAD8. Also write whether the failure of decision 22 (URI failing in some games) reproduces, and whether the failing form was `origin://` or an `Origin.SFT.…` ID (EAD9).

## Step 8. Desktop shortcut made by the EA app

**Do:** in the EA app open the game and look for a way to create a desktop shortcut (properties or "…" next to Play). If it exists, right-click the new shortcut > Properties and read the **Target** or **URL**. Do not edit or run it. Delete the shortcut afterward.
**Expect:** a target of the form `origin2://game/launch/?offerIds=…` or `link2ea://…`, or no option at all.
**Note:** the target with the IDs kept, and nothing else; the exact form of the scheme (`origin2` or `link2ea`) and of the query (`launch?` or `launch/?`); `.url` or `.lnk`. If the app has no such option, write NOT CHECKED. This is context only; it does not close an assumption by itself.

## Step 9. Only manual folders (ADR 42)

**Do:** Settings > "Carpetas de juegos" > choose "Solo las carpetas que yo indique". Press "Escanear ahora". Look at the Library. Then press "Añadir carpeta" and add the folder with the game (`C:\Program Files\EA Games`, or `F:\Juegos EA ñ` for the second game), and scan again. Finally go back to "Automática y carpetas manuales" and scan.
**Expect:**

- After the first scan the default-folder game **disappears**. No warning about automatic detection appears on the EA card (it does not apply to EA, unlike Ubisoft).
- After adding the folder by hand the game **comes back** with the same title. With `F:\Juegos EA ñ` the second game also appears (spaces and "ñ" in the path work).
- After going back to automatic, the games appear again, without duplicates.

**Note:** game gone yes/no; game back with the manual folder yes/no (default and `ñ` folders separately); duplicates yes/no; any warning shown. Also try "Configurarlo más tarde" (the onboarding option) if you can reach it: expect no EA games.

> In the current simulated build "Añadir carpeta" may add a sample path instead of a picker (`settings.folders.simulatedPicker`: «En esta versión simulada, «Añadir carpeta» añade una ruta de ejemplo...»). If so, mark the manual-folder part NOT CHECKED and report it to the programmer; the mode switch can still be checked.

## Step 10. Uninstall from the EA app (EAD13)

**Do:**
1. Uninstall the game from the EA app. Wait until it finishes.
2. Look at its folder in Explorer: does the game folder exist, and does `__Installer` remain inside it?
3. In Ludiary press "Escanear ahora" and open the Library.

**Expect:** the game folder is removed together with `__Installer` (EAD13) and the game disappears from the library.
**Note:** game folder left yes/no; `__Installer\installerdata.xml` left yes/no; game gone yes/no; if the folder or file remained and the game still shows, that is the FAIL of EAD13: write what else the leftovers contain (file names only) so the architect can choose another condition. If you press "Jugar" before scanning: no crash (either the message for a game no longer installed, or a clear error). Reinstall the game afterward for step 11 if you want a clean log.

## Step 11. Exported log has no paths or titles

**Do:** after steps 6 to 10, go to Settings > "Privacidad y registros" > "Exportar registros" > "Exportar". If the web export is still simulated, read the real files in `%LOCALAPPDATA%\Ludiary\logs` instead, read-only, in a text editor. Search for: the game title, the folder name, `EA Games`, `Origin Games`, `Juegos EA`, `ñ`, `F:\`, `F:/`, `C:\Program Files`, `C:\Users`, the Windows user name, `EA Desktop`, `EADesktop.exe`, `EALauncher.exe`, `.exe`, `installerdata`, `origin2://`.
**Expect:** none of those appear. Only numbers and codes: offer IDs, counters (`invalidFiles`, `invalidIds`, `duplicates`), result codes. The Play entry names the connector and the result, never a path or a title (ADR 81, point 3 and 4).
**Note:** OK or FAIL. If FAIL, report the file name pattern (`ludiary-YYYYMMDD`), the line number and the kind of leak (path, title, user name), never the leaked text. Do not share the file. Closes the log privacy requirement (ADR 35).

## Step 12. Play without the EA app (optional)

**Do:** with the game saved in Ludiary and its folder still on disk, remove the app in one of two ways:
- uninstall the EA app (the game stays in Ludiary until the next scan; do **not** scan), or
- rename `C:\Program Files\Electronic Arts\EA Desktop\EA Desktop` to something else (for example add `-old`; needs administrator rights), and undo it afterwards.

Then press "Jugar" on the game in Ludiary.
**Expect:** the message «No se encuentra la app de EA. Instálala desde ea.com y vuelve a intentarlo» (`connectors.ea.errors.launcherMissing`, text from ADR 81), and no crash and no empty Windows dialog.
**Note:** message shown yes/no and its real text; what Windows did (nothing, an "open with" dialog, an error); if you only renamed the folder, the `origin2` key still points to it: write that. Mark NOT CHECKED if you skip it. Undo the rename afterwards, or reinstall the EA app.

## Extra checks while you are here

- **EAD10 (DLC):** if you installed an expansion or pack of the game, expect no separate EA entry for it. NOT CHECKED if you have none.
- **EAD12:** only if you own an EA game on Steam or Epic and have it installed. Look for `__Installer\installerdata.xml` in its folder; add that folder in Ludiary only as a manual folder. Expect it to appear under EA and Play via `origin2` to maybe fail. NOT CHECKED if you have none.

## Closing the test

1. Fill one line per assumption EAD1 to EAD14: OK, FAIL or NOT CHECKED, with the sanitized note.
2. Give the lines to the architect to update the assumptions list in ADR 81.
3. If a step FAILS because EA changed something (file format, URI form, folder), the connector and its fixtures must be updated together (ADR 19). If EAD8 fails (several IDs), see ADR 81 point 4. If EAD13 fails, the architect decides a stronger "installed" condition.
4. Delete the scratch notes file. No credential, log or screenshot with personal data goes into the repository.

## Summary table

| Step | Closes |
|---|---|
| 0 | setup; folder names |
| 1 | EAD7 |
| 2 | EAD9 (schemes registered) |
| 3 | EAD1, EAD2, EAD3, EAD4 |
| 4 | EAD6 (Origin Games key) |
| 5 | EAD6 (machine.ini / user ini) |
| 6 | EAD1, EAD5, EAD10, EAD14 (end to end in Ludiary) |
| 7 | EAD8, EAD9, EAD11 |
| 8 | context for the URI form |
| 9 | manual folders (ADR 42, 81 point 3) |
| 10 | EAD13, uninstall behavior |
| 11 | log privacy (ADR 35) |
| 12 | app missing message (ADR 81 point 4) |
| extra | EAD10 (DLC), EAD12 |
