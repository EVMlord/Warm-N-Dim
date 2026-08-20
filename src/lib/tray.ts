import path from "node:path";
import { Tray, Menu } from "electron";
import { getSettings } from "./settings.js";
import { getClickThrough } from "./overlays.js";

let tray: Tray | null = null;
let dirname = "";

export type TrayActions = {
  toggleOverlay: () => void;
  setAutolaunch: (v: boolean) => void;
  setUpdateChannel: (channel: "stable" | "beta") => void;
  openControls: () => void;
  flashOverlay: () => void;
  toggleClickThrough: () => void;
  openOverlayDevtools: () => void;
  openControlDevtools: () => void;
  openLogs: () => void;
  checkUpdates: () => void;
  fullscreenProbe: () => void;
};

let actions: TrayActions | null = null;

export function initTray(appDir: string, a: TrayActions): void {
  dirname = appDir;
  actions = a;
}

export function getTray(): Tray | null {
  return tray;
}

function iconPath(): string {
  return path.join(dirname, "icons", "icon.ico");
}

function buildTrayMenu(): Electron.Menu {
  const s = getSettings();
  const a = actions!;
  return Menu.buildFromTemplate([
    {
      id: "toggleOverlay",
      label: s.enabled ? "Disable overlay" : "Enable overlay",
      accelerator: s.hotkeys.toggle || undefined,
      click: () => a.toggleOverlay(),
    },
    {
      id: "autolaunch",
      type: "checkbox",
      label: "Launch at startup",
      checked: !!s.autolaunch,
      click: (item) => a.setAutolaunch(item.checked),
    },
    {
      id: "beta",
      type: "checkbox",
      label: "Include beta updates",
      checked: s.updateChannel === "beta",
      click: (item) => a.setUpdateChannel(item.checked ? "beta" : "stable"),
    },
    { type: "separator" },
    {
      label: "Open controls",
      accelerator: s.hotkeys.openControls || undefined,
      click: () => a.openControls(),
    },
    {
      label: "Debug ▸",
      submenu: [
        { label: "Flash overlay", click: () => a.flashOverlay() },
        {
          label: getClickThrough()
            ? "Disable click-through (debug)"
            : "Enable click-through",
          click: () => a.toggleClickThrough(),
        },
        { label: "Fullscreen probe", click: () => a.fullscreenProbe() },
        {
          label: "Open overlay DevTools",
          click: () => a.openOverlayDevtools(),
        },
        {
          label: "Open control DevTools",
          click: () => a.openControlDevtools(),
        },
        { label: "Open logs folder", click: () => a.openLogs() },
      ],
    },
    { type: "separator" },
    { label: "Check for updates…", click: () => a.checkUpdates() },
    { type: "separator" },
    { role: "quit" },
  ]);
}

export function createTray(): void {
  if (!tray) {
    tray = new Tray(iconPath());
    tray.on("click", () => actions?.openControls());
    tray.setToolTip("Warm N Dim");
  }
  updateTray();
}

export function updateTray(): void {
  if (tray) tray.setContextMenu(buildTrayMenu());
}
