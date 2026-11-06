# Manual test: Epic Games, cut 1 and cut 2 (ADR decision 78, point 11)

Goal: close assumptions E1 to E11 (cut 1) and EA1 to EA10 (cut 2, account) of ADR 78 on a real Windows PC. Automatic tests cannot do this: there is no recorded Epic response in the repository on purpose (ADR 78, point 10).
Same format as `gog.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). Quotes in "..." are the Spanish texts of the web UI; switch Ludiary to English if you prefer.

Time: cut 1 about 1 hour (plus the game download); cut 2 about 1 hour plus waits (A6 needs 30 minutes, and one check the next day). Needs: an Epic account, internet, Ludiary built and running, the Epic launcher (here in `X:\Epic Games\Launcher`, no game installed yet), about 2 GB of disk.

**Do cut 2 only after cut 1 passes** (ADR 78, point 1).

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\epic-notes.txt`).
- Before copying anything into the ADR, sanitize it: replace the Windows user name with `<user>`, remove the account name and e-mail, keep only relative paths, and for IDs write the **shape** (length and characters), not the value.
- Never write down or paste: `authorizationCode`, `exchangeCode`, `sid`, any `eg1~` token, cookies, the account ID, the full log. Do not commit screenshots that show your account name.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

# Part 1. Cut 1: installed games, Play and covers

## Step 0. Get and install the test game

1. Open the Epic launcher (`X:\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe`) and sign in.
2. Get **Home - A Unique Horror Adventure** (free in the Epic store from 22-10-2026 17:00 to 29-10-2026 16:00, Spanish mainland time; small 2D game). **Do it before 29-10-2026.** If you already own another small Epic game, use that one and write down the substitute.
3. Install it in a folder with spaces and an "ñ", for example `X:\Epic Games ñ` (the launcher asks for the install folder in the install dialog; create the folder first if needed).
4. Wait until it finishes. If the game opens by itself, close it. Close the launcher fully (also from the tray) when the step says so.

**Expect:** the folder `X:\Epic Games ñ\<game folder>` exists with the game files.
**Note:** nothing yet beyond the game's folder name shape.

## Step 1. The `.item` manifest (E1, E2, E6)

**Do:** open `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests` and open the new `.item` file in a text editor (read-only, do not edit).
**Expect (E1):** one `.item` file exists there even though the launcher is on `E:`.
**Note**, sanitized:

- The names of all fields (names only).
- The values of `AppCategories`, `bIsIncompleteInstall` and `MainGameAppName` (present or not).
- Only the **shape** (length and characters) of `CatalogNamespace`, `CatalogItemId` and `AppName`: is `CatalogItemId` 32 lowercase hexadecimal? Does `AppName` use anything outside `[A-Za-z0-9._-]` (E6)? Is the letter case the same as in the file name or other places?
- Does `AppCategories` contain `games` (E2)?
- Does the file have a BOM? (optional, a hex viewer is enough)
- Look in the game folder for `.egstore` and `*.mancpn`: does it exist, and which field names does it have (E10)? Names only.

## Step 2. Launcher registry (E5)

**Do:** in a terminal run:

```
reg query "HKCU\Software\Epic Games\EOS" /v ModSdkCommand
reg query "HKCU\Software\Classes\com.epicgames.launcher\shell\open\command"
```

**Expect (E5):** `ModSdkCommand` exists and points to `EpicGamesLauncher.exe` in `X:\Epic Games\Launcher\...`. The second query shows the launcher with `%1`.
**Note:** whether `ModSdkCommand` exists (yes/no), whether it points to the `EpicGamesLauncher.exe` of `E:` (yes/no; write only `X:\...\EpicGamesLauncher.exe`). If the value is missing or points elsewhere, E5 is FALSE and cut 2 will not check for the launcher on Install. Also list which other values exist in `HKCU\Software\Epic Games\EOS` (names only).

## Step 3. Automatic detection and cover (E1, E7, E8, E11)

**Do:** close the launcher. Start Ludiary. In Ajustes > "Carpetas de juegos", make sure "Cómo se detectan los juegos instalados" is "Automática y carpetas manuales". Press "Escanear ahora". Then open "Biblioteca" and use "Filtrar por tienda".
**Expect:**

- Ajustes > "Ubicaciones" lists, as "Detectada automáticamente", the Epic data folder (`C:\ProgramData\Epic\EpicGamesLauncher\Data`) and the parent library folder of the game (`X:\Epic Games ñ`): one entry, not one per game.
- The game shows under Epic with its title and a **tall cover** (vertical image), not the gradient fallback.
- The Epic card in Ajustes > "Tiendas" shows "Se detecta lo instalado" (or "Solo instalados") and the "Vía no oficial: más información" icon.

**Note:** cover shown yes/no (E7: the catalog accepted the application token). If it is not shown, open the browser developer tools, Network tab, and write **only the host names** of the image requests (or of the Console CSP error) (E8). Also write whether the title is the real one or the fallback `Epic <AppName>`. Do not write the AppName.

## Step 4. Play with the launcher closed, then open (E3, E9)

**Do:**
1. Make sure the Epic launcher is fully closed (also from the tray). Press "Jugar" on the game in Ludiary.
2. Close the game. Open the launcher and leave it running. Press "Jugar" again.

**Expect (both times):** the toast says "Abriendo en Epic Games…" (or the store name as the web shows it). The launcher starts in the background if it was closed, **without showing its window**, and then the game window opens in front and visible.
**Note:** launcher started by itself yes/no; launcher window shown yes/no; game really started (not only the launcher) yes/no (E3); whether the game needed the launcher or asked to sign in (E9); time from click to game window (rough seconds). If Windows shows an "open with" dialog instead, write it (the URI scheme failed).

## Step 5. Disable the library folder

**Do:** Ajustes > "Carpetas de juegos" > "Ubicaciones": turn off "Usar X:\Epic Games ñ" (the library folder of the game). Press "Escanear ahora" and look at the Library. Then turn it back on and scan again.
**Expect:** with it off, the game disappears from the library (it is skipped, not an error). With it on, it comes back with the same title.
**Note:** result. Also: turn off the **Epic data folder** entry instead, scan, and write whether the game disappears (it should: no manifests, no detection). Turn it back on.

## Step 6. Only manual folders (ADR 78, point 13.3)

**Do:** Ajustes > "Carpetas de juegos" > mode "Solo las carpetas que yo indique". Press "Escanear ahora".
**Expect:** the Epic game does **not** appear (decided behavior: Epic needs its manifests). No error, no crash. Other stores keep working as before.
**Note:** result. Set the mode back to "Automática y carpetas manuales".

> In the current simulated build "Añadir carpeta" may add a sample path, not a picker (see `settings.folders.simulatedPicker`). Do not rely on it here.

## Step 7. Uninstall

**Do:** uninstall the game from the Epic launcher. Back in Ludiary press "Escanear ahora".
**Expect:** the game disappears from the library. If you press "Jugar" before scanning (reinstall first to test it), you get a clear "not installed" message or the launcher's own notice, no crash.
**Note:** result. **Reinstall the game afterwards** (Step 0.3) for Part 2.

## Step 8. Exported log has no paths, titles or IDs (ADR 35)

**Do:** after steps 3 to 7, go to Ajustes > "Privacidad y registros" > "Exportar registros" > "Exportar", and open the file in a text editor. Also read the real files in `%LOCALAPPDATA%\Ludiary\logs` (the web export is still simulated). Search for: `Epic Games ñ`, `ñ`, `Home`, the game folder name, the Windows user name, `C:\Users`, `.exe`, `ProgramData`, and any run of 32 hexadecimal characters (regex `[0-9a-fA-F]{32}`).
**Expect:** none of those. Only counters and codes (number of manifests read, skipped as incomplete or DLC, skipped by root).
**Note:** OK or FAIL. If FAIL, report the file name pattern (`ludiary-YYYYMMDD`), the line number and the kind of leak (path, title, Epic ID), never the text. Do not share the file.

## Part 1 summary

| Step | Closes |
|---|---|
| 0 | game installed (needed for everything) |
| 1 | E1, E2, E6, E10 |
| 2 | E5 |
| 3 | E1, E7, E8, E11 |
| 4 | E3, E9 |
| 5 | root rule of `scanInstalled` (point 3) |
| 6 | decision 13.3 |
| 7 | uninstall behavior |
| 8 | log privacy (ADR 35) |

# Part 2. Cut 2: account (ADR 78)

Goal: close EA1 to EA10 with your real Epic account. Needs: Part 1 passed, the game installed again, an Epic account with several owned games (some not installed; free weekly games count), Ludiary running with the cut 2 build.
Extra rules for the notes: never write down the code, any token, the account name or the e-mail. Do not paste the text of the final page anywhere (it contains the code). Blur or crop any screenshot of that page.
Run A1 in Chrome, Edge and Firefox if you can (at least your default browser). Disconnect between browsers.

## A1. Connect by pasting the JSON (EA1, EA2, EA3, EA4)

**Do:** Ajustes > "Tiendas" > Epic card > "Conectar".
1. A new tab opens with the Epic login ("Iniciar sesión en Epic Games"). Sign in (password and second factor go to `epicgames.com`, never to Ludiary). At the end you see a text between braces (`{ ... }`).
2. Wrong input first. Paste plain nonsense (for example `hola`), then `{"foo":"bar"}`, then a JSON with `authorizationCode` set to `null`. Then paste an expired or invalid code of the right shape (32 characters of `0-9a-f`) if you want to see EA6.
3. Select the **whole page**, copy it, paste it in the field with the button "Pegar" (or Ctrl+V: "Pulsa Ctrl+V") and press "Comprobar y conectar".
4. Disconnect (A8) and repeat pasting **only the code** (the value of `authorizationCode`, without quotes) from a fresh login.
5. If your browser has a "Dar formato" (pretty print) box in the page, try copying with it ticked too (Chrome).

**Expect:**
- Step 2: each time a format error appears ("No se pudo completar el inicio de sesión de Epic..." or the format text for the wizard), you stay on the same step and nothing is sent to Epic when the format is clearly wrong.
- Steps 3 to 5: the card shows connected. The field hides the pasted text (secret field).
- The final page is on `www.epicgames.com` and is a JSON with `warning`, `redirectUrl`, `authorizationCode`, `exchangeCode` and `sid` (EA2).

**Note:** only the **shape** of the code: length and characters (is it 32 characters of `0-9a-f`, lowercase? EA3). If the pattern rejected your real code, write its length and character classes. Field names of the JSON (names only). Whether the whole page, the braces-only text and the bare code were each accepted, in each browser. If Connect fails with "unexpected response", it may be a token shape problem (EA4): write only that. Also paste a **used** code again: expect "El código ha caducado o ya se usó..." (write the message, not the code). If Epic asks you to accept something on its site, write whether you saw the "corrective action" message (EA6).

## A2. Connected as (ADR 78, point 13.1)

**Do:** look at the Epic card after A1.
**Expect:** "Conectado como <your Epic display name>" (the display name comes straight from the exchange).
**Note:** shows a name yes/no. If only "Conectada", the connector still works. Do not write the name.

## A3. Not installed games (EA7, EA9, EA10)

**Do:** open the Library, "Filtrar por tienda" > Epic, and "Filtrar por estado" > "No instalados". Count the games. Compare with your library on the Epic web site (store.epicgames.com, your library page), **not counting DLC, add-ons or apps**. Time the first synchronization (click "Sincronizar" on the Epic card, count seconds until the games appear).
**Expect:**
- Not installed games appear with the grey veil, their cover and the "Instalar" button. Installed games (Home) have no veil.
- The numbers match. No owned game is missing (EA7). No DLC, app or Unreal Engine content shows as a game (EA10).
- The first sync finishes within the 60 s of the operation (EA9).

**Note:** the two counts; the total number of owned games and the sync duration in seconds (EA9); any "rate limited" message. For each missing game write its title (Epic titles are not personal data; skip it if you prefer and write the count). For each extra item that is not a game, write what it is (add-on, app, engine) if you can see it.

## A4. The installed game appears once

**Do:** find the installed game in the library.
**Expect:** a single Epic entry, installed, with the title from the API (spelling may differ from the local `DisplayName`). Its DLC (if any) does not appear.
**Note:** one entry yes/no; DLC visible yes/no. If duplicated, write what differs (letter case of the ID, a trademark sign), not the IDs.

## A5. Install opens the launcher (E4, E5)

**Do:**
1. Close the Epic launcher completely. Press "Instalar" on a not installed game.
2. Repeat with the launcher already open.
3. Optional, E5 branch: rename the launcher folder `X:\Epic Games\Launcher` temporarily (or close it and rename `Portal`), press "Instalar" again, and **undo the rename afterwards**.

**Expect:** the toast says "Abriendo Epic Games para instalar…" (store name as shown). The launcher opens (or comes to front) with **its own install dialog** for that game. Nothing installs without your confirmation in the launcher (E4). Ludiary shows no error. In step 3, if E5 holds, Ludiary says: "Para instalar este juego hace falta el launcher de Epic Games. Descárgalo de epicgames.com" with no crash.
**Note:** launcher opened on the right game yes/no; install dialog shown yes/no, or what happened instead (opened the store page, the library, nothing); whether it was closed or running before; what Ludiary and Windows showed in step 3. Do not confirm the install unless you want a game on disk.

## A6. Sync again, token renewal and session life (EA5, EA9)

**Do:** read the number `refresh_expires` in the real log (`%LOCALAPPDATA%\Ludiary\logs`, search for `refresh_expires`; it is a number of seconds, not personal data). Press "Sincronizar" on the Epic card. Wait more than 30 minutes (the 30 minute floor between syncs, ADR 50) and sync again. Close and reopen Ludiary and sync a third time. **Next day**, open Ludiary again and sync.
**Expect:** it stays connected each time, no "Hay que volver a conectar", and the library keeps its games. This shows token renewal works and Ludiary stores the new refresh token (EA5).
**Note:** the `refresh_expires` number in seconds; connected after each sync yes/no (including the next day). If it shows "Hay que volver a conectar" write how long since the last sync (this decides whether a warning on the card is needed, ADR 78 point 7). Any 429 or "rate limited" message (EA9).

## A7. Expired session (EA6, optional)

**Do:** on epicgames.com change the password (or sign out of all devices). In Ludiary press "Sincronizar" on the Epic card.
**Expect:** the card says "Hay que volver a conectar" and the text "Epic ha cerrado la sesión. Vuelve a conectar la cuenta."; the library is left as it was, with the veil ("Lista de la última sincronización correcta."). Reconnect works.
**Note:** message shown yes/no. This changes your password flow: skip it if you do not want it and mark NOT CHECKED.

## A8. Disconnect (veil stays)

**Do:** Ajustes > "Tiendas" > Epic card > "Desconectar" and confirm. Open the Library.
**Expect:** the not installed games keep the grey veil and stay visible; the installed game is still playable ("Jugar" works). The card shows "Sin conectar". The text says Ludiary deletes its Epic session from this PC and that to close all sessions you change the password at epicgames.com.
**Note:** veil kept yes/no; the installed game plays yes/no; does "Instalar" still open the launcher (note either way).

## A9. Reconnect

**Do:** connect again as in A1 (fresh login, new text).
**Expect:** connected, "Conectado como <name>", the not installed games are live again, **no duplicates**, the installed game still once.
**Note:** duplicates yes/no.

## A10. Log review (ADR 35)

The web export ("Privacidad y registros" > "Exportar") is still simulated, so read the real log files.

**Do:** after A1 to A9, open `%LOCALAPPDATA%\Ludiary\logs` and open each file in a text editor, read-only. Search for:
- `eg1~`
- `authorizationCode`, `exchangeCode`, `sid`
- `bearer`, `basic`, `access_token`, `refresh_token`, `client_secret`, `authorization`
- any run of 32 hexadecimal characters (regex `[0-9a-fA-F]{32}`) and any run of 64 or more letters, digits, `-`, `_` or `.` (regex `[A-Za-z0-9_.-]{64,}`)
- your Epic display name and your e-mail address (or the part before `@`)
- the Windows user name (`C:\Users\`)

**Expect:** none of those. Only counters and codes (number of games, pages, skipped DLC, the number `refresh_expires`, error codes).
**Note:** OK or FAIL. If FAIL, report the file name pattern (`ludiary-YYYYMMDD`), the line number and the kind of leak (token, code, e-mail, name, ID), never the text. Do not share the file. If you find a leak, treat the session as burnt: change your Epic password and sign out of all devices.

## Part 2 summary

| Step | Closes |
|---|---|
| A1 | EA1, EA2, EA3, EA4, EA6 (used code, corrective action); `json-field` with whole page, braces text and bare code |
| A2 | "Conectado como" (13.1) |
| A3 | EA7, EA9, EA10 (count, duration) |
| A4 | single entry, DLC hidden |
| A5 | E4, E5 (launcher missing), 13.2 |
| A6 | EA5, EA9 (session life, renewal) |
| A7 | EA6 (expired, optional) |
| A8, A9 | disconnect and reconnect |
| A10 | log privacy (ADR 35) |

If a step FAILS because Epic changed a format (login page, token response, library items, catalog), update the connector and its **invented** fixtures (`connectors/epic/fixtures/`) together (ADR 19, ADR 78 point 10). Revoke your sessions on epicgames.com after the test if you want to be tidy.

# Closing the test

1. Fill one line per assumption E1 to E11 and EA1 to EA10: OK, FAIL or NOT CHECKED, with the sanitized note.
2. Give the lines to the architect to update the assumption lists in ADR 78.
3. Known stale texts in the simulated web: `stores.epic.desc` and `connectors.epic.login.*` in `packages/i18n/locales/web/es.json` still say "no hay que copiar nada" (simulated flow). Cut 2 must replace them with the paste-the-JSON wording; report it to the programmer if it still shows in A1.
4. Delete the scratch notes file. No credential, log or screenshot with personal data goes into the repository.
5. Uninstall the test game when done, if you want the disk back.

## Summary table (step to assumption)

| Step | Closes |
|---|---|
| 1 | E1, E2, E6, E10 |
| 2 | E5 |
| 3 | E1, E7, E8, E11 |
| 4 | E3, E9 |
| 5, 6, 7 | root rule, decision 13.3, uninstall |
| 8 | log privacy (ADR 35) |
| A1 | EA1, EA2, EA3, EA4, EA6 |
| A2 | decision 13.1 |
| A3 | EA7, EA9, EA10 |
| A5 | E4, E5, decision 13.2 |
| A6 | EA5, EA9 |
| A7 | EA6 |
| A10 | log privacy (ADR 35) |
