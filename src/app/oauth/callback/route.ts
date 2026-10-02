import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { consumeState, exchangeCode, GoogleError, redirectUri } from "@/server/sources/google/oauth";

/**
 * Google's redirect back. A missing, unknown, reused or expired `state` is a 400 and touches nothing.
 * Otherwise the result goes back to /settings as `?oauth=connected` or `?oauth=<error code>`.
 */
export async function GET(request: Request) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  if (!consumeState(params.get("state"))) return new Response("Invalid or expired state", { status: 400 });

  const back = (result: string) =>
    Response.redirect(`${google.appUrl}/settings?oauth=${encodeURIComponent(result)}`, 302);
  const code = params.get("code");
  if (!code) return back("access_denied");
  try {
    await exchangeCode(getDb(), { google, redirectUri: redirectUri(google.appUrl), code });
    return back("connected");
  } catch (err) {
    // GoogleError messages hold a status and code only; anything else is logged by name alone.
    console.error(`[oauth] callback failed: ${err instanceof GoogleError ? err.message : (err as Error)?.name}`);
    return back(err instanceof GoogleError ? err.code : "error");
  }
}
