import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const requireCJS = createRequire(import.meta.url);

import Store from "electron-store";

import {
  app,
  BrowserWindow,
  dialog,
  Tray,
  Menu,
  screen,
  shell,
  ipcMain,
  nativeTheme,
  powerMonitor,
} from "electron";

import type {
  AppUpdater,
  UpdateCheckResult,
  ProgressInfo,
  UpdateInfo,
} from "electron-updater";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logsDir, "main.log");

function logMain(...args: unknown[]) {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const line =
      new Date().toISOString() +
      " " +
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ") +
      "\n";
    fs.appendFileSync(logFile, line);
  } catch {}
  // still mirror to console for dev
  console.log(...args);
}

const updaterCfgPath = path.join(process.resourcesPath, "app-update.yml");

logMain("[Updater] packaged =", app.isPackaged);
logMain(
  "[Updater] app-update.yml present =",
  fs.existsSync(updaterCfgPath),
  "path:",
  updaterCfgPath
);

// ---- State ----
let tray: Tray | null = null;
let controlWin: BrowserWindow | null = null;
let updater: AppUpdater | null = null;
let updateTimer: NodeJS.Timeout | null = null;
const overlayWins = new Map<number, BrowserWindow>(); // display.id -> BrowserWindow

// ---- Store with defaults----
const defaults: Settings = {
  enabled: true,
  warmth: 40,
  dim: 20,
  autolaunch: false,
};

const store = new Store<{ settings: Settings }>({
  name: "prefs",
  defaults: { settings: defaults }, // <- defaults live in the store
});

let settings: Settings = store.get("settings");

function saveSettings() {
  store.set("settings", settings);
}

function applyAutoLaunch() {
  try {
    // Built-in Electron method (Windows + macOS).
    // On Windows this writes to HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    app.setLoginItemSettings({
      openAtLogin: !!settings.autolaunch,
      path: process.execPath,
    });
  } catch (e) {
    console.error("setLoginItemSettings failed", e);
  }
}

const paths = {
  preload: () => path.join(__dirname, "preload.js"),
  overlayHtml: () => path.join(__dirname, "renderer", "overlay.html"),
  controlHtml: () => path.join(__dirname, "renderer", "control.html"),
  trayIcon: () => path.join(__dirname, "icons", "icon.ico"),
};

// log once so we can sanity-check
function logPathsOnce() {
  console.log("[WarmNDim] preload:", paths.preload());
  console.log("[WarmNDim] overlayHtml:", paths.overlayHtml());
  console.log("[WarmNDim] controlHtml:", paths.controlHtml());
  console.log("[WarmNDim] trayIcon:", paths.trayIcon());
}

// Resolve autoUpdater no matter how the module is exposed
function getAutoUpdater(): AppUpdater | null {
  try {
    const mod = requireCJS("electron-updater"); // CJS load always works
    const au = mod?.autoUpdater ?? mod?.default?.autoUpdater;
    return au ?? null;
  } catch (e) {
    logMain("[Updater] load failed:", String(e));
    return null;
  }
}

// ---- Overlay management ----
function createOverlayForDisplay(display: Electron.Display) {
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
      preload: paths.preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Stay above everything (even fullscreen). On Windows, 'screen-saver' is very top.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through

  win.loadFile(paths.overlayHtml());
  win.once("ready-to-show", () => {
    win.webContents.send("apply", settings);
  });

  win.on("closed", () => {
    overlayWins.delete(display.id);
  });

  return win;
}

function refreshOverlays() {
  const displays = screen.getAllDisplays();
  const currentIds = new Set(displays.map((d) => d.id));

  // Remove stale overlays
  for (const [id, w] of overlayWins) {
    if (!currentIds.has(id)) {
      try {
        w.close();
      } catch {}
      overlayWins.delete(id);
    }
  }

  // Create missing overlays
  for (const d of displays) {
    if (!overlayWins.has(d.id))
      overlayWins.set(d.id, createOverlayForDisplay(d));
    else overlayWins.get(d.id)!.setBounds(d.bounds);
  }

  broadcastSettings();
}

function broadcastSettings() {
  saveSettings();

  for (const [, w] of overlayWins) {
    try {
      w.webContents.send("apply", settings);
    } catch {}
  }

  if (controlWin && !controlWin.isDestroyed()) {
    try {
      controlWin.webContents.send("apply", settings);
    } catch {}
  }
}

// --- Debug: Flash overlay ---
function debugFlashOverlay() {
  for (const [, w] of overlayWins) {
    try {
      w.webContents.send("debug:flash");
    } catch {}
  }
}

let clickThrough = true;
function debugToggleClickThrough() {
  clickThrough = !clickThrough;
  for (const [, w] of overlayWins)
    try {
      w.setIgnoreMouseEvents(clickThrough, { forward: true });
    } catch {}
}

// ---- Tray ----
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      id: "toggleOverlay",
      label: settings.enabled ? "Disable overlay" : "Enable overlay",
      click: () => {
        settings.enabled = !settings.enabled;
        broadcastSettings();
        updateTray(); // just rebuild the menu
      },
    },
    {
      id: "autolaunch",
      type: "checkbox",
      label: "Launch at startup",
      checked: !!settings.autolaunch,
      click: (item) => {
        settings.autolaunch = item.checked;
        applyAutoLaunch();
        broadcastSettings();
      },
    },
    { type: "separator" },
    { label: "Open controls", click: () => createControlWindow() },
    {
      label: "Debug ▸",
      submenu: [
        { label: "Flash overlay", click: () => debugFlashOverlay() },
        {
          label: clickThrough
            ? "Disable click-through (debug)"
            : "Enable click-through",
          click: () => {
            debugToggleClickThrough();
            updateTray();
          },
        },
        {
          label: "Open overlay DevTools",
          click: () =>
            [...overlayWins.values()][0]?.webContents.openDevTools({
              mode: "detach",
            }),
        },
        {
          label: "Open control DevTools",
          click: () => controlWin?.webContents.openDevTools({ mode: "detach" }),
        },
        { label: "Open logs folder", click: () => shell.openPath(logsDir) },
      ],
    },
    { type: "separator" },
    {
      label: "Check for updates…",
      enabled: !!updater && app.isPackaged,
      click: () => updater?.checkForUpdatesAndNotify(),
    },
    { type: "separator" },
    { role: "quit" },
  ]);
}

function createTray() {
  if (!tray) {
    tray = new Tray(paths.trayIcon()); // ensure icon.ico exists, or use a PNG
    tray.on("click", () => createControlWindow());
    tray.setToolTip("Warm N Dim");
  }
  tray.setContextMenu(buildTrayMenu());
}

function updateTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

// ---- Controls window ----
function createControlWindow() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.show();
    return;
  }

  controlWin = new BrowserWindow({
    width: 380,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Warm N Dim Controls",
    icon: paths.trayIcon(),
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: paths.preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWin.loadFile(paths.controlHtml());
  controlWin.webContents.on("did-finish-load", () => {
    controlWin!.webContents.send("apply", settings);
  });
}

// ---- Updates ----
function setupAutoUpdater() {
  if (!app.isPackaged) {
    logMain("[Updater] electron-updater skipped; running in dev");
    return; // only enable in packaged builds
  }

  updater = getAutoUpdater();

  logMain("[Updater] resolved =", !!updater, "packaged =", app.isPackaged);

  if (!updater) return;

  // direct logs from electron-updater into our file logger
  updater.logger = {
    info: (...a: unknown[]) => logMain("[Updater][info]", ...a),
    warn: (...a: unknown[]) => logMain("[Updater][warn]", ...a),
    error: (...a: unknown[]) => logMain("[Updater][error]", ...a),
    debug: (...a: unknown[]) => logMain("[Updater][debug]", ...a),
  };

  // Allow betas if our app version has a prerelease tag (e.g. 1.2.0-beta.1)
  updater.allowPrerelease = /-/.test(app.getVersion());
  updater.autoDownload = true; // download when found
  updater.autoInstallOnAppQuit = true; // install on quit (or call quitAndInstall)

  // event telemetry
  updater.on("checking-for-update", () =>
    logMain("[Updater] checking-for-update")
  );
  updater.on("update-available", (i: UpdateInfo) => {
    logMain("[Updater] update-available:", i.version, i.releaseDate ?? "");
    tray?.displayBalloon?.({
      title: "Warm N Dim",
      content: "Update available. Downloading…",
    });
  });
  updater.on("update-not-available", (i: UpdateInfo) =>
    logMain(
      "[Updater] update-not-available; current =",
      app.getVersion(),
      "latest =",
      i?.version
    )
  );
  updater.on("error", (e: Error) => logMain("[Updater] error:", e.message));
  updater.on("download-progress", (p: ProgressInfo) => {
    logMain(
      "[Updater] download-progress:",
      `${p.percent.toFixed(0)}%`,
      `${Math.round(p.bytesPerSecond / 1024)} KB/s`
    );
    tray?.setToolTip?.(`Warm N Dim — downloading ${p.percent.toFixed(0)}%`);
  });
  updater.on("update-downloaded", (i: UpdateInfo) => {
    logMain("[Updater] update-downloaded:", i.version);
    tray?.setToolTip?.("Warm N Dim");
    const res = dialog.showMessageBoxSync({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Warm N Dim ${i.version} is ready to install.`,
      detail: "Restart to apply the update.",
    });
    if (res === 0) updater!.quitAndInstall();
  });
  // initial check (use checkForUpdates so we can log result)
  updater
    .checkForUpdates()
    .then((res: UpdateCheckResult | null | undefined) => {
      const v = res?.updateInfo?.version ?? "unknown";
      logMain("[Updater] initial check result:", v);
      // optional notify balloon
      if (res?.updateInfo && res.updateInfo.version !== app.getVersion()) {
        logMain("[Updater] newer version detected:", res.updateInfo.version);
      }
    })
    .catch((err) => logMain("[Updater] initial check failed:", String(err)));

  // periodic
  if (!updateTimer) {
    updateTimer = setInterval(() => {
      updater!
        .checkForUpdates()
        .catch((err) =>
          logMain("[Updater] periodic check failed:", String(err))
        );
    }, 6 * 60 * 60 * 1000); // periodic checks (every 6h)
    updateTimer.unref(); // won’t keep the app alive
  }
}

// IPC from control window
ipcMain.on("settings:change", (_evt, patch: Partial<Settings>) => {
  const before = { ...settings };

  settings = { ...settings, ...patch };

  if ("autolaunch" in patch && patch.autolaunch !== before.autolaunch)
    applyAutoLaunch();

  broadcastSettings();
  updateTray();
});

ipcMain.on("overlay:toggle", () => {
  settings.enabled = !settings.enabled;
  broadcastSettings();
  updateTray();
});

// expose current settings on demand
ipcMain.handle("settings:get", (): Settings => settings);

// ---- Single-instance ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => createControlWindow());
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  app.setAppUserModelId("dev.evmlord.warmndim");

  nativeTheme.themeSource = "dark";

  // helpful once: see which files we’re actually loading
  logPathsOnce();

  applyAutoLaunch();
  refreshOverlays();
  createControlWindow();
  createTray();

  setupAutoUpdater();

  // React to display changes
  screen.on("display-added", refreshOverlays);
  screen.on("display-removed", refreshOverlays);
  screen.on("display-metrics-changed", refreshOverlays);
});

powerMonitor.on("resume", () => updater?.checkForUpdates().catch(() => {}));

app.on("before-quit", () => {
  if (updateTimer) clearInterval(updateTimer);
});

app.on("window-all-closed", () => {
  // Keep running in tray on Windows
  if (process.platform !== "darwin") {
    // do nothing; app continues
  }
});
