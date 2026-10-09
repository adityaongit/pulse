# Running Pulse on Vercel

This page puts Pulse on Vercel's free Hobby plan with a free Postgres from Aiven or Neon. It's an alternative to the
Docker setup in [setup.md](setup.md); the Google OAuth steps are the same.

> Pulse is licensed under PolyForm Noncommercial 1.0.0 ([LICENSE](../LICENSE)). A deployment like this one is for
> personal, noncommercial use.

## How Pulse runs on Vercel

On Docker, one long-lived process runs the sync worker on a 15-minute timer. Vercel freezes a function between
requests, so a timer can't keep running there. When `VERCEL` is set (Vercel sets it on every deployment):

- **No timer loop.** The worker still starts at boot, but it only syncs when something asks it to.
- **`/api/cron` runs one sync cycle** over every connected user and returns when the cycle has finished (up to
  300 s). It needs `CRON_SECRET`, and it refuses every request while `CRON_SECRET` is unset.
- **Page loads still sync.** Opening Pulse runs your sync when the last run is more than 5 minutes old, and
  `after()` keeps the function alive until the run is done.
- **Migrations run at boot.** Each cold start applies any pending migrations, and the `drizzle/` folder is traced
  into the function bundle so they can be read from disk.
- **Small pool.** `DB_POOL_MAX` defaults to 2 on Vercel (10 elsewhere). Each running function instance has its own
  pool, plus one short-lived connection per user sync that holds that user's lock.

Vercel's Hobby plan runs a cron job at most once a day, so `vercel.json` schedules `/api/cron` daily at 00:30 UTC.
For regular syncs, have a free external pinger such as cron-job.org call it every 15–30 minutes
([below](#5-sync-every-15-minutes-with-cron-joborg)).

## 1. Create the database

Use either Aiven or Neon. Both free plans are enough for one person.

### Aiven

1. Sign up at [aiven.io](https://aiven.io), create a **PostgreSQL** service, and choose the **Free** plan. Pick a
   region close to your Vercel region (Vercel's default is Washington, D.C., `iad1`).
2. When the service is running, open its **Overview** page:
   - Copy the **Service URI**. It looks like
     `postgres://avnadmin:<password>@pg-xxxx.aivencloud.com:12345/defaultdb?sslmode=require`. This is your
     `DATABASE_URL`.
   - Download the **CA certificate** (`ca.pem`). Aiven signs its servers with its own CA, so without it the
     connection fails with `self-signed certificate in certificate chain`.
3. Turn the certificate into one line for Vercel:

   ```sh
   base64 -w0 ca.pem      # macOS: base64 -i ca.pem
   ```

   This is your `DATABASE_SSL_CA`. You can also paste the PEM as is, line breaks included. When
   `DATABASE_SSL_CA` is set, Pulse verifies the server against that CA and ignores the `sslmode` parameter in the URL.

Aiven's free plan allows only a few connections, so keep `DB_POOL_MAX` at 1 or 2.

### Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project (Postgres 16 or newer). Pick a region close to your
   Vercel region.
2. In **Connect**, turn on **Connection pooling** and copy the connection string. Its host ends in `-pooler`, for
   example `postgresql://user:<password>@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`. This is your
   `DATABASE_URL`.

Neon uses a public CA, so you don't need `DATABASE_SSL_CA`. Pulse's per-user sync lock is transaction-scoped, so it
works behind Neon's pooler.

## 2. Create the Google OAuth client

Follow [setup.md › 4. Create the Google OAuth client](setup.md#4-create-the-google-oauth-client), with this redirect
URI:

```
https://<your-project>.vercel.app/oauth/callback
```

The host is your production domain on Vercel (or your custom domain). It must match `APP_URL` exactly. You can import
the project first (step 4) to find out the domain, then come back and add the redirect URI.

For demo data only (`DATA_SOURCE=demo`), skip this step.

## 3. Environment variables

Set these in Vercel under **Project › Settings › Environment Variables**, for the **Production** environment.

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | The Aiven service URI or the Neon pooled connection string |
| `DATABASE_SSL_CA` | Aiven | The contents of Aiven's `ca.pem`, base64-encoded or as is |
| `DB_POOL_MAX` | no (2 on Vercel) | Connections per function instance. Use `1` or `2` on a free database |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `CRON_SECRET` | yes | `openssl rand -hex 32`. Vercel Cron sends it automatically; give it to cron-job.org too |
| `APP_URL` | yes | `https://<your-project>.vercel.app` (or your custom domain), with no trailing slash |
| `ADMIN_EMAILS` | yes | Your email. On a server with no accounts, this address can sign up without an invite |
| `DATA_SOURCE` | yes | `google` for your own data, or `demo` for generated data |
| `GOOGLE_CLIENT_ID` | with `google` | From step 2 |
| `GOOGLE_CLIENT_SECRET` | with `google` | From step 2 |
| `ENABLE_EXPERIMENTAL_COREPACK` | recommended | `1`, so Vercel builds with the pnpm version in `package.json` (`packageManager`) |

The optional variables in [technical-details.md](technical-details.md#environment-reference) (`SIGNUP`,
`SUPPORT_EMAIL`, the `VAPID_*` notification keys, `COACH_LOCAL_*`) work the same way on Vercel. `VERCEL` is set by
Vercel itself; don't add it.

## 4. Import the project

1. Push your fork of Pulse to GitHub.
2. In Vercel, click **Add New › Project** and import the repository. Vercel detects Next.js. Leave the root directory,
   build command and output settings at their defaults.
3. Add the variables from step 3 before the first deploy, then click **Deploy**.
4. When the deploy is done, open `https://<your-project>.vercel.app/healthz`. `{"ok":true}` means the app booted and
   the migrations ran. If it fails, open the deployment's **Logs**: an invalid setting is reported as
   `Invalid configuration: ...` with the variable's name.
5. Sign up with an email in `ADMIN_EMAILS`, finish onboarding, and connect Google in Settings.

The `site/` folder is the landing page, a separate Astro project; it isn't part of this deployment.

## 5. Sync every 15 minutes with cron-job.org

The daily Vercel Cron is a backstop. For regular syncs:

1. Sign up at [cron-job.org](https://cron-job.org) and click **Create cronjob**.
2. **URL**: `https://<your-project>.vercel.app/api/cron`
3. **Execution schedule**: every 15 or 30 minutes.
4. Under **Advanced**:
   - **Request method**: `GET` (`POST` works too).
   - **Headers**: add `Authorization` with the value `Bearer <CRON_SECRET>`, or `x-cron-secret` with the value
     `<CRON_SECRET>`.
   - **Timeout**: the longest available. A cycle that pulls new data can take tens of seconds; a timeout on the
     pinger's side doesn't stop the run.
5. Save, then click **Test run**. A `200` with `{"ok":true}` means the cycle ran; a `401` means the secret is missing or
   wrong.

If your pinger can't send headers, use `https://<your-project>.vercel.app/api/cron?secret=<CRON_SECRET>` instead.
A query string ends up in request logs (Vercel's and the pinger's), so prefer a header when you can.

The secret is compared in constant time.

## Troubleshooting

- **`self-signed certificate in certificate chain`**: on Aiven, set `DATABASE_SSL_CA` to the service's CA
  certificate.
- **`remaining connection slots are reserved` or `too many clients`**: lower `DB_POOL_MAX` to 1. On Neon, use the
  `-pooler` connection string.
- **`redirect_uri_mismatch` when connecting Google**: the OAuth client's redirect URI must be exactly
  `<APP_URL>/oauth/callback`.
- **Data only updates when you open Pulse**: the external pinger isn't running or is getting `401`. Check its
  history in cron-job.org.
