# Manual test: wishlist import from Steam and GOG (ADR decision 91, points 11 and 13)

Goal: close assumptions SW1, SW2, SW3, GW1, GW2 and ITAD4 (GOG part) of ADR 91 on a real Windows PC with your own Steam and GOG accounts. Automatic tests cannot do this: they use invented responses with the shape of the documentation.
Same format as `prices.md`, `gog.md` and `epic.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). Quotes in "..." are the Spanish texts of the web UI; switch Ludiary to English if you prefer.

Time: about 1 hour. Needs: Ludiary built and running, internet, IsThereAnyDeal already connected (see `prices.md`, step 1), Steam and GOG connected (Settings > Stores), a Steam profile you can switch between public and private, a Steam wishlist with at least 4 games (one of them unreleased, if you can find one), and a GOG wishlist with at least 4 games (one of them unreleased or "coming soon", if possible; ideally with IDs that are not in ascending order of when you added them).

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\wishlists-notes.txt`).
- **Never write down or paste**: your SteamID (17 digits), a profile URL, GOG user name or e-mail, any token, the IsThereAnyDeal key, full game IDs (AppID, GOG product ID), response bodies. For IDs write only the **shape** (length, digits only or not). For the order of games use the **position** (1st, 2nd, ...) and the title in your private notes only.
- Game titles are fine in your private notes. Do not put them in the ADR; say "a Steam game" or "an unreleased GOG game" instead.
- Before copying anything into the ADR, sanitize it: no key, no e-mail, no account name, no Windows user name (use `<user>`).
- Do not open the browser developer tools Network tab and copy request URLs: the Steam request carries your SteamID. Looking is fine, copying is not.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

## Step 0. Prepare

1. Start Ludiary, open the web, and check Settings > Stores shows Steam and GOG connected, and Settings > Services shows IsThereAnyDeal connected (not "invalid").
2. Open "Comparador". Empty your watch list on purpose if you want a clean test: press "Dejar de seguir" on every item (this is the test list, not your real one; if you keep real items, they are "manual" and must survive the whole test, which is step 9).
3. Follow by hand (with "Seguir") **one game that is also on your Steam wishlist** and **one game that is not on any wishlist**. Write the position of both in your notes. These two are your "manual" items for steps 8 and 9.
4. Note the time you start, so you can tell which log lines belong to this test (step 14).

**Expect:** the Comparador shows the buttons "Importar lista de deseos de Steam" and "Importar lista de deseos de GOG", each one only if that store is connected. With a store disconnected, its button is not there.

**Note:** Ludiary version, date, browser language, how many items you followed by hand.

## Step 1. The notice before importing

**Do:** press "Importar lista de deseos de Steam". Do not confirm yet.

**Expect:** a dialog titled "Importar tu lista de deseos de Steam" that says Ludiary will read your Steam wishlist and send the identifiers of those games to IsThereAnyDeal to follow their price, and that what you added by hand does not change. It also says that games brought by an earlier import that are no longer on the list will stop being followed. Buttons "Importar" and a way to cancel. Cancel: nothing happens, no network (no new items).

**Note:** whether the text was complete and clear, and whether cancel really did nothing. Same check for the GOG button in step 7.

## Step 2. Steam, public wishlist (SW1, SW3)

**Do:**
1. In Steam, set Privacy > "Detalles de juegos" (Game details) to **Public**. Check the wishlist opens in a private browser window without logging in.
2. In Ludiary press "Importar lista de deseos de Steam" and confirm with "Importar". The button shows "Importando…".
3. Read the summary notice and the new items in the list.

**Expect:**
- A summary made of counters, for example "4 añadidos, 1 ya lo seguías, 0 sin datos en IsThereAnyDeal". Parts with zero may be omitted. No error.
- Every new item has the small label "Lista de deseos de Steam", a title, a cover (Steam image), and after a moment a price (the page asks for prices as usual).
- The item you followed by hand and that is also on the wishlist is counted in "ya lo seguías" and **does not get the label** (it stays manual).
- The order of the new items follows your wishlist priority in Steam (position 1 on Steam, first here).

**Note:**
- **SW1:** did the import work with only the SteamID and no API key (it never asked for a key)? Are the titles the right ones? Is the order the same as the Steam wishlist order (priority)? Counts of the summary: added, already followed, not found, over limit. The log does not keep the response shape (point 13 forbids IDs and titles there), so the shape is closed by the result: right titles in the right order = shape OK. FAIL if the import ends with "No se ha encontrado ningún juego..." although the profile is public.
- **SW3:** if you have an unreleased game on the wishlist, does it have its real name, or a fallback like "Steam <number>"? Write "real name" or "fallback" for the unreleased game, and how many of the items had a fallback title.
- Games "sin datos en IsThereAnyDeal": write how many, and the kind (for example "unreleased", "very new"). Not titles in the ADR.

## Step 3. Steam, hidden or empty list (SW2)

**Do:**
1. In Steam set "Detalles de juegos" to **Friends only** (or Private). Wait a minute for Steam to apply it. Check the wishlist is not visible in a private browser window.
2. Wait for the floor (10 minutes since the last Steam import; see step 11) or do this step after step 11. Press "Importar lista de deseos de Steam" and confirm.
3. Look at the notice and at the Comparador list.

**Expect:**
- The notice "No se ha encontrado ningún juego. Si tu lista de deseos de Steam no es pública, cámbialo en la privacidad de tu perfil (Detalles de juegos) y vuelve a intentarlo."
- **Nothing is removed**: the items imported in step 2 are all still there with their label.
- Steam stays "connected" in Settings > Stores (the import never changes the connection state).

**Distinguishing hidden from empty:** the app cannot tell them apart (SW2), and shows the same notice for both. The test is to compare: with "Detalles de juegos" on Public and a wishlist with games (step 2) the import brings games; with it hidden, it brings none. To also see the **empty** case, make the profile Public again, remove every game from the Steam wishlist (or use a second account with an empty list), and import: the same notice must appear and nothing is deleted. Put the wishlist back afterwards.

**Note (SW2):** result for hidden and for empty: same notice, nothing deleted? Did Steam answer without any key? Also write whether Steam needed a few minutes to apply the privacy change (that explains a wrong result). FAIL if the items disappeared or if the notice does not show.

Set "Detalles de juegos" back to Public before the next step.

## Step 4. Remove a game in Steam and import again (ADR 91, 9.2 a)

**Do:**
1. In Steam remove **two** games from the wishlist: one that was imported in step 2, and the one you also follow by hand (step 0). Do not remove the other manual item (it is not on any wishlist).
2. Make sure the floor has passed (step 11), then import again.

**Expect:**
- The summary says "1 quitado" (the imported one disappears from the Comparador).
- The game you followed by hand **stays** even though it left the wishlist, and the other manual item stays too.
- If a bought game left the wishlist (buying removes it), the same rule applies.

**Note:** whether "quitado" counted exactly the imported ones removed, and whether both manual items stayed. FAIL if a manual item vanished: that is a data loss incident for the `programador`.

## Step 5. Unfollow an imported game and import again (ADR 91, 9.3 a)

**Do:**
1. Pick an imported Steam game that is **still** on the Steam wishlist. Press "Dejar de seguir" on it.
2. Read the notice after unfollowing.
3. After the floor, import again.

**Expect:**
- After "Dejar de seguir": "Dejado de seguir. Si el juego sigue en tu lista de deseos de Steam, volverá la próxima vez que la importes."
- After the new import: the game comes back (it counts as "1 añadido") with the label.
- Unfollowing a **manual** item shows no such notice.

**Note:** result for each point. Nothing else to record unless it fails.

## Step 6. Several kinds of "nothing new"

**Do:** after the floor, import Steam again with no change in the wishlist.

**Expect:** the notice "No hay nada nuevo que importar." (or counters of "ya los seguías" only). No item changes, no duplicates.

**Note:** result.

## Step 7. GOG import (GW1, GW2, ITAD4)

**Do:**
1. Repeat step 1 with the button "Importar lista de deseos de GOG": the dialog must say GOG, with the same text.
2. Confirm "Importar". Read the notice and the new items.
3. Compare the order of the new items with your GOG wishlist order on the GOG website.

**Expect:**
- A summary with counters, and new items with the label "Lista de deseos de GOG", a title and an image.
- **Order:** GOG comes out in **ascending product ID**, not in the order of your wishlist on the GOG website. This is a known risk of the design (`JSON.parse` sorts numeric keys), not a failure. It only matters with more than 500 items: the low IDs get in first. Write whether it is so.
- **Wide images:** the catalogue has no vertical cover. GOG items may show a wide image (hero) cropped or in the plain gradient where a cover is expected. Just look: does the image look wrong (stretched, cut in a bad way) or acceptable?
- The games found by IsThereAnyDeal get prices after a moment.

**Note:**
- **GW1:** did `wishlist.json` answer with your Galaxy token (the import ran, no "GOG no ha dejado leer la lista de deseos")? Number of items vs your real GOG wishlist size. FAIL if the import ends with the GOG read error or with "No se ha encontrado ningún juego. Si tu lista de deseos de GOG está vacía..." although you have games on it. Write the shape of the product IDs only (digits only, length).
- **GW2:** do all items have the real title and an image? How many show a fallback like "GOG <number>" or no image? Is any unreleased or "coming soon" game on the list: does it have a real title? Write counts and "real" / "fallback".
- **GOG order:** the positions of your first five wishlist items on GOG and the positions they take in Ludiary (for example "GOG 1,2,3,4,5 became 3,1,5,2,4"). Say whether the result is ascending by ID (you can check by the oldest products coming first).
- **Wide images:** acceptable, ugly, or missing; how many of the items.
- **ITAD4 (GOG):** how many GOG IDs counted as "sin datos en IsThereAnyDeal" versus found. FAIL (for the GOG part of ITAD4) if almost all are "sin datos" although they are normal released GOG games: then IsThereAnyDeal does not accept GOG product IDs in the lookup. If you ran `prices.md` step 3, compare with what you wrote there.

## Step 8. GOG: remove a game, import again, and manual stays

**Do:** in GOG remove one wishlist game that was imported, then (after the floor, step 11) import GOG again. Follow by hand one GOG-wishlist game before, if you have none.

**Expect:** "1 quitado", the manual items stay, the other GOG items stay. Games from the Steam import are untouched (the removal only touches the same origin).

**Note:** result. A game on both wishlists: write which label it got. If you remove it from the store that gave the label, it disappears and comes back with the other label only after that other store is imported (known and accepted, ADR 91 point 13 b).

## Step 9. What you added by hand stays intact

**Do:** after steps 2 to 8, look at the two items from step 0.

**Expect:** both are still followed, with **no** origin label, never changed or removed by any import, and unfollowing an imported item never touches them.

**Note:** result.

## Step 10. More than 500 (optional)

**Do:** only if your wishlists add up to more than 500 followed games. Otherwise mark NOT CHECKED.

**Expect:** the summary says "N no caben: la lista admite 500" (singular "no cabe" for one). The ones in store order enter first (in GOG: lowest IDs first, see step 7).

**Note:** result and the count only.

## Step 11. The 10-minute floor

**Do:** import Steam. Press "Importar lista de deseos de Steam" again right after, then once more after 5 minutes, then after 10 minutes. Do the same with GOG (the floors are separate).

**Expect:**
- The second import is refused without a network call, with a message that gives the time when you can import again (rate limited). Nothing is changed.
- The refused one does not consume a new window (you can retry at the time shown).
- The Steam floor does not block GOG, and vice versa.
- After 10 minutes the import works again.

**Note:** whether the time shown matches about 10 minutes after the last successful import, and whether the 5-minute attempt was refused. The floor is in memory: restarting Ludiary resets it (expected).

## Step 12. GOG stays connected if the wishlist fails

**Do:**
1. Import GOG while a GOG sync is running (press "Sincronizar" on GOG in the library and, at once, import in the Comparador). Then use the GOG library normally.
2. To force a wishlist failure, disconnect your internet for the GOG import only, or block `embed.gog.com` in the Windows hosts file (undo after the test). Import GOG.

**Expect:**
- Step 1: the import waits for the sync (or the sync waits for the import); both end well; GOG stays "connected" and the next sync works (no "reconnect" request). No two refreshes of the session at once.
- Step 2: a clear error from GOG ("GOG no ha dejado leer la lista de deseos. Inténtalo más tarde; tu conexión con GOG sigue activa.", or the network one). GOG remains connected in Settings > Stores, the library still syncs, the watch list is unchanged, Steam is not affected.
- With Steam, a failure leaves Steam connected too ("Steam no ha dejado leer la lista de deseos..."), and the IsThereAnyDeal card stays as it was.

**Note:** result for each, and whether anything asked you to reconnect (FAIL if so). Remove the hosts entry afterwards.

## Step 13. Remove IsThereAnyDeal and a disconnected store (optional)

**Do:** in Settings > Services press "Desconectar" on IsThereAnyDeal and open the Comparador. Reconnect with the key. Then disconnect Steam in Settings > Stores and look at the Comparador.

**Expect:** with IsThereAnyDeal disconnected, no import buttons work (the Comparador asks to connect it); with Steam disconnected, its import button disappears and the already imported Steam items stay in the list (they are your data).

**Note:** result.

## Step 14. Exported log: no IDs, no titles

**Do:**
1. Settings > "Privacidad y registros" > "Exportar registros" > "Exportar". If the web export is still simulated, read the real files in `%LOCALAPPDATA%\Ludiary\logs`, read-only, in a text editor.
2. Search for: your SteamID (type only its first 6 digits), the word `wishlist`, `GetWishlist`, `steamid`, `Bearer`, every game title you used, the numeric ID of one GOG game and one AppID (first 4 digits only), `embed.gog.com`, `https://`, `C:\Users`, your Windows user name, your e-mail, the account name.
3. Look for counters: `requested`, `found`, `notFound`, `added`, `removed`.

**Expect:** no match for the SteamID, IDs, titles, tokens, full URLs, user name or e-mail. Only counters (and the host of an error, if any). Sizes within limits.

**Note:** the counters of one import. **Any match for the SteamID, a game ID, a title or a token is an incident:** do not copy the line. Write the file name and the kind of data, then tell the `programador` and `auditor`, and rotate what applies.

## Summary table

Fill it in your notes and bring only this table (sanitized) to the ADR.

| Assumption | Step | Result | What to bring |
|---|---|---|---|
| SW1 `GetWishlist` shape and order | 2 | | worked with only SteamID, right titles, priority order or not |
| SW2 hidden vs empty, no key | 3 | | same notice for hidden and empty, nothing deleted |
| SW3 name for unreleased games | 2 | | real name or fallback, how many fallbacks |
| GW1 `wishlist.json` with the Galaxy token | 7 | | works or error, item count vs real, shape of IDs |
| GW2 `api.gog.com/products` title and image | 7 | | titles and images found, fallbacks, unreleased products |
| GOG order (known risk) | 7 | | ascending by ID or not, positions |
| GOG wide images | 7 | | acceptable, ugly or missing |
| ITAD4 GOG product ID lookup | 7 | | found vs "sin datos" counts |
| Origin label, remove, unfollow, manual intact | 2, 4, 5, 8, 9 | | OK or FAIL for each |
| 10-minute floor, separate per store | 11 | | time shown, 5-minute attempt refused |
| GOG stays connected | 12 | | OK or FAIL |
| Log without IDs or titles | 14 | | counters, no match |

## If something fails

- The route changed or the shape differs (SW1, GW1, GW2): tell the `conectores` agent with the step, what you expected and what the notice showed (never the response body or the SteamID). They update the connector and its invented responses in `connectors/*/fixtures/wishlist/`.
- GOG IDs not accepted by IsThereAnyDeal (ITAD4): note it for the ADR; the likely fix is to drop GOG from the import or look up by title, which point 5 forbids today, so it goes to the `arquitecto`.
- Something removed that was added by hand, or a connection marked as expired: stop and tell the `programador` and `auditor` at once. These break ADR 91 points 5 and 13 (M2).
