import type { CycleStatus } from "./api";

// Calendar maths for the cycle view. Mirrors services/cycle.py: ovulation is estimated 14 days before the next
// period (never inside the period), the fertile window runs from 3 days before it to 1 day after. Dates are plain
// YYYY-MM-DD strings handled at UTC noon so time zones and daylight saving never shift a day.

export type Phase = "menstrual" | "follicular" | "ovulation" | "luteal";
export const PHASES: Phase[] = ["menstrual", "follicular", "ovulation", "luteal"];

export type DayInfo = {
  iso: string;
  phase: Phase | null;
  cycleDay: number | null;
  /** A period start the person logged. */
  loggedStart: boolean;
  /** Inside a logged period (start + period length). */
  period: boolean;
  /** A future period, from the average cycle. */
  predicted: boolean;
  ovulationDay: boolean;
  /** After the expected period with nothing logged yet. */
  late: boolean;
};

const DAY = 86400000;
export const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY);
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const ovulationDay = (cycleLen: number, periodLen: number) => Math.max(cycleLen - 14, periodLen + 1);

/** Phase for day `day` (1-based) of a cycle `len` days long. */
export function phaseFor(day: number, len: number, periodLen: number): Phase {
  const ov = ovulationDay(len, periodLen);
  if (day <= periodLen) return "menstrual";
  if (day >= ov - 3 && day <= ov + 1) return "ovulation";
  return day < ov - 3 ? "follicular" : "luteal";
}

/** First and last cycle day of each phase, for the wheel and the phase cards. */
export function phaseRanges(len: number, periodLen: number): Record<Phase, [number, number]> {
  const ov = ovulationDay(len, periodLen);
  const fertileStart = Math.max(periodLen + 1, ov - 3);
  return {
    menstrual: [1, periodLen],
    follicular: [periodLen + 1, Math.max(periodLen, fertileStart - 1)],
    ovulation: [fertileStart, Math.min(len, ov + 1)],
    luteal: [Math.min(len, ov + 2), len],
  };
}

export const PHASE_OF_STATUS: Record<CycleStatus["phase"], Phase | null> = {
  period: "menstrual",
  follicular: "follicular",
  fertile_window: "ovulation",
  luteal: "luteal",
  late: null,
};

export function dayInfo(iso: string, c: CycleStatus, today = todayIso()): DayInfo {
  const starts = [...c.period_starts].sort();
  const base: DayInfo = { iso, phase: null, cycleDay: null, loggedStart: starts.includes(iso), period: false, predicted: false, ovulationDay: false, late: false };
  const avg = c.average_cycle_length;
  const pl = c.period_length;
  let start: string | null = null;
  let len = avg;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i] <= iso) {
      start = starts[i];
      if (i + 1 < starts.length) len = diffDays(starts[i + 1], starts[i]);
      break;
    }
  }
  if (!start) return base;
  const last = starts[starts.length - 1];
  let predicted = false;
  if (start === last) {
    const since = diffDays(iso, last);
    if (since >= avg) {
      // Past the expected period without a new log: the days up to today are "late", not a guessed period.
      if (c.days_late > 0 && iso <= today) return { ...base, late: true };
      if (c.days_late > 0) return base;
      start = addDays(last, Math.floor(since / avg) * avg);
      predicted = true;
    }
    len = avg;
  }
  const cycleDay = diffDays(iso, start) + 1;
  const phase = phaseFor(cycleDay, len, pl);
  return {
    ...base,
    phase,
    cycleDay,
    period: phase === "menstrual" && !predicted,
    predicted: predicted && phase === "menstrual",
    ovulationDay: cycleDay === ovulationDay(len, pl),
  };
}

/** The next few expected period starts (none while a period is late). */
export function upcomingPeriods(c: CycleStatus, n = 3): string[] {
  if (c.days_late > 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(c.next_period_expected, i * c.average_cycle_length));
}

/** The estimated fertile window and ovulation day of the current cycle. */
export function fertileWindow(c: CycleStatus): { from: string; to: string; ovulation: string } {
  const ov = ovulationDay(c.average_cycle_length, c.period_length);
  const r = phaseRanges(c.average_cycle_length, c.period_length).ovulation;
  return { from: addDays(c.last_period_start, r[0] - 1), to: addDays(c.last_period_start, r[1] - 1), ovulation: addDays(c.last_period_start, ov - 1) };
}

/** Six weeks of days for a month grid starting on Sunday; days outside the month are null. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const daysIn = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysIn; d++) cells.push(toIso(new Date(Date.UTC(year, month, d, 12))));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function formatDate(iso: string, lang: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(lang, { ...opts, timeZone: "UTC" }).format(toDate(iso));
}
