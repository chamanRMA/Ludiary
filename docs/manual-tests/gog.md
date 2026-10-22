# Manual test: GOG first cut (ADR decision 76, point 9)

Goal: close assumptions G1 to G16 of ADR 76 on a real Windows PC. Automatic tests cannot do this.
No Steam manual guide existed in the repository, so this file sets the format: one section per step with **Do**, **Expect** and **Note** (what to write down).

Time: about 1 hour. Needs: a GOG account (free), internet, Ludiary built and running, about 2 GB of disk.

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\gog-notes.txt`).
- Before copying anything into the ADR, sanitize it: replace the Windows user name with `<user>`, the account name and e-mail with nothing, and keep only relative paths. Example: `D:\Juegos GOG Ñ\Beneath a Steel Sky`. Never paste tokens, cookies, account IDs or the full log.
- Do not commit screenshots that show your account name.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

## Step 0. Install GOG Galaxy and the test game

1. Download GOG Galaxy from gog.com and install it with defaults. Sign in.
2. In the GOG store, add **Beneath a Steel Sky** (product 1207658695, free) to your account.
3. In Galaxy, go to Settings > Games > Default installation folder (wording may vary) and set it to `D:\Juegos GOG Ñ` (a folder with spaces and an "Ñ"; use another drive letter if you have no `D:`). Create the folder first if Galaxy asks.
4. Install the game from Galaxy. Wait until it finishes. Close the game if it opens by itself.
5. Optional, to test a console program (step 11): also add and install any free GOG game that uses DOSBox.

**Expect:** the folder `D:\Juegos GOG Ñ\Beneath a Steel Sky` exists and contains the game files.
**Note:** the real default library path Galaxy proposed (sanitized) for G2.

## Step 1. Registry (G1)

**Do:** in a terminal run:

```
reg query "HKLM\SOFTWARE\WOW6432Node\GOG.com\Games" /s
```

**Expect:** a subkey `1207658695` with the value `path` pointing to the game folder.
**Note:** which values exist (`path`, `gameID`, `gameName`, `exe`, `launchCommand`, `dependsOn`; names only, no paths). Closes G1.

## Step 2. The `.info` file (G3, G4, G5, G15)

**Do:** open `goggame-1207658695.info` in the game folder with a text editor. Do not edit it.
**Expect:** it is in the root of the game folder (G3), valid JSON, with `gameId`, `rootGameId`, `name` and `playTasks`.
**Note**, sanitized:

- `gameId`, `rootGameId` (present or not, same or different), `name`.
- The primary task: `type` (`FileTask`?), `isPrimary`, `path`, `arguments`, `workingDir`. Is `path` relative (G4)? Is `arguments` one string? Does it open ScummVM with quoted arguments (G15)?
- Whether other `goggame-*` files exist (`.hashdb`, `.ico`).
- Any game without `playTasks` (G6): mark NOT CHECKED if none.

## Step 3. Automatic detection, cover (G7, G9)

**Do:** close Galaxy. Start Ludiary. In Settings > Game folders, make sure the mode is automatic detection. Press "Scan now". Open the Library.
**Expect:**

- Settings > "Detected automatically" lists the parent library folder (`...\Juegos GOG Ñ`), one entry, not one per game.
- The library shows Beneath a Steel Sky under GOG, with a tall cover (about 923x1300) and not the gradient fallback.
- The GOG card in Settings shows the "unofficial API" icon.

**Note:** cover shown or not (G7); open the browser developer tools, Network tab, filter `images.gog.com`: was there any redirect to another host, or a CSP error in the Console (G9)? Write only the host names.

## Step 4. Play with Galaxy closed, then open (G12, G13 not used)

**Do:**
1. Make sure Galaxy is fully closed (also from the tray). Press Play on the game in Ludiary.
2. Close the game. Open Galaxy and leave it running. Press Play again.

**Expect (both times):** the game window opens in front and visible (not hidden, not minimized). Galaxy does **not** open by itself in the first run. The toast says "Opening in GOG…".
**Note:** window visible or hidden (`windowsHide: false` check); whether Galaxy launched; whether the game complains about Galaxy missing (G12); whether the quoted ScummVM arguments worked, meaning the game really started and not only the launcher (G10, G15).

## Step 5. Only manual folders (ADR 42)

**Do:** Settings > Game folders > set the mode to "only manual folders". Press "Scan now": the automatic entries go away and the game disappears. Press "Add folder" and choose `D:\Juegos GOG Ñ` (the library) and scan.
**Expect:** the game appears again, same title. Play works.
**Note:** whether it worked also by adding the game folder itself instead of the library. Then set the mode back to automatic.

> In the current simulated build "Add folder" may add a sample path, not a picker (see `settings.folders.simulatedPicker`). If so, mark this step NOT CHECKED and report it to the programmer.

## Step 6. Uninstall

**Do:** uninstall the game from Galaxy. Back in Ludiary press "Scan now".
**Expect:** the game disappears from the library. Press Play before scanning (reinstall first if needed to test it): a clear "not installed" message, no crash.
**Note:** result. Reinstall the game afterward for steps 8 to 10.

## Step 7. Offline installer without Galaxy (G2, optional)

**Do:** from gog.com, library, download the offline installer of the game. Install it to another folder, for example `D:\Offline GOG Ñ`, with Galaxy not involved. Press "Scan now" in Ludiary.
**Expect (G2):** either it appears by itself, or only after adding its folder (step 5). Both are acceptable, we just need to know which.
**Note:** did it appear alone? Did `reg query` (step 1) show a new subkey for it? Did it use `C:\Program Files (x86)\GOG Galaxy\Games` as default?

## Step 8. DLC (G5, optional)

**Do:** only if you have a GOG game with an installed DLC. Scan.
**Expect:** only the base game shows; the DLC does not appear as a game.
**Note:** the DLC `.info`: its `rootGameId` equals the base `gameId`? If no such game, NOT CHECKED.

## Step 9. Exported log has no paths or arguments

**Do:** after steps 3 to 6, go to Settings > "Privacy and logs", export the log, and open the file in a text editor. Search for: `Juegos GOG`, `Ñ`, `Beneath`, the Windows user name, `scummvm`, `.exe`, `--`, `D:\`, `C:\Users`.
**Expect:** none of those appear. Only IDs (`1207658695`), counters and codes. The Play entry names the connector and the result, never the path.
**Note:** OK or FAIL. If FAIL, report the line number and the kind of leak, not the leaked text. Do not share the file.

## Step 10. Leave Ludiary with the game open (the game survives)

**Do:**
1. Press Play and leave the game open.
2. Stop Ludiary from the tray menu (Exit), or with `Ludiary.exe --stop`.
3. Check the game is still running (it still has its window; Task Manager shows its process).
4. Open Ludiary again from the shortcut, with the game still open. Compare the port in the address bar (`ludiary.localhost:<port>`) with the one before.
5. Open the Library and press Sync/Scan.

**Expect:** the game stays open after stopping Ludiary (this is the "game outlives the server" claim, point 4). Ludiary starts on the **same port** and the library works.
**Note:** game survived yes/no; same port yes/no; any error shown. Close the game afterward.

## Step 11. Console executable (G16)

**Do:** if you installed a DOSBox-based game (step 0.5), press Play in Ludiary.
**Expect:** the DOSBox window (and its console window, if it normally has one) appears.
**Note:** window visible? Console visible? If the process runs without a visible window (check Task Manager), that is G16 failing: report it, the fix is a separate decision (never a shell). If no game uses a console, write NOT CHECKED.

## Extra checks while you are here

- **G11:** if any installed game asks for administrator rights, press Play. Expect the message "Windows did not allow the game to open...". NOT CHECKED if none.
- **G8:** with 5 or more GOG games installed, the covers load and the browser shows no 429 errors. NOT CHECKED otherwise.
- **G13, G14:** not used in this cut, nothing to do.

## Closing the test

1. Fill one line per assumption G1 to G16: OK, FAIL or NOT CHECKED, with the sanitized note.
2. Give the lines to the architect to update the assumptions list in ADR 76.
3. If something FAILS because GOG changed a format (`.info`, GamesDB), the connector and its recorded responses (`connectors/gog/fixtures/`) must be updated together (ADR 19).
4. Delete the scratch notes file. No credential, log or screenshot with personal data goes into the repository.

## Summary table

| Step | Closes |
|---|---|
| 1 | G1 |
| 2 | G3, G4, G5, G6, G15 |
| 3 | G7, G9 |
| 4 | G10, G12, G15 |
| 5 | ADR 42 manual-only mode |
| 6 | uninstall behavior |
| 7 | G2 |
| 8 | G5 |
| 9 | log privacy (ADR 35) |
| 10 | process survives, same port (ADR 26, 28) |
| 11 | G16 |
| extras | G8, G11 |
