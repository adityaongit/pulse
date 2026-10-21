import { getDb } from "@/server/db";
import { exchangeToken, resourceOf, oauthHeaders } from "@/server/mcp/oauth";
export async function POST(req: Request) {
  if (req.headers.has("authorization") || req.headers.get("content-type")?.split(";")[0].trim() !== "application/x-www-form-urlencoded")
    return Response.json({ error: "invalid_request" }, { status: 400, headers: oauthHeaders });
  let params: URLSearchParams;
  try { params = new URLSearchParams(await req.text()); } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: oauthHeaders });
  }
  const result = await exchangeToken(getDb(), params, resourceOf(req.url));
  return Response.json(result, { status: "error" in result ? 400 : 200, headers: oauthHeaders });
}
