import fs from "node:fs";
import { app } from "electron";
import Store from "electron-store";
import { logMain } from "./log.js";
import { defaults, migrate } from "./settingsMigrate.js";

export { defaults, migrate };

const store = new Store<{ settings: Settings }>({
  name: "prefs",
  defaults: { settings: defaults },
});

let settings: Settings = defaults;
let firstRun = false;

export function initSettings(): { firstRun: boolean } {
  firstRun = !fs.existsSync(store.path);
  settings = migrate(store.get("settings"));
  saveSettings();
  logMain("[Settings] loaded", { firstRun, path: store.path });
  return { firstRun };
}

export function getSettings(): Settings {
  return settings;
}

export function getFirstRun(): boolean {
  return firstRun;
}

export function saveSettings(): void {
  store.set("settings", settings);
}

export function patchSettings(patch: Partial<Settings>): Settings {
  settings = {
    ...settings,
    ...patch,
    hotkeys: { ...settings.hotkeys, ...(patch.hotkeys ?? {}) },
    schedule: { ...settings.schedule, ...(patch.schedule ?? {}) },
  };
  settings = migrate(settings);
  saveSettings();
  return settings;
}

export function applyAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
    });
  } catch (e) {
    logMain("[Settings] setLoginItemSettings failed", String(e));
  }
}
