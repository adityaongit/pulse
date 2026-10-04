import { runCycle } from "@/server/worker";

export const maxDuration = 300;

/** Vercel Cron (vercel.json): one sync cycle over every user. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  await runCycle();
  return Response.json({ ok: true });
}
