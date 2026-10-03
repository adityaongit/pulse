import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { getDb } from "@/server/db";
import { backupCopy, download, refuse } from "@/server/export";
import { defaultCtx } from "@/server/queries/common";

/**
 * A SQLite backup of everything Pulse stores, minus the Google grant and the session secret (see backupCopy).
 * Owner sessions only: a demo visitor gets a 403.
 */
export async function GET(req: NextRequest) {
  const session = await requestSession(req);
  if (!session) return refuse(401, "Signed out. Sign in again.");
  if (session.kind !== "owner") return refuse(403, "Backups are for the owner's account.");
  const file = await backupCopy(getDb());
  try {
    return download(defaultCtx(), "backup", "db", "application/vnd.sqlite3", new Uint8Array(fs.readFileSync(file)));
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}
