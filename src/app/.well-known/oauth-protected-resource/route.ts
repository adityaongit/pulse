import { protectedResource } from "@/server/mcp/oauth";
export function GET(req: Request) { return Response.json(protectedResource(req.url)); }
