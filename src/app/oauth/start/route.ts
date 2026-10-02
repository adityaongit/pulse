import { getConfig } from "@/server/config";
import { authUrl, createState, redirectUri } from "@/server/sources/google/oauth";

/** Redirects to Google consent. 404 in demo mode (`google` is null unless GOOGLE_OAUTH_ENABLED=true). */
export function GET() {
  const { google } = getConfig();
  if (!google) return new Response("Not found", { status: 404 });
  const url = authUrl({ clientId: google.clientId, redirectUri: redirectUri(google.appUrl), state: createState() });
  return Response.redirect(url, 302);
}
