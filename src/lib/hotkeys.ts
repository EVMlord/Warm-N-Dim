import { globalShortcut } from "electron";
import { logMain } from "./log.js";
import { getSettings, patchSettings } from "./settings.js";
import { clamp } from "./scheduleMath.js";

export type HotkeyHandlers = {
  toggle: () => void;
  openControls: () => void;
  afterAdjust?: () => void;
};

let handlers: HotkeyHandlers | null = null;
let recording = false;
let errors: Partial<Record<HotkeyAction, string>> = {};

const ACTIONS: HotkeyAction[] = [
  "toggle",
  "openControls",
  "dimUp",
  "dimDown",
  "warmthUp",
  "warmthDown",
];

export function initHotkeys(h: HotkeyHandlers): void {
  handlers = h;
}

export function getHotkeyErrors(): Partial<Record<HotkeyAction, string>> {
  return errors;
}

export function setHotkeyRecording(on: boolean): void {
  recording = on;
  if (on) {
    globalShortcut.unregisterAll();
  } else {
    registerHotkeys();
  }
}

function bump(key: "dim" | "warmth", delta: number): void {
  const s = getSettings();
  patchSettings({ [key]: clamp(s[key] + delta, 0, 100) });
  handlers?.afterAdjust?.();
}

export function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  errors = {};
  if (recording || !handlers) return;

  const map = getSettings().hotkeys;
  const used = new Map<string, HotkeyAction>();

  for (const action of ACTIONS) {
    const acc = (map[action] ?? "").trim();
    if (!acc) continue;
    const owner = used.get(acc);
    if (owner) {
      errors[action] = `Same as ${owner}`;
      continue;
    }
    used.set(acc, action);
    let ok = false;
    try {
      ok = globalShortcut.register(acc, () => runAction(action));
    } catch (e) {
      logMain("[Hotkeys] register threw", action, acc, String(e));
      ok = false;
    }
    if (!ok) {
      errors[action] = "Already in use by another app";
      logMain("[Hotkeys] failed to register", action, acc);
    } else {
      logMain("[Hotkeys] registered", action, acc);
    }
  }
}

function runAction(action: HotkeyAction): void {
  if (!handlers) return;
  switch (action) {
    case "toggle":
      handlers.toggle();
      break;
    case "openControls":
      handlers.openControls();
      break;
    case "dimUp":
      bump("dim", 5);
      break;
    case "dimDown":
      bump("dim", -5);
      break;
    case "warmthUp":
      bump("warmth", 5);
      break;
    case "warmthDown":
      bump("warmth", -5);
      break;
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
