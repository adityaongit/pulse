// Pinned score fingerprints: one hash per daily_scores column, per intraday series kind and for reports, on the
// pinned 180-day demo database. A scorer change that moves any value fails here, so it must either bump
// SCORING_VERSION (so every install recomputes) and record new fingerprints, or update them on purpose.
import crypto from "node:crypto";
import { expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import { SCORING_VERSION } from ".";
import { seeded, USER } from "../testing";

/**
 * Fingerprints per SCORING_VERSION. To update: run this test, copy the "Received" object from the failure into
 * GOLDEN[SCORING_VERSION], and say in the commit why the scores moved. Versions before 6 hashed SQLite's JSON text;
 * 6 was re-recorded for Postgres (sorted jsonb keys) with parity.test.ts proving the scores themselves did not move.
 */
const GOLDEN: Record<number, Record<string, string>> = {
  4: {
    "daily_scores.scoring_version": "7127cc4d409f56c8",
    "daily_scores.strain": "0142128af067d3d9",
    "daily_scores.activities": "73a473e0117e7634",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "48b659063a72ca94",
    "daily_scores.sleep": "4760e092b846b6d0",
    "daily_scores.training_load": "bee5c4c4e8f6fd4e",
    "daily_scores.strain_target": "ee29a80d51723fb7",
    "daily_scores.sleep_planner": "5a6e94255768f61a",
    "daily_scores.energy_bank": "dabfb4821ce758b4",
    "daily_scores.stress": "f07e69608121ab9e",
    "daily_scores.health_monitor": "3186093d465c5164",
    "daily_scores.healthspan": "c6a1e21fa34d302b",
    "daily_scores.fitness": "271fe91d5f634fef",
    "daily_scores.journal_impact": "96829f8a2aa64e1c",
    "intraday_series.energy_bank": "e2d63643740bc4f3",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "5015ada146270d7c",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    reports: "1c262d6fb0d39aba",
  },
  5: {
    "daily_scores.scoring_version": "aa80152d5fba63f3",
    "daily_scores.strain": "69517e5973ce141f",
    "daily_scores.activities": "73a473e0117e7634",
    "daily_scores.session_rhr_bpm": "eb0c3b3835b4a988",
    "daily_scores.recovery": "48b659063a72ca94",
    "daily_scores.sleep": "4760e092b846b6d0",
    "daily_scores.training_load": "bee5c4c4e8f6fd4e",
    "daily_scores.strain_target": "ee29a80d51723fb7",
    "daily_scores.sleep_planner": "5a6e94255768f61a",
    "daily_scores.energy_bank": "dabfb4821ce758b4",
    "daily_scores.stress": "f07e69608121ab9e",
    "daily_scores.health_monitor": "3186093d465c5164",
    "daily_scores.healthspan": "f995aedb11fa6e2a",
    "daily_scores.fitness": "271fe91d5f634fef",
    "daily_scores.journal_impact": "96829f8a2aa64e1c",
    "intraday_series.energy_bank": "e2d63643740bc4f3",
    "intraday_series.hr": "05de9bb2ba692679",
    "intraday_series.load": "5015ada146270d7c",
    "intraday_series.still_hr": "1f35b44871871769",
    "intraday_series.stress": "a466449cc9fa5819",
    "reports": "1c262d6fb0d39aba",
  },
  6: {
    "daily_scores.scoring_version": "d2623305a0334fca",
    "daily_scores.strain": "a5938298e73c9b8d",
    "daily_scores.activities": "5d40e7c0996983b2",
    "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
    "daily_scores.recovery": "f30d80524db0f63f",
    "daily_scores.sleep": "ccb090c5c5766471",
    "daily_scores.training_load": "c6a22d117dfa06bc",
    "daily_scores.strain_target": "bfcfd859e9c7dd75",
    "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
    "daily_scores.energy_bank": "f822e67fed343673",
    "daily_scores.stress": "a8514c3f8bedce98",
    "daily_scores.health_monitor": "3a2163c7f92d4dab",
    "daily_scores.healthspan": "bd47739ff5d02880",
    "daily_scores.fitness": "cfad8d1954c878ed",
    "daily_scores.journal_impact": "7eed29fa9baca1ea",
    "intraday_series.energy_bank": "237320b091a7a358",
    "intraday_series.hr": "5ca83bb68dad9033",
    "intraday_series.load": "859d8876596ad379",
    "intraday_series.still_hr": "c0bf14266ee71abd",
    "intraday_series.stress": "66d650df74998208",
    "reports": "7c7cfdf8c1583777",
  },
  // 7: five zones on heart-rate reserve. The day's zones (strain), each activity's, and Pulse Age (healthspan), whose
  // zones 1-3 and 4-5 terms now count Pulse's own zones instead of Google's roll-up.
  7: {
    "daily_scores.scoring_version": "4540e362bb306df2",
    "daily_scores.strain": "5002bbb246544891",
    "daily_scores.activities": "1d2f8021722c6b84",
    "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
    "daily_scores.recovery": "f30d80524db0f63f",
    "daily_scores.sleep": "ccb090c5c5766471",
    "daily_scores.training_load": "c6a22d117dfa06bc",
    "daily_scores.strain_target": "bfcfd859e9c7dd75",
    "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
    "daily_scores.energy_bank": "f822e67fed343673",
    "daily_scores.stress": "a8514c3f8bedce98",
    "daily_scores.health_monitor": "3a2163c7f92d4dab",
    "daily_scores.healthspan": "683be47b969df06b",
    "daily_scores.fitness": "cfad8d1954c878ed",
    "daily_scores.journal_impact": "7eed29fa9baca1ea",
    "intraday_series.energy_bank": "237320b091a7a358",
    "intraday_series.hr": "5ca83bb68dad9033",
    "intraday_series.load": "859d8876596ad379",
    "intraday_series.still_hr": "c0bf14266ee71abd",
    "intraday_series.stress": "66d650df74998208",
    "reports": "7c7cfdf8c1583777",
  },  // 8: max HR no longer from Google's PEAK zone; the demo sets its own, so only the stamp and strain's key moved.
  8: {
    "daily_scores.scoring_version": "7e0dd1c597907815",
    "daily_scores.strain": "74dc3c718456b3b5",
    "daily_scores.activities": "1d2f8021722c6b84",
    "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
    "daily_scores.recovery": "f30d80524db0f63f",
    "daily_scores.sleep": "ccb090c5c5766471",
    "daily_scores.training_load": "c6a22d117dfa06bc",
    "daily_scores.strain_target": "bfcfd859e9c7dd75",
    "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
    "daily_scores.energy_bank": "f822e67fed343673",
    "daily_scores.stress": "a8514c3f8bedce98",
    "daily_scores.health_monitor": "3a2163c7f92d4dab",
    "daily_scores.healthspan": "683be47b969df06b",
    "daily_scores.fitness": "cfad8d1954c878ed",
    "daily_scores.journal_impact": "7eed29fa9baca1ea",
    "intraday_series.energy_bank": "237320b091a7a358",
    "intraday_series.hr": "5ca83bb68dad9033",
    "intraday_series.load": "859d8876596ad379",
    "intraday_series.still_hr": "c0bf14266ee71abd",
    "intraday_series.stress": "66d650df74998208",
    "reports": "7c7cfdf8c1583777",
  },
  // 9: Zone 0 (time under Zone 1) stored on days and activities, so only the stamp, strain and activities moved.
  9: {
    "daily_scores.scoring_version": "06731b2819e3281d",
    "daily_scores.strain": "5ab7bab5e048f3ad",
    "daily_scores.activities": "cb2d75373aaf4d20",
    "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
    "daily_scores.recovery": "f30d80524db0f63f",
    "daily_scores.sleep": "ccb090c5c5766471",
    "daily_scores.training_load": "c6a22d117dfa06bc",
    "daily_scores.strain_target": "bfcfd859e9c7dd75",
    "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
    "daily_scores.energy_bank": "f822e67fed343673",
    "daily_scores.stress": "a8514c3f8bedce98",
    "daily_scores.health_monitor": "3a2163c7f92d4dab",
    "daily_scores.healthspan": "683be47b969df06b",
    "daily_scores.fitness": "cfad8d1954c878ed",
    "daily_scores.journal_impact": "7eed29fa9baca1ea",
    "intraday_series.energy_bank": "237320b091a7a358",
    "intraday_series.hr": "5ca83bb68dad9033",
    "intraday_series.load": "859d8876596ad379",
    "intraday_series.still_hr": "c0bf14266ee71abd",
    "intraday_series.stress": "66d650df74998208",
    "reports": "7c7cfdf8c1583777",
  },
  // 10: healthspan stores each factor's 30-day mean (`recent`); strain moves only through its stage-1 key, which hashes
  // the version. Every other value is as at 9.
  10: {
    "daily_scores.scoring_version": "bfc634c893f9c22c",
    "daily_scores.strain": "cae5fec2cbcf2efd",
    "daily_scores.activities": "cb2d75373aaf4d20",
    "daily_scores.session_rhr_bpm": "2f808b51bd7a0bc8",
    "daily_scores.recovery": "f30d80524db0f63f",
    "daily_scores.sleep": "ccb090c5c5766471",
    "daily_scores.training_load": "c6a22d117dfa06bc",
    "daily_scores.strain_target": "bfcfd859e9c7dd75",
    "daily_scores.sleep_planner": "bf57a92ddfecd8e0",
    "daily_scores.energy_bank": "f822e67fed343673",
    "daily_scores.stress": "a8514c3f8bedce98",
    "daily_scores.health_monitor": "3a2163c7f92d4dab",
    "daily_scores.healthspan": "b7ad7077ab11d111",
    "daily_scores.fitness": "cfad8d1954c878ed",
    "daily_scores.journal_impact": "7eed29fa9baca1ea",
    "intraday_series.energy_bank": "237320b091a7a358",
    "intraday_series.hr": "5ca83bb68dad9033",
    "intraday_series.load": "859d8876596ad379",
    "intraday_series.still_hr": "c0bf14266ee71abd",
    "intraday_series.stress": "66d650df74998208",
    "reports": "7c7cfdf8c1583777",
  },
};

// Numbers are rounded to 10 significant digits first, so a last-ulp difference in Math between Node
// versions does not count as a scoring change. Object keys are sorted: jsonb stores them in its own order.
const canon = (v: unknown): unknown =>
  typeof v === "number"
    ? +v.toPrecision(10)
    : Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
const hash = (rs: Record<string, unknown>[]) =>
  crypto
    .createHash("sha256")
    .update(rs.map((r) => Object.values(r).map((v) => JSON.stringify(canon(v))).join("\t")).join("\n"))
    .digest("hex")
    .slice(0, 16);

async function fingerprints(db: Db) {
  const out: Record<string, string> = {};
  const columns = await rows<{ name: string }>(
    db,
    sql`select column_name as name from information_schema.columns
        where table_name = 'daily_scores' and column_name not in ('day', 'user_id') order by ordinal_position`,
  );
  for (const { name } of columns) {
    out[`daily_scores.${name}`] = hash(await rows(db, sql`select day, ${sql.identifier(name)} from daily_scores where user_id = ${USER} order by day`));
  }
  const kinds = await rows<{ kind: string }>(db, sql`select distinct kind from intraday_series where user_id = ${USER} order by kind`);
  for (const { kind } of kinds) {
    out[`intraday_series.${kind}`] = hash(await rows(db, sql`select day, data from intraday_series where user_id = ${USER} and kind = ${kind} order by day`));
  }
  out.reports = hash(await rows(db, sql`select period, data from reports where user_id = ${USER} order by period`));
  return out;
}

it(`the demo database scores exactly as pinned for SCORING_VERSION ${SCORING_VERSION}`, async () => {
  const actual = await fingerprints(await seeded());
  expect(
    GOLDEN[SCORING_VERSION],
    `no fingerprints for SCORING_VERSION ${SCORING_VERSION}: add GOLDEN[${SCORING_VERSION}] = ${JSON.stringify(actual, null, 2)}`,
  ).toBeDefined();
  expect(actual, "scores changed: bump SCORING_VERSION and record the new fingerprints, or update them if the change is intended").toEqual(
    GOLDEN[SCORING_VERSION],
  );
});
