// Sign-in session (U20): an HS256 JWT in an httpOnly cookie, signed with a per-instance secret
// generated on first use and kept in the database. One user per instance, so the payload is just
// who signed in: the Google owner, or a visitor of a demo instance.
import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Db } from "./db";
import { instance } from "./db/schema";

export const SESSION_COOKIE = "pulse_session";
export const SESSION_DAYS = 90;

export type Session = { kind: "owner"; email: string } | { kind: "demo" };

// Read first, insert only when missing: an insert on every request would wait on the worker's write lock.
function instanceRow(db: Db) {
  const row = db.select().from(instance).get();
  if (row) return row;
  db.insert(instance).values({ id: 1, sessionSecret: randomBytes(32).toString("base64url") }).onConflictDoNothing().run();
  return db.select().from(instance).get()!;
}

const key = (db: Db) => new TextEncoder().encode(instanceRow(db).sessionSecret);

export async function signSession(db: Db, s: Session, now = Date.now()): Promise<string> {
  return new SignJWT(s.kind === "owner" ? { email: s.email } : {})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.kind)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + SESSION_DAYS * 86_400)
    .sign(key(db));
}

/**
 * The session in a cookie value, or null for missing, forged, expired or stale ones. A session is stale
 * when the instance has changed hands since: an owner session must still name the owner, and a demo
 * session only counts on a demo instance.
 */
export async function verifySession(
  db: Db,
  token: string | undefined,
  o: { googleEnabled: boolean; ownerEmail: string | null; now?: number },
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(db), {
      algorithms: ["HS256"],
      currentDate: o.now === undefined ? undefined : new Date(o.now),
    });
    if (payload.sub === "demo") return o.googleEnabled ? null : { kind: "demo" };
    if (payload.sub === "owner" && typeof payload.email === "string" && o.googleEnabled && payload.email === owner(db, o.ownerEmail)) {
      return { kind: "owner", email: payload.email };
    }
  } catch {
    // Bad signature, expired, malformed: all just mean signed out.
  }
  return null;
}

/** OWNER_EMAIL when set, else the account that claimed the instance, else null. */
export function owner(db: Db, ownerEmail: string | null): string | null {
  return ownerEmail ?? instanceRow(db).ownerEmail;
}

/**
 * Whether `email` may sign in. With no OWNER_EMAIL, the first verified account claims the instance
 * (stored, so it holds across restarts); every later account is refused.
 */
export function claimOrCheckOwner(db: Db, email: string, ownerEmail: string | null): boolean {
  const e = email.toLowerCase();
  if (ownerEmail) return e === ownerEmail;
  instanceRow(db);
  // Conditional update: two first sign-ins racing can't both claim.
  db.$client.prepare("update instance set owner_email = ? where id = 1 and owner_email is null").run(e);
  return instanceRow(db).ownerEmail === e;
}

/** True over https, including behind a TLS-terminating proxy or tunnel. */
export const isHttps = (req: Request) =>
  (req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? new URL(req.url).protocol.replace(":", "")) === "https";

/** Cookie options. Secure only over https, so a LAN http address (a phone on 192.168.x.x) still keeps a session. */
export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
});
