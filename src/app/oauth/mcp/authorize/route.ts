import { currentUser } from "@/server/auth";
import { authorizeRedirect, issuerOf, resourceOf, safeRedirect, validateAuthorize, oauthHeaders } from "@/server/mcp/oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const issuer = issuerOf(req.url);
  try { await validateAuthorize(url.searchParams, resourceOf(req.url)); } catch {
    const uri = url.searchParams.get("redirect_uri") ?? "";
    if (url.searchParams.getAll("redirect_uri").length === 1 && safeRedirect(uri))
      return new Response(null, { status: 303, headers: { ...oauthHeaders, Location: authorizeRedirect(uri, url.searchParams, issuer, { error: "invalid_request" }) } });
    return new Response("Invalid authorization request", { status: 400, headers: oauthHeaders });
  }
  const next = `/oauth/mcp/authorize${url.search}`;
  const location = await currentUser() ? `/oauth/mcp/consent${url.search}` : `/login?next=${encodeURIComponent(next)}`;
  return new Response(null, { status: 303, headers: { ...oauthHeaders, Location: location } });
}
