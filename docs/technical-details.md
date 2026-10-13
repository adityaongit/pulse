# Technical details

How a Pulse server works under the hood. You don't need any of this to set it up ([setup.md](setup.md)); it is here
for the curious and for debugging.

## The path from demo to server

```mermaid
flowchart TB
  demo[Demo on your laptop<br/>Postgres in Docker, no Google account] --> google[Google Cloud project<br/>Health API, consent screen, OAuth client]
  google --> local[Real data on localhost<br/>Sign up, onboarding, Connect Google]
  local --> server[Docker compose on a server<br/>app + Postgres]
  server --> https[HTTPS hostname<br/>tunnel or reverse proxy]
  https --> phone[Open it on your phone<br/>Install app]
```

## Containers

[`compose.yaml`](../compose.yaml) runs two containers:

- `pulse`: the Next.js app and its sync worker, on port 3000 inside Docker.
- `pulse-db`: `postgres:18-alpine`, reachable only from the app over the compose network.

Neither publishes a port on the host. Migrations run when the app starts, after it has waited for Postgres to accept
connections. `compose.override.yaml` (gitignored) holds machine-specific additions such as a host port; `docker
compose` reads it automatically, and `scripts/deploy.sh` loads it on every deploy.

**Memory:** the app uses about 100–150 MB (`mem_limit: 384m`, with the V8 heap at 50% of it, `NODE_OPTIONS` in the
[`Dockerfile`](../Dockerfile)). Postgres is capped at 256 MB with small buffers (`shared_buffers=64MB`,
`max_connections=30`). Each person's data grows by roughly 4 MB a month.

## Google connection

- Pulse accounts are separate (email or username and a password); Google is only the data source.
- The OAuth redirect is `<origin>/oauth/callback`, where the origin is `APP_URL` if set, else the address the
  request came in on. Google accepts plain `http` only for localhost, never a raw IP.
- The scopes Pulse asks for are `openid`, `userinfo.email`, `userinfo.profile` and the Google Health scopes in
  `SCOPES` in `src/server/sources/google/oauth.ts`.
- In Testing, only listed test users can connect, and Google expires grants every 7 days. In production anyone can
  connect; until the app is verified, Google shows an "unverified app" warning first.
- Each Google account must have a Google Health profile (the Fitbit Air paired in the Google Health app). Otherwise
  Pulse refuses the connection with "That Google account has no Google Health profile".
- Switching Google account removes the data synced from the old one; the journal stays.

## How sign-up is checked

```mermaid
flowchart TD
  S["POST /api/auth/sign-up/email"] --> O{"Email in ADMIN_EMAILS?"}
  O -- yes --> F{"Server has<br/>no accounts?"}
  F -- yes --> OK["Account created"]
  F -- no --> NO0["Refused: OWNER_EMAIL_RESERVED"]
  O -- no --> M{"Sign-up mode<br/>(panel, else SIGNUP)"}
  M -- closed --> NO1["Refused: sign-up closed"]
  M -- open --> OK
  M -- invite --> I{"x-pulse-invite header:<br/>unused, unexpired link?"}
  I -- no --> NO2["Refused: INVITE_INVALID"]
  I -- yes --> C["Link used up (atomic)"] --> OK
```

The check runs in better-auth's `user.create.before` hook (`src/server/auth.ts`), so the sign-up form, the API and
any other client all go through it. Invite links are stored only as a hash. Sign-in allows 5 tries a minute per IP.

## AI coach

```mermaid
flowchart LR
  Q["Question in /coach"] --> R["POST /api/coach<br/>session, access, consent,<br/>10 requests a minute"]
  R --> K["The person's key<br/>(decrypted in memory)"]
  K --> P["Their provider"]
  P -- "tool calls" --> T["Read tools over<br/>Pulse's own screens<br/>(only this person's data)"]
  T --> P
  P -- "log calls" --> C["Confirmation card<br/>(Log / Don't log)"]
  C -- "approval ids, yes/no" --> R
  R -- "approved" --> L["logging.ts, as the log sheets<br/>(Google Health + logged_entries)"]
  P -- "answer, streamed" --> Q
  R -- "chat saved" --> DB[("coach_chats")]
```

- **Providers:** Anthropic, OpenAI, Google Gemini, Vercel AI Gateway or OpenRouter. Pulse makes one tiny test
  request and saves a key only if it works.
- **What leaves the server:** the person's questions and the numbers the tools look up (scores, vitals, workouts,
  journal behaviours), sent to the provider *they* chose. Never names, emails or Google tokens.
- **Keys** are encrypted with AES-256-GCM under a key derived from `BETTER_AUTH_SECRET`. They are never sent back to
  the browser, logged or exported.
- **Chats** are saved per person in `coach_chats` (Settings › Coach deletes them, More › Your data exports them) and
  are deleted with the account. Long conversations use an extra provider request to summarize older turns; the
  summaries carry preferences and earlier decisions, and measurements are fetched again.
- **No user-supplied server addresses**, since the server makes the request and a user-chosen URL could reach your
  internal network. Only `COACH_LOCAL_URL` (set by the admin) points at a self-hosted model.
- **Logging:** asked to log water, food, weight, mood, symptoms, a period or an ovulation test (the last two on
  female profiles only), the coach proposes the entry and the turn stops at a confirmation card. Only Log writes it,
  through the same code as the log sheets. The browser sends back approval ids and yes/no; the tool and its input come
  from the chat the server saved, so nothing the browser sends can change what is written. Writing a new message
  instead of answering declines the open card.
- **Streaming:** Pulse sends `X-Accel-Buffering: no`, which nginx honours by default.

### Checking coach answers

`pnpm coach:eval --fixtures` checks six generated-data cases in an isolated in-memory database: Recovery drops, poor
sleep, missing data, conflicting signals, sparse habit evidence and conversation continuity. It never reads an
account's health data.

To compare real models, set `COACH_EVAL_PROVIDER`, `COACH_EVAL_MODEL` and `COACH_EVAL_KEY`, then run
`pnpm coach:eval`. It uses the chosen provider for answers, conversation summaries and a structured model judge. It
checks required data reads and grades grounding, actions and honesty. The judge is a heuristic, not proof of answer
quality. The output contains case names and pass/fail scores, never keys, health data or full replies. Provider usage
is billed to that key.

## Environment reference

Every variable is listed in [`.env.example`](../.env.example). The server validates them at boot and exits with a
list of what's wrong.

| Variable | Required | Meaning |
|---|---|---|
| `DATA_SOURCE` | no (`demo`) | `demo`: generated data for one shared demo user; `google`: real data, accounts, each user connects Google |
| `POSTGRES_PASSWORD` | with compose | The database password; compose builds `DATABASE_URL` from it |
| `DATABASE_URL` | outside compose | Defaults to `postgres://pulse:pulse@localhost:5432/pulse` (compose.dev.yaml) |
| `DATABASE_SSL_CA` | no | The database's CA certificate (PEM or base64), for a server signed by its own CA such as Aiven; the URL's `ssl*` parameters are then ignored |
| `DB_POOL_MAX` | no (10; 2 on Vercel) | Connections in the database pool |
| `CRON_SECRET` | on Vercel | The secret `/api/cron` checks; it refuses every request without it ([docs/vercel.md](vercel.md)) |
| `BETTER_AUTH_SECRET` | in production | Signs sessions; `openssl rand -base64 32` |
| `ADMIN_EMAILS` | with Google | Comma-separated owner emails: they open the admin panel; on a server with no accounts, they sign up without an invite |
| `SIGNUP` | no (`invite`) | The starting sign-up mode (`invite`, `open` or `closed`) until an admin changes it in the panel |
| `DISABLE_SIGNUP` | no (false) | Older setting: `true` is the same as `SIGNUP=closed` |
| `COACH_LOCAL_URL`, `COACH_LOCAL_MODEL` | no | A model you run (OpenAI-compatible, e.g. Ollama at `http://localhost:11434/v1`), offered in the coach with no key; set both or neither |
| `SUPPORT_EMAIL` | no | Shown on the forgot-password page so people can ask you for a reset |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | no | Turns on notifications ("Recovery ready", "Pulse can't sync", and the coach's optional "Your brief is ready"). Make the keys with `npx web-push generate-vapid-keys`; the subject is `mailto:you@example.com`. Set all three or none |
| `ANDROID_PACKAGE_NAME`, `ANDROID_CERT_SHA256` | no | Your Android APK's package and signing key fingerprints, served as `/.well-known/assetlinks.json` so the APK opens without a URL bar ([docs/pwa.md](pwa.md#android-apk-with-pwabuilder)). Set both or neither |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | with Google | The OAuth client |
| `APP_URL` | no (recommended behind a proxy) | The public URL; it pins the OAuth redirect and is the trusted origin for sign-in ([below](#app_url)). On a Vercel production deployment it defaults to the project's production domain |
| `AVATAR_URL` | no | A default avatar photo; a user's Google photo or upload wins |

Each user's time zone is set in onboarding and Settings › Profile, not in the environment.

### APP_URL

`APP_URL` is optional. It has nothing to do with CORS: the browser only talks to Pulse's own origin, so no
cross-origin requests happen. It sets two things:

- **The OAuth redirect URI** (`src/server/sources/google/oauth.ts`). Without `APP_URL`, Pulse builds it from the
  address the request came in on, so one OAuth client can serve localhost, a LAN address and a tunnel at once.
- **better-auth's `baseURL` and `trustedOrigins`** (`src/server/auth.ts`). better-auth rejects sign-in and sign-up
  requests whose `Origin` header isn't trusted (a CSRF check). Without `APP_URL`, it works out the base URL from each
  request.

Without it, both depend on the tunnel or proxy passing the original host and `https` scheme on to Pulse. If it
doesn't, Pulse sees something like `http://localhost:3000`, and you get `redirect_uri_mismatch` from Google or an
"Invalid origin" error at sign-in. Setting `APP_URL` rules this out, which is why the guides set it. Leave it unset
only if you open Pulse on several addresses (each then needs its own redirect URI in the OAuth client).

## Local development helpers

- `pnpm seed:demo [username]` fills a local account (or the demo account `demo@pulse.local` /
  `pulse-demo-generated-data`) with 180 days of generated data. It refuses an account that has connected Google.
- `pnpm seed:people` (development only) adds a dozen sample accounts (password `pulse-sample-person`) and open, used
  and expired invites, to try the admin dashboard.
