import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

/** Sign out: drops the session cookie. The Google grant stays, so sync keeps running. */
export function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
