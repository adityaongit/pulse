import path from "node:path";
import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}

function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const Env = z
  .object({
    NODE_ENV: z.string().optional(),
    GOOGLE_OAUTH_ENABLED: z.stringbool().default(false),
    DATABASE_PATH: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    BIRTH_DATE: z.iso.date(),
    SEX: z.enum(["male", "female"]),
    TZ: z.string().refine(isTimeZone, "must be an IANA time zone"),
    MAX_HR: z.coerce.number().int().min(100).max(240).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    APP_URL: z.url().optional(),
    CF_ACCESS_TEAM_DOMAIN: z.url({ protocol: /^https$/ }).optional(),
    CF_ACCESS_AUD: z.string().optional(),
    DEV_ACCESS_BYPASS: z.stringbool().default(false),
  })
  .superRefine((e, ctx) => {
    const need = (keys: (keyof typeof e)[], why: string) => {
      for (const k of keys) if (!e[k]) ctx.addIssue({ code: "custom", path: [k], message: `required ${why}` });
    };
    if (e.GOOGLE_OAUTH_ENABLED) {
      need(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APP_URL"], "when GOOGLE_OAUTH_ENABLED=true");
    }
    if (e.DEV_ACCESS_BYPASS && e.NODE_ENV !== "development") {
      ctx.addIssue({ code: "custom", path: ["DEV_ACCESS_BYPASS"], message: "only allowed with NODE_ENV=development" });
    }
    if (!e.DEV_ACCESS_BYPASS) {
      need(["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD"], "unless DEV_ACCESS_BYPASS=1");
    }
  });

function ageOn(birthDate: string, now: Date) {
  const [y, m, d] = birthDate.split("-").map(Number);
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  return now.getUTCFullYear() - y - (beforeBirthday ? 1 : 0);
}

export function parseConfig(env: Record<string, string | undefined>, now = new Date()) {
  // Treat empty values (e.g. `GOOGLE_CLIENT_ID=` copied from .env.example) as unset.
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const r = Env.safeParse(set);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join("\n")}`);
  }
  const e = r.data;
  return {
    googleOAuthEnabled: e.GOOGLE_OAUTH_ENABLED,
    databasePath: path.resolve(e.DATABASE_PATH ?? (e.GOOGLE_OAUTH_ENABLED ? "data/pulse.db" : "data/demo.db")),
    port: e.PORT,
    timeZone: e.TZ,
    profile: {
      birthDate: e.BIRTH_DATE,
      sex: e.SEX,
      // Tanaka: 208 - 0.7 * age.
      maxHr: e.MAX_HR ?? Math.round(208 - 0.7 * ageOn(e.BIRTH_DATE, now)),
    },
    google: e.GOOGLE_OAUTH_ENABLED
      ? { clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET!, appUrl: e.APP_URL!.replace(/\/$/, "") }
      : null,
    access: e.DEV_ACCESS_BYPASS
      ? ({ bypass: true } as const)
      : ({ bypass: false, teamDomain: e.CF_ACCESS_TEAM_DOMAIN!.replace(/\/$/, ""), aud: e.CF_ACCESS_AUD! } as const),
  };
}

export type Config = ReturnType<typeof parseConfig>;

let cached: Config | undefined;

/** Parsed once from process.env; throws ConfigError on invalid configuration. */
export function getConfig(): Config {
  return (cached ??= parseConfig(process.env));
}
