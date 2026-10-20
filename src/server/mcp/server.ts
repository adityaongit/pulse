// The MCP server for one signed-in user: the coach's own tools (../coach/tools.ts, the read tools and the log tools),
// registered with the same input schemas and descriptions, so the coach and MCP clients never drift. The tools are
// closed over the user's QueryCtx; a client never names a user.
//
// One difference from the chat: the coach asks the user to tap Log before a log tool runs (`coachApproval`, applied by
// the chat route, not by the tool). An MCP client is the user's own authenticated agent and the token is the consent,
// so the log tools run as called, and their descriptions say so instead of "waits for the user".
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { isLogTool } from "@/lib/log";
import { APP_VERSION } from "../queries/settings";
import type { QueryCtx } from "../queries/common";
import { coachTools } from "../coach/tools";
import { defaultTexts, LOG_WAITS, type Texts } from "../coach/texts";

const INSTRUCTIONS =
  "Pulse: one person's recovery, strain, sleep and health data from their own Pulse server. Read tools return digests of what the app shows; " +
  "a metric without a value carries a reason (calibrating, awaiting_sleep_sync, band_not_worn, no_data) instead of a number: say so, never guess. " +
  "Days are the person's local days. The log_ tools save an entry for this person immediately: call them only when they asked you to.";

/** The coach's default wording, with the chat-only "waits for the user to confirm" made true for this transport. */
const mcpTexts: Texts = (key) => defaultTexts(key).replace(LOG_WAITS, "Saves immediately");

/** What an MCP call needs of a coach tool: AI SDK 7 tools whose input is a zod object and whose output is plain data. */
type CoachTool = { description: string; inputSchema: z.ZodObject; execute: (input: never, options: never) => Promise<unknown> };

export function createMcpServer(ctx: QueryCtx): McpServer {
  const server = new McpServer({ name: "pulse", version: APP_VERSION }, { instructions: INSTRUCTIONS });
  for (const [name, tool] of Object.entries(coachTools(ctx, mcpTexts)) as unknown as [string, CoachTool][]) {
    server.registerTool(
      name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: isLogTool(name) ? { readOnlyHint: false, destructiveHint: false } : { readOnlyHint: true } },
      async (args: object) => {
        try {
          const out = await tool.execute(args as never, { toolCallId: `mcp-${name}`, messages: [] } as never);
          return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
        } catch (e) {
          // Name only: a database error can echo the query and its parameters.
          console.warn(`[mcp] ${name} failed: ${e instanceof Error ? e.name : "error"}`);
          return { isError: true, content: [{ type: "text" as const, text: "The tool failed. Try again." }] };
        }
      },
    );
  }
  return server;
}
