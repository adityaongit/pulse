import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { setOwnerPicture } from "@/server/avatar";
import { claimOrCheckOwner, cookieOptions, isHttps, SESSION_COOKIE, signSession, verifySession } from "@/server/session";
import { appOrigin, consumeState, exchangeCode, GoogleError, redirectUri } from "@/server/sources/google/oauth";
import { requestSync } from "@/server/worker";

/**
 * Google's redirect back. A missing, unknown, reused or expired `state` is a 400 and touches nothing.
 * Signing in lands on Home (the proxy routes on to onboarding) with a session cookie, or back on
 * /login?error=<code>. An owner already signed in was reconnecting from Settings: back there with
 * `?oauth=connected` or `?oauth=<code>`.
 */
export async function GET(request: NextRequest) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });

  const params = request.nextUrl.searchParams;
  if (!consumeState(params.get("state"))) return new Response("Invalid or expired state", { status: 400 });

  const db = getDb();
  const origin = appOrigin(request, google.appUrl);
  const signedIn = await verifySession(db, request.cookies.get(SESSION_COOKIE)?.value, { googleEnabled: true, ownerEmail: google.ownerEmail });
  const back = (result: string) =>
    NextResponse.redirect(signedIn ? `${origin}/settings?oauth=${encodeURIComponent(result)}` : `${origin}/login?error=${encodeURIComponent(result)}`, 302);
  const code = params.get("code");
  if (!code) return back("access_denied");
  try {
    const { email, picture } = await exchangeCode(db, {
      google,
      redirectUri: redirectUri(origin),
      code,
      allow: (e) => claimOrCheckOwner(db, e, google.ownerEmail),
    });
    // Start the import now, not at the next timer tick: runs before the grant finished at once and armed the
    // 5-minute gate. Fire-and-forget, so the redirect doesn't wait on the sync.
    requestSync({ force: true });
    setOwnerPicture(db, picture);
    const res = NextResponse.redirect(signedIn ? `${origin}/settings?oauth=connected` : `${origin}/`, 302);
    res.cookies.set(SESSION_COOKIE, await signSession(db, { kind: "owner", email }), cookieOptions(isHttps(request)));
    return res;
  } catch (err) {
    // GoogleError messages hold a status and code only; anything else is logged by name alone.
    console.error(`[oauth] callback failed: ${err instanceof GoogleError ? err.message : (err as Error)?.name}`);
    return back(err instanceof GoogleError ? err.code : "error");
  }
}
