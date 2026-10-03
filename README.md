# Pulse

A personal recovery, strain and sleep app for the Fitbit Air: one Next.js app (frontend, sync worker and scoring) on SQLite.
See `docs/plans/` for the plan.

## Screenshots

<p>
  <img src="docs/screenshots/phone-home.png" alt="Pulse on a phone: sleep, recovery and strain dials" width="32%">
  <img src="docs/screenshots/phone-health-monitor.png" alt="Pulse on a phone: the Health Monitor with heart rhythm and measurements" width="32%">
  <img src="docs/screenshots/phone-journal.png" alt="Pulse on a phone: the Journal with the Log" width="32%">
</p>

Every screen, on a phone and a laptop: [docs/screenshots.md](docs/screenshots.md) (demo mode, seeded data).

## Run in demo mode

Demo mode generates deterministic data into `data/demo.db`, so no Google account is needed.

```sh
pnpm install
cp .env.example .env   # GOOGLE_OAUTH_ENABLED=false is already set
pnpm dev               # http://localhost:3000, health check at /healthz
```

The database is created and migrated on boot, and the sync worker starts once (`[worker] started (source: seed)`).

## Environment

Every variable is listed and explained in [`.env.example`](.env.example). It is validated at startup, and the server exits on invalid config.

- `GOOGLE_OAUTH_ENABLED=true` switches to the Google Health API and `data/pulse.db`. It needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and the sign-in screen becomes "Sign in with Google". Set `OWNER_EMAIL` so only your account gets in.
- The first sign-in asks for your birth date and sex (onboarding). Settings › Profile edits them.

## Deploy

Pulse runs as one Docker container with its database in a volume, behind a tunnel or HTTPS reverse proxy. The [setup guide](docs/setup.md) covers Google Cloud, Docker, HTTPS, backups and troubleshooting.

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

## Contributing and security

- [Setup guide](docs/setup.md): from the demo to your own data on a server.
- [Contributing](CONTRIBUTING.md): how changes land (`main` is protected; every change is a pull request).
- [Security policy](SECURITY.md): report vulnerabilities privately.
- [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Use it, change it and share it for any noncommercial purpose. Selling it, or putting it inside a commercial product, is not allowed.

## Credits

- Design inspiration: the interface is inspired by the WHOOP app's look and flow. Pulse is a free, non-commercial community project by an independent developer. It is not affiliated with, endorsed by or competing with WHOOP, Inc., uses no WHOOP device, data, code or assets, and every score is computed from your own Google Health data. WHOOP is a trademark of WHOOP, Inc. If you represent WHOOP or any other company and have a concern, please email work.adityajindal@gmail.com and it will be changed or taken down.
- [noop](https://github.com/ryanbr/noop): the recovery, strain, sleep and readiness scoring is ported from its analytics engine.
- [Hælan](https://github.com/bardesss/haelan): its notes on how the Google Health API behaves saved a lot of trial and error.

