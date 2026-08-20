export type Rect = { left: number; top: number; right: number; bottom: number };

export const WS_CAPTION = 0x00c00000;

export const QUNS = {
  NOT_PRESENT: 1,
  BUSY: 2,
  RUNNING_D3D_FULL_SCREEN: 3,
  PRESENTATION_MODE: 4,
  ACCEPTS_NOTIFICATIONS: 5,
  QUIET_TIME: 6,
  APP: 7,
} as const;

export function rectArea(r: Rect): number {
  return Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
}

export function intersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return rectArea({ left, top, right, bottom });
}

export function coverageRatio(win: Rect, display: Rect): number {
  const area = rectArea(display);
  if (area <= 0) return 0;
  return intersectionArea(win, display) / area;
}

export function isBorderlessStyle(style: number): boolean {
  // GetWindowLongPtrW returns 0 on failure; do not treat that as caption-less.
  if (style === 0) return false;
  return (style & WS_CAPTION) === 0;
}

export function isFullscreenCover(
  win: Rect,
  display: Rect,
  ratio = 0.98
): boolean {
  return coverageRatio(win, display) >= ratio && rectArea(win) > 0;
}

export function isExclusiveIsh(quns: number): boolean {
  return (
    quns === QUNS.RUNNING_D3D_FULL_SCREEN ||
    quns === QUNS.PRESENTATION_MODE
  );
}

export const SHELL_CLASS_NAMES = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "NotifyIconOverflowWindow",
  "MultitaskingViewFrame",
  "TaskSwitcherWnd",
  "XamlExplorerHostIslandWindow",
  "Windows.UI.Core.CoreWindow",
  "Windows.Internal.Shell.TabProxyWindow",
  "Windows.UI.Composition.DesktopWindowContentBridge",
  "ForegroundStaging",
  "Xaml_WindowedPopupClass",
  "Shell_InputSwitchTopLevelWindow",
  "TopLevelWindowForOverflowXamlIsland",
  "GameBar",
  "XboxGameBarUIHost",
  "WidgetBoardWindow",
]);
