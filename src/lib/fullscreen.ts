import path from "node:path";
import { createRequire } from "node:module";
import { BrowserWindow, ipcMain, screen } from "electron";
import { logMain } from "./log.js";
import { getSettings, patchSettings } from "./settings.js";
import {
  applyFullscreenHides,
  getOverlayNativeHandles,
  getOverlayWindows,
} from "./overlays.js";
import { getControlNativeHandle } from "./controls.js";
import {
  isBorderlessStyle,
  isExclusiveIsh,
  isFullscreenCover,
  SHELL_CLASS_NAMES,
  type Rect,
} from "./fullscreenMath.js";

const requireCJS = createRequire(import.meta.url);

type Ffi = {
  GetForegroundWindow: () => unknown;
  GetWindowRect: (hwnd: unknown, rect: Rect) => boolean;
  GetWindowLongPtrW: (hwnd: unknown, n: number) => number | bigint;
  GetClassNameW: (hwnd: unknown) => string;
  SHQueryUserNotificationState: () => number;
  address: (ptr: unknown) => bigint;
};

let ffi: Ffi | null = null;
let ffiFailed = false;
let pollTimer: NodeJS.Timeout | null = null;
let asking = false;
let lastHadFullscreen = false;
let hidThisSession = false;
let notify: () => void = () => {};
let dirname = "";
let promptWin: BrowserWindow | null = null;

const GWL_STYLE = -16;

export function initFullscreen(appDir: string, onChange: () => void): void {
  dirname = appDir;
  notify = onChange;
  ipcMain.on("fullscreen:choice", (_e, choice: unknown) => {
    applyPromptChoice(choice);
  });
}

function trayIcon(): string {
  return path.join(dirname, "icons", "icon.ico");
}

function preloadPath(): string {
  return path.join(dirname, "preload.js");
}

function handleToBigInt(buf: Buffer): bigint {
  if (buf.length >= 8) return buf.readBigUInt64LE(0);
  return BigInt(buf.readUInt32LE(0));
}

function getPromptNativeHandle(): Buffer | null {
  try {
    if (promptWin && !promptWin.isDestroyed())
      return promptWin.getNativeWindowHandle();
  } catch {
    // ignore
  }
  return null;
}

function ourAddresses(): Set<string> {
  const set = new Set<string>();
  const add = (buf: Buffer | null): void => {
    if (!buf) return;
    try {
      set.add(handleToBigInt(buf).toString());
    } catch {
      // ignore
    }
  };
  for (const buf of getOverlayNativeHandles()) add(buf);
  add(getControlNativeHandle());
  add(getPromptNativeHandle());
  return set;
}

function loadFfi(): Ffi | null {
  if (ffi) return ffi;
  if (ffiFailed || process.platform !== "win32") return null;
  try {
    const koffi = requireCJS("koffi") as {
      load: (name: string) => { func: (sig: string) => CallableFunction };
      struct: (name: string, fields: Record<string, string>) => unknown;
      encode: (type: unknown, value: unknown) => unknown;
      decode: ((value: unknown, type: unknown, length?: number) => unknown) & {
        int: (ptr: unknown) => number;
        string16: (ptr: unknown, length?: number) => string;
      };
      address: (ptr: unknown) => number | bigint;
      alloc: (type: string, length?: number) => unknown;
    };
    const user32 = koffi.load("user32.dll");
    const shell32 = koffi.load("shell32.dll");
    koffi.struct("RECT", {
      left: "long",
      top: "long",
      right: "long",
      bottom: "long",
    });
    const GetForegroundWindow = user32.func(
      "void* __stdcall GetForegroundWindow()"
    ) as () => unknown;
    const GetWindowRect = user32.func(
      "bool __stdcall GetWindowRect(void* hWnd, _Out_ RECT *lpRect)"
    ) as (hwnd: unknown, rect: unknown) => boolean;
    const GetWindowLongPtrW = user32.func(
      "int64 __stdcall GetWindowLongPtrW(void* hWnd, int nIndex)"
    ) as (hwnd: unknown, n: number) => number | bigint;
    const GetClassNameW = user32.func(
      "int __stdcall GetClassNameW(void* hWnd, _Out_ char16 *lpClassName, int nMaxCount)"
    ) as (hwnd: unknown, buf: unknown, n: number) => number;
    const SHQueryUserNotificationState = shell32.func(
      "int __stdcall SHQueryUserNotificationState(_Out_ int *pquns)"
    ) as (out: unknown) => number;

    ffi = {
      GetForegroundWindow,
      GetWindowRect: (hwnd, rect) => {
        const decoded = { left: 0, top: 0, right: 0, bottom: 0 };
        const ok = GetWindowRect(hwnd, decoded);
        if (ok) {
          rect.left = decoded.left;
          rect.top = decoded.top;
          rect.right = decoded.right;
          rect.bottom = decoded.bottom;
        }
        return !!ok;
      },
      GetWindowLongPtrW,
      GetClassNameW: (hwnd) => {
        try {
          const buf = koffi.alloc("char16", 256);
          const n = GetClassNameW(hwnd, buf, 256);
          if (!n || n <= 0) return "";
          return koffi.decode.string16(buf, n) || "";
        } catch {
          return "";
        }
      },
      SHQueryUserNotificationState: () => {
        try {
          const out = koffi.alloc("int", 1);
          const hr = SHQueryUserNotificationState(out);
          if (hr !== 0) return 0;
          return koffi.decode.int(out) || 0;
        } catch {
          return 0;
        }
      },
      address: (ptr) => BigInt(koffi.address(ptr)),
    };

    logMain("[Fullscreen] FFI loaded");
    return ffi;
  } catch (e) {
    ffiFailed = true;
    logMain("[Fullscreen] FFI load failed; overlay hide disabled", String(e));
    return null;
  }
}

function displayPhys(d: Electron.Display): Rect {
  try {
    const r = screen.dipToScreenRect(null, {
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
    });
    return {
      left: r.x,
      top: r.y,
      right: r.x + r.width,
      bottom: r.y + r.height,
    };
  } catch {
    const s = d.scaleFactor || 1;
    return {
      left: Math.round(d.bounds.x * s),
      top: Math.round(d.bounds.y * s),
      right: Math.round((d.bounds.x + d.bounds.width) * s),
      bottom: Math.round((d.bounds.y + d.bounds.height) * s),
    };
  }
}

export type ProbeResult = {
  quns: number;
  exclusiveIsh: boolean;
  className: string;
  fgRect: Rect | null;
  displayIds: number[];
  wouldHide: number[] | "all";
};

export function probeFullscreen(): ProbeResult {
  const empty: ProbeResult = {
    quns: 0,
    exclusiveIsh: false,
    className: "",
    fgRect: null,
    displayIds: [],
    wouldHide: [],
  };
  const api = loadFfi();
  if (!api) return empty;

  let quns = 0;
  try {
    quns = api.SHQueryUserNotificationState();
  } catch (e) {
    logMain("[Fullscreen] QUNS failed", String(e));
  }

  const fg = api.GetForegroundWindow();
  if (!fg) {
    return { ...empty, quns, exclusiveIsh: isExclusiveIsh(quns) };
  }

  const addr = api.address(fg).toString();
  if (ourAddresses().has(addr)) {
    return { ...empty, quns, exclusiveIsh: isExclusiveIsh(quns) };
  }

  let className = "";
  try {
    className = api.GetClassNameW(fg) || "";
  } catch {
    className = "";
  }
  if (SHELL_CLASS_NAMES.has(className)) {
    return { ...empty, quns, exclusiveIsh: isExclusiveIsh(quns), className };
  }

  const fgRect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  let gotRect = false;
  try {
    gotRect = api.GetWindowRect(fg, fgRect);
  } catch {
    gotRect = false;
  }

  let style = 0;
  try {
    style = Number(api.GetWindowLongPtrW(fg, GWL_STYLE));
  } catch {
    style = 0;
  }
  const borderless = isBorderlessStyle(style);
  const exclusiveIsh = isExclusiveIsh(quns);
  const s = getSettings();
  const displays = screen.getAllDisplays();
  const geoHidden: number[] = [];
  if (gotRect) {
    for (const d of displays) {
      if (isFullscreenCover(fgRect, displayPhys(d))) {
        if (exclusiveIsh || borderless) geoHidden.push(d.id);
      }
    }
  }

  let wouldHide: number[] | "all" = [];
  const treatBorderless = s.hideOnBorderlessFullscreen;
  const filtered = exclusiveIsh
    ? geoHidden
    : treatBorderless
      ? geoHidden
      : [];

  if (exclusiveIsh && filtered.length === 0) wouldHide = "all";
  else wouldHide = filtered;

  return {
    quns,
    exclusiveIsh,
    className,
    fgRect: gotRect ? fgRect : null,
    displayIds: displays.map((d) => d.id),
    wouldHide,
  };
}

function closePrompt(): void {
  try {
    if (promptWin && !promptWin.isDestroyed()) promptWin.close();
  } catch {
    // ignore
  }
  promptWin = null;
}

function applyPromptChoice(choice: unknown): void {
  if (choice === "hide" || choice === "always-on-top") {
    patchSettings({ fullscreenBehavior: choice });
    notify();
  }
  asking = false;
  closePrompt();
}

function showPostSessionPrompt(): void {
  if (asking) return;
  if (promptWin && !promptWin.isDestroyed()) {
    asking = true;
    promptWin.show();
    promptWin.focus();
    return;
  }

  asking = true;
  promptWin = new BrowserWindow({
    width: 440,
    height: 440,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    title: "Warm N Dim",
    icon: trayIcon(),
    show: false,
    backgroundColor: "#1b1b1b",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  promptWin.setMenuBarVisibility(false);
  promptWin.loadFile(path.join(dirname, "renderer", "fullscreenPrompt.html"));
  promptWin.once("ready-to-show", () => {
    if (!promptWin || promptWin.isDestroyed()) return;
    promptWin.show();
    promptWin.focus();
  });
  promptWin.on("closed", () => {
    promptWin = null;
    asking = false;
  });
}

function tick(): void {
  if (asking) return;
  const s = getSettings();
  if (s.fullscreenBehavior === "always-on-top") {
    applyFullscreenHides("none");
    lastHadFullscreen = false;
    hidThisSession = false;
    return;
  }

  const probe = probeFullscreen();
  const has =
    probe.wouldHide === "all" ||
    (Array.isArray(probe.wouldHide) && probe.wouldHide.length > 0);

  if (!has) {
    applyFullscreenHides("none");
    const leftAskSession =
      s.fullscreenBehavior === "ask" && lastHadFullscreen && hidThisSession;
    lastHadFullscreen = false;
    hidThisSession = false;
    if (leftAskSession && s.enabled) showPostSessionPrompt();
    return;
  }

  const toHidden = (): Set<number> | "all" => {
    if (probe.wouldHide === "all") return "all";
    return new Set(probe.wouldHide);
  };

  applyFullscreenHides(toHidden());
  lastHadFullscreen = true;
  if (s.fullscreenBehavior === "ask") hidThisSession = true;
}

export function startFullscreenWatch(): void {
  if (process.platform !== "win32") return;
  loadFfi();
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    try {
      tick();
    } catch (e) {
      logMain("[Fullscreen] tick failed", String(e));
    }
  }, 750);
  pollTimer.unref();
}

export function stopFullscreenWatch(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  asking = false;
  closePrompt();
}

export function logFullscreenProbe(): void {
  const p = probeFullscreen();
  logMain("[Fullscreen] probe", p);
  const wins = [...getOverlayWindows().entries()].map(([id, w]) => ({
    id,
    visible: !w.isDestroyed() && w.isVisible(),
  }));
  logMain("[Fullscreen] overlays", wins);
}
