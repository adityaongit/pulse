import { saveJournalEntry } from "@/server/actions/journal"

// Check-in answers saved while the connection was down. They are plain upserts (day, tag, value), so replaying
// them later is safe; the newest answer for a (day, tag) wins. localStorage is enough: a check-in is a handful of
// small entries, and this is only read back on this device. Keyed by account: a queue left behind by one person on a
// shared device must never be sent under the next person's session.
const key = (userId: number) => `pulse:journal-queue:${userId}`
// Before the queue was per account; its owner is unknown, so it is dropped rather than replayed.
const LEGACY_KEY = "pulse:journal-queue"
export type Queued = { day: string; tag: string; value: boolean | null; detail?: number | null }

const read = (userId: number): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) ?? "[]")
  } catch {
    return []
  }
}
const write = (userId: number, q: Queued[]) => {
  try {
    localStorage.setItem(key(userId), JSON.stringify(q))
  } catch {
    // Storage full or blocked: the entries are lost, same as before the queue existed.
  }
}

export function enqueue(userId: number, entries: Queued[]) {
  const q = read(userId).filter((o) => !entries.some((e) => e.day === o.day && e.tag === o.tag))
  write(userId, [...q, ...entries])
}

export const queued = (userId: number) => read(userId).length

let flushing = false
/** Sends what `userId` queued (call it with the signed-in account); returns how many went through. An entry the server rejects (unknown tag, future day) is dropped; a network failure or a signed-out session keeps the rest for later. */
export async function flushQueue(userId: number): Promise<number> {
  if (flushing || typeof navigator === "undefined" || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    try {
      localStorage.removeItem(LEGACY_KEY)
    } catch {}
    for (const item of read(userId)) {
      const r = await saveJournalEntry(item).catch(() => null)
      if (!r || (!r.ok && r.error.startsWith("Signed out"))) break
      write(userId, read(userId).filter((o) => !(o.day === item.day && o.tag === item.tag && o.value === item.value)))
      if (r.ok) sent++
    }
  } finally {
    flushing = false
  }
  return sent
}
