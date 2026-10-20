# MCP: let an AI agent use your Pulse

Pulse serves your data to AI agents (Hermes, Claude Desktop, Cursor, any MCP client) over the
[Model Context Protocol](https://modelcontextprotocol.io). An agent reads your recovery, sleep, strain and health, and
can log water, food, weight, mood and symptoms when you ask it to. It sees only your account.

## Connect

1. In Pulse, open **Settings › Agents**, name the agent and tap **Create**.
2. Copy the token (`pulse_…`). It is shown once; Pulse keeps only its SHA-256.
3. Point the agent at `https://<your-pulse-host>/api/mcp` (Streamable HTTP) with the header
   `Authorization: Bearer <token>`.

Hermes (`config.yaml`):

```yaml
mcp_servers:
  pulse:
    url: https://pulse.example.com/api/mcp
    headers:
      Authorization: "Bearer pulse_…"
```

Any client that takes a URL and headers works the same way. Revoke a token in Settings › Agents and that agent is refused
on its next request. Up to 10 tokens per person. With nginx in front, no special proxy settings are needed: the endpoint
answers each request with plain JSON.

## Tools

They are the coach's own tools (`src/server/coach/tools.ts`), with the same inputs and descriptions (the admin
dashboard's wording is not applied: MCP uses the defaults in `texts.ts`).

| Tool | Reads |
|---|---|
| `get_day` | One day: Recovery and its contributors, sleep, Strain and target, stress, Energy Bank |
| `get_sleep` | One night: need, stages, efficiency, consistency, debt, bedtime planner |
| `get_trend` | One metric over up to 90 days, against the previous window |
| `get_activities`, `get_activity` | Recent workouts; one workout's heart rate, zones and recovery |
| `get_journal_impacts` | How journal behaviours relate to recovery, HRV or sleep |
| `get_health` | Vitals against your ranges, Pulse Age, VO2 max, training load |
| `get_report` | The latest weekly or monthly report |
| `get_profile` | Age, sex, max heart rate, time zone, first day with data |
| `log_water`, `log_food`, `log_weight`, `log_mood`, `log_symptoms` | Save one entry |
| `log_period`, `log_ovulation` | Save one entry (female profiles only) |

A metric with no value returns a reason (`calibrating`, `awaiting_sleep_sync`, `band_not_worn`, `no_data`) instead of a
number. Days are your local days.

## Writes

In the coach chat you tap **Log** before a log tool runs. Over MCP there is no such step: the token is your consent, and a
log tool saves as soon as the agent calls it, by the same path as the log sheets (so Google Health gets the entry when the
server is connected to it). Tell an agent to log only when you want it logged. Read-only access is not offered yet;
revoke the token to stop it.

## Security

- A token resolves to one user. Every tool is built for that user alone; the agent never names a user.
- Tokens are random (256 bits), stored hashed, never logged, and shown once.
- Anyone holding a token can read your health data and log entries as you. Treat it like a password and give each agent
  its own so you can revoke one without the others.
- Serve Pulse over HTTPS: the token is a bearer credential.
