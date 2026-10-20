// Personal access tokens for the MCP endpoint (/api/mcp). A token is `pulse_` plus 32 random bytes; only its SHA-256 is
// stored, so a leaked database can't be replayed, and the token itself is shown once, when it is made. Every token
// belongs to one user and resolves to exactly that user.
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { mcpTokens } from "../db/schema";

export const TOKEN_PREFIX = "pulse_";
export const MAX_NAME = 60;
/** Tokens one person can hold at once. */
export const MAX_TOKENS = 10;
export type TokenRow = { id: number; name: string; createdAt: number; lastUsedAt: number | null };

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Makes a token for `userId` and returns it: the only time it exists in the clear. */
export async function createToken(db: Db, userId: number, name: string): Promise<string> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  await db.insert(mcpTokens).values({ userId, name, tokenHash: hashOf(token), createdAt: nowSeconds() });
  return token;
}

export async function listTokens(db: Db, userId: number): Promise<TokenRow[]> {
  return db
    .select({ id: mcpTokens.id, name: mcpTokens.name, createdAt: mcpTokens.createdAt, lastUsedAt: mcpTokens.lastUsedAt })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt), desc(mcpTokens.id));
}

/** Deletes one of the user's own tokens; the agent holding it is refused from its next request. */
export async function revokeToken(db: Db, userId: number, id: number): Promise<void> {
  await db.delete(mcpTokens).where(and(eq(mcpTokens.userId, userId), eq(mcpTokens.id, id)));
}

/** The user a token belongs to, or null for an unknown one. Stamps `last_used_at` in the same statement. */
export async function userForToken(db: Db, token: string): Promise<number | null> {
  const [row] = await db.update(mcpTokens).set({ lastUsedAt: nowSeconds() }).where(eq(mcpTokens.tokenHash, hashOf(token))).returning({ userId: mcpTokens.userId });
  return row?.userId ?? null;
}
