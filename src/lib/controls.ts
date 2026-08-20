import path from "node:path";
import { BrowserWindow } from "electron";

let controlWin: BrowserWindow | null = null;
let dirname = "";
let getPayload: () => UiPayload = () => {
  throw new Error("controls not initialized");
};

export function initControls(appDir: string, payload: () => UiPayload): void {
  dirname = appDir;
  getPayload = payload;
}

function trayIcon(): string {
  return path.join(dirname, "icons", "icon.ico");
}

function preloadPath(): string {
  return path.join(dirname, "preload.js");
}

export function getControlWindow(): BrowserWindow | null {
  return controlWin;
}

export function getControlNativeHandle(): Buffer | null {
  try {
    if (controlWin && !controlWin.isDestroyed())
      return controlWin.getNativeWindowHandle();
  } catch {
    // ignore
  }
  return null;
}

export function createControlWindow(): void {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.show();
    controlWin.focus();
    return;
  }

  controlWin = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Warm N Dim Controls",
    icon: trayIcon(),
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWin.loadFile(path.join(dirname, "renderer", "control.html"));
  controlWin.webContents.on("did-finish-load", () => {
    broadcastControl();
  });
  controlWin.on("closed", () => {
    controlWin = null;
  });
}

export function broadcastControl(): void {
  if (controlWin && !controlWin.isDestroyed()) {
    try {
      controlWin.webContents.send("apply", getPayload());
    } catch {
      // ignore
    }
  }
}

export function openControlDevTools(): void {
  controlWin?.webContents.openDevTools({ mode: "detach" });
}
