# Pulse

A personal recovery, strain and sleep app for the Fitbit Air: one Next.js app (frontend, sync worker and scoring) on Postgres. The server's admins invite people (or open sign-up); each person connects their own Google account and sees only their own data.

> No server? [Pulse Mobile](https://github.com/adityaongit/pulse-mobile) is the Android app that does it all on your phone, from Health Connect. See [below](#no-server-pulse-mobile).
See `docs/plans/` for the plan.

## Screenshots

<p>
  <img src="docs/screenshots/phone-home.png" alt="Pulse on a phone: sleep, recovery and strain dials" width="32%">
  <img src="docs/screenshots/phone-health-monitor.png" alt="Pulse on a phone: the Health Monitor with heart rhythm and measurements" width="32%">
  <img src="docs/screenshots/phone-journal.png" alt="Pulse on a phone: the Journal with the Log" width="32%">
</p>

Every screen, on a phone and a laptop: [docs/screenshots.md](docs/screenshots.md) (demo mode, seeded data).

## Run in demo mode

Demo mode generates deterministic data for a shared demo user, so no Google account is needed. Start Postgres first: `docker compose -f compose.dev.yaml up -d`.

```sh
pnpm install
cp .env.example .env   # DATA_SOURCE=demo is already set
pnpm dev               # http://localhost:3000, health check at /healthz
```

The database is created and migrated on boot, and the sync worker starts once (`[worker] started (source: seed)`).

## Environment

Every variable is listed and explained in [`.env.example`](.env.example). It is validated at startup, and the server exits on invalid config.

- `DATA_SOURCE=google` switches to real data from the Google Health API. It needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET`. People sign up with a name, username, email and password (better-auth), sign in with the username or the email, and connect their own Google account from inside Pulse. Sign-up is invite-only by default: set `ADMIN_EMAILS` to your email, create your account, then invite people from the admin dashboard at `/admin` ([admin guide](docs/admin.md#invite-people)).
- The first sign-in asks for your birth date and sex (onboarding). Settings › Profile edits them.

## Install as an app

Pulse is a PWA: install it from Chrome on Android, Add to Home Screen on iPhone, or wrap it into an Android APK with
PWABuilder. Notifications, the offline page, launch screens and how to rebrand the icons for a fork are in
[docs/pwa.md](docs/pwa.md).

There is also a native Android and iOS app (`mobile/`, Capacitor) that connects to any Pulse server you enter on first
launch: [docs/mobile.md](docs/mobile.md).

### No server? Pulse Mobile

[Pulse Mobile](https://github.com/adityaongit/pulse-mobile) is a separate Android app with no server and no account. It
reads your Fitbit data from Health Connect and scores and stores it on the phone. It imports what Health Connect holds,
up to the last 180 days, and does not share a Pulse server's history.
[Download the APK](https://github.com/adityaongit/pulse-mobile/releases/latest).

| | Pulse (this repo) | Pulse Mobile |
|---|---|---|
| Runs | On your server, in the browser or the app shell above | On your Android phone |
| Data | On your server | Only on the phone |
| Source | The Google Health API | Fitbit through Health Connect |
| Accounts | One server, many users | None: one install is one person |

## Deploy

Pulse runs as one Docker container with its database in a volume, behind a tunnel or HTTPS reverse proxy. The [setup guide](docs/setup.md) covers Google Cloud, Docker, HTTPS over Tailscale and troubleshooting; [other setups](docs/other-setups.md) covers Cloudflare Tunnel and reverse proxies; the [admin guide](docs/admin.md) covers invites, the coach, updates and backups.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build (standalone output) and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Generates Next route types, then `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest (Node for `*.test.ts`, happy-dom for `*.test.tsx`) |
| `pnpm e2e` | Playwright |
| `pnpm db:generate` | Generates a migration in `drizzle/` from `src/server/db/schema.ts` |
| `pnpm pwa:assets` | Regenerates the app icons, shortcut icons and iOS launch screens ([docs/pwa.md](docs/pwa.md#rebrand-it-for-your-fork)) |

## Contributing and security

- [Setup guide](docs/setup.md): from the demo to your own data on a server.
- [Installed app (PWA)](docs/pwa.md): install, notifications, offline, rebranding, Android APK.
- [Native app (Capacitor)](docs/mobile.md): the Android and iOS shell, building, signing, releases.
- [Contributing](CONTRIBUTING.md): how changes land (`main` is protected; every change is a pull request).
- [Security policy](SECURITY.md): report vulnerabilities privately.
- [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for any noncommercial purpose. Selling it, or putting it inside a commercial product, is not allowed.

## Credits

- Design inspiration: the interface is inspired by the WHOOP app's look and flow. Pulse is a free, non-commercial community project by an independent developer. It is not affiliated with, endorsed by or competing with WHOOP, Inc., uses no WHOOP device, data, code or assets, and every score is computed from your own Google Health data. WHOOP is a trademark of WHOOP, Inc. If you represent WHOOP or any other company and have a concern, please email work.adityajindal@gmail.com and it will be changed or taken down.
- [noop](https://github.com/ryanbr/noop): the recovery, strain, sleep and readiness scoring is ported from its analytics engine.
- [Hælan](https://github.com/bardesss/haelan): its notes on how the Google Health API behaves saved a lot of trial and error.

