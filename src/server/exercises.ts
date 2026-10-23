/** Conservative matching for duplicate source records; originals remain stored for reconciliation. */
type Exercise = { id: string; day: string; type: string; startTs: number; endTs: number; distanceM: number | null };

export function sameExercise(a: Exercise, b: Exercise): boolean {
  if (a.id === b.id) return true;
  return a.day === b.day && a.type === b.type
    && Math.min(a.endTs - a.startTs, b.endTs - b.startTs) >= 300
    && Math.abs(a.startTs - b.startTs) <= 30 && Math.abs(a.endTs - b.endTs) <= 30
    && a.distanceM !== null && b.distanceM !== null && a.distanceM > 0 && b.distanceM > 0
    && Math.abs(a.distanceM - b.distanceM) <= Math.max(10, Math.min(a.distanceM, b.distanceM) * 0.01);
}

/** Stable ID selection avoids changing the retained workout when Google's page order changes. */
export function uniqueExercises<T extends Exercise>(rows: T[]): T[] {
  const kept: T[] = [];
  for (const row of [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    if (!kept.some((other) => sameExercise(row, other))) kept.push(row);
  }
  return kept.sort((a, b) => a.startTs - b.startTs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
