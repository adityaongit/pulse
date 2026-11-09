// Auth contract: every Server Action and every route handler on disk refuses a signed-out caller on its own,
// without the proxy. Both lists are found by globbing, so a new action or route is covered with no edit here.
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_EMAIL, getAuth, requestUser, SIGNED_OUT } from "./auth";
import { parseConfig, type Config } from "./config";
import { type Db, rows, sql } from "./db";
import { freshDb } from "./testing";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, cookie: undefined as string | undefined }));
vi.mock("./config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(h.cookie ? { cookie: h.cookie } : {}),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {}, has: () => false }),
}));
const worker = vi.hoisted(() => ({ requestSync: vi.fn(), syncAndWait: vi.fn(async () => ({ ok: true, error: null })) }));
vi.mock("./worker", async (orig) => ({ ...(await orig<object>()), ...worker }));
vi.mock("@/server/worker", async (orig) => ({ ...(await orig<object>()), ...worker }));

const ROOT = process.cwd();
/** Deliberately public: liveness, the OAuth round trip (the callback checks its state), better-auth, signing in and out. */
const PUBLIC = [/^\/healthz$/, /^\/oauth\//, /^\/api\/auth\//, /^\/login(\/|$)/, /^\/logout$/];

const demoCfg = parseConfig({});
// Open sign-up: these test better-auth itself; the invite gate has its own tests in auth.test.ts.
const googleCfg = parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "cs", SIGNUP: "open" });

const files = (pattern: string) => fs.globSync(pattern, { cwd: ROOT }).filter((f) => !/\.test\.tsx?$/.test(f)).sort();
const actionFiles = files("src/**/*.{ts,tsx}").filter((f) => /^\s*["']use server["']/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
const routeFiles = files("src/app/**/route.ts");
/** `src/app/(group)/a/b/route.ts` → `/a/b` (glob returns backslashes on Windows). */
const urlOf = (f: string) =>
  f.replaceAll("\\", "/").replace(/^src\/app/, "").replace(/\/route\.ts$/, "").replace(/\/\([^)]+\)/g, "") || "/";

type Fn = (...args: unknown[]) => Promise<unknown>;
let actions: { name: string; fn: Fn }[] = [];
const routes: { url: string; method: string; fn: Fn }[] = [];
let db: Db;

/** Every row of every table, so a refused call is shown to have written nothing. */
async function snapshot() {
  const tables = await rows<{ table_name: string }>(db, sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
  const out: string[] = [];
  for (const { table_name } of tables) out.push(JSON.stringify(await rows(db, sql`select * from ${sql.identifier(table_name)} order by 1`)));
  return out.join("\n");
}

const sessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/**
 * Cookies that are not a session: none, garbage, a token with a forged signature, and a real session that has since
 * been signed out (its row is gone).
 */
async function badSessions() {
  const saved = h.cfg;
  h.cfg = googleCfg; // sign-up is closed on a demo instance
  const auth = getAuth();
  const res = await auth.api.signUpEmail({ body: { name: "Gone", email: "gone@example.com", password: "a-long-password", username: "gone" }, asResponse: true });
  const stale = sessionCookie(res);
  await auth.api.signOut({ headers: new Headers({ cookie: stale }) });
  h.cfg = saved;
  return [undefined, "better-auth.session_token=garbage", "better-auth.session_token=abc.forgedsignature", stale];
}

beforeAll(async () => {
  for (const f of actionFiles) {
    const mod = (await import(/* @vite-ignore */ path.join(ROOT, f))) as Record<string, unknown>;
    for (const [name, fn] of Object.entries(mod)) if (typeof fn === "function") actions.push({ name: `${f}#${name}`, fn: fn as Fn });
  }
  for (const f of routeFiles) {
    const mod = (await import(/* @vite-ignore */ path.join(ROOT, f))) as Record<string, unknown>;
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      if (typeof mod[method] === "function") routes.push({ url: urlOf(f), method, fn: mod[method] as Fn });
    }
  }
  actions = actions.sort((a, b) => a.name.localeCompare(b.name));
});

beforeEach(async () => {
  db = await freshDb();
  h.cookie = undefined;
  worker.requestSync.mockClear();
  worker.syncAndWait.mockClear();
});

describe("auth contract", () => {
  it("finds every Server Action and route handler, including the ones that had no signed-out test", () => {
    const names = actions.map((a) => a.name.split("#")[1]);
    for (const n of ["saveProfileAction", "loadCalendarMonth", "uploadAvatar", "removeAvatar", "saveJournalEntry", "saveDashboard", "disconnectGoogle"]) {
      expect(names).toContain(n);
    }
    const urls = routes.map((r) => r.url);
    for (const u of ["/status", "/sync", "/avatar", "/export/daily", "/logout", "/login/demo", "/healthz", "/api/auth/[...all]"]) expect(urls).toContain(u);
  });

  it.each([
    ["demo", demoCfg],
    ["Google", googleCfg],
  ])("every Server Action refuses a signed-out caller before it reads input or writes (%s instance)", async (_, cfg) => {
    h.cfg = cfg;
    const cookies = await badSessions();
    const before = await snapshot();
    for (const cookie of cookies) {
      h.cookie = cookie;
      for (const { name, fn } of actions) {
        // Junk arguments: the session check must come first, so they are never read. A read-only action throws
        // "signed_out" instead (it has no result shape for an error), and a page-style one may redirect to /login.
        const out = await fn(null, new FormData()).then(
          (r) => r,
          (e: unknown) => (e instanceof Error ? e.message : e),
        );
        if (out !== "NEXT_REDIRECT" && out !== "signed_out") expect.soft(out, `${name} with ${cookie}`).toEqual(SIGNED_OUT);
      }
    }
    expect(await snapshot()).toBe(before);
    expect(worker.requestSync).not.toHaveBeenCalled();
    expect(worker.syncAndWait).not.toHaveBeenCalled();
  });

  it.each([
    ["demo", demoCfg],
    ["Google", googleCfg],
  ])("every route handler outside the public list answers 401 to a signed-out request (%s instance)", async (_, cfg) => {
    h.cfg = cfg;
    const cookies = await badSessions();
    const before = await snapshot();
    for (const cookie of cookies) {
      for (const { url, method, fn } of routes) {
        if (PUBLIC.some((p) => p.test(url))) continue;
        const req = new NextRequest(`http://pulse:3000${url}?format=csv`, { method, headers: cookie ? { cookie } : {} });
        const res = (await fn(req, { params: Promise.resolve({}) })) as Response;
        expect(res.status, `${method} ${url} with ${cookie}`).toBe(401);
      }
    }
    expect(await snapshot()).toBe(before);
  });
});

describe("the public routes", () => {
  const route = (url: string, method: string) => routes.find((r) => r.url === url && r.method === method)!.fn;
  const post = (url: string, cookie?: string) =>
    route(url, "POST")(new NextRequest(`http://pulse:3000${url}`, { method: "POST", headers: cookie ? { cookie } : {} })) as Promise<Response>;

  it("/healthz answers 200 to anyone", async () => {
    h.cfg = googleCfg;
    const res = (await route("/healthz", "GET")(new NextRequest("http://pulse:3000/healthz"))) as Response;
    expect(res.status).toBe(200);
  });

  it("/logout ends the session and clears its cookie; a signed-out visitor is just sent to /login", async () => {
    h.cfg = googleCfg;
    const anon = await post("/logout");
    expect(anon.status).toBe(303);
    // Relative, never the container's own address (behind a tunnel request.url is http://0.0.0.0:3000).
    expect(anon.headers.get("location")).toBe("/login");

    const up = await getAuth().api.signUpEmail({ body: { name: "Me", email: "me@example.com", password: "a-long-password", username: "meself" }, asResponse: true });
    const cookie = sessionCookie(up);
    const req = () => new Request("http://pulse:3000/", { headers: { cookie } });
    expect(await requestUser(req())).not.toBeNull();
    const res = await post("/logout", cookie);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.getSetCookie().join("\n")).toMatch(/session_token=;.*Max-Age=0/i);
    expect(await requestUser(req())).toBeNull();
  });

  it("/login/demo signs a visitor in as the demo user, on a demo instance only", async () => {
    h.cfg = googleCfg;
    const refused = await post("/login/demo");
    expect(refused.status).toBe(404);
    expect(refused.headers.get("set-cookie")).toBeNull();

    h.cfg = demoCfg;
    const res = await post("/login/demo");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const user = await requestUser(new Request("http://pulse:3000/", { headers: { cookie: sessionCookie(res) } }));
    expect(user?.email).toBe(DEMO_EMAIL);
  });
});
