# Add a game that is not in a store

Some games do not come from Steam, GOG, Epic, Ubisoft or EA: a game from another launcher, a game without DRM that you downloaded, or an emulator. You can add them to Ludiary by hand. They appear in the **Local** page and in your library, and you can open them with **Play**, give them tags, put them in collections and mark them as favorites, like any other game.

Contents: [Add a game](#add-a-game) · [Edit it](#edit-it) · [Remove it](#remove-it) · [What is not supported](#what-is-not-supported) · [After a restore on another PC](#after-a-restore-on-another-pc)

## Add a game

1. Open **Local** in the side menu.
2. Press **Add game**. The button shows "Waiting for the window…".
3. A Windows window opens. Go to the folder where the game is installed and choose the file that starts it (it ends in `.exe`). It is usually named after the game. If you are not sure, look at the target of the game's desktop shortcut: right-click the shortcut and choose "Open file location".
4. Press Open.

Ludiary opens the game's page. Its name is the name of the game's folder. You can change it (see below).

If you close the window without choosing anything, nothing is added.

If you add the same file twice, Ludiary does not create a second game: it shows the one you already have.

[CAPTURA: the Local page with the "Add game" button and one game added]

## Edit it

Open the game's page. In the **Local game** panel:

- **Rename:** change **Name** and press **Save**.
- **Change executable:** press **Change executable** and choose another `.exe`. Use it if you moved the game, or if the game was updated and the file has another name. The name, tags, collections and favorite stay as they are.

If you moved or renamed the `.exe` and press **Play**, Ludiary shows an error and does not open anything. Press **Change executable** and choose the file again.

[CAPTURA: the "Local game" panel on a game's page]

## Remove it

1. Open the game's page.
2. Press **Remove from Ludiary** and confirm.

Ludiary asks you to confirm because its tags, collections and favorite are lost. **The game itself is not touched:** its folder and files stay on your disk, and you can add it again later.

## What is not supported

- **Arguments.** Ludiary opens the `.exe` with no options. If the game needs something like `-dx11` or a profile, it cannot be set here. Open it from its own shortcut.
- **Network drives.** The file must be on a disk of this PC. A shared network folder (`\\server\folder`) or a mapped network drive (`Z:`) is refused.
- **Shortcuts and scripts.** Only `.exe` files. A shortcut (`.lnk`), `.bat`, `.cmd` and similar files are refused, because they can hide options that Ludiary would not see. Choose the real program instead.
- **Ludiary's own files** cannot be added.
- **Covers.** A manual game shows a plain coloured cover with its title. You cannot choose an image yet.
- **Running as administrator.** If a game needs administrator rights, Windows may not let Ludiary open it. Ludiary tells you; open it from its own shortcut.
- **Emulators.** You can add the emulator's own `.exe`, but not a single ROM or game inside it.
- Ludiary does not merge a manual game with the same game from a store. If you have it in both, you will see two entries.

Error shown when a file is refused: "Choose an .exe file on a local disk of this computer. Shortcuts, scripts, network folders, mapped network drives and Ludiary's own files are not allowed."

## After a restore on another PC

A [backup](backups.md) keeps your manual games, their names, tags, collections and favorites. It does **not** keep where the game is on your disk, because that is different on each PC.

When you restore a backup made on another PC (or after reinstalling Windows):

1. The game is in the list, but its page says "This game is not set up on this computer. Choose its executable to play it."
2. Press **Choose its executable** and pick the game's `.exe` on this PC.
3. **Play** works again.

If you restore a backup on the **same** PC and the game has not moved, it keeps working with nothing to do.

## If something goes wrong

See [troubleshooting](troubleshooting.md): it explains how to export the logs from Settings and how to open an issue. Logs do not include the path of your games.
