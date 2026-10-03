import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { appOrigin, authUrl, createState, hasGrant, redirectUri } from "@/server/sources/google/oauth";

/** Sign in with Google: redirects to consent. 404 on a demo instance (`google` is null unless GOOGLE_OAUTH_ENABLED=true). */
export function GET(request: Request) {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });
  const url = authUrl({
    clientId: google.clientId,
    redirectUri: redirectUri(appOrigin(request, google.appUrl)),
    state: createState(),
    prompt: hasGrant(getDb()) ? "select_account" : "consent",
  });
  return Response.redirect(url, 302);
}
