// The MCP endpoint (Streamable HTTP, stateless): one JSON-RPC exchange per POST, answered as JSON. There are no sessions
// and no server-initiated messages, so GET (a stream) and DELETE (end a session) are not exported and Next answers 405. A personal access
// token (Settings › Agents) in `Authorization: Bearer` picks the one user the request is about; the tools are built
// for that user alone (src/server/mcp/server.ts). Nothing here is cookie-based, so src/proxy.ts leaves /api/mcp open.
// Never logs the token, the request or the tool output.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/server/db";
import { createMcpServer } from "@/server/mcp/server";
import { TOKEN_PREFIX, userForToken } from "@/server/mcp/tokens";
import { ctxOf } from "@/server/queries/common";

const rpcError = (status: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

export async function POST(req: Request) {
  const token = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const db = getDb();
  const userId = token?.startsWith(TOKEN_PREFIX) ? await userForToken(db, token) : null;
  if (userId === null) return rpcError(401, "Unauthorized: send a Pulse access token as 'Authorization: Bearer pulse_…'.", { "WWW-Authenticate": "Bearer" });
  const ctx = await ctxOf(db, userId).catch(() => null);
  if (!ctx) return rpcError(409, "Finish setting up your Pulse profile first.");

  // Stateless: a server and transport per request, closed when it is answered.
  const server = createMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
