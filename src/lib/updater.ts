import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { app, dialog } from "electron";
import type {
  AppUpdater,
  UpdateCheckResult,
  ProgressInfo,
  UpdateInfo,
} from "electron-updater";
import { logMain } from "./log.js";
import { getSettings } from "./settings.js";
import { getTray } from "./tray.js";
import { broadcastControl } from "./controls.js";

const requireCJS = createRequire(import.meta.url);

let updater: AppUpdater | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let updateStatus = "";

function getAutoUpdater(): AppUpdater | null {
  try {
    const mod = requireCJS("electron-updater");
    const au = mod?.autoUpdater ?? mod?.default?.autoUpdater;
    return au ?? null;
  } catch (e) {
    logMain("[Updater] load failed:", String(e));
    return null;
  }
}

export function getUpdater(): AppUpdater | null {
  return updater;
}

export function getUpdateStatus(): string {
  return updateStatus;
}

function setStatus(s: string): void {
  updateStatus = s;
  try {
    broadcastControl();
  } catch {
    // controls may not be ready
  }
}

export function applyUpdateChannel(): void {
  if (!updater) return;
  updater.allowPrerelease = getSettings().updateChannel === "beta";
  logMain("[Updater] allowPrerelease =", updater.allowPrerelease);
}

export function isUpdaterEnabled(): boolean {
  return !!updater && app.isPackaged;
}

export function checkForUpdates(notify = false): void {
  if (!app.isPackaged || !updater) {
    setStatus("Updates are only checked in packaged builds.");
    logMain("[Updater] skip check (dev or unresolved)");
    return;
  }
  setStatus("Checking for updates…");
  const p = notify
    ? updater.checkForUpdatesAndNotify()
    : updater.checkForUpdates();
  p?.catch((err: unknown) => {
    setStatus("Update check failed.");
    logMain("[Updater] check failed:", String(err));
  });
}

export function setupAutoUpdater(): void {
  const updaterCfgPath = path.join(process.resourcesPath, "app-update.yml");
  logMain("[Updater] packaged =", app.isPackaged);
  logMain(
    "[Updater] app-update.yml present =",
    fs.existsSync(updaterCfgPath),
    "path:",
    updaterCfgPath
  );

  if (!app.isPackaged) {
    logMain("[Updater] electron-updater skipped; running in dev");
    setStatus("Dev build — auto-update disabled.");
    return;
  }

  updater = getAutoUpdater();
  logMain("[Updater] resolved =", !!updater);
  if (!updater) return;

  updater.logger = {
    info: (...a: unknown[]) => logMain("[Updater][info]", ...a),
    warn: (...a: unknown[]) => logMain("[Updater][warn]", ...a),
    error: (...a: unknown[]) => logMain("[Updater][error]", ...a),
    debug: (...a: unknown[]) => logMain("[Updater][debug]", ...a),
  };

  applyUpdateChannel();
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;

  updater.on("checking-for-update", () => {
    logMain("[Updater] checking-for-update");
    setStatus("Checking for updates…");
  });
  updater.on("update-available", (i: UpdateInfo) => {
    logMain("[Updater] update-available:", i.version, i.releaseDate ?? "");
    setStatus(`Update ${i.version} available. Downloading…`);
    getTray()?.displayBalloon?.({
      title: "Warm N Dim",
      content: "Update available. Downloading…",
    });
  });
  updater.on("update-not-available", (i: UpdateInfo) => {
    logMain(
      "[Updater] update-not-available; current =",
      app.getVersion(),
      "latest =",
      i?.version
    );
    setStatus(`Up to date (${app.getVersion()}).`);
  });
  updater.on("error", (e: Error) => {
    logMain("[Updater] error:", e.message);
    setStatus(`Updater error: ${e.message}`);
  });
  updater.on("download-progress", (p: ProgressInfo) => {
    logMain(
      "[Updater] download-progress:",
      `${p.percent.toFixed(0)}%`,
      `${Math.round(p.bytesPerSecond / 1024)} KB/s`
    );
    setStatus(`Downloading update… ${p.percent.toFixed(0)}%`);
    getTray()?.setToolTip?.(`Warm N Dim — downloading ${p.percent.toFixed(0)}%`);
  });
  updater.on("update-downloaded", (i: UpdateInfo) => {
    logMain("[Updater] update-downloaded:", i.version);
    setStatus(`Update ${i.version} ready. Restart to install.`);
    getTray()?.setToolTip?.("Warm N Dim");
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

  updater
    .checkForUpdates()
    .then((res: UpdateCheckResult | null | undefined) => {
      const v = res?.updateInfo?.version ?? "unknown";
      logMain("[Updater] initial check result:", v);
      if (res?.updateInfo && res.updateInfo.version !== app.getVersion()) {
        logMain("[Updater] newer version detected:", res.updateInfo.version);
      }
    })
    .catch((err) => logMain("[Updater] initial check failed:", String(err)));

  if (!updateTimer) {
    updateTimer = setInterval(() => {
      updater!.checkForUpdates().catch((err) =>
        logMain("[Updater] periodic check failed:", String(err))
      );
    }, 6 * 60 * 60 * 1000);
    updateTimer.unref();
  }
}

export function stopAutoUpdater(): void {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}
