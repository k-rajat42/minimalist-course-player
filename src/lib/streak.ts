/** Watch-activity helpers for the daily streak and the heatmap. */

export function unixToDate(ts: number): Date {
  return new Date(ts);
}

export interface ActivityRow {
  date: string; // local YYYY-MM-DD
  secondsWatched: number;
}

function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isNextDay(prevKey: string, key: string): boolean {
  const prev = new Date(`${prevKey}T00:00:00`);
  prev.setDate(prev.getDate() + 1);
  return toKey(prev) === key;
}
export function computeStreak(rows: ActivityRow[]): {
  current: number;
  longest: number;
  watchedToday: boolean;
} {
  const active = new Set(rows.filter((r) => r.secondsWatched > 0).map((r) => r.date));
  const today = new Date();
  const todayKey = toKey(today);

  // Current streak: walk backwards from today; if today has no watch time
  // yet, the streak is still alive as long as yesterday does.
  let current = 0;
  const cursor = new Date(today);
  if (!active.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (active.has(toKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak ever recorded.
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev !== null && isNextDay(prev, key)) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = key;
  }

  return {
    current,
    longest: Math.max(longest, current),
    watchedToday: active.has(todayKey),
  };
}

/**
 * Heatmap cells for the last `weeks` weeks, oldest first, one column per
 * week, 7 cells per column (Mon..Sun). Days with no data get seconds = null.
 */
export function buildHeatmap(
  rows: ActivityRow[],
  weeks = 12,
): { date: string; seconds: number | null }[] {
  const byDate = new Map(rows.map((r) => [r.date, r.secondsWatched]));
  const cells: { date: string; seconds: number | null }[] = [];

  const today = new Date();
  // End the range on today; walk back to cover `weeks` full weeks ending today.
  const totalDays = weeks * 7;
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toKey(d);
    cells.push({ date: key, seconds: byDate.get(key) ?? null });
  }
  return cells;
}
export function heatmapLevel(seconds: number | null): 0 | 1 | 2 | 3 | 4 {
  if (seconds === null || seconds <= 0) return 0;
  if (seconds < 600) return 1; // < 10 min
  if (seconds < 1800) return 2; // < 30 min
  if (seconds < 3600) return 3; // < 1 h
  return 4;
}
