import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Config } from "./config";

// Module level: jose caches the fetched keys and refetches on an unknown kid.
// ponytail: one team domain per process, which is all config allows.
let jwks: JWTVerifyGetKey | undefined;
const remoteJwks = (teamDomain: string) =>
  (jwks ??= createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)));

/**
 * Fail-closed Cloudflare Access check (KTD13). Returns a 403 to send, or undefined to let the
 * request through. Only `/healthz` is exempt; the manifest and icons are fetched with credentials.
 */
export async function checkAccess(
  req: Request,
  access: Config["access"],
  getKey?: JWTVerifyGetKey,
): Promise<Response | undefined> {
  if (access.bypass || new URL(req.url).pathname === "/healthz") return;
  const token = req.headers.get("cf-access-jwt-assertion");
  if (token) {
    try {
      await jwtVerify(token, getKey ?? remoteJwks(access.teamDomain), {
        issuer: access.teamDomain,
        audience: access.aud,
        algorithms: ["RS256"],
      });
      return;
    } catch {
      // Any verify failure (signature, expiry, aud, issuer, JWKS fetch) is a 403.
    }
  }
  return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
}
