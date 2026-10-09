import { describe, expect, it } from "vitest";
import { poolOptions } from ".";

const AIVEN = "postgres://avnadmin:pw@pg-x.aivencloud.com:12345/defaultdb?sslmode=require";

describe("poolOptions", () => {
  it("passes the URL through, with the pool size, when no CA is set", () => {
    expect(poolOptions({ databaseUrl: AIVEN, databaseSslCa: null, dbPoolMax: 10 }, false)).toEqual({ connectionString: AIVEN, ssl: undefined, max: 10 });
  });

  it("with a CA, verifies TLS against it and drops the URL's ssl parameters (they would win over the option)", () => {
    const o = poolOptions({ databaseUrl: `${AIVEN}&sslrootcert=/x.pem&application_name=pulse`, databaseSslCa: "PEM", dbPoolMax: 2 }, false);
    expect(o.ssl).toEqual({ ca: "PEM", rejectUnauthorized: true });
    expect(o.connectionString).toBe("postgres://avnadmin:pw@pg-x.aivencloud.com:12345/defaultdb?application_name=pulse");
  });

  it("closes idle connections sooner on Vercel", () => {
    expect(poolOptions({ databaseUrl: AIVEN, databaseSslCa: null, dbPoolMax: 2 }, true)).toMatchObject({ max: 2, idleTimeoutMillis: 5_000 });
  });
});
