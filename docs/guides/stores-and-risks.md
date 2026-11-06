# Stores and risks

This guide explains how Ludiary reaches each store, and what that means for you.

Ludiary is not affiliated with Steam, GOG, Epic Games, Ubisoft or EA. This guide is not legal advice.

## Signing in is optional

You do not need to connect any account. Without one:

- Ludiary still finds the games installed on your PC.
- **Play** still works, through the store's own app.

Connecting an account adds the games you own but have not installed, and other extras such as the Install button. You can disconnect at any time.

## How each store is reached

| Store | Account connection | Wishlist import |
|---|---|---|
| Steam | Official: Steam sign-in and the Steam Web API, with your own key | Undocumented endpoint |
| GOG | Unofficial API | Unofficial API |
| Epic Games | Unofficial API | Not available |
| Ubisoft Connect | Unofficial API | Not available |
| EA app | Unofficial API | Not available |

GOG, Epic, Ubisoft and EA do not offer an official way for an app like Ludiary to read your library. Ludiary uses the internal APIs that their own apps use. Other open-source launchers use similar routes.

Steam's wishlist endpoint (`IWishlistService/GetWishlist`) has no public documentation either, even though the rest of the Steam account connection is official.

What the sign-in looks like:

- **GOG and Epic:** you sign in on the store's official page and paste a code into Ludiary. Ludiary then presents itself to the store with the client identifier of the store's own app.
- **Ubisoft:** you sign in on Ubisoft's page, inside a small Ludiary window. That window is the one exception to "you type your password in your browser". A fixed script in the window reads the session that Ludiary needs after you sign in. It does not touch the form or your keystrokes, and the code is open source. Ludiary never reads the session of Ubisoft Connect or of your browser.
- **EA:** you sign in on EA's page in your browser and paste a token. The token identifies an EA client. The session lasts about an hour, so you need to reconnect to refresh the list.

## What this means for you

**A connection can stop working.** A store can change an unofficial API without notice. If that happens, that store's connection fails and shows an error. The other stores keep working, and so do scanning and Play. Your library and your data are not touched.

**It is your decision.** Using these unofficial connections is your own choice and at your own risk.

If you prefer to avoid this, do not connect those accounts. Steam and local scanning cover the rest.

## Your data

Tokens, sessions and keys are stored encrypted on your PC. Ludiary never sends them anywhere except to the store they belong to. See [privacy](../privacy.md).

If a connection stops working, see [troubleshooting](troubleshooting.md).
