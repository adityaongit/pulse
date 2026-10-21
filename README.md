<div align="center">

<img src="docs/brand/logo-round.svg" alt="" width="88" height="88">

# Pulse

**Recovery, strain and sleep from your Google Health data.**

Daily scores from what your Fitbit or Pixel Watch syncs to Google Health. Built on Fitbit Air, free for personal use.

[![CI](https://github.com/adityaongit/pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/adityaongit/pulse/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)](LICENSE)
[![Website](https://img.shields.io/badge/site-pulse.portlabs.in-00f19f)](https://pulse.portlabs.in)

<img src="docs/screenshots/phone-home.png" alt="Pulse on a phone: sleep, recovery and strain dials" width="30%">
<img src="docs/screenshots/phone-health-monitor.png" alt="Pulse on a phone: the Health Monitor" width="30%">
<img src="docs/screenshots/phone-journal.png" alt="Pulse on a phone: the Journal" width="30%">

</div>

## Get Pulse

<div align="center">

<a href="docs/setup.md"><img src="docs/badges/self-host.svg" alt="Self-host on your server" height="56"></a>
<a href="https://github.com/adityaongit/pulse-mobile/releases/latest"><img src="docs/badges/android.svg" alt="Available on Android" height="56"></a>

**Self-host:** one Docker container with Postgres behind HTTPS, for you and the people you invite. The [setup guide](docs/setup.md)
walks through Google Cloud, Docker and Tailscale.

**Android:** [Pulse Mobile](https://github.com/adityaongit/pulse-mobile) needs no server or account and scores everything on your
phone, from Health Connect.

</div>

## What you get

- **Sleep, Recovery and Strain** every morning, with a Strain Target for the day
- **Pulse Age**, **Stress Monitor** and **Energy Bank** through the day
- **Health Monitor**, **Journal**, **Trends**, **Reports**, **My Dashboard** and an optional **AI coach** with your own key

Every score is explained on the [metrics pages](https://pulse.portlabs.in/metrics/) and in [docs/algorithms](docs/algorithms).
More screens: [docs/screenshots.md](docs/screenshots.md).

## Try the demo

No Google account needed: demo mode generates 180 days of data.

```sh
git clone https://github.com/adityaongit/pulse.git && cd pulse
pnpm install && cp .env.example .env
docker compose -f compose.dev.yaml up -d && pnpm dev    # http://localhost:3000
```

## Documentation

[Setup](docs/setup.md) · [Other setups](docs/other-setups.md) · [Admin](docs/admin.md) · [MCP](docs/mcp.md) · [PWA](docs/pwa.md) ·
[App shell](docs/mobile.md) · [Technical details](docs/technical-details.md) · [Contributing](CONTRIBUTING.md) ·
[AGENTS.md](AGENTS.md)

## License

[PolyForm Noncommercial 1.0.0](LICENSE) · [Security](SECURITY.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

<sub><b>Credits.</b> Design inspiration: the interface is inspired by the WHOOP app's look and flow. Pulse is a free, non-commercial community project by an independent developer. It is not affiliated with, endorsed by or competing with WHOOP, Inc., uses no WHOOP device, data, code or assets, and every score is computed from your own Google Health data. WHOOP is a trademark of WHOOP, Inc. If you represent WHOOP or any other company and have a concern, please email work.adityajindal@gmail.com and it will be changed or taken down.<br>
[noop](https://github.com/ryanbr/noop): the recovery, strain, sleep and readiness scoring is ported from its analytics engine.<br>
[Hælan](https://github.com/bardesss/haelan): its notes on how the Google Health API behaves saved a lot of trial and error.</sub>
