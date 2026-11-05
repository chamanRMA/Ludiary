# Releasing Ludiary (for the maintainer)

How a version is published. The CI builds a **draft** release; you sign it on your own computer and publish it. The private key never goes to GitHub. Design: ADR 90, point 21.

The version comes from the **label of the pull request**, not from `package.json` (which stays at `0.0.0`).

Contents: [One-time setup](#one-time-setup) · [Publish a version](#publish-a-version) · [If something fails](#if-something-fails) · [Publishing by hand](#publishing-by-hand-without-ci) · [Key rotation and loss](#keys-rotation-compromise-and-loss) · [Updating pinned tools](#updating-pinned-actions-and-inno-setup) · [SmartScreen](#smartscreen)

## One-time setup

### 1. Create the two signing keys

You need two Ed25519 key pairs: a main one and a spare. Run this twice, with a passphrase of at least 12 characters each time:

```
corepack pnpm --filter @ludiary/desktop release:keygen --id k1 --out <path outside the repository>\k1.pem
corepack pnpm --filter @ludiary/desktop release:keygen --id k2 --out <path outside the repository>\k2.pem
```

- The script refuses a path inside the repository and never overwrites a file.
- The private key is written encrypted. Store the spare (`k2`) somewhere else (another disk or a password manager vault), not next to `k1`.
- Back up the passphrases separately. Without the key and its passphrase you cannot sign.
- It prints only the public key.

### 2. Put the public keys in the repository

Add both public keys to `apps/desktop/update-keys.json`, under `keys`, in a normal pull request:

```json
{
  "keys": {
    "k1": "<public key printed for k1, base64>",
    "k2": "<public key printed for k2, base64>"
  }
}
```

Before merging, check each private key against the file: `corepack pnpm --filter @ludiary/desktop release:pubkey <path>\k1.pem` prints its public key and the id it matches (do the same for `k2.pem`). A key that matches no id cannot sign.

Never put a private key here. Until two real keys are in this file, `release:build` refuses to build and the CI run stays red. Do not label any pull request `release:*` before this is merged.

### 3. Repository settings (GitHub)

1. **Labels:** create `release:patch`, `release:minor` and `release:major`.
2. **Settings > Actions > General > Workflow permissions:** choose **Read repository contents and packages permissions**. The workflow asks for what each job needs.
3. **Settings > General > Releases:** turn on **Immutable releases**. After publishing, neither the files nor the tag can be changed.
4. **Your GitHub account:** turn on 2FA.
5. **Protect `main`** (Settings > Branches): require a pull request before merging.

## Publish a version

1. Before merging, add **one** label to the pull request: `release:patch` (X.Y.Z+1), `release:minor` (X.Y+1.0) or `release:major` (X+1.0.0). Write the release notes in the pull request description: they become the notes of the release.
2. Merge the pull request into `main`.
3. In the **Actions** tab, wait for the `release` workflow. It must be green. The summary says `Draft <tag> created`, where the tag is `X.Y.Z` (only `v0.1.0` and `v0.1.1` carry a "v").
4. Open the draft under **Releases**. Check the notes, and that it has exactly `Ludiary-Setup-X.Y.Z.exe`, `ludiary-update.json` and `SHA256SUMS.txt`. Review the commit and the run.
5. In your copy, check out that commit (`git fetch`, then the commit shown by the script) and run:

   ```
   corepack pnpm --filter @ludiary/desktop release:publish X.Y.Z <path>\k1.pem
   ```

   Add `--id k2` if you sign with the spare key. It needs `gh` logged in and `git`. The script:
   - checks that the draft is the one the CI built and has no `.sig`;
   - checks that your `update-keys.json` is identical to the one in the draft commit;
   - downloads the files and checks version, name, size and SHA-256 of the installer and `SHA256SUMS.txt`;
   - asks for your passphrase, signs, and verifies the signature with the public key in the repository;
   - asks you to type `yes`, then uploads `ludiary-update.json.sig` and publishes.

If you answer anything other than `yes`, nothing is uploaded or published. Run the command again when ready.

There is only **one pending draft at a time**. Publish (or delete) it before the next merge can create another.

## If something fails

| What you see | What to do |
|---|---|
| `plan` is green, "no `release:*` label, no version" in the summary | The pull request had no label. Add it, then open the run of the merge commit and press **Re-run all jobs**. |
| `plan` fails: "has more than one release:* label" | Remove the extra label, then **Re-run all jobs**. |
| `build` fails: "`release:build` failed… no release can be built" | `apps/desktop/update-keys.json` does not have the two real public keys. Add them in a normal pull request. Then **Re-run all jobs** on the run that failed (or label a new pull request). |
| `release` fails: "there is a pending draft (vA.B.C)" | Publish the draft with `release:publish`, or delete it on GitHub. Then **Re-run all jobs** (not only the failed job) so the version is planned again. |
| `release` fails: "<tag> already exists" (`X.Y.Z` or `vX.Y.Z`) | You re-ran only the failed job with an old version. Use **Re-run all jobs**. Nothing was overwritten. |
| The run shows "cancelled" | A third merge arrived while the second waited. Re-run it. Rare. |
| `release:publish`: "is not a draft" | It is already published. Immutable: publish a new version instead. |
| `release:publish`: "differs from the one in the draft commit" | Check out the commit shown by the script and run it again. |
| `release:publish`: "does not verify with the embedded public key" | Wrong private key or wrong `--id`. Nothing was written or uploaded. |
| `release:publish`: a size, hash or `SHA256SUMS` mismatch | Do not sign. Delete the draft and re-run the workflow, and find out why before publishing anything. |

A forgotten label is fixed by adding it and re-running **all** jobs of the run of the merge commit. A direct `push` to `main` without a pull request never creates a version.

## Publishing by hand (without CI)

For when the CI is not available. Pass the version yourself (PowerShell):

```
$env:LUDIARY_VERSION = "X.Y.Z"
corepack pnpm --filter @ludiary/desktop release:build
corepack pnpm --filter @ludiary/desktop release:manifest
corepack pnpm --filter @ludiary/desktop release:sign <path>\k1.pem --id k1
gh release create X.Y.Z --draft --title "Ludiary X.Y.Z" --notes-file <notes file> apps/desktop/dist/installer/Ludiary-Setup-X.Y.Z.exe apps/desktop/dist/installer/ludiary-update.json apps/desktop/dist/installer/SHA256SUMS.txt apps/desktop/dist/installer/ludiary-update.json.sig
```

The tag is `X.Y.Z` except for the bridge version: use `v0.1.1` for 0.1.1 (installed 0.1.0 copies only accept tags with `v`).

Then review the draft and publish it from GitHub. The version must be greater than the last published one: publish in order.

## Keys: rotation, compromise and loss

**Rotate** (planned): sign a version with a key still valid. That version embeds the new set of public keys in `update-keys.json`. Older installations accept it because it is signed with a key they trust, and from then on trust the new set.

**A private key may be compromised** (the file and the passphrase):

1. Generate a replacement key with `release:keygen`.
2. In a pull request, replace the compromised public key in `update-keys.json` with the new one and keep the spare. Label it and merge it.
3. Sign that version with the **spare** key (`--id k2`) and publish it as soon as possible.
4. Weak point: until an installation installs that version, it still accepts anything signed with the compromised key. Tell users to update (see the release notes) and make the notes plain about it.

**You lose one key:** do the same as above using the other one.

**You lose both keys:** no installation can verify new versions. Users must download and install Ludiary by hand once. Publish new keys in the new installer and say so in the notes.

**Your GitHub account is compromised:** an attacker can create drafts but cannot sign, and no installation accepts a version without a valid `.sig`. Immutable releases stop published files from being changed. Remove the intruder's access and review the drafts and the workflow.

## Updating pinned actions and Inno Setup

- Each action in `.github/workflows/release.yml` is pinned by its full commit SHA, with the version in a comment. Update it by hand, in a normal pull request. Do not add third-party actions.
- Inno Setup is downloaded in the `build` job and checked against `INNO_SHA256` (variables `INNO_VERSION` and `INNO_SHA256` at the top of the workflow). To change the version, change **both**, taking the hash from the official release page, and mention it in the pull request.
- The workflow must never use `pull_request_target`, `workflow_run` or `secrets.*`, and nothing from the pull request may be written inside a `run:` block.

## SmartScreen

The installer is not signed with a code-signing certificate (Authenticode) yet. When someone downloads it with a browser and opens it, Windows SmartScreen may show "Windows protected your PC".

- Tell users to press **More info** and then **Run anyway** if they downloaded it from the project's releases page.
- This warning appears only on the first manual install. Updates made by Ludiary itself do not trigger it.
- Updates are still protected by the Ed25519 signature, which does not depend on the certificate.
- Say this in the installation guide and in the release notes of the first versions. When a certificate exists, ADR 90 point 11.7 describes the change.

`[POR VERIFICAR]` The exact SmartScreen wording on current Windows 11 builds; check it on a clean PC with a real download.
