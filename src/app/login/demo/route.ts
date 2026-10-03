import { NextResponse } from "next/server";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { getProfile, saveProfile } from "@/server/profile";
import { cookieOptions, isHttps, SESSION_COOKIE, signSession } from "@/server/session";
import { DEMO_PROFILE } from "@/server/sources/seed/generate";

/** "Continue with demo data": a demo instance's only way in. 404 once Google is set up. */
export async function POST(request: Request) {
  if (getConfig().google) return new Response("Not found", { status: 404 });
  const db = getDb();
  // The seed worker writes it too; doing it here means a visitor right after first boot never sees onboarding.
  if (!getProfile(db)) saveProfile(db, DEMO_PROFILE);
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(SESSION_COOKIE, await signSession(db, { kind: "demo" }), cookieOptions(isHttps(request)));
  return res;
}
