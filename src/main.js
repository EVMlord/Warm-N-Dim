const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  ipcMain,
  nativeTheme,
} = require("electron");
const path = require("path");

let tray = null;
let controlWin = null;
let overlayWins = new Map(); // display.id -> BrowserWindow

let settings = {
  enabled: true,
  warmth: 40, // 0-100 (tint strength)
  dim: 20, // 0-100 (black overlay strength)
};

const isWin = process.platform === "win32";

function createOverlayForDisplay(display) {
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
    type: isWin ? "toolbar" : "panel",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Stay above everything (even fullscreen). On Windows, 'screen-saver' is very top.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true }); // click-through

  win.loadFile(path.join(__dirname, "overlay.html"));
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
    if (!overlayWins.has(d.id)) {
      const w = createOverlayForDisplay(d);
      overlayWins.set(d.id, w);
    } else {
      // Reposition if metrics changed
      const w = overlayWins.get(d.id);
      const { bounds } = d;
      w.setBounds(bounds);
    }
  }

  broadcastSettings();
}

function broadcastSettings() {
  for (const [, w] of overlayWins) {
    try {
      w.webContents.send("apply", settings);
    } catch {}
  }
}

function createControlWindow() {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.show();
    return;
  }

  controlWin = new BrowserWindow({
    width: 360,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "Warm Dim Controls",
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWin.loadFile(path.join(__dirname, "control.html"));
}

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
    { type: "separator" },
    { label: "Open controls", click: () => createControlWindow() },
    { type: "separator" },
    { role: "quit" },
  ]);
}

function createTray() {
  if (!tray) {
    const iconPath = path.join(__dirname, "..", "icons", "icon.ico");
    tray = new Tray(iconPath); // ensure icon.ico exists, or use a PNG
    tray.on("click", () => createControlWindow());
    tray.setToolTip("Warm N Dim");
  }
  tray.setContextMenu(buildTrayMenu());
}

function updateTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

// IPC from control window
ipcMain.on("settings:change", (_evt, patch) => {
  settings = { ...settings, ...patch };
  broadcastSettings();
});

ipcMain.on("overlay:toggle", () => {
  settings.enabled = !settings.enabled;
  broadcastSettings();
  updateTray();
});

// Single-instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => createControlWindow());
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";
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
