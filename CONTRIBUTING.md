# Contributing to Pulse

Thanks for wanting to help. Pulse is a self-hosted, one-user-per-instance app, and contributions of every
size are welcome: bug reports, docs, fixes, new screens and better algorithms.

## Before you start

- **Licence.** Pulse is source-available under [PolyForm Noncommercial 1.0.0](LICENSE), not an OSI open-source
  licence. By contributing, you agree that your contribution is licensed under the same terms, and that the
  maintainer may relicense the project in the future. Scoring code ported from
  [noop](https://github.com/ryanbr/noop) keeps noop's notice (see [NOTICE](NOTICE)).
- **Talk first for big changes.** Open an issue before a large feature or a change to how a score is
  computed, so we agree on the approach before you write the code.
- **Security issues** go through [SECURITY.md](SECURITY.md), never a public issue.
- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Node 24 and pnpm (the version pinned in `package.json`; `corepack enable` picks it up).

```sh
pnpm install
cp .env.example .env    # demo mode: no Google account needed
pnpm dev                # http://localhost:3000, then "Continue with demo data"
```

Demo mode generates 180 days of realistic data, so every screen works without a Fitbit. To work against
real data, follow [docs/setup.md](docs/setup.md).

## How changes land

```mermaid
flowchart LR
  fork[Fork, or a branch if you have access] --> branch[Branch off main<br/>feat/..., fix/...]
  branch --> commit[Small commits<br/>Conventional Commits, signed off]
  commit --> pr[Pull request to main]
  pr --> ci[CI: checks + e2e]
  ci --> review[Code owner review]
  review --> squash[Squash merge]
```

`main` is protected: nobody pushes to it directly, not even the maintainer. Every change is a pull request
that passes CI and gets a review, and it lands as one squashed commit.

1. Branch off `main`: `feat/short-name`, `fix/short-name`, `docs/short-name`.
2. Commit in small steps with [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat(journal): ...`, `fix(sync): ...`, `docs: ...`) and sign off each commit with `git commit -s`
   ([Developer Certificate of Origin](https://developercertificate.org/)).
3. Before you push, run:

   ```sh
   pnpm typecheck && pnpm lint && pnpm test
   pnpm e2e   # for UI changes; it runs its own server on :3300
   ```

4. Open a pull request and fill in the template. CI must be green.

## The rules of the codebase

[AGENTS.md](AGENTS.md) is the guide for both people and coding agents. The short version:

- **Honest states.** Every nullable metric is `{ value, reason, provisional }` with a reason code. Never show a
  made-up number.
- **Causality.** A day's scores depend only on that day and earlier days.
- **UI from the kit.** Screens are built from the shells and kit components with the design tokens in
  `src/app/globals.css`; no new CSS files. Check every UI change at 361 px (a phone) and 1440 px (a laptop).
  The UI contract is [docs/design/spec.md](docs/design/spec.md).
- **Tests beside the code.** Algorithms get golden-value or property tests; queries get tests on a temporary
  database (`src/server/testing.ts`).
- **Database changes** go through `pnpm db:generate`; migrations run at boot.

## Privacy and assets

- Use demo data in issues, screenshots and test fixtures. Never commit or post real health data, OAuth
  tokens, `.env` files or databases.
- Never commit third-party screenshots (WHOOP, Bevel or others). Describe them in words or keep them in the
  gitignored `docs/design/reference/`.
- Fixtures from the Google Health API must be synthetic or scrubbed of anything personal.

## Reporting bugs and ideas

Use the issue templates. A good bug report says what happened, what you expected, how to reproduce it in
demo mode, and which version you run (More › About).
