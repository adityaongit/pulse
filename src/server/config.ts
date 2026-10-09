import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}


const Env = z
  .object({
    /** Where the data comes from: `demo` (generated, one shared demo user) or `google` (each user connects Google). */
    DATA_SOURCE: z.enum(["demo", "google"], "must be demo or google").default("demo"),
    /** Postgres. Unset: the local dev database from compose.dev.yaml. */
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL").optional(),
    /**
     * The database's CA certificate (PEM, or the PEM base64-encoded), for a server whose certificate isn't signed by a
     * public CA (Aiven). Set: the connection uses TLS verified against it, and DATABASE_URL's ssl* parameters are ignored.
     */
    DATABASE_SSL_CA: z.string().optional(),
    /** Connections in the pool. Unset: 10, or 2 on Vercel (one function instance each, against a free plan's limit). */
    DB_POOL_MAX: z.coerce.number("must be a number").int().min(1).max(100).optional(),
    /** Signs sessions and auth tokens (better-auth). Required in production: `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "use at least 32 characters (openssl rand -base64 32)").optional(),
    /** Who resets forgotten passwords (shown on /forgot as an email button). Unset: "ask whoever runs this server". */
    SUPPORT_EMAIL: z.email("must be an email address").optional(),
    /**
     * Who can create an account until an admin changes it in the admin panel: `invite` (an admin's invite link),
     * `open` (anyone) or `closed`. ADMIN_EMAILS can always sign up.
     */
    SIGNUP: z.enum(["invite", "open", "closed"], "must be invite, open or closed").default("invite"),
    /** Older setting: `true` is the same as SIGNUP=closed. */
    DISABLE_SIGNUP: z.stringbool().default(false),
    /** Comma-separated emails of this server's admins (the admin panel at /admin). They sign up without an invite. */
    ADMIN_EMAILS: z
      .string()
      .transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.email("must be comma-separated email addresses")))
      .optional(),
    /** Coach: an OpenAI-compatible server the owner runs (Ollama, LM Studio), offered to users with no key needed. */
    COACH_LOCAL_URL: z.url("must be a URL, e.g. http://localhost:11434/v1").optional(),
    COACH_LOCAL_MODEL: z.string().optional(),
    /** Tests and e2e only: a scripted coach model. Refused in production. */
    COACH_MOCK: z.stringbool().default(false),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    APP_URL: z.url().optional(),
    /** The Home avatar photo: an absolute URL or a path under public/ ("/me.jpg"). */
    AVATAR_URL: z.string().optional(),
    /** Web Push (notifications): `npx web-push generate-vapid-keys`. Unset: notifications are off. */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** Who the push service can contact: `mailto:you@example.com` or an https URL. */
    VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "must be mailto:you@example.com or an https URL").optional(),
    /**
     * Android app (a Trusted Web Activity, e.g. from PWABuilder): its package name and signing key's SHA-256
     * fingerprints (comma-separated), served as /.well-known/assetlinks.json so the app opens without a URL bar.
     */
    ANDROID_PACKAGE_NAME: z.string().regex(/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/, "must be a package name like com.example.pulse").optional(),
    ANDROID_CERT_SHA256: z
      .string()
      .transform((s) => s.split(",").map((f) => f.trim().toUpperCase()).filter(Boolean))
      .pipe(z.array(z.string().regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, "must be SHA-256 fingerprints like AB:CD:...(32 pairs), comma-separated")))
      .optional(),
  })
  .superRefine((e, ctx) => {
    const need = (keys: (keyof typeof e)[], why: string) => {
      for (const k of keys) if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: `required ${why}` });
    };
    if (!!e.COACH_LOCAL_URL !== !!e.COACH_LOCAL_MODEL)
      ctx.addIssue({ code: "custom", path: [e.COACH_LOCAL_URL ? "COACH_LOCAL_MODEL" : "COACH_LOCAL_URL"], message: "set COACH_LOCAL_URL and COACH_LOCAL_MODEL together" });
    // Refused in production, except the e2e suite's production build (E2E_PROD), which also sets PULSE_E2E=1.
    if (e.COACH_MOCK && process.env.NODE_ENV === "production" && process.env.PULSE_E2E !== "1")
      ctx.addIssue({ code: "custom", path: ["COACH_MOCK"], message: "is for tests only, never in production" });
    if (e.ANDROID_PACKAGE_NAME || e.ANDROID_CERT_SHA256) need(["ANDROID_PACKAGE_NAME", "ANDROID_CERT_SHA256"], "together for the Android app");
    if (e.VAPID_PUBLIC_KEY || e.VAPID_PRIVATE_KEY) need(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"], "together for notifications");
    if (e.DATA_SOURCE === "google") {
      need(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "when DATA_SOURCE=google");
      // Real accounts: sessions must be signed with a secret of your own. Not checked at build time (no .env there).
      if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
        need(["BETTER_AUTH_SECRET"], "in production when DATA_SOURCE=google (openssl rand -base64 32)");
      }
    }
  });

export function parseConfig(env: Record<string, string | undefined>) {
  // Treat empty values (e.g. `GOOGLE_CLIENT_ID=` copied from .env.example) as unset.
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const r = Env.safeParse(set);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = r.data;
  return {
    dataSource: e.DATA_SOURCE,
    databaseUrl: e.DATABASE_URL ?? "postgres://pulse:pulse@localhost:5432/pulse",
    databaseSslCa: e.DATABASE_SSL_CA ? pem(e.DATABASE_SSL_CA) : null,
    dbPoolMax: e.DB_POOL_MAX ?? (env.VERCEL ? 2 : 10),
    authSecret: e.BETTER_AUTH_SECRET ?? null,
    appUrl: e.APP_URL?.replace(/\/$/, "") ?? null,
    /** The starting sign-up mode; the admin panel's choice (server_settings) wins once made. */
    signup: e.DISABLE_SIGNUP ? ("closed" as const) : e.SIGNUP,
    adminEmails: e.ADMIN_EMAILS ?? [],
    coachLocal: e.COACH_LOCAL_URL && e.COACH_LOCAL_MODEL ? { url: e.COACH_LOCAL_URL, model: e.COACH_LOCAL_MODEL } : null,
    coachMock: e.COACH_MOCK,
    supportEmail: e.SUPPORT_EMAIL ?? null,
    port: e.PORT,
    avatarUrl: e.AVATAR_URL ?? null,
    android: e.ANDROID_PACKAGE_NAME && e.ANDROID_CERT_SHA256?.length ? { packageName: e.ANDROID_PACKAGE_NAME, fingerprints: e.ANDROID_CERT_SHA256 } : null,
    vapid: e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT ? { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT } : null,
    google: e.DATA_SOURCE === "google"
      ? {
          clientId: e.GOOGLE_CLIENT_ID!,
          clientSecret: e.GOOGLE_CLIENT_SECRET!,
          /** Pins the OAuth redirect host (behind a proxy). Unset: the host the request came in on. */
          appUrl: e.APP_URL?.replace(/\/$/, "") ?? null,
        }
      : null,
  };
}

/** A PEM as pasted (literal `\\n` escapes allowed, as some dashboards keep a value on one line), or base64 of one. */
function pem(v: string) {
  const s = v.trim();
  return s.includes("-----BEGIN") ? s.replace(/\\n/g, "\n") : Buffer.from(s, "base64").toString("utf8");
}

export type Config = ReturnType<typeof parseConfig>;

let cached: Config | undefined;

/** Parsed once from process.env; throws ConfigError on invalid configuration. */
export function getConfig(): Config {
  return (cached ??= parseConfig(process.env));
}
