# Manual test: manual games (ADR decision 93, point 12)

Goal: check on a real Windows PC that a game outside the stores can be added, played, edited and removed, and close assumptions MG1, MG2 and MG3 of ADR 93. Automatic tests cannot do this: they use a fake launcher and a fake file dialog.
Same format as `wishlists.md`, `gog.md` and `epic.md`: one section per step with **Do**, **Expect** and **Note** (what to write down). Button names are the English UI texts; Ludiary may show them in Spanish.

Time: about 40 minutes. Needs: Ludiary built and running, and **Farming Simulator** installed (any edition) as the reference game. Optional: a mapped network drive (step 7) and a second PC (step 11).

## Rules for the notes

- Write notes in a scratch file **outside the repository** (for example `%TEMP%\manual-games-notes.txt`).
- The path of the game is personal data. Do not paste full paths, your Windows user name or your game folder into the ADR or an issue. Write `<user>` and the shape only ("a normal `.exe` in a game folder").
- Each step ends with a result: **OK**, **FAIL** or **NOT CHECKED**, plus the assumption it closes.

## Step 0. Prepare

1. Find the **main `.exe`** of Farming Simulator in its installation folder (the file that starts the game, not the launcher or the uninstaller). Ludiary does not know where it is; if you are unsure, use the target of the game's own shortcut ("Open file location").
2. Start Ludiary and open the web. Open **Local** in the side menu.

**Expect:** the page shows "You have not added any game yet." (or your earlier manual games) and the **Add game** button.

**Note:** Ludiary version, date, browser language.

## Step 1. Add the game (MG1)

**Do:**
1. Press **Add game**. The button shows "Waiting for the window…".
2. In the Windows window, look at the file list and at the title. Choose the main `.exe` of Farming Simulator.

**Expect:**
- The Windows window opens **in front of the browser** and is titled "Choose the game's program (.exe)". It lists only `.exe` files.
- The browser goes to the game's page. Its name is the name of the game's folder (or the file name without `.exe` if the folder is a generic one such as `bin` or `x64`). The cover is the plain coloured placeholder with the title.
- "Where you own it" shows the game's **folder**, not the full file path.
- The game also appears in **Local**, and the side menu counter of Local goes up by one.

**Note:**
- **MG1:** did the window show only `.exe` files, and was the `.exe` accepted? Write the title Ludiary chose and whether you would have chosen it.
- Cancel check: press **Add game** again and close the window with Cancel. Nothing must change and the button must return to normal.

## Step 2. Rename

**Do:** on the game's page, in the "Local game" panel, change **Name** to something different and press **Save**. Reload the page.

**Expect:** the new name shows on the page, in the Local list and in the library search. It is still there after reloading.

**Note:** result. Also try an empty name: it must not be saved.

## Step 3. Play (MG2, MG3)

**Do:**
1. Press **Play** on the game's page. The button shows "Opening {title}…" (with the game's name, no store name).
2. Wait for the game to reach its main menu.
3. Close the game. Press **Play** on the game's card in Local, and double-click it quickly.

**Expect:**
- The game opens and loads its data (menus, maps, sound). It runs from its own folder.
- A fast second click does not open the game twice.
- If the game asks for administrator rights and Windows refuses, Ludiary shows "Windows did not allow the game to open. It may ask for administrator rights: open it from its own shortcut." instead of an unknown error.

**Note:**
- **MG3:** does it behave the same as when started from the game's own shortcut (no missing files, no extra window asking for a profile)? If a game needs arguments, write which ones; this slice does not support them.
- **MG2:** only if it asked for administrator rights: which message did Ludiary show (the "administrator" one or a generic one)? NOT CHECKED if it did not ask.

## Step 4. Change executable

**Do:**
1. Press **Change executable**. In the window press Cancel.
2. Press **Change executable** again and choose the **same** `.exe`.

**Expect:** after Cancel nothing changes. After choosing the same file the game stays as it was (same name, same favorites). The name you gave in step 2 is **not** reset.

**Note:** result.

## Step 5. A shortcut and a script are refused (MG1)

**Do:**
1. On the desktop, create a shortcut (`.lnk`) to the game's `.exe` (right-click the file, "Show more options", "Create shortcut"). In the **Add game** window, change the file type filter if it lets you, or type the shortcut's name and press Enter.
2. Make a plain text file `test.bat` with the line `echo hi`, in a folder of your own (not in the game's folder). Try to choose it the same way.
3. Try also a `.cmd` file if you want, and a file that is not a program (a `.txt`).

**Expect:**
- A `.bat`, `.cmd`, `.txt` or similar is not offered, or if you force it, refused with: "Choose an .exe file on a local disk of this computer. Shortcuts, scripts, network folders, mapped network drives and Ludiary's own files are not allowed."
- Nothing is added or changed.
- For the shortcut, one of two results is fine: the window follows the shortcut and returns the real `.exe` (it is then accepted as that `.exe`, and if it is the same game it counts as the same one, step 6), or the window returns the `.lnk` and Ludiary refuses it with the message above.

**Note:**
- **MG1:** which of the two results happened for the shortcut? FAIL if the `.bat` or a `.lnk` was **accepted** and added as a game. Delete the test files afterwards.
- Also try to choose one of Ludiary's own files, for example `ludiary-tray.exe` in the install folder: it must be refused with the same message.

## Step 6. The same executable twice

**Do:** press **Add game** and choose the Farming Simulator `.exe` again (the one from step 1).

**Expect:** no second game is created. Ludiary shows the game that already exists. The Local counter does not change.

**Note:** result. Also try the same file through a different spelling of the path if you can (for example, typed in lower case): still one game.

## Step 7. A mapped network drive is refused (optional)

**Do:** only if you have a mapped network drive (a letter such as `Z:` that points to a share). Copy or find any `.exe` there, press **Add game** and choose it.

**Expect:** the same refusal message as in step 5. Nothing is added.

**Note:** result. NOT CHECKED if you have no network drive. Do not try to type a `\\server\share` path by hand; the check for those paths runs before touching the network and is covered by automatic tests.

## Step 8. Favorite, tag and collection

**Do:** mark the game as favorite, add a tag and put it in a collection.

**Expect:** all three show on the game's page and in the library filters.

**Note:** result. These are the data that steps 10 and 12 check.

## Step 9. A moved or renamed executable

**Do:**
1. Rename the game's `.exe` in its folder (for example add `_old`), or move it. Press **Play**.
2. Press **Change executable** and choose the renamed file.
3. Press **Play** again. Then undo the rename in the game's folder.

**Expect:**
- Step 1: a clear error appears and the game is not opened. Ludiary does not mark the game as uninstalled by itself.
- Step 2: the game's name, favorite, tag and collection are kept; Play works again.

**Note:** the message shown in step 1. If Ludiary showed a vague or technical message, copy the text (it has no path in it).

## Step 10. A running game blocks "Restart and update" (optional)

**Do:** only if an update is ready (the "Restart and update" button is visible). Otherwise mark NOT CHECKED.
1. Start the game from Ludiary and leave it open.
2. Press **Restart and update**.
3. Close the game.

**Expect:** with the game open, Ludiary says "A game is open. Close it and try again; otherwise the update will be installed the next time you open Ludiary." and does not restart. After closing the game it can restart.

**Note:** result. If no update is available, mark NOT CHECKED; a way to force one is in `docs/release.md`.

## Step 11. Backup and restore keep the game

**Do:**
1. Open Settings > "Backups" and press **Back up now**. Wait for it to appear in the list.
2. Open the game in Ludiary and change its name and tag a little (for example add a second tag).
3. In the list, press **Restore** on the backup you just made and confirm "Restore and restart". Wait for Ludiary to reopen in a new tab.
4. Open **Local**.

**Expect:**
- The game is there, with the name, tag, collection and favorite from the backup, **installed** and playable (same computer, same `.exe`). The second tag you added after the backup is gone.
- **Play** still works.

**Note:** result. **Another PC (optional):** if you have a second PC, restore that backup there. Expect the game to be listed as "not set up": the page says "This game is not set up on this computer. Choose its executable to play it." with the button **Choose its executable**, and **Play** does nothing until you choose a file. Tags, collection and favorite are kept. NOT CHECKED if you have no second PC.

## Step 12. Remove

**Do:** on the game's page press **Remove from Ludiary** and read the confirmation. First cancel it, then repeat and confirm.

**Expect:**
- The question says: "Remove {title} from Ludiary? Its files are not touched, but its tags, collections and favorite are lost."
- After cancelling, nothing changes.
- After confirming, you go back to **Local**. The game is gone from Local, from the library, from its collection, and its tag is gone from the tag list if no other game uses it.
- **The game's folder and files are untouched.** Check in Explorer that the folder and the `.exe` are still there, and that the game still starts from its own shortcut.

**Note:** result. FAIL if any file of the game was deleted.

## Step 13. The log has no path

**Do:**
1. Settings > "Privacy and logs" > **Export logs** > **Export**. If the web export is still simulated, read the real files in `%LOCALAPPDATA%\Ludiary\logs`, read-only, in a text editor.
2. Search for: the name of the game's folder, the file name of the `.exe`, `FarmingSimulator`, `C:\Users`, your Windows user name, `.exe`, and the word `manual`.

**Expect:** no match for the folder, the `.exe`, the Windows user name or any full path. A match for `manual` is fine (the log marks launches with `connector: manual`), as long as it carries no path or title.

**Note:** result. **Any match for a path is an incident:** do not copy the line. Write the file name and the kind of data, then tell the `developer` and the `auditor`.

## Summary table

Fill it in your notes and bring only this table (sanitized) to the ADR.

| Assumption | Step | Result | What to bring |
|---|---|---|---|
| MG1 file dialog filter, `.exe` path returned, shortcut resolved or refused | 1, 5 | | `.exe` only shown, `.lnk` followed to its target or refused |
| MG2 elevation gives the "administrator" message | 3 | | message shown, or NOT CHECKED |
| MG3 game works with its folder as working folder and no arguments | 3 | | same as its own shortcut, or arguments it needs |
| Add, title, rename, change executable | 1, 2, 4 | | OK or FAIL, title chosen |
| `.lnk`, `.bat`, own files, network drive refused | 5, 7 | | OK or FAIL |
| Same `.exe` twice gives one game | 6 | | OK or FAIL |
| Moved file gives a clear error and Change executable fixes it | 9 | | message shown |
| Running game blocks "Restart and update" | 10 | | OK, FAIL or NOT CHECKED |
| Backup and restore keep the game (and another PC asks for the executable) | 11 | | OK, FAIL or NOT CHECKED |
| Remove does not touch the files | 12 | | OK or FAIL |
| Log without paths | 13 | | no match |

## If something fails

- A shortcut or script was accepted, a file was deleted on Remove, or a path appears in the log: stop and tell the `developer` and the `auditor` at once. These break the rules of ADR 93 (points 2, 3 and 4) and invariant 3.
- The dialog does not come to the front, shows other file types, or returns a `.lnk` that is then accepted (MG1): tell the `packager` with the step and what you saw.
- The game does not start or needs arguments (MG3), or the administrator message is missing (MG2): write what happened and tell the `architect`; arguments are a separate decision (ADR 93, point 13.1).
