// Local-time helpers shared by the sources, the pipeline and the queries. Instants are unix seconds;
// days are local `YYYY-MM-DD` in the configured IANA zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local wall-clock reading of instant `s`: the day, `HH:mm:ss`, and that wall time read as if it were UTC. */
export function wall(s: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(s * 1000)).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    asUtc: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000,
  };
}

/** The local day containing instant `s`. */
export const localDay = (s: number, tz: string) => wall(s, tz).day;

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The instant local midnight opens `day`. The offset is read twice, so a DST day uses midnight's own offset. */
export function localMidnight(day: string, tz: string): number {
  const utc = Date.parse(`${day}T00:00:00Z`) / 1000;
  const offset = (s: number) => wall(s, tz).asUtc - Math.floor(s);
  return utc - offset(utc - offset(utc));
}

/** Minutes after local midnight of instant `s`. */
export const localMinutes = (s: number, tz: string) => Math.round((s - localMidnight(localDay(s, tz), tz)) / 60);
