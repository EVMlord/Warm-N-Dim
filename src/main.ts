import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  ipcMain,
  screen,
  shell,
  nativeTheme,
  powerMonitor,
} from "electron";

import { logMain, getLogsDir } from "./lib/log.js";
import {
  initSettings,
  getSettings,
  patchSettings,
  applyAutoLaunch,
} from "./lib/settings.js";
import { initCities, loadCities } from "./lib/cities.js";
import {
  initOverlays,
  refreshOverlays,
  broadcastOverlays,
  debugFlashOverlay,
  toggleClickThrough,
  openFirstOverlayDevTools,
  startAlwaysOnTopWatch,
  stopAlwaysOnTopWatch,
} from "./lib/overlays.js";
import {
  initControls,
  createControlWindow,
  broadcastControl,
  openControlDevTools,
} from "./lib/controls.js";
import { initTray, createTray, updateTray } from "./lib/tray.js";
import {
  setupAutoUpdater,
  stopAutoUpdater,
  applyUpdateChannel,
  checkForUpdates,
  getUpdateStatus,
} from "./lib/updater.js";
import {
  initHotkeys,
  registerHotkeys,
  unregisterHotkeys,
  setHotkeyRecording,
  getHotkeyErrors,
} from "./lib/hotkeys.js";
import {
  initSchedule,
  getOverlaySettings,
  getScheduleHint,
  onScheduleStart,
  onScheduleSettingsChanged,
  onScheduleResume,
  stopSchedule,
  markManualOverride,
  cancelFade,
} from "./lib/schedule.js";
import {
  initFullscreen,
  startFullscreenWatch,
  stopFullscreenWatch,
  logFullscreenProbe,
} from "./lib/fullscreen.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function controlPayload(): UiPayload {
  return {
    ...getSettings(),
    hotkeyErrors: getHotkeyErrors(),
    scheduleHint: getScheduleHint(),
    appVersion: app.getVersion(),
    updateStatus: getUpdateStatus(),
  };
}

function broadcastAll(): void {
  broadcastOverlays();
  broadcastControl();
  updateTray();
}

function toggleEnabled(): void {
  cancelFade();
  markManualOverride();
  patchSettings({ enabled: !getSettings().enabled });
  broadcastAll();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // quit() is async and can still run whenReady on a second launch
  app.exit(0);
} else {
  app.on("second-instance", () => createControlWindow());
}

if (gotLock) {

ipcMain.on("settings:change", (_evt, patch: Partial<Settings>) => {
  const before = getSettings();

  if (
    patch.enabled !== undefined ||
    patch.warmth !== undefined ||
    patch.dim !== undefined
  ) {
    cancelFade();
  }
  if (patch.enabled !== undefined && patch.enabled !== before.enabled) {
    markManualOverride();
  }

  const scheduleTouched = patch.schedule !== undefined;
  const hotkeysTouched = patch.hotkeys !== undefined;
  const channelTouched =
    patch.updateChannel !== undefined &&
    patch.updateChannel !== before.updateChannel;

  const next = patchSettings(patch);

  if ("autolaunch" in patch && patch.autolaunch !== before.autolaunch) {
    applyAutoLaunch(next.autolaunch);
  }
  if (hotkeysTouched) registerHotkeys();
  if (scheduleTouched) onScheduleSettingsChanged();
  if (channelTouched) {
    applyUpdateChannel();
    checkForUpdates(false);
  }

  broadcastAll();
});

ipcMain.on("overlay:toggle", () => toggleEnabled());

ipcMain.handle("settings:get", (): Settings => getSettings());
ipcMain.handle("cities:list", (): City[] => loadCities());
ipcMain.handle("app:version", (): string => app.getVersion());
ipcMain.on("updates:check", () => checkForUpdates(true));
ipcMain.on("hotkeys:recording", (_e, on: boolean) => {
  setHotkeyRecording(!!on);
});

app.whenReady().then(() => {
  app.setAppUserModelId("dev.evmlord.warmndim");
  nativeTheme.themeSource = "dark";

  const { firstRun } = initSettings();
  logMain("[WarmNDim] ready", {
    version: app.getVersion(),
    firstRun,
    preload: path.join(__dirname, "preload.js"),
  });

  applyAutoLaunch(getSettings().autolaunch);

  initCities(__dirname);
  initOverlays(__dirname, getOverlaySettings);
  initControls(__dirname, controlPayload);
  initSchedule(broadcastAll);
  initFullscreen(broadcastAll);
  initHotkeys({
    toggle: toggleEnabled,
    openControls: createControlWindow,
    afterAdjust: () => {
      cancelFade();
      broadcastAll();
    },
  });
  initTray(__dirname, {
    toggleOverlay: toggleEnabled,
    setAutolaunch: (v) => {
      patchSettings({ autolaunch: v });
      applyAutoLaunch(v);
      broadcastAll();
    },
    setUpdateChannel: (channel) => {
      patchSettings({ updateChannel: channel });
      applyUpdateChannel();
      checkForUpdates(false);
      broadcastAll();
    },
    openControls: createControlWindow,
    flashOverlay: debugFlashOverlay,
    toggleClickThrough: () => {
      toggleClickThrough();
      updateTray();
    },
    openOverlayDevtools: openFirstOverlayDevTools,
    openControlDevtools: openControlDevTools,
    openLogs: () => {
      shell.openPath(getLogsDir());
    },
    checkUpdates: () => checkForUpdates(true),
    fullscreenProbe: logFullscreenProbe,
  });

  refreshOverlays();
  if (firstRun) createControlWindow();
  createTray();
  registerHotkeys();
  onScheduleStart();
  startAlwaysOnTopWatch();
  startFullscreenWatch();
  setupAutoUpdater();

  screen.on("display-added", refreshOverlays);
  screen.on("display-removed", refreshOverlays);
  screen.on("display-metrics-changed", refreshOverlays);

  powerMonitor.on("resume", () => {
    logMain("[WarmNDim] power resume");
    onScheduleResume();
    checkForUpdates(false);
  });
});

app.on("before-quit", () => {
  stopAutoUpdater();
  stopSchedule();
  stopFullscreenWatch();
  stopAlwaysOnTopWatch();
  unregisterHotkeys();
});

app.on("will-quit", () => {
  unregisterHotkeys();
});

app.on("window-all-closed", () => {
  // Keep running in tray on Windows
});
}
