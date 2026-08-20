import { clamp } from "./scheduleMath.js";

export const defaults: Settings = {
  enabled: true,
  warmth: 40,
  dim: 20,
  autolaunch: false,
  hotkeys: {
    toggle: "Control+Alt+W",
    openControls: "Control+Alt+Shift+W",
    dimUp: "",
    dimDown: "",
    warmthUp: "",
    warmthDown: "",
  },
  schedule: {
    enabled: false,
    mode: "fixed",
    start: "21:00",
    end: "07:00",
    latitude: null,
    longitude: null,
    city: null,
    fadeMinutes: 0,
  },
  fullscreenBehavior: "hide",
  hideOnBorderlessFullscreen: true,
  updateChannel: "stable",
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function asHotkeys(v: unknown): HotkeyMap {
  const r = asRecord(v);
  const pick = (k: HotkeyAction, fallback: string): string =>
    typeof r[k] === "string" ? (r[k] as string) : fallback;
  return {
    toggle: pick("toggle", defaults.hotkeys.toggle),
    openControls: pick("openControls", defaults.hotkeys.openControls),
    dimUp: pick("dimUp", defaults.hotkeys.dimUp),
    dimDown: pick("dimDown", defaults.hotkeys.dimDown),
    warmthUp: pick("warmthUp", defaults.hotkeys.warmthUp),
    warmthDown: pick("warmthDown", defaults.hotkeys.warmthDown),
  };
}

function asSchedule(v: unknown): ScheduleSettings {
  const r = asRecord(v);
  const mode: ScheduleMode = r.mode === "sunset" ? "sunset" : "fixed";
  const lat = typeof r.latitude === "number" ? r.latitude : null;
  const lng = typeof r.longitude === "number" ? r.longitude : null;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : defaults.schedule.enabled,
    mode,
    start: typeof r.start === "string" ? r.start : defaults.schedule.start,
    end: typeof r.end === "string" ? r.end : defaults.schedule.end,
    latitude: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    longitude: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
    city: typeof r.city === "string" ? r.city : null,
    fadeMinutes: clamp(
      typeof r.fadeMinutes === "number" ? r.fadeMinutes : defaults.schedule.fadeMinutes,
      0,
      60
    ),
  };
}

function asBehavior(v: unknown): FullscreenBehavior {
  if (v === "always-on-top" || v === "hide" || v === "ask") return v;
  return defaults.fullscreenBehavior;
}

export function migrate(raw: unknown): Settings {
  const r = asRecord(raw);
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : defaults.enabled,
    warmth: clamp(typeof r.warmth === "number" ? r.warmth : defaults.warmth, 0, 100),
    dim: clamp(typeof r.dim === "number" ? r.dim : defaults.dim, 0, 100),
    autolaunch:
      typeof r.autolaunch === "boolean" ? r.autolaunch : defaults.autolaunch,
    hotkeys: asHotkeys(r.hotkeys),
    schedule: asSchedule(r.schedule),
    fullscreenBehavior: asBehavior(r.fullscreenBehavior),
    hideOnBorderlessFullscreen:
      typeof r.hideOnBorderlessFullscreen === "boolean"
        ? r.hideOnBorderlessFullscreen
        : defaults.hideOnBorderlessFullscreen,
    updateChannel: r.updateChannel === "beta" ? "beta" : "stable",
  };
}
