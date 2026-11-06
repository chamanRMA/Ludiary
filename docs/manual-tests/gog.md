# Manual test: GOG first cut (ADR decision 76, point 9)

Goal: close assumptions G1 to G16 of ADR 76 on a real Windows PC. Automatic tests cannot do this.
No Steam manual guide existed in the repository, so this file sets the format: one section per step with **Do**, **Expect** and **Note** (what to write down).

Time: about 1 hour. Needs: a GOG account (free), internet, Ludiary built and running, about 2 GB of disk.

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\gog-notes.txt`).
- Before copying anything into the ADR, sanitize it: replace the Windows user name with `<user>`, the account name and e-mail with nothing, and keep only relative paths. Example: `X:\Juegos GOG Ñ\Beneath a Steel Sky`. Never paste tokens, cookies, account IDs or the full log.
- Do not commit screenshots that show your account name.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

## Step 0. Install GOG Galaxy and the test game

1. Download GOG Galaxy from gog.com and install it with defaults. Sign in.
2. In the GOG store, add **Beneath a Steel Sky** (product 1207658695, free) to your account.
3. In Galaxy, go to Settings > Games > Default installation folder (wording may vary) and set it to `X:\Juegos GOG Ñ` (a folder with spaces and an "Ñ"; use another drive letter if you have no `D:`). Create the folder first if Galaxy asks.
4. Install the game from Galaxy. Wait until it finishes. Close the game if it opens by itself.
5. Optional, to test a console program (step 11): also add and install any free GOG game that uses DOSBox.

**Expect:** the folder `X:\Juegos GOG Ñ\Beneath a Steel Sky` exists and contains the game files.
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

## Step 4b. Play through Galaxy, the default (ADR 76 point 12.8, GG1 to GG7)

Step 4 was written for direct launch. Since 5-11-2026 Play goes through GOG Galaxy by default; the choice is in Settings > Stores > GOG ("Through GOG Galaxy" / "Directly").

**Do:**
1. Default setting, Galaxy fully closed: press Play. Repeat with Galaxy open.
2. Use a game whose folder has spaces and `ñ` (for example `X:\Games ñ\My Game`).
3. If you have a game installed with the offline installer, try it too.
4. Switch to "Directly" and press Play: the game opens without Galaxy, as in step 4.
5. Optional: sign out of Galaxy or uninstall it, set the mode back to "Through GOG Galaxy" and press Play: it must open directly.
6. With a game that has cloud saves, see whether Galaxy syncs before the game starts.
7. Export the logs: no path and no arguments in them.

**Expect:** step 1, Galaxy opens (if closed) and starts the game; step 4, no Galaxy.
**Note:** game opened or not with spaces and `ñ` (GG1: if not, through Galaxy is withdrawn); Galaxy took the foreground or not (GG2); closed vs open behaviour (GG3, GG4); offline-installer game (GG5); cloud sync (GG6).

## Step 5. Only manual folders (ADR 42)

**Do:** Settings > Game folders > set the mode to "only manual folders". Press "Scan now": the automatic entries go away and the game disappears. Press "Add folder" and choose `X:\Juegos GOG Ñ` (the library) and scan.
**Expect:** the game appears again, same title. Play works.
**Note:** whether it worked also by adding the game folder itself instead of the library. Then set the mode back to automatic.

> In the current simulated build "Add folder" may add a sample path, not a picker (see `settings.folders.simulatedPicker`). If so, mark this step NOT CHECKED and report it to the programmer.

## Step 6. Uninstall

**Do:** uninstall the game from Galaxy. Back in Ludiary press "Scan now".
**Expect:** the game disappears from the library. Press Play before scanning (reinstall first if needed to test it): a clear "not installed" message, no crash.
**Note:** result. Reinstall the game afterward for steps 8 to 10.

## Step 7. Offline installer without Galaxy (G2, optional)

**Do:** from gog.com, library, download the offline installer of the game. Install it to another folder, for example `X:\Offline GOG Ñ`, with Galaxy not involved. Press "Scan now" in Ludiary.
**Expect (G2):** either it appears by itself, or only after adding its folder (step 5). Both are acceptable, we just need to know which.
**Note:** did it appear alone? Did `reg query` (step 1) show a new subkey for it? Did it use `C:\Program Files (x86)\GOG Galaxy\Games` as default?

## Step 8. DLC (G5, optional)

**Do:** only if you have a GOG game with an installed DLC. Scan.
**Expect:** only the base game shows; the DLC does not appear as a game.
**Note:** the DLC `.info`: its `rootGameId` equals the base `gameId`? If no such game, NOT CHECKED.

## Step 9. Exported log has no paths or arguments

**Do:** after steps 3 to 6, go to Settings > "Privacy and logs", export the log, and open the file in a text editor. Search for: `Juegos GOG`, `Ñ`, `Beneath`, the Windows user name, `scummvm`, `.exe`, `--`, `X:\`, `C:\Users`.
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

## Account (ADR 77)

Goal: close assumptions GA1 to GA13 of ADR 77 with your real GOG account. Needs: Galaxy installed, Cold Waters installed, a GOG account with several owned games (some not installed, ideally one hidden on gog.com), Ludiary running, about 1 hour (step A6 needs a 30 minute wait).
Same rules for notes as above. Extra rules: never write down the code, any token, the account name or the e-mail. Do not paste the address of the final page anywhere (it contains the code). Do not use the browser address bar screenshot.
Run A1 in Chrome, Edge and Firefox if you can (at least in your default browser). Disconnect between browsers.

### A1. Connect (GA1, GA2, GA12, GA13)

**Do:** Settings > GOG card > Connect.
1. A new tab opens with the GOG login. Sign in. At the end you see a nearly blank page.
2. Wrong input first. Paste an address from another host, for example `https://example.com/?code=abcdefghijklmnop`. Then paste `https://embed.gog.com/on_login_success?origin=client` (no `code`). Then paste plain text.
3. Copy the full address of the final page from the bar, paste it in the field, and press Connect.

**Expect:**
- Step 2: each time the format error appears, you stay on the same step with the same link, and nothing is sent to GOG.
- Step 3: the card shows connected. The address was `https://embed.gog.com/on_login_success?origin=client&code=...` (GA2).
- The field hides the pasted text (it is a secret field).
**Note:** only the shape of the code: its length and which characters it uses (letters, digits, `-`, `_`; anything else?). Does it fit `^[A-Za-z0-9_-]{10,512}$` (GA12)? If the address did not match the form above, write the host and path only. If Connect fails with "unexpected response", that may be GA13 (token shape): write only that. GA1 holds if GOG accepted the exchange; write FAIL with the HTTP status class if it rejected it. Also try pasting a used code again: expect the "code expired or already used" message (GA7); write the message key, not the code.

### A2. Connected as (GA10)

**Do:** after A1, look at the GOG card.
**Expect:** "Connected as <your GOG user name>".
**Note:** shows a name: yes/no. If only "Connected", GA10 is not confirmed (the connector still works). Do not write the name.

### A3. Not installed games (GA5, GA6)

**Do:** open the Library, filter by GOG. Count the games under GOG that are not installed. Compare with your library on gog.com, not counting DLC (and not counting movies if gog.com lists them separately).
**Expect:**
- Not installed games appear with a grey veil and an Install button.
- The number matches. A game hidden on gog.com does appear (GA5). No owned game is missing (GA6).
- Installed games (Cold Waters) have no veil.
**Note:** the two counts and whether a hidden game appeared. For each missing game write its numeric product ID (from the gog.com page URL or `https://api.gog.com/products?ids=<id>`), not its title. If extra items appear that are not games (movies, packs, DLC), write their product type (`game_type`) if you can see it, not the title.

### A4. Cold Waters appears once

**Do:** look for Cold Waters in the library.
**Expect:** a single entry, installed, with the title from the API (spelling may differ from the local one). Its DLC (the OST) does not appear.
**Note:** one entry yes/no; DLC visible yes/no. If duplicated, write the two titles' differences (e.g. a trademark sign), not the titles themselves if they identify nothing else.

### A5. Install opens Galaxy (GA8, GA9)

**Do:**
1. Press Install on a not installed game.
2. In a terminal run:
```
reg query "HKLM\SOFTWARE\WOW6432Node\GOG.com\GalaxyClient\paths"
reg query "HKCU\Software\Classes\goggalaxy"
reg query "HKLM\SOFTWARE\Classes\goggalaxy"
```
**Expect:** Galaxy opens (or comes to front) on the game page with its own Install button. Nothing installs without your confirmation in Galaxy. This closes GA8. The first query has a `client` value (GA9). Ludiary shows no error.
**Note:** Galaxy opened on the right game page yes/no; whether Galaxy was closed or running before; whether it asked anything; which of the two `goggalaxy` keys exists (names only, no paths). Do not confirm the install, unless you want a game on disk.

### A6. Install without Galaxy (optional)

**Do:** only if you dare. Close Galaxy completely. Rename the Galaxy folder (the one in the `client` value) to something else, or uninstall Galaxy. Press Install in Ludiary.
**Expect:** the message "To install this game you need GOG Galaxy" (and no crash, no empty window). Undo the rename afterwards.
**Note:** message shown yes/no; what Windows did (nothing, an "open with" dialog, an error). If you rename the folder, the `goggalaxy` key still points to it: write that. Mark NOT CHECKED if you skip it.

### A7. Sync again (GA3, GA4, GA11)

**Do:** press Sync on the GOG card. Wait more than 30 minutes (the access token lasts about 1 hour, so a wait of 70 minutes tests it best) and press Sync again. Do it a third time after closing and reopening Ludiary.
**Expect:** it stays connected each time, no "reconnect" message, the library keeps its games. This shows token renewal works and Ludiary stores the new token (GA4).
**Note:** connected after each sync yes/no. Any 429 or "rate limited" message (GA11). If you stop using Ludiary for days, note whether it later asks to reconnect and after how long (GA4 session life, this one is a long-term note).

### A8. Disconnect (veil stays)

**Do:** Settings > GOG card > Disconnect. Open the Library.
**Expect:** the not installed games keep the grey veil and remain visible (or stay as the web shows them); Install no longer works as an account game or shows reconnect. Cold Waters is still playable. The card shows disconnected.
**Note:** veil kept yes/no; Cold Waters plays yes/no; did Install still open Galaxy (it should still be allowed, note either way).

### A9. Reconnect

**Do:** connect again as in A1 (a fresh login and a new address).
**Expect:** connected, "Connected as <name>", the not installed games are live again, with no duplicates and Cold Waters still once.
**Note:** duplicates yes/no.

### A10. Expired session (GA7, optional)

**Do:** on gog.com, close all sessions (or change the password). In Ludiary press Sync on the GOG card.
**Expect:** the card says to reconnect ("expired"), the library is left as it was with the veil. Reconnect works.
**Note:** message shown yes/no. This changes your password flow, so skip it if you do not want it: mark NOT CHECKED.

### A11. Log review (ADR 35)

The web export is still simulated, so read the real log files.

**Do:** after A1 to A9, open `%LOCALAPPDATA%\Ludiary\logs` and open each file in a text editor, read-only. Search for:
- `code=` and `on_login_success`
- `Bearer`, `access_token`, `refresh_token`, `client_secret`, `authorization`
- any run of 64 or more letters, digits, `-` or `_` in a row (use the regex search `[A-Za-z0-9_-]{64,}`)
- your GOG user name and your e-mail address (or the part before `@`)
- the Windows user name (`C:\Users\`)
- `46899977096215655` (the Galaxy client id; it is public, but note whether it appears)

**Expect:** none of those, except the client id. Only IDs, counters and codes (for example the number of games and the error code).
**Note:** OK or FAIL. If FAIL, report the file name pattern (`ludiary-YYYYMMDD`), the line number and the kind of leak (token, code, e-mail, user name), never the text. Do not share the file. If you find a leak, treat the token as burnt: sign out all sessions on gog.com.

### Account summary

| Step | Closes |
|---|---|
| A1 | GA1, GA2, GA12, GA13, GA7 (used code) |
| A2 | GA10 |
| A3 | GA5, GA6 |
| A4 | Cold Waters single entry, DLC hidden |
| A5 | GA8, GA9 |
| A6 | Install without Galaxy (optional) |
| A7 | GA3, GA4, GA11 |
| A8, A9 | disconnect and reconnect |
| A10 | GA7 (optional) |
| A11 | log privacy (ADR 35) |

If a step FAILS because GOG changed a format (login address, token response, `user/data/games`, `products`), update the connector and its recorded responses (`connectors/gog/fixtures/`) together (ADR 19). Revoke your sessions on gog.com after the test if you want to be tidy.

## Closing the test

1. Fill one line per assumption G1 to G16 (and GA1 to GA13 for the account part): OK, FAIL or NOT CHECKED, with the sanitized note.
2. Give the lines to the architect to update the assumptions list in ADR 76 and ADR 77.
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
| A1 to A11 | GA1 to GA13 (see "Account summary") |
