# Other ways to reach Pulse

[setup.md](setup.md) puts Pulse on HTTPS with Tailscale, so only your own devices can open it. This page sketches the
alternatives (for Vercel with a hosted Postgres, see [vercel.md](vercel.md)). Follow [setup.md](setup.md) for everything else, and swap its Tailscale steps (3 and 6.2) for one of
these.

Whichever you pick:

- Google needs an HTTPS hostname (plain `http` works only for `localhost`, and never with a raw IP address).
- Add `https://<your-host>/oauth/callback` as a redirect URI on the OAuth client.
- Setting `APP_URL=https://<your-host>` in `.env` is optional but recommended (see
  [technical-details.md](technical-details.md#app_url)).

## How the tunnel or proxy reaches Pulse

Pulse listens on port 3000 inside Docker and publishes no port on the host. Connect your tunnel or proxy in one of two
ways, in a `compose.override.yaml` next to `compose.yaml`:

- **Tunnel or proxy installed on the host:** publish a loopback-only port, as in [setup.md](setup.md#5-configure-pulse),
  and point it at `http://localhost:3000`.
- **Tunnel or proxy running in Docker:** put Pulse on the proxy's network and point it at `http://pulse:3000`, with no
  host port at all:

  ```yaml
  services:
    pulse:
      networks: [default, proxy]
  networks:
    proxy:
      external: true
  ```

## Cloudflare Tunnel

Good for reaching Pulse from anywhere without opening ports.

1. Add your domain to Cloudflare and create a tunnel in the
   [Zero Trust dashboard](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
2. Run `cloudflared` on the server, either installed on the host or as a container.
3. Add a public hostname such as `pulse.example.com` that routes to `http://localhost:3000` (host) or
   `http://pulse:3000` (Docker).

Sign-in rate limits use Cloudflare's client IP, and the coach streams through the tunnel with no extra setting.

## Reverse proxy with your own domain

Good for a server with a public IP. You open ports 80 and 443 to the internet, so only do this if you know how to
secure a server.

1. Point a DNS record for your domain at the server.
2. Run Caddy or nginx with a Let's Encrypt certificate and forward the domain to Pulse.
3. Forward the `X-Forwarded-For` and `X-Forwarded-Proto` headers.
4. With nginx, turn off response buffering for `/api/coach` (`proxy_buffering off;`) so coach answers stream.

## Real data on your laptop only

To try Pulse with your own data without a server, run the demo from [setup.md, step 1](setup.md#1-try-the-demo), set
`DATA_SOURCE=google`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and add
`http://localhost:3000/oauth/callback` as a redirect URI. Restart `pnpm dev` and open <http://localhost:3000>.
