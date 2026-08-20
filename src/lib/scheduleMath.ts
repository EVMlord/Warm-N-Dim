export type Hm = { h: number; m: number };

export function parseHHmm(s: string): Hm | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function isInNightWindow(now: Date, start: string, end: string): boolean {
  const s = parseHHmm(start);
  const e = parseHHmm(end);
  if (!s || !e) return false;
  const a = s.h * 60 + s.m;
  const b = e.h * 60 + e.m;
  if (a === b) return false;
  const n = minutesSinceMidnight(now);
  if (a < b) return n >= a && n < b;
  return n >= a || n < b;
}

function atTimeOnOrAfter(now: Date, t: Hm): Date {
  const d = new Date(now.getTime());
  d.setSeconds(0, 0);
  d.setHours(t.h, t.m, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function nextFixedTransition(
  now: Date,
  start: string,
  end: string
): Date | null {
  const s = parseHHmm(start);
  const e = parseHHmm(end);
  if (!s || !e) return null;
  if (s.h === e.h && s.m === e.m) return null;
  const a = atTimeOnOrAfter(now, s);
  const b = atTimeOnOrAfter(now, e);
  return a.getTime() <= b.getTime() ? a : b;
}

export function isValidDate(d: Date | null | undefined): d is Date {
  return !!d && Number.isFinite(d.getTime());
}

export type SunTimes = { sunrise: Date; sunset: Date };

export function isNightBySun(now: Date, times: SunTimes | null): boolean {
  if (!times || !isValidDate(times.sunrise) || !isValidDate(times.sunset))
    return false;
  return now.getTime() >= times.sunset.getTime() || now.getTime() < times.sunrise.getTime();
}

export function nextSunTransition(
  now: Date,
  today: SunTimes | null,
  tomorrow: SunTimes | null
): Date | null {
  const candidates: Date[] = [];
  for (const t of [today, tomorrow]) {
    if (!t) continue;
    if (isValidDate(t.sunrise)) candidates.push(t.sunrise);
    if (isValidDate(t.sunset)) candidates.push(t.sunset);
  }
  const future = candidates
    .filter((d) => d.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? null;
}

export function formatHint(next: Date | null, willEnable: boolean): string {
  if (!next) return "No upcoming schedule change";
  const hh = String(next.getHours()).padStart(2, "0");
  const mm = String(next.getMinutes()).padStart(2, "0");
  const day =
    next.toDateString() === new Date().toDateString()
      ? "today"
      : "tomorrow";
  return `Next: turns ${willEnable ? "on" : "off"} ${day} at ${hh}:${mm}`;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
