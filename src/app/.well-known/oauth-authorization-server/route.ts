import { authorizationServer } from "@/server/mcp/oauth";
export function GET(req: Request) { return Response.json(authorizationServer(req.url)); }
