// Request-scoped session lookup for Server Components and Server Actions. Actions check it
// themselves: the proxy is the main gate, but an action must never rely on a matcher alone.
import { cookies } from "next/headers";
import { getConfig } from "./config";
import { getDb } from "./db";
import { SESSION_COOKIE, type Session, verifySession } from "./session";

export async function currentSession(): Promise<Session | null> {
  const { google } = getConfig();
  return verifySession(getDb(), (await cookies()).get(SESSION_COOKIE)?.value, {
    googleEnabled: !!google,
    ownerEmail: google?.ownerEmail ?? null,
  });
}

export const SIGNED_OUT = { ok: false as const, error: "Signed out. Sign in again." };
