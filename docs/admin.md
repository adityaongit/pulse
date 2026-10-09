# Running a Pulse server as admin

What you can do as the admin of a Pulse server once it is set up ([setup.md](setup.md)).

## Become the admin

Put your own email in `ADMIN_EMAILS` before the first start, then open Pulse and create your account **right away**.

- While the server has no accounts, an `ADMIN_EMAILS` address needs no invite.
- Emails aren't verified, so whoever signs up first with that address owns the server.
- Once any account exists, an `ADMIN_EMAILS` address can't be used to sign up at all.

Already running Pulse? Set `ADMIN_EMAILS` to the email of your existing account and restart.

There are two kinds of admin:

- **Owners**: the emails in `ADMIN_EMAILS`. They are changed only in `.env`, never from the dashboard. To add a second
  owner, let them create their account first (with an invite), then add their email and restart.
- **Admins**: accounts an admin switched to **Admin** in the dashboard.

## The admin dashboard

Open **`/admin`**. It isn't linked from the app's menus, and anyone who isn't an admin gets a 404 there. No page in it
shows anyone's health data.

- **Overview**: how many people, how active they are, sign-ups per week, open invites, and how access is set.
- **People**: everyone on the server, with their role, when they joined and were last active, their Google
  connection and coach set-up. **Manage** opens a person's panel, where you can:
  - switch **Admin** and **AI coach** on or off;
  - **Sign out everywhere**;
  - **Reset password** (owners only);
  - **Delete account**, which removes the account and all its data. An admin must be switched to member first.
- **Invites**: create and revoke invite links.
- **Access**: choose who can sign up and who can use the AI coach.
- **AI coach**: edit the coach's instructions.

## Invite people

Sign-up is **invite only** by default. In **Invites**, **Create invite link** makes a one-time link
(`/signup?invite=…`) that expires after 7 days. It is shown only once, so copy it and send it to the person.
**Revoke** an open link to stop it working.

To change who can sign up, pick one in **Access**: **Invite only**, **Open to anyone** or **Closed**. It applies at
once. `SIGNUP` in `.env` sets the mode only until an admin picks one here.

## Turn on the AI coach

The coach is off until you pick **Everyone** or **Chosen people** in **Access**. With **Chosen people**, switch it on
per person in **People › Manage**; owners always have it.

- Each person adds their own provider API key, so the server pays nothing. Admins can't see anyone's key or chats.
- To offer a model you run yourself (for example Ollama), set `COACH_LOCAL_URL` and `COACH_LOCAL_MODEL` in `.env`.
  It is offered as "This server's model", with no key needed.
- Changing `BETTER_AUTH_SECRET` makes stored keys unreadable, and everyone has to add their key again.
- The coach can log water, food, weight, mood and symptoms (and cycle entries on female profiles) when asked. Each
  entry waits for the person to tap Log, and goes to Google Health as if they had used the log sheet.
- In **AI coach**, you can edit the coach's instructions and its tool descriptions. Every save is a new version, with
  history, restore and reset to the default.

## Reset a password

Pulse sends no email, so people who forget their password ask you. Set `SUPPORT_EMAIL` in `.env` and the
forgot-password page shows an "Email the admin" button.

1. Check that it is really them.
2. Reset it in **People › Manage › Reset password** (owners only), or on the server:

   ```sh
   docker exec pulse node scripts/reset-password.mjs <username-or-email>
   ```

   Either way you get a temporary password, and the person is signed out on every device.
3. Send them the temporary password over a channel you trust.
4. They sign in with it and choose a new password in Settings › Account.

## Fill a test account with generated data

To try every screen without a Fitbit, fill an account that hasn't connected Google with 180 days of generated data:

```sh
docker exec pulse node scripts/seed-user.mjs <username-or-email>
```

## Update Pulse

```sh
scripts/deploy.sh
```

It backs up the database, pulls the latest `main`, rebuilds, and rolls back to the previous version if the new one
doesn't start (`--help` for options).

## Back up the database

Dump Postgres daily from cron. This script keeps 14 days:

```sh
#!/bin/sh
set -eu
umask 077
dir=/var/backups/pulse
mkdir -p "$dir" && chmod 700 "$dir"
docker exec pulse-db pg_dump -U pulse -Fc pulse > "$dir/pulse-$(date +%F).dump"
ls -1t "$dir"/pulse-*.dump | tail -n +15 | xargs -r rm -f
```

The dump holds everyone's health data and Google tokens, so encrypt any copy that leaves the machine.

To restore a dump:

```sh
docker compose stop pulse
docker exec -i pulse-db pg_restore -U pulse -d pulse --clean --if-exists < pulse-YYYY-MM-DD.dump
docker compose start pulse
```
