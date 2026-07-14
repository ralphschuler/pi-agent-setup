export type ScheduleKind = "once" | "every" | "daily" | "cron";

export type CronScheduleJob = {
  schedule: string;
  kind: ScheduleKind;
  enabled?: boolean;
  lastRunAt?: string;
  dispatchStatus?: "pending" | "sent";
};

export const MAX_CRON_SEARCH_MINUTES = 525_600;

export function parseSchedule(value: string): { kind: ScheduleKind } | undefined {
  const lower = value.toLowerCase().trim();
  if (!lower) return undefined;
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value.trim()) && !Number.isNaN(Date.parse(value))) return { kind: "once" };

  const every = lower.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/);
  if (every && Number(every[1]) > 0) return { kind: "every" };
  if (/^daily\s+([01]?\d|2[0-3]):[0-5]\d$/.test(lower)) return { kind: "daily" };

  const fields = lower.split(/\s+/);
  const ranges: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  if (fields.length === 5 && fields.every((field, index) => isCronField(field, ...ranges[index]))) return { kind: "cron" };
  return undefined;
}

export function computeNextRun(job: CronScheduleJob, from: Date) {
  if (job.kind === "once") {
    const date = new Date(job.schedule);
    return date.getTime() >= from.getTime() ? date : undefined;
  }

  const lower = job.schedule.toLowerCase().trim();
  const every = lower.match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/);
  if (every) {
    const amount = Number(every[1]);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    const unit = every[2];
    const base = job.lastRunAt ? new Date(job.lastRunAt) : from;
    const baseTime = base.getTime();
    if (!Number.isFinite(baseTime)) return undefined;
    const ms = unit.startsWith("minute") ? amount * 60_000 : unit.startsWith("hour") ? amount * 3_600_000 : amount * 86_400_000;
    const next = new Date(baseTime + ms);
    while (next.getTime() < from.getTime()) next.setTime(next.getTime() + ms);
    return next;
  }

  const daily = lower.match(/^daily\s+([01]?\d|2[0-3]):([0-5]\d)$/);
  if (daily) {
    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setHours(Number(daily[1]), Number(daily[2]), 0, 0);
    if (next.getTime() < from.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  return nextCronRun(job.schedule, from);
}

export function refreshJobNextRun(job: CronScheduleJob, now: Date) {
  if (!job.enabled) return undefined;
  if (job.dispatchStatus === "pending") return now;
  if (job.kind === "once") {
    if (job.lastRunAt || job.dispatchStatus === "sent") return undefined;
    const scheduled = new Date(job.schedule);
    return Number.isFinite(scheduled.getTime()) ? scheduled : undefined;
  }
  return computeNextRun(job, now);
}

export function nextCronRun(expression: string, from: Date) {
  const fields = expression.trim().split(/\s+/);
  const ranges: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  if (fields.length !== 5 || !fields.every((field, index) => isCronField(field, ...ranges[index]))) return undefined;

  for (let i = 1; i <= MAX_CRON_SEARCH_MINUTES; i++) {
    const candidate = new Date(from.getTime() + i * 60_000);
    candidate.setSeconds(0, 0);
    if (
      matchesCronField(fields[0], candidate.getMinutes(), 0, 59) &&
      matchesCronField(fields[1], candidate.getHours(), 0, 23) &&
      matchesCronField(fields[2], candidate.getDate(), 1, 31) &&
      matchesCronField(fields[3], candidate.getMonth() + 1, 1, 12) &&
      matchesCronField(fields[4], candidate.getDay(), 0, 6)
    )
      return candidate;
  }
  return undefined;
}

export function isCronField(field: string, min: number, max: number) {
  return (
    field.length > 0 &&
    field.split(",").every((part) => {
      if (part === "*") return true;
      if (/^\*\/\d+$/.test(part)) return Number(part.slice(2)) > 0;
      if (/^\d+$/.test(part)) {
        const value = Number(part);
        return value >= min && value <= max;
      }
      const range = part.match(/^(\d+)-(\d+)$/);
      if (!range) return false;
      const start = Number(range[1]);
      const end = Number(range[2]);
      return start >= min && end <= max && start <= end;
    })
  );
}

export function matchesCronField(field: string, value: number, min: number, max: number) {
  return field.split(",").some((part) => {
    if (part === "*") return true;
    if (part.startsWith("*/")) return value % Number(part.slice(2)) === 0;
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      return value >= start && value <= end;
    }
    const number = Number(part);
    return number >= min && number <= max && value === number;
  });
}
