import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Open without a session: the signed-out pages (and /login/demo), and /logout. The matcher skips a few more. */
const PUBLIC = ["/login", "/signup", "/forgot", "/logout"];

/**
 * The optimistic sign-in gate: only checks that a session cookie exists (no database on every request). The (app)
 * layout checks the session for real and sends a new account to onboarding; route handlers and Server Actions check
 * it again themselves.
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const open = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
  // A signed-in visitor on /login or /signup is sent home by the page itself, after a real session check: doing it
  // here on the cookie alone would loop an expired cookie between "/" and /login.
  if (!open && !getSessionCookie(req)) return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Open to all: better-auth's endpoints, the cron (checks CRON_SECRET itself), Google's redirect (the callback
  // validates itself), the health check, /.well-known (the Android app's asset links, which Android fetches with no
  // session), build assets, and files under public/ (static extensions only, so a page path with a dot in it,
  // /activity/a.b, is still gated).
  matcher: ["/((?!api/auth/|api/cron$|oauth/|healthz|_next/|\\.well-known/|.*\\.(?:ico|png|jpe?g|svg|webp|webmanifest|txt|xml|html|js|css|woff2?|map)$).*)"],
};
