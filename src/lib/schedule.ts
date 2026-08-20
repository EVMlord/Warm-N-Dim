import { createRequire } from "node:module";
import { logMain } from "./log.js";
import { getSettings, patchSettings } from "./settings.js";
import {
  formatHint,
  isInNightWindow,
  isNightBySun,
  isValidDate,
  lerp,
  nextFixedTransition,
  nextSunTransition,
  type SunTimes,
} from "./scheduleMath.js";

const requireCJS = createRequire(import.meta.url);
// suncalc is CJS; load the same way as electron-updater to avoid ESM interop issues
const SunCalc = requireCJS("suncalc") as {
  getTimes: (
    date: Date,
    lat: number,
    lng: number
  ) => { sunrise: Date; sunset: Date };
};

type Fade = {
  fromDim: number;
  fromWarmth: number;
  toDim: number;
  toWarmth: number;
  start: number;
  duration: number;
  wantOn: boolean;
};

let fade: Fade | null = null;
let fadeTimer: NodeJS.Timeout | null = null;
let armTimer: NodeJS.Timeout | null = null;
let overrideUntil = 0;
let notify: () => void = () => {};

export function initSchedule(onChange: () => void): void {
  notify = onChange;
}

export function markManualOverride(): void {
  const next = computeNext(getSettings(), new Date());
  overrideUntil = next ? next.getTime() : 0;
}

export function cancelFade(): void {
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
  fade = null;
}

export function getOverlaySettings(): Settings {
  const s = getSettings();
  if (!fade) return s;
  const t = Math.min(
    1,
    (Date.now() - fade.start) / Math.max(1, fade.duration)
  );
  return {
    ...s,
    enabled: true,
    dim: lerp(fade.fromDim, fade.toDim, t),
    warmth: lerp(fade.fromWarmth, fade.toWarmth, t),
  };
}

function sunTimes(
  date: Date,
  lat: number | null,
  lng: number | null
): SunTimes | null {
  if (lat == null || lng == null) return null;
  try {
    const t = SunCalc.getTimes(date, lat, lng);
    if (!isValidDate(t.sunrise) || !isValidDate(t.sunset)) return null;
    return { sunrise: t.sunrise, sunset: t.sunset };
  } catch (e) {
    logMain("[Schedule] suncalc failed", String(e));
    return null;
  }
}

function todayAndTomorrow(
  now: Date,
  lat: number | null,
  lng: number | null
): { today: SunTimes | null; tomorrow: SunTimes | null } {
  const tomorrow = new Date(now.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { today: sunTimes(now, lat, lng), tomorrow: sunTimes(tomorrow, lat, lng) };
}

function computeWantOn(s: Settings, now: Date): boolean {
  if (s.schedule.mode === "sunset") {
    return isNightBySun(
      now,
      sunTimes(now, s.schedule.latitude, s.schedule.longitude)
    );
  }
  return isInNightWindow(now, s.schedule.start, s.schedule.end);
}

function computeNext(s: Settings, now: Date): Date | null {
  if (s.schedule.mode === "sunset") {
    const { today, tomorrow } = todayAndTomorrow(
      now,
      s.schedule.latitude,
      s.schedule.longitude
    );
    return nextSunTransition(now, today, tomorrow);
  }
  return nextFixedTransition(now, s.schedule.start, s.schedule.end);
}

export function getScheduleHint(): string {
  const s = getSettings();
  if (!s.schedule.enabled) return "Schedule is off";
  if (
    s.schedule.mode === "sunset" &&
    (s.schedule.latitude == null || s.schedule.longitude == null)
  ) {
    return "Set a location for sunset mode";
  }
  const now = new Date();
  const next = computeNext(s, now);
  const wantNow = computeWantOn(s, now);
  return formatHint(next, !wantNow);
}

function startFade(wantOn: boolean): void {
  cancelFade();
  const s = getSettings();
  const duration = Math.max(0, s.schedule.fadeMinutes) * 60_000;
  if (duration <= 0) {
    if (s.enabled !== wantOn) patchSettings({ enabled: wantOn });
    notify();
    return;
  }
  if (wantOn) {
    fade = {
      fromDim: 0,
      fromWarmth: 0,
      toDim: s.dim,
      toWarmth: s.warmth,
      start: Date.now(),
      duration,
      wantOn: true,
    };
    if (!s.enabled) patchSettings({ enabled: true });
  } else {
    fade = {
      fromDim: s.dim,
      fromWarmth: s.warmth,
      toDim: 0,
      toWarmth: 0,
      start: Date.now(),
      duration,
      wantOn: false,
    };
  }
  tickFade();
}

function tickFade(): void {
  if (!fade) return;
  const t = (Date.now() - fade.start) / Math.max(1, fade.duration);
  if (t >= 1) {
    const want = fade.wantOn;
    fade = null;
    fadeTimer = null;
    if (!want) patchSettings({ enabled: false });
    notify();
    return;
  }
  notify();
  fadeTimer = setTimeout(tickFade, 5000);
  fadeTimer.unref();
}

export function applyScheduledEnabled(): void {
  const s = getSettings();
  if (!s.schedule.enabled) return;
  if (Date.now() < overrideUntil) {
    logMain("[Schedule] skip apply; manual override until", new Date(overrideUntil).toISOString());
    return;
  }
  const want = computeWantOn(s, new Date());
  if (s.enabled === want && !fade) return;
  logMain("[Schedule] applying enabled =", want);
  startFade(want);
}

export function reschedule(): void {
  if (armTimer) {
    clearTimeout(armTimer);
    armTimer = null;
  }
  const s = getSettings();
  if (!s.schedule.enabled) return;
  const next = computeNext(s, new Date());
  if (!next) return;
  const delay = Math.max(1000, Math.min(next.getTime() - Date.now(), 86_400_000));
  logMain("[Schedule] next transition", next.toISOString(), "in ms", delay);
  armTimer = setTimeout(() => {
    applyScheduledEnabled();
    reschedule();
  }, delay);
  armTimer.unref();
}

export function onScheduleSettingsChanged(): void {
  overrideUntil = 0;
  cancelFade();
  applyScheduledEnabled();
  reschedule();
}

export function onScheduleStart(): void {
  applyScheduledEnabled();
  reschedule();
}

export function onScheduleResume(): void {
  reschedule();
  applyScheduledEnabled();
}

export function stopSchedule(): void {
  if (armTimer) clearTimeout(armTimer);
  armTimer = null;
  cancelFade();
}
