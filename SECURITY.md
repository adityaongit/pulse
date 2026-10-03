# Security policy

Pulse holds health data and a Google OAuth grant, so security reports are taken seriously.

## Reporting a vulnerability

Report it privately through GitHub: **Security › Report a vulnerability** on this repository, or open
<https://github.com/adityaongit/pulse/security/advisories/new>. Please do not open a public issue,
discussion or pull request for a vulnerability.

Include what you found, how to reproduce it (against a demo instance where possible), and the impact you
see. Never send real health data, tokens or `.env` values.

Pulse is maintained by one person in their spare time. Expect an acknowledgement within a week, and a fix
or a plan as soon as the issue is understood. You will be credited in the advisory unless you prefer not
to be.

## Supported versions

Only the latest commit on `main` is supported. There are no release branches; update to `main` to get fixes.

## Scope

In scope, for example:

- Sign-in and the owner lock: the session cookie, the owner claim, `OWNER_EMAIL` (`src/server/session.ts`, `src/proxy.ts`, `src/app/oauth/`).
- Anything that lets a non-owner read data, run server actions or reach the Google grant.
- Leaks of OAuth tokens, the session secret or health data through logs, errors, exports or the API.
- The data exports and the avatar upload.

Out of scope:

- Instances deployed against the setup guide's advice, for example reachable from the internet without `OWNER_EMAIL` (the first account to sign in claims such an instance by design).
- Attacks that need root on the host, or physical access to it.
- Findings from automated scanners without a demonstrated impact.

## Hardening a self-hosted instance

- Set `OWNER_EMAIL` before the instance is reachable by anyone else.
- Serve it over HTTPS only (a tunnel or reverse proxy); the session cookie is marked Secure over HTTPS.
- Keep `.env`, `data/` and backups readable by you only, and encrypt backups before they leave the machine.
- If you suspect a leak, revoke Pulse at <https://myaccount.google.com/permissions>, rotate the OAuth client secret, and delete the `instance` row in the database to invalidate every session.

See [docs/setup.md](docs/setup.md) for the full setup.
