import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const go = (path: string, cookie?: string) => {
  const res = proxy(new NextRequest(`http://pulse:3000${path}`, { headers: cookie ? { cookie } : {} }));
  return res ? new URL(res.headers.get("location")!).pathname : "pass";
};
const SESSION = "better-auth.session_token=abc.def";

describe("proxy", () => {
  it("signed out: every screen goes to /login; the signed-out pages and /logout pass", () => {
    for (const p of ["/", "/settings", "/onboarding", "/strain/2026-10-01"]) expect(go(p), p).toBe("/login");
    for (const p of ["/login", "/login/demo", "/signup", "/forgot", "/logout"]) expect(go(p), p).toBe("pass");
    expect(go("/loginx")).toBe("/login");
  });

  it("with a session cookie (plain or __Secure-) everything passes; the pages check the session themselves", () => {
    for (const c of [SESSION, `__Secure-${SESSION}`]) for (const p of ["/", "/settings", "/login", "/signup"]) expect(go(p, c), p).toBe("pass");
  });

  it("the matcher leaves better-auth, the MCP endpoint, Google's redirect, the health check, build assets and public files open", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of ["/api/auth/sign-in/email", "/api/mcp", "/oauth/callback", "/oauth/start", "/healthz", "/_next/static/x.js", "/icon.svg", "/manifest.webmanifest", "/icons/oauth-logo-120.png", "/sw.js", "/offline.html", "/splash/apple-splash-dark-1179-2556.png", "/screenshots/phone-home.webp", "/.well-known/assetlinks.json"])
      expect(re.test(p), p).toBe(false);
    for (const p of ["/", "/settings", "/login", "/onboarding", "/strain/2026-10-01", "/activity/a.b", "/metric/x.json", "/api/coach", "/api/mcp/x"]) expect(re.test(p), p).toBe(true);
  });
});
