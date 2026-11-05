# Code signing for Ludiary (for the maintainer)

How to get and use an Authenticode code-signing certificate so that Windows SmartScreen stops warning about the installer. This is a guide, not a change: nothing here is implemented yet. Design context: ADR 90 point 11.7 and decision 58. How a version is published today: [release.md](release.md).

> **Verification status.** This guide was written without web access. Prices, eligibility rules and policies below come from the ADR and from general knowledge as of late 2025 and **may be out of date**. Every such item is marked `[POR VERIFICAR]`. Check each one on the provider's own page before paying or applying.

Contents: [What Authenticode covers](#what-authenticode-signs-and-what-it-does-not) · [Options](#options) · [Recommendation](#recommendation) · [Fit with the release flow](#fit-with-the-current-release-flow) · [Code changes needed](#code-changes-that-would-be-needed-described-only) · [Verifying a signature](#verifying-a-signature)

## What Authenticode signs, and what it does not

Authenticode is the Windows way of signing `.exe` files. It proves who published the file and that it was not modified after signing.

- It is **independent of the Ed25519 signature** of `ludiary-update.json`. Ed25519 is the root of trust for updates (pinned key, no authority, no renewals). Authenticode only removes the SmartScreen warning on a manual download (ADR 90 point 11.7). Having one does not replace the other.
- Updates made by Ludiary itself do not trigger SmartScreen (the files Node downloads carry no web mark, assumption W1), so the benefit is the **first manual install**.

Files to sign (all produced by `apps/desktop/scripts/build.mjs`):

| File | Where | Note |
|---|---|---|
| Stable launcher `Ludiary.exe` | root of the install, built from `apps/desktop/launcher` | The shortcut opens it. |
| Program `Ludiary.exe` | `app-<version>\Ludiary.exe`, Node single executable | Sign it **last** in its pipeline: editing with `resedit` or injecting with `postject` removes the signature (ADR 45). |
| `ludiary-tray.exe` | `app-<version>\bin\` | Go helper. |
| Installer `Ludiary-Setup-<version>.exe` | `dist/installer` | Also the uninstaller (`SignedUninstaller` in Inno). |

The inner three must be signed **before** Inno Setup packs them, because the installer compresses the files as they are. Signing only the installer is not enough.

## Options

Costs are approximate and `[POR VERIFICAR]`.

### SignPath Foundation (free for open source)

- Free code signing for open-source projects, with the certificate issued to SignPath Foundation. Windows then shows **SignPath Foundation** as the publisher, not your name. `[POR VERIFICAR]`
- Requirements: an OSI-approved license (GPL-3.0 qualifies) and a **public** repository; MFA for every team member on SignPath and on GitHub; a code signing policy page in the project, usually with the line "Free code signing provided by SignPath.io, certificate by SignPath Foundation". Checked on 5-11-2026 on [signpath.org/terms](https://signpath.org/terms) and in published policies of approved projects (Pandoc, Lyrion). Quotas and other details: `[POR VERIFICAR]` on the application page.
- Signing happens in their cloud: the key never leaves their HSM. The CI uploads the unsigned file as an artifact and downloads the signed one. An approval step by the maintainer can be required. `[POR VERIFICAR]`
- Cost to you: zero money, a one-time application, and some CI work (below).
- Risk: they may refuse the project or ask for changes; publisher name and certificate belong to them.

### Azure Artifact Signing (formerly Trusted Signing)

- Microsoft's cloud signing service. About 9.99 USD/month; billing starts when the account is created (Microsoft's [code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), checked 5-11-2026).
- Short-lived certificates, managed by Azure; works with `signtool` through a plugin, or from GitHub Actions. `[POR VERIFICAR]`
- Requires identity validation. **Individuals only in the USA and Canada**; organizations also in the EU and the UK (same Microsoft page, checked 5-11-2026). A maintainer in Spain can only use it through an organization.

### OV certificate from a CA, with a hardware token

- An Organization/Individual Validation certificate from a commercial CA. Typical price: about 150 to 300 USD per year according to Microsoft's page above; check the CA.
- Since 1 June 2023 (CA/B Forum Baseline Requirements) the private key must be generated and kept on certified hardware (FIPS 140-2 level 2 or Common Criteria EAL4+): a USB token the CA ships, or a cloud HSM. You cannot keep it as a `.pfx` file. `[POR VERIFICAR]`
- The maximum validity of new certificates is being shortened (a reduction to about 460 days was scheduled for 2026), so expect yearly renewal. `[POR VERIFICAR]`
- Individuals can usually be validated with an ID document; some CAs sell cheaper certificates for open-source developers. `[POR VERIFICAR]`
- A physical token needs a local machine: it does **not** work on a GitHub-hosted runner. Cloud-HSM variants exist but cost more. `[POR VERIFICAR]`

### Why an EV certificate no longer gives instant reputation

An Extended Validation certificate used to be treated as trusted by SmartScreen at once. As understood, Microsoft stopped doing that around 2024: EV and OV are handled alike and reputation is built from how many users download and run files signed by that certificate without problems. A new certificate of either type can still show a warning for a while. EV also costs more and has the same hardware requirement, so it is not worth it for this project. `[POR VERIFICAR]` Do not promise users "no warning from day one", even when signed.

## Recommendation

For a personal open-source project:

1. **Apply to SignPath Foundation first.** It costs nothing, matches ADR 90 point 11.7, and its certificate is shared, which may help reputation. Prepare: the signing-policy page, MFA on GitHub, and the CI changes below.
2. If refused, or if the CI constraints are unacceptable: **Azure Artifact Signing** only if you act as an organization (individuals in Spain are not accepted); otherwise an **OV certificate** (cheapest reliable one, from a CA that sells to individuals).
3. If none is practical: publish unsigned, as the ADR already allows (decision of the user), and keep the SmartScreen explanation in the install guide ([release.md](release.md#smartscreen)).

## Fit with the current release flow

Today: CI builds an unsigned installer, the manifest and `SHA256SUMS.txt` and uploads a draft; the maintainer runs `release:publish`, which checks that all three assets were uploaded by `github-actions[bot]`, that the SHA-256 in the manifest equals the installer's, signs the manifest with Ed25519 and publishes. The workflow uses no secrets and no third-party actions.

Two rules constrain the design:

- **Order.** Sign the three inner binaries, then pack with Inno (which signs the installer and uninstaller), then run `release:manifest`. The manifest hash and `SHA256SUMS.txt` must be of the **final signed installer**. Any signing after `release:manifest` makes the hash wrong and the update is rejected.
- **Same bytes.** Do not rebuild the installer after the CI. Builds are not guaranteed to be byte-identical, and `release:publish` rejects a different file.

### Option A: sign in CI with a cloud service (SignPath, Azure)

- The `build` job signs between `build.mjs` and `build-installer.mjs`, then again for the installer, then runs `release:manifest`.
- Everything else (draft, `release:publish`, Ed25519) stays as it is, because the assets are still uploaded by the bot.
- Cost: the workflow needs a token (a secret, or OIDC for Azure) and, for SignPath, their official GitHub action. This breaks two stated rules (no `secrets.*`, no third-party actions). That requires an ADR decision, a pinned action by commit SHA, and a protected environment with required reviewer. Keep the Ed25519 key out of GitHub as it is now.
- Fits SignPath and Azure. Best fit for the recommendation.

### Option B: sign locally with `signtool` (OV certificate with token)

- The token cannot be on the runner, so the signed installer cannot be produced by CI.
- Use the hand route in [release.md](release.md#publishing-by-hand-without-ci), adding signing steps: `release:build` split into build, sign the three binaries, Inno with `SignTool`, then `release:manifest`, `release:sign`, `gh release create --draft`.
- `release:publish` would not accept that draft (its uploader check and its "built by CI" promise no longer hold), so it needs a decision: either drop that check for this route, or keep CI as a reproducible-build check only. This weakens the "the maintainer only signs what CI built" guarantee of ADR 90 point 21. Escalate to the architect before choosing.
- Cheaper to start, more manual, and everything runs on the maintainer's PC.

### The role of Inno's `SignTool`

Inno Setup can run a signing command on the installer and uninstaller itself. In `apps/desktop/installer/ludiary.iss` it would be:

- `SignedUninstaller=yes` in `[Setup]` (the uninstaller is built from the setup stub, so it is signed with the same tool);
- `SignTool=<name>` in `[Setup]`, where `<name>` is defined on the compiler command line, e.g. `ISCC.exe /S<name>="signtool.exe sign /fd sha256 /tr <timestamp URL> /td sha256 ... $f"`. The `$f` is replaced by each file to sign.

With option A, the command line calls the cloud client instead of `signtool` (SignPath works by submitting files and cannot be called per file from Inno, so the installer would be signed in a separate CI step after Inno, and `SignedUninstaller` may not be usable with it). `[POR VERIFICAR]` Inno's documentation on `SignTool`/`SignedUninstaller` for 6.7.3.

## Code changes that would be needed (described only)

Nothing is modified by this guide. For the record:

1. **`build.mjs` / `release-build.mjs`:** a signing step after the Go builds and the SEA edit, before the installer. A single script (for example `release-signfiles.mjs`) that signs the three inner binaries, optional and off when no certificate is configured so local development keeps working.
2. **`build-installer.mjs` and `ludiary.iss`:** pass `/S<name>=...` to `ISCC` and add `SignTool` and `SignedUninstaller`; set `AppPublisher` and the file `CompanyName` (now empty) to match the certificate subject.
3. **`release-manifest.mjs`:** no change if it keeps running after signing. A guard that it refuses an unsigned installer in a release build is advisable.
4. **`release.yml` (option A):** signing steps in `build`, a pinned action, a protected environment, updated header comments. Update the rule in `release.md`.
5. **`release-publish.mjs`:** for option B only, relax or replace `checkUploaders`. Optionally, check `signtool verify /pa` on the downloaded installer.
6. **Launcher (Go):** ADR 90 point 11.7 plans a mandatory `WinVerifyTrust` check with the expected subject on the downloaded installer. Observation to escalate: if the subject is pinned, changing certificate provider (SignPath subject today, another one tomorrow) or a renewal with a different subject would make every installed launcher reject the new installer, and updates would stop until a manual install. The ADR says Ed25519 is the root of trust. The architect should decide whether to keep this check and how to rotate the subject.
7. **Docs:** update the SmartScreen section of `release.md`, the install guide and the release notes once signing exists.

## Verifying a signature

On a Windows PC with the Windows SDK (`signtool.exe`), in PowerShell:

```
signtool verify /pa /v Ludiary-Setup-X.Y.Z.exe
```

- `/pa` uses the default Authenticode policy. Success ends with "Successfully verified". It prints the certificate chain and, if present, the timestamp.
- Run it on the installer **and** on the three inner binaries after installing (`Ludiary.exe` in the install folder, `app-X.Y.Z\Ludiary.exe`, `app-X.Y.Z\bin\ludiary-tray.exe`) and on the uninstaller (`unins000.exe`).
- Without the SDK: `Get-AuthenticodeSignature .\Ludiary-Setup-X.Y.Z.exe | Format-List` shows `Status` (`Valid`), the signer certificate and `TimeStamperCertificate`.
- By hand: right-click the file, **Properties**, tab **Digital Signatures**, select the signature, **Details**. It shows the signer, "This digital signature is OK" and the countersignature (timestamp).

**Timestamp.** Sign with an RFC 3161 timestamp (`/tr <URL> /td sha256`, with `/fd sha256`). Without it, the signature stops being valid when the certificate expires; with it, it stays valid for files signed while the certificate was valid. Use the timestamp server the provider tells you to use. Check that "Timestamp" or the countersignature appears in the verify output. An installer without a timestamp is a defect.

Also check on a clean PC with a real browser download that SmartScreen behaves as expected; a valid signature does not guarantee no warning for a new publisher. `[POR VERIFICAR]`
