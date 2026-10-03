import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { getProfile } from "@/server/profile";
import { SESSION_COOKIE, verifySession } from "@/server/session";

/**
 * The sign-in gate (U20). Signed out: everything goes to /login. Signed in without a profile:
 * everything goes to /onboarding (U19). Server actions check the session again themselves.
 */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const { google } = getConfig();
  const db = getDb();
  const session = await verifySession(db, req.cookies.get(SESSION_COOKIE)?.value, {
    googleEnabled: !!google,
    ownerEmail: google?.ownerEmail ?? null,
  });
  const to = (p: string) => NextResponse.redirect(new URL(p, req.url));
  const onLogin = path === "/login" || path.startsWith("/login/");
  if (!session) return onLogin ? undefined : to("/login");
  if (onLogin) return to("/");
  const onboarded = getProfile(db) !== null;
  if (!onboarded && path !== "/onboarding") return to("/onboarding");
  if (onboarded && path === "/onboarding") return to("/");
}

export const config = {
  // Open to all: Google's redirect, the health check, build assets, and files under public/ (anything with an extension).
  matcher: ["/((?!oauth/|healthz|_next/|.*\\.[a-z0-9]+$).*)"],
};
