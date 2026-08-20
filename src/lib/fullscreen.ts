import { createRequire } from "node:module";
import { BrowserWindow, dialog, screen } from "electron";
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
let sessionDecision: "hide" | "keep" | null = null;
let lastHadFullscreen = false;
let notify: () => void = () => {};

const GWL_STYLE = -16;

export function initFullscreen(onChange: () => void): void {
  notify = onChange;
}

function handleToBigInt(buf: Buffer): bigint {
  if (buf.length >= 8) return buf.readBigUInt64LE(0);
  return BigInt(buf.readUInt32LE(0));
}

function ourAddresses(): Set<string> {
  const set = new Set<string>();
  for (const buf of getOverlayNativeHandles()) {
    try {
      set.add(handleToBigInt(buf).toString());
    } catch {
      // ignore
    }
  }
  const ctrl = getControlNativeHandle();
  if (ctrl) {
    try {
      set.add(handleToBigInt(ctrl).toString());
    } catch {
      // ignore
    }
  }
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
      decode: (type: unknown, value: unknown) => unknown;
      address: (ptr: unknown) => number | bigint;
      alloc: (type: string, length?: number) => unknown;
      decodeString: (buf: unknown, encoding: string) => string;
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
      "int __stdcall GetClassNameW(void* hWnd, _Out_ uint16 *lpClassName, int nMaxCount)"
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
          const array = new Uint16Array(256);
          const n = GetClassNameW(hwnd, array, 256);
          if (!n || n <= 0) return "";
          return String.fromCharCode(...array.subarray(0, n));
        } catch {
          return "";
        }
      },
      SHQueryUserNotificationState: () => {
        const out = [0];
        const hr = SHQueryUserNotificationState(out);
        if (hr !== 0) return 0;
        return Number(out[0]) || 0;
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

async function maybeAsk(): Promise<"hide" | "keep"> {
  asking = true;
  const parent = new BrowserWindow({
    width: 440,
    height: 180,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    title: "Warm N Dim",
    show: true,
  });
  parent.setAlwaysOnTop(true, "screen-saver");
  try {
    const res = await dialog.showMessageBox(parent, {
      type: "question",
      buttons: [
        "Hide this time",
        "Keep overlay this time",
        "Always hide in fullscreen",
        "Always stay on top",
      ],
      defaultId: 0,
      cancelId: 1,
      title: "Fullscreen app detected",
      message: "A fullscreen app is covering the screen.",
      detail:
        "The overlay sits on top of fullscreen apps and games, which can look wrong. Hide it until that app exits?",
    });
    if (res.response === 2) {
      patchSettings({ fullscreenBehavior: "hide" });
      notify();
      return "hide";
    }
    if (res.response === 3) {
      patchSettings({ fullscreenBehavior: "always-on-top" });
      notify();
      return "keep";
    }
    return res.response === 0 ? "hide" : "keep";
  } finally {
    asking = false;
    try {
      if (!parent.isDestroyed()) parent.close();
    } catch {
      // ignore
    }
  }
}

async function tick(): Promise<void> {
  if (asking) return;
  const s = getSettings();
  if (s.fullscreenBehavior === "always-on-top") {
    applyFullscreenHides("none");
    lastHadFullscreen = false;
    sessionDecision = null;
    return;
  }

  const probe = probeFullscreen();
  const has =
    probe.wouldHide === "all" ||
    (Array.isArray(probe.wouldHide) && probe.wouldHide.length > 0);

  if (!has) {
    applyFullscreenHides("none");
    lastHadFullscreen = false;
    sessionDecision = null;
    return;
  }

  const toHidden = (): Set<number> | "all" => {
    if (probe.wouldHide === "all") return "all";
    return new Set(probe.wouldHide);
  };

  if (s.fullscreenBehavior === "hide") {
    applyFullscreenHides(toHidden());
    lastHadFullscreen = true;
    return;
  }

  // ask
  if (!lastHadFullscreen && sessionDecision == null) {
    lastHadFullscreen = true;
    sessionDecision = await maybeAsk();
  }
  if (sessionDecision === "hide") applyFullscreenHides(toHidden());
  else applyFullscreenHides("none");
}

export function startFullscreenWatch(): void {
  if (process.platform !== "win32") return;
  loadFfi();
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    tick().catch((e) => logMain("[Fullscreen] tick failed", String(e)));
  }, 750);
  pollTimer.unref();
}

export function stopFullscreenWatch(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
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
