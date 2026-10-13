import { createHash, timingSafeEqual } from "node:crypto";
import { runCycle } from "@/server/worker";

export const maxDuration = 300;

/** Equal by SHA-256 digest: constant time whatever the lengths. */
function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** The secret the caller sent: Vercel Cron's `Authorization: Bearer`, an `x-cron-secret` header, or `?secret=`. */
function sent(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
}

/**
 * One sync cycle over every user, resolved when it has finished. Called by Vercel Cron (vercel.json, daily on Hobby)
 * and by an external pinger (cron-job.org) every 15–30 minutes. Refused when CRON_SECRET is unset.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = sent(req);
  if (!secret || !got || !same(got, secret)) return new Response("Unauthorized", { status: 401 });
  await runCycle();
  return Response.json({ ok: true });
}

export { handle as GET, handle as POST };
