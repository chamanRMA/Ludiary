# Price comparison

Ludiary can show the price of a game in several stores, its historical low and where it is cheapest. It does this with **IsThereAnyDeal**, a free price comparison service.

This is optional. Without it, Ludiary works the same but shows no prices.

Ludiary is not affiliated with IsThereAnyDeal, Steam, GOG, Epic, Ubisoft or EA.

Contents: [Connect IsThereAnyDeal](#connect-isthereanydeal) · [Country and stores](#country-and-stores) · [Prices on a game page](#prices-on-a-game-page) · [The Price comparison page](#the-price-comparison-page) · [Import your Steam or GOG wishlist](#import-your-steam-or-gog-wishlist) · [Privacy](#privacy-what-leaves-your-computer) · [Problems](#problems)

## Connect IsThereAnyDeal

You need a free key. A key is a code that lets Ludiary ask IsThereAnyDeal for prices in your name. Each person creates their own; Ludiary does not include one.

1. Open Ludiary and go to **Settings > Services**.
2. Find **IsThereAnyDeal** and press **Connect**.
3. Read the first screen (it explains what is sent, see [Privacy](#privacy-what-leaves-your-computer)) and continue.
4. Press **Open the page**. IsThereAnyDeal opens in a new tab (`https://isthereanydeal.com/apps/my/`).
5. Create an account if you do not have one.
6. **Verify your email.** Without it, IsThereAnyDeal gives you a lower request limit.
7. Register an application. Any name works, for example `Ludiary personal`.
8. On your application page, find the section **API Keys** and copy the key there.
   - Do **not** copy the OAuth **Client ID** or **Client Secret**. They look similar but do not work.
   - The wizard shows an image with the right spot outlined in red. [CAPTURA: application page on IsThereAnyDeal with the API Keys section]
9. Go back to the Ludiary tab and press **Paste**.
10. Ludiary checks the key with IsThereAnyDeal. If it works, the service shows as connected.

If the key is rejected, you will see one of these messages:

| Message | What to do |
|---|---|
| That key does not look right. It must be 16 to 128 letters, numbers, hyphens or underscores, with no spaces. | You probably copied extra spaces or the wrong value. Copy it again from **API Keys**. |
| IsThereAnyDeal does not accept the key. Check that you copied the "API key" whole and that it has not been deleted, then connect again. | Check that the application still exists on IsThereAnyDeal and copy the key again. |
| IsThereAnyDeal asks you to wait before the next request. Try again in a few minutes. | Wait and try again. |
| IsThereAnyDeal is not responding right now. Try again later. | Try again later. |
| IsThereAnyDeal sent an answer Ludiary does not understand. It may have changed; try again later. | The service may have changed. If it lasts, [report it](#problems). |

To remove the key, go to **Settings > Services** and press **Disconnect**. Ludiary deletes the key and the saved prices. The games you follow stay on your list.

The key is stored encrypted on your computer, like your store connections.

## Country and stores

Prices depend on your country (and its currency).

- After connecting, Ludiary suggests the country of your browser language (for example, `es-ES` gives `ES`). If it cannot, it asks you for one: *Choose your country (two capital letters, for example ES) to see prices.*
- In **Settings > Services** you can change **Country for prices** at any time. Use two capital letters, for example `ES` or `US`. Prices you saw for another country are kept.
- **Stores to compare** has two options:
  - **Only my stores**: Steam, GOG, Epic, Ubisoft and EA. This is the default.
  - **All authorized stores**: every store IsThereAnyDeal lists for you.

Ludiary shows prices exactly as IsThereAnyDeal gives them. It does not round them or convert currencies.

## Prices on a game page

When IsThereAnyDeal is connected, a game page has a **Prices** panel with:

- **Best price** and the store where it is, with the usual price and the discount.
- **Historical low**.
- A line per store with a link to the offer (**Go to the offer at** that store). The list can be shortened: press **Show every shop** to see all stores, **Hide the shops** to fold it again.
- The country, and the date of the last check.

Buttons:

- **Update prices**: asks for fresh prices. You can do it about once a minute. Without pressing it, Ludiary refreshes prices on its own after 6 hours, only when you open the game.
- **This is not the game**: use it if IsThereAnyDeal matched your game with a different one. The panel stops showing prices for it. Press **Search again** to undo.

Possible messages:

- *This game was not found in IsThereAnyDeal.* Common for Epic, Ubisoft and EA games, which are matched by title and may not be found.
- *Your copies of this game match different games in IsThereAnyDeal, so no prices are shown.* Ludiary prefers showing nothing to showing the price of another game.
- *There are no prices for this game in {country}.*
- *Showing the prices saved on {date}; they could not be updated.*
- *IsThereAnyDeal limit reached.* Ludiary asks for at most 200 things every 5 minutes. When you reach it, it shows what it has saved and tells you when it will update again.
- *IsThereAnyDeal does not accept your key.* / *Ludiary can no longer read your IsThereAnyDeal key.* Press **Reconnect**.

DLC and add-ons have no price panel.

Ludiary asks for prices only for the games you look at. It does not send your whole library.

## The Price comparison page

Open **Price comparison** in the menu. It shows the games you follow, with the biggest discounts first.

**Follow a game**

1. In **Search a game by title**, type at least two letters. Ludiary searches after you stop typing for a moment.
2. Press **Follow** on the result. The button then says **Following**.
3. The game appears in your list, with its best price. **Following {n} games** shows how many you have (the limit is 500).

If you already own the game, the list says **You already have it.** with **View in your library**.

**Unfollow** removes a game from the list.

Each game appears folded to its best price. Open it to see every store, as on the game page.

If IsThereAnyDeal is not connected, the page explains it and has the button **Open Settings > Services**.

## Import your Steam or GOG wishlist

Instead of searching game by game, you can bring your wishlist from Steam or GOG into the list you follow.

You need the store connected in Settings and IsThereAnyDeal connected. Epic, Ubisoft and EA cannot be imported: there is no way to read their wishlists with the connection Ludiary has. These stores show no button.

1. Open **Price comparison**, section **Wishlists**.
2. Press **Import Steam wishlist** or **Import GOG wishlist**.
3. A window explains: *Ludiary will read your {store} wishlist and send IsThereAnyDeal the identifiers of those games so it can follow their price. What you added by hand does not change.* Press **Import**.
4. Wait while it says **Importing…**. A summary appears, for example: 12 added, 3 already followed, 2 without data in IsThereAnyDeal, 4 do not fit: the list holds 500.

What to know:

- **Nothing is imported on its own.** Only when you press the button.
- **Only identifiers are sent.** Ludiary sends IsThereAnyDeal the store's game numbers, not your account or your name. Titles and images come from the store itself.
- **Limit of 500.** The list holds 500 games in total, counting those you added by hand. Games are imported in the store's order until it is full. The rest are counted as "do not fit". GOG gives no priority order, so Ludiary uses the game number order; if you have more than 500, the lower numbers enter first.
- **Games IsThereAnyDeal does not know** are not added ("without data in IsThereAnyDeal"). They are tried again next time.
- **What you added by hand is never touched** by an import: not changed, not removed.
- **Imported games carry a label**, for example *Steam wishlist*. The label tells you where they came from.
- **If you remove a game from the store wishlist** (or you buy it, which removes it), the next import stops following it, but only if it came from an import.
- **If you press Unfollow on an imported game** that is still on the store wishlist, it comes back at the next import. Ludiary tells you: *Unfollowed. If the game is still on your {store} wishlist, it will come back the next time you import it.*
- **If the list comes back empty, nothing is removed.** This protects your list from a hidden or unreadable wishlist.
- **Wait between imports.** You can import the same store about once every 10 minutes.
- If you disconnect a store, the games you followed stay on your list.

**Steam: the wishlist must be public.** Steam does not tell Ludiary the difference between an empty list and a hidden one. If nothing is found, you see: *No game was found. If your Steam wishlist is not public, change it in your profile privacy settings (Game details) and try again.* In Steam, open your profile, **Edit Profile > Privacy Settings** and set **Game details** to **Public**. [POR VERIFICAR: exact names of the menus in Steam, they change]

**GOG:** if you see *No game was found. If your GOG wishlist is empty, add games to it in GOG and try again.*, add games to your GOG wishlist.

These two readings are not official ways of the stores and may stop working if Steam or GOG change them. If that happens, the rest of Ludiary keeps working. See [Problems](#problems).

## Privacy: what leaves your computer

Ludiary has no server and no telemetry. When you use price comparison, data goes to IsThereAnyDeal, a service you chose and configured. This is what is sent and when:

| What | When |
|---|---|
| The numbers that identify your Steam and GOG games, and the titles of games whose price Ludiary looks up | When you open a game page or the Price comparison page |
| The titles you type in the search | When you search |
| Your country | With every price request |
| The numbers that identify the games on your Steam or GOG wishlist | Only when you press **Import**, after you confirm |
| Your key | With every request, so IsThereAnyDeal knows it is you |

Because of the key, **IsThereAnyDeal can link these requests to your IsThereAnyDeal account.**

Also:

- **Images.** Covers of games you follow and do not own are loaded by your browser from IsThereAnyDeal's image server. For games you own, and for imported wishlist games, images come from your library or from the store itself. Your browser does not tell IsThereAnyDeal which page you came from.
- **Links to offers go through IsThereAnyDeal.** When you press **Go to the offer**, IsThereAnyDeal sees the click (your IP address and the offer) before you reach the store. Ludiary does not change the links.
- **No affiliation.** Ludiary is not affiliated with IsThereAnyDeal or with any store. IsThereAnyDeal's terms apply to your use of their key.
- Ludiary does not send your whole library: only the games you look at.
- Ludiary's exported logs never contain your key, titles or game numbers.

To stop everything, press **Disconnect** in **Settings > Services**. Ludiary deletes the key and the price cache.

## Problems

- **No prices at all:** check that IsThereAnyDeal shows as connected and that a country is chosen.
- **Wrong game:** use **This is not the game**.
- **A price differs from the store:** Ludiary shows what IsThereAnyDeal reports at the time it was checked; see the date. Press **Update prices**.
- **Offer links do not appear:** the offer points to an address Ludiary does not recognize and hides the link for safety. Report it.
- **Reporting:** press **Export** under **Export logs** in **Settings > Privacy and logs** and open an issue on GitHub. See [troubleshooting](troubleshooting.md).

[POR VERIFICAR: before publishing this guide, confirm that IsThereAnyDeal accepts an open source application where each user brings their own key (ADR 86 point 13). If they refuse, the comparator is removed from the release.]
