# Manual test: price comparator with IsThereAnyDeal (ADR decision 86, point 11)

Goal: close assumptions ITAD3, ITAD4, ITAD6, ITAD7, ITAD12 and ITAD13 of ADR 86 on a real Windows PC with your own IsThereAnyDeal key. Automatic tests cannot do this: they use invented responses with the shape of the documentation.
Same format as `gog.md` and `epic.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). Quotes in "..." are the Spanish texts of the web UI; switch Ludiary to English if you prefer.

Time: about 1 hour. Needs: Ludiary built and running with the library already synced, internet, an e-mail account you can read, and a library that has at least: one Steam game, one GOG game (Cold Waters if it is still there), and one game each from Epic, Ubisoft and EA (if a store has none, mark its step NOT CHECKED).

This guide does not need the reply from `api@isthereanydeal.com` (point 13). That reply only gates publishing a version with the comparator.

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\prices-notes.txt`).
- **The API key goes only into the field of the Ludiary wizard.** Do not paste it into notes, the chat, an issue, a screenshot, a terminal, a URL or a file. If you need to compare keys, write only its length and its character classes (letters, digits, `-`, `_`).
- Before copying anything into the ADR, sanitize it: no key, no e-mail, no account name, no Windows user name (use `<user>`). For IDs write the **shape** (length and characters), not the value.
- Game titles are fine in your private notes. Do not put them in the ADR if you are unsure; say "a Steam game" instead.
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

## Step 0. Prepare

1. Start Ludiary and open the web. Check the library shows your games and the stores are connected (Settings > Stores).
2. Open Settings > Services. Expect IsThereAnyDeal listed as not connected (RAWG and IGDB are hidden in real mode).
3. Optional, to see the exported log later: Settings > "Privacidad y registros". Note the time you start, so you can tell which log lines belong to this test.

**Note:** Ludiary version, date, browser language.

## Step 1. Create the account and the key (ITAD7)

**Do:**
1. In Settings > Services press "Conectar" on IsThereAnyDeal. Read the first step ("what is sent"): it must say that game IDs of Steam and GOG, titles of games whose price is queried, titles you search and the country are sent, and that the links of the offers pass through IsThereAnyDeal. Continue.
2. The second step opens `https://isthereanydeal.com/apps/my/` in your browser. Create an account and **verify the e-mail** (the 1000-requests limit depends on it, ITAD2).
3. Register an application (for example "Ludiary personal"). Copy the **API key**. It is not the Client ID and not the OAuth secret.
4. Before pasting the real key, try an invented one: type `not-a-real-key-123` (18 characters, so it passes the format) and continue. Then try `short` and one with a space.
5. Paste the real key with the wizard "Pegar" button (or type it) and continue.

**Expect:**
- `short` and the key with a space are refused in the form with the format message ("Esa clave no parece correcta...").
- The invented 18-character key is refused by the server ("IsThereAnyDeal no acepta tu clave" or similar), the wizard stays on the same step, and nothing is saved.
- The real key is accepted, the wizard ends, and the card shows connected. The key is never shown again anywhere.

**Note (ITAD7):** the length of your real key and which character classes it has (letters, digits, `-`, `_`). FAIL if the real key is refused by the format check (`^[A-Za-z0-9_-]{16,128}$`): then write the length and the classes of the character the pattern rejects, never the key.

## Step 2. Country and shops

**Do:** after connecting, look at Settings > Services > "País de los precios". If it is empty, type `ES`. Leave "Tiendas que comparar" on "Solo mis tiendas".

**Expect:** if your browser language has a region (`es-ES`), the country is already `ES`. If not, the panel says "Elige tu país...". Lowercase or three letters are refused.

**Note:** whether the country was proposed automatically, and from which browser language.

## Step 3. A Steam game and a GOG game (ITAD4, ITAD6, ITAD12)

**Do:** open the detail page of a Steam game that is on sale or has a price, then one of GOG (Cold Waters if possible). Look at the "Precios" panel. Wait for "Buscando precios..." to finish.

**Expect:**
- Best price (shop, price, regular price, discount), "Mínimo histórico", one row per shop among your five stores, country "ES", currency EUR, the query date, and "Precios de IsThereAnyDeal" with a link.
- Prices formatted as euros with two decimals.
- Each shop row has a link "Ir a la oferta de ...".

**Note:**
- **ITAD4:** for each game, did it find a price? The panel does not show `source`; read it from the exported log counters (step 12: `found` and `notFound`) or ask the developer to read `price_links.source` in the database copy. Expected `steam` for the Steam game and `gog` for the GOG one. FAIL if the GOG game is "not found" by ID but appears after a title search (then GOG lookup by product ID does not work).
- **ITAD6:** do you see rows for shops without a discount (all shops with a price, not only offers)? Is there a "Mínimo histórico"? Is the currency EUR for ES? Is the amount right to the cent against the shop page (compare one price by hand)? Does the best price always match the cheapest row?
- **ITAD12:** do all rows have a link? If some rows have **no** link, do step 12 and read `droppedLinkHosts` in the exported log: that list is the real host of the offers. Write the hosts (they are not personal). Also hover one working link and write only its host (for example `itad.link` or `next.isthereanydeal.com`), not the path.

## Step 4. Epic, Ubisoft and EA by title (ITAD3)

**Do:** open one game of each store (prefer well-known titles with a plain name, and also one with a trademark sign or an edition name, such as "Edition" or a subtitle). For each one, wait for the panel.

**Expect:** a price panel for the right game, or "No hemos encontrado este juego en IsThereAnyDeal" (not found is a valid result for Ubisoft and EA, whose catalogue in IsThereAnyDeal is short).

**Note (ITAD3, ITAD5):** a small table: store, found / not found, **and whether the game shown is the right one** (compare with the shop page; the panel does not name the matched game, so compare the price and the shop link). A wrong match is the serious failure: write the store and the shape of the title (for example "title with subtitle", "edition", "trademark sign"). Total: how many of the 3 or more were found by title.

## Step 5. "No es este juego" and undo

**Do:** on a game with prices, press "No es este juego". Reload the page. Then press "Buscar de nuevo".

**Expect:**
- After the first press: the panel says "Indicaste que los precios de IsThereAnyDeal no son de este juego." and no prices. It stays like that after reload and after an "Actualizar precios".
- After "Buscar de nuevo": prices come back (same game as before).

**Note:** result. Nothing else to record unless it fails.

## Step 6. "Actualizar precios" twice

**Do:** on a game with prices press "Actualizar precios", then press it again right away (within the first minute). Wait a minute and press it once more.

**Expect:** the first press shows "Actualizando precios..." and the query date changes. The second, within 1 minute, does not call the network again (the date does not change; the button may be disabled or show the stored prices). The third works again.

**Note:** whether the date changed each time. Also: if you see "Límite de IsThereAnyDeal alcanzado", write when (the time shown) and what you did just before.

## Step 7. Change the country (ITAD6)

**Do:** Settings > Services > country `US`. Go back to the same game.

**Expect:** prices in USD, "Precios para US". Set the country back to `ES`: the euro prices appear again without a new query if less than 6 hours have passed (the date is the old one).

**Note (ITAD6):** the currency you got for US, and whether the Steam and GOG prices match their US store pages.

## Step 8. Shops: "Todas las tiendas autorizadas"

**Do:** change "Tiendas que comparar" to "Todas las tiendas autorizadas". Open a game.

**Expect:** more rows (other shops), and the panel asks again (a new cache row). Set it back to "Solo mis tiendas".

**Note:** the number of rows with each setting. If it fails with an error or an empty panel, write what the panel says.

## Step 9. Watch list in the Comparador (ITAD13)

**Do:**
1. Open "Comparador". It should show "Tu lista está vacía...".
2. Type in the search a title of a game you **do not own** (at least 2 characters; wait about half a second). Follow it with "Seguir".
3. Search also for a title that has a DLC or a bundle ("... Season Pass", "... Bundle", "... DLC") and look at the labels "DLC" / "Paquete" in the results.
4. Follow a game you **do** own.
5. Reload the page. The list shows prices ordered by discount.
6. Remove each with "Dejar de seguir".

**Expect:** followed games appear with prices; the owned one shows "Ya lo tienes." with "Ver en tu biblioteca"; after unfollowing, the list is empty again; after reload, the state stays.

**Note (ITAD13):** which kinds appeared in the results: normal game (no label), "DLC", "Paquete", and any result that came with no label although it looks like a DLC (that would be a `type` value Ludiary stores as `null`). Do not write anything beyond the kinds.

**Expect (covers, ADR 86 point 17):** each result and each followed game shows a small cover on the left. The owned game shows the same cover as in the library. A game you do not own shows the image from IsThereAnyDeal, or a plain gradient if it has none.

**Note (ITAD14):** if the games you do not own show only gradients, open the browser developer tools (F12) > Console and copy the host of any blocked image (for example `Refused to load the image 'https://<host>/...'`). Write down only the host, not the path.

## Step 10. Disconnect

**Do:** Settings > Services > IsThereAnyDeal > "Desconectar". Then open a game and the Comparador.

**Expect:** the card is not connected; the game page shows no price panel; the Comparador shows "Conecta IsThereAnyDeal para comparar precios" with a button to Settings. Your watch list is kept (reconnect and check it), the "No es este juego" marks are kept, and the old prices are not shown (cache emptied).

**Note:** result. Reconnecting needs a new key paste; the old key is not stored anywhere readable.

## Step 11. Invalid key (optional)

**Do:** in the IsThereAnyDeal account page, regenerate or delete the key, then open a game in Ludiary.

**Expect:** "IsThereAnyDeal no acepta tu clave." with "Reconectar"; no more requests until you reconnect.

**Note:** result.

## Step 12. Exported log and log files: no key, titles or IDs

**Do:**
1. Settings > "Privacidad y registros" > "Exportar registros" > "Exportar". If the web export is still simulated, read the real files in `%LOCALAPPDATA%\Ludiary\logs`, read-only, in a text editor.
2. Search for: your API key (type only its first 6 characters in the search box, never the whole key), `itad-api-key`, `apiKey`, `isthereanydeal`, every game title you used in this test, `app/`, the numeric ID of the GOG game, the shape of a UUID (`-` between groups of hex digits, `[0-9a-f]{8}-[0-9a-f]{4}`), `https://`, `C:\Users`, your Windows user name, your e-mail, the account name.
3. Look for the price counters: `requested`, `found`, `notFound`, `deals`, `linksDropped`, `droppedLinkHosts`.

**Expect:**
- No match for the key, the header name, titles, `app/`, game IDs, UUIDs, full URLs, your user name or e-mail.
- Only counters, and `droppedLinkHosts` with hosts only (if some links were dropped).
- File sizes are within the limits and files rotate (do not check this here beyond a glance).

**Note (ITAD12, ITAD4):** the counters (`requested`, `found`, `notFound`) of a run, and the hosts in `droppedLinkHosts`. **Any match for the key, a title or an ID is an incident:** do not copy the line. Write the file name and the kind of data, then tell the `programador` and `auditor`, and rotate the key in isthereanydeal.com.

## Summary table

Fill it in your notes and bring only this table (sanitized) to the ADR.

| Assumption | Step | Result | What to bring |
|---|---|---|---|
| ITAD3 title lookup for Epic, Ubisoft, EA | 4 | | found / not found per store, wrong matches |
| ITAD4 Steam `app/<id>` and GOG product ID | 3 | | `source` of each, found or not |
| ITAD6 `prices/v3`, `historyLow`, minor units, currency | 3, 7, 8 | | all shops listed, history low, EUR for ES, USD for US |
| ITAD7 key format | 1 | | length and character classes, accepted or not |
| ITAD12 deal link host | 3, 12 | | hosts of the links, `droppedLinkHosts` |
| ITAD13 search `type` | 9 | | kinds seen, any unlabelled DLC |

## If something fails

- The API changed or the shape differs: tell the `conectores`/`programador` agent with the step, what you expected and what the panel or the log counters showed (never the response body). They update `@ludiary/itad` and its invented responses.
- A new link host (ITAD12): the ADR 86 decision gets a revision to add it to `linkHosts`.
- A wrong game matched by title (ITAD3): note it for the ADR; the likely fix is to show the matched title or drop the title lookup for that store.
