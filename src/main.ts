import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeTheme,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
// import fs from "node:fs";
import Store from "electron-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- State ----
let tray: Tray | null = null;
let controlWin: BrowserWindow | null = null;
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

// ---- Robust asset resolver ----
// Handles dev (src/), tsc build (dist/ + src/), and packaged (app.asar)
// function resolveAsset(...segments: string[]) {
//   // 1) dist-relative (e.g., dist/preload.js)
//   const p1 = path.join(__dirname, ...segments);
//   if (fs.existsSync(p1)) return p1;

//   // 2) src-relative (e.g., dist/../src/overlay.html)
//   const p2 = path.join(__dirname, "../src/renderer", ...segments);
//   if (fs.existsSync(p2)) return p2;

//   // 3) packaged
//   const p3 = path.join(process.resourcesPath, ...segments);
//   return p3;
// }

// const paths = {
//   preload: () => resolveAsset("preload.js"),
//   overlayHtml: () => resolveAsset("overlay.html"),
//   controlHtml: () => resolveAsset("control.html"),
//   trayIcon: () => resolveAsset("../icons", "icon.ico"),
// };

// // Resolve built (dist) first, then src fallback (useful during early dev)
// function resolveDist(...s: string[]) {
//   return path.join(__dirname, ...s);
// }
// function resolveSrcRenderer(...s: string[]) {
//   return path.join(__dirname, "../src/renderer", ...s);
// }
// function pick(...candidates: string[]) {
//   return candidates.find((p) => fs.existsSync(p)) || candidates[0];
// }

// const paths = {
//   preload: () => pick(resolveDist("preload.js")),
//   overlayHtml: () =>
//     pick(
//       resolveDist("renderer/overlay.html"),
//       resolveSrcRenderer("overlay.html")
//     ),
//   controlHtml: () =>
//     pick(
//       resolveDist("renderer/control.html"),
//       resolveSrcRenderer("control.html")
//     ),
//   trayIcon: () =>
//     pick(
//       resolveDist("icons/icon.ico"),
//       path.join(__dirname, "../icons/icon.ico")
//     ),
// };

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
function debugOpenOverlayDevTools() {
  for (const [, w] of overlayWins)
    try {
      w.webContents.openDevTools({ mode: "detach" });
    } catch {}
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
      label: "Debug",
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
          click: () => debugOpenOverlayDevTools(),
        },
      ],
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

  // React to display changes
  screen.on("display-added", refreshOverlays);
  screen.on("display-removed", refreshOverlays);
  screen.on("display-metrics-changed", refreshOverlays);
});

app.on("window-all-closed", () => {
  // Keep running in tray on Windows
  if (process.platform !== "darwin") {
    // do nothing; app continues
  }
});
