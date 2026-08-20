import path from "node:path";
import { BrowserWindow, screen } from "electron";
import { logMain } from "./log.js";

const overlayWins = new Map<number, BrowserWindow>();
let dirname = "";
let getOverlaySettings: () => Settings = () => {
  throw new Error("overlays not initialized");
};
let clickThrough = true;
let alwaysOnTopTimer: NodeJS.Timeout | null = null;

export function initOverlays(
  appDir: string,
  overlaySettings: () => Settings
): void {
  dirname = appDir;
  getOverlaySettings = overlaySettings;
}

function overlayHtml(): string {
  return path.join(dirname, "renderer", "overlay.html");
}

function preloadPath(): string {
  return path.join(dirname, "preload.js");
}

export function getOverlayWindows(): Map<number, BrowserWindow> {
  return overlayWins;
}

export function getOverlayNativeHandles(): Buffer[] {
  const out: Buffer[] = [];
  for (const [, w] of overlayWins) {
    try {
      if (!w.isDestroyed()) out.push(w.getNativeWindowHandle());
    } catch {
      // ignore
    }
  }
  return out;
}

function createOverlayForDisplay(display: Electron.Display): BrowserWindow {
  const { bounds } = display;
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    show: true,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    type: process.platform === "win32" ? "toolbar" : "panel",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(clickThrough, { forward: true });

  win.loadFile(overlayHtml());
  win.once("ready-to-show", () => {
    try {
      win.webContents.send("apply", getOverlaySettings());
    } catch {
      // ignore
    }
  });

  win.on("closed", () => {
    overlayWins.delete(display.id);
  });

  return win;
}

export function refreshOverlays(): void {
  const displays = screen.getAllDisplays();
  const currentIds = new Set(displays.map((d) => d.id));

  for (const [id, w] of overlayWins) {
    if (!currentIds.has(id)) {
      try {
        w.close();
      } catch {
        // ignore
      }
      overlayWins.delete(id);
    }
  }

  for (const d of displays) {
    if (!overlayWins.has(d.id)) overlayWins.set(d.id, createOverlayForDisplay(d));
    else overlayWins.get(d.id)!.setBounds(d.bounds);
  }

  broadcastOverlays();
}

export function broadcastOverlays(): void {
  const s = getOverlaySettings();
  for (const [, w] of overlayWins) {
    try {
      w.webContents.send("apply", s);
    } catch {
      // ignore
    }
  }
}

export function debugFlashOverlay(): void {
  for (const [, w] of overlayWins) {
    try {
      w.webContents.send("debug:flash");
    } catch {
      // ignore
    }
  }
}

export function toggleClickThrough(): boolean {
  clickThrough = !clickThrough;
  for (const [, w] of overlayWins) {
    try {
      w.setIgnoreMouseEvents(clickThrough, { forward: true });
    } catch {
      // ignore
    }
  }
  return clickThrough;
}

export function getClickThrough(): boolean {
  return clickThrough;
}

export function reassertAlwaysOnTop(): void {
  for (const [, w] of overlayWins) {
    try {
      if (!w.isDestroyed() && w.isVisible()) w.setAlwaysOnTop(true, "screen-saver");
    } catch {
      // ignore
    }
  }
}

export function startAlwaysOnTopWatch(): void {
  if (alwaysOnTopTimer) return;
  alwaysOnTopTimer = setInterval(() => reassertAlwaysOnTop(), 2000);
  alwaysOnTopTimer.unref();
}

export function stopAlwaysOnTopWatch(): void {
  if (alwaysOnTopTimer) {
    clearInterval(alwaysOnTopTimer);
    alwaysOnTopTimer = null;
  }
}

export function applyFullscreenHides(
  hidden: Set<number> | "all" | "none"
): void {
  for (const [id, w] of overlayWins) {
    if (w.isDestroyed()) continue;
    const hide =
      hidden === "all" || (hidden instanceof Set && hidden.has(id));
    try {
      if (hide) {
        if (w.isVisible()) w.hide();
      } else {
        if (!w.isVisible()) w.show();
        w.setIgnoreMouseEvents(clickThrough, { forward: true });
        w.setAlwaysOnTop(true, "screen-saver");
      }
    } catch (e) {
      logMain("[Overlay] hide/show failed", String(e));
    }
  }
}

export function openFirstOverlayDevTools(): void {
  [...overlayWins.values()][0]?.webContents.openDevTools({ mode: "detach" });
}
