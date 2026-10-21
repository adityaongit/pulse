import { loginReturn } from "@/lib/login-return";
import { DEMO_EMAIL, DEMO_PASSWORD, getAuth } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { ensureDemoUser } from "@/server/sources/seed/generate";

/** "Continue with demo data": a demo instance's only way in, as the demo user. 404 once Google is set up. */
export async function POST(request: Request) {
  if (getConfig().google) return new Response("Not found", { status: 404 });
  // The seed worker creates it too; doing it here means a visitor right after first boot still gets in.
  await ensureDemoUser(getDb());
  const signIn = await getAuth().api.signInEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD }, headers: request.headers, asResponse: true });
  if (!signIn.ok) return new Response("Demo sign-in failed", { status: 500 });
  // Relative, like /logout: request.url is the container's address behind a tunnel.
  const form = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") ? await request.formData() : new FormData();
  const res = new Response(null, { status: 303, headers: { Location: loginReturn(form.get("next")) } });
  for (const c of signIn.headers.getSetCookie()) res.headers.append("set-cookie", c);
  return res;
}
