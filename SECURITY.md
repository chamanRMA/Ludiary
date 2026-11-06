# Security policy

## Report a vulnerability

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/chamanRMA/Ludiary/security/advisories/new).

Please do not open a public issue, pull request or discussion about a vulnerability.

## Scope

- **Local server:** anything that lets another program, website or user on the same PC reach the API, get past the `Origin` and `Host` checks, or get past browser authorization.
- **Secrets store:** reading tokens, sessions or API keys, weaknesses in their encryption, or secrets leaking into logs, exported logs or backups.
- **Process launching:** starting anything other than a game saved in the database, or injecting commands, paths or arguments.
- **Updater:** installing an unsigned or tampered version, downgrade attacks, or abusing the apply and rollback steps.
- **Connectors:** mishandling of store tokens and sessions, the sign-in flows, or crafted store responses that cause harm on the PC.

Out of scope:

- Vulnerabilities in the stores themselves or in IsThereAnyDeal. Report those to them.
- A connector that stops working because a store changed. That is a normal [bug report](https://github.com/chamanRMA/Ludiary/issues/new/choose).
- The SmartScreen warning on the first install, which is a known limit: the installer is not code-signed yet.

## What to include

- The Ludiary version (**Settings > About**) and Windows version.
- The affected area, and what an attacker can achieve.
- The steps to reproduce it, ideally with a small proof of concept.
- Any idea you have for a fix.

Do not include real tokens, keys, passwords or personal data. Use test accounts, or replace the values. Read any log before you attach it.

## Response times

Ludiary has a single maintainer, so these are best effort, not promises:

- First reply: within 7 days.
- First assessment: within 30 days.
- Fix: as soon as is reasonable, depending on severity.

Please keep the report private until a fix is published. You will be credited in the advisory unless you prefer not to be.

## Supported versions

Only the [latest release](https://github.com/chamanRMA/Ludiary/releases/latest) gets security fixes.
