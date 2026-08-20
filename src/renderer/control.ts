const warmth = document.getElementById("warmth") as HTMLInputElement;
const dim = document.getElementById("dim") as HTMLInputElement;
const warmthOut = document.getElementById("warmthOut") as HTMLOutputElement;
const dimOut = document.getElementById("dimOut") as HTMLOutputElement;
const toggle = document.getElementById("toggle") as HTMLButtonElement;
const autolaunch = document.getElementById("autolaunch") as HTMLInputElement;
const fullscreenBehavior = document.getElementById(
  "fullscreenBehavior"
) as HTMLSelectElement;
const hideOnBorderless = document.getElementById(
  "hideOnBorderless"
) as HTMLInputElement;
const borderlessRow = document.getElementById("borderlessRow") as HTMLElement;

const scheduleEnabled = document.getElementById(
  "scheduleEnabled"
) as HTMLInputElement;
const scheduleMode = document.getElementById("scheduleMode") as HTMLSelectElement;
const scheduleStart = document.getElementById("scheduleStart") as HTMLInputElement;
const scheduleEnd = document.getElementById("scheduleEnd") as HTMLInputElement;
const city = document.getElementById("city") as HTMLSelectElement;
const latitude = document.getElementById("latitude") as HTMLInputElement;
const longitude = document.getElementById("longitude") as HTMLInputElement;
const fadeMinutes = document.getElementById("fadeMinutes") as HTMLInputElement;
const fadeOut = document.getElementById("fadeOut") as HTMLOutputElement;
const scheduleHint = document.getElementById("scheduleHint") as HTMLElement;
const fixedTimes = document.getElementById("fixedTimes") as HTMLElement;
const sunsetFields = document.getElementById("sunsetFields") as HTMLElement;

const updateChannel = document.getElementById("updateChannel") as HTMLSelectElement;
const checkUpdates = document.getElementById("checkUpdates") as HTMLButtonElement;
const appVersion = document.getElementById("appVersion") as HTMLElement;
const updateStatus = document.getElementById("updateStatus") as HTMLElement;

const HOTKEY_ACTIONS: HotkeyAction[] = [
  "toggle",
  "openControls",
  "dimUp",
  "dimDown",
  "warmthUp",
  "warmthDown",
];

let current: UiPayload | null = null;
let cities: City[] = [];
let capturing: HotkeyAction | null = null;
let applying = false;

function sendPatch(patch: Partial<Settings>) {
  if (applying) return;
  window.api.sendSettings(patch);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = (btn as HTMLElement).dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => {
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("hidden", p.id !== `tab-${tab}`);
    });
  });
});

warmth.addEventListener("input", () => {
  warmthOut.textContent = warmth.value;
  sendPatch({ warmth: Number(warmth.value) });
});

dim.addEventListener("input", () => {
  dimOut.textContent = dim.value;
  sendPatch({ dim: Number(dim.value) });
});

autolaunch.addEventListener("change", () => {
  sendPatch({ autolaunch: autolaunch.checked });
});

toggle.addEventListener("click", () => window.api.toggleOverlay());

fullscreenBehavior.addEventListener("change", () => {
  sendPatch({
    fullscreenBehavior: fullscreenBehavior.value as FullscreenBehavior,
  });
  syncBorderlessRow();
});

hideOnBorderless.addEventListener("change", () => {
  sendPatch({ hideOnBorderlessFullscreen: hideOnBorderless.checked });
});

function syncBorderlessRow() {
  const show = fullscreenBehavior.value !== "always-on-top";
  borderlessRow.classList.toggle("hidden", !show);
}

function sendSchedule(patch: Partial<ScheduleSettings>) {
  if (!current) return;
  sendPatch({ schedule: { ...current.schedule, ...patch } });
}

scheduleEnabled.addEventListener("change", () => {
  sendSchedule({ enabled: scheduleEnabled.checked });
});
scheduleMode.addEventListener("change", () => {
  sendSchedule({ mode: scheduleMode.value as ScheduleMode });
  syncScheduleMode();
});
scheduleStart.addEventListener("change", () => {
  sendSchedule({ start: scheduleStart.value });
});
scheduleEnd.addEventListener("change", () => {
  sendSchedule({ end: scheduleEnd.value });
});
fadeMinutes.addEventListener("input", () => {
  fadeOut.textContent = fadeMinutes.value;
  sendSchedule({ fadeMinutes: Number(fadeMinutes.value) });
});

function syncScheduleMode() {
  const sunset = scheduleMode.value === "sunset";
  fixedTimes.classList.toggle("hidden", sunset);
  sunsetFields.classList.toggle("hidden", !sunset);
}

city.addEventListener("change", () => {
  const c = cities.find((x) => `${x.name}|${x.country}` === city.value);
  if (!c) {
    sendSchedule({ city: null });
    return;
  }
  latitude.value = String(c.lat);
  longitude.value = String(c.lng);
  sendSchedule({
    city: `${c.name}, ${c.country}`,
    latitude: c.lat,
    longitude: c.lng,
  });
});

function parseCoord(el: HTMLInputElement): number | null {
  if (el.value.trim() === "") return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
}

function onCoordChange() {
  sendSchedule({
    city: null,
    latitude: parseCoord(latitude),
    longitude: parseCoord(longitude),
  });
  city.value = "";
}
latitude.addEventListener("change", onCoordChange);
longitude.addEventListener("change", onCoordChange);

updateChannel.addEventListener("change", () => {
  sendPatch({
    updateChannel: updateChannel.value === "beta" ? "beta" : "stable",
  });
});
checkUpdates.addEventListener("click", () => window.api.checkForUpdates());

const KEY_MAP: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
  Enter: "Return",
  Plus: "Plus",
  Minus: "Minus",
};

function eventToAccelerator(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  if (parts.length === 0) return null;
  let key = KEY_MAP[e.key];
  if (!key) {
    if (e.key.length === 1) key = e.key.toUpperCase();
    else if (/^F\d{1,2}$/i.test(e.key)) key = e.key.toUpperCase();
    else return null;
  }
  parts.push(key);
  return parts.join("+");
}

function setCapturing(action: HotkeyAction | null) {
  capturing = action;
  window.api.setHotkeyRecording(!!action);
  HOTKEY_ACTIONS.forEach((a) => {
    const el = document.getElementById(`hk-${a}`) as HTMLInputElement;
    el.classList.toggle("capturing", a === action);
    if (a === action) el.value = "Press shortcut…";
  });
}

HOTKEY_ACTIONS.forEach((action) => {
  const el = document.getElementById(`hk-${action}`) as HTMLInputElement;
  el.addEventListener("click", () => setCapturing(action));
  el.addEventListener("keydown", (e) => {
    if (capturing !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      applyHotkeyField(action, current?.hotkeys[action] ?? "");
      setCapturing(null);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (!current) return;
      sendPatch({ hotkeys: { ...current.hotkeys, [action]: "" } });
      setCapturing(null);
      return;
    }
    const acc = eventToAccelerator(e);
    if (!acc || !current) return;
    sendPatch({ hotkeys: { ...current.hotkeys, [action]: acc } });
    setCapturing(null);
  });
  el.addEventListener("blur", () => {
    if (capturing === action) {
      applyHotkeyField(action, current?.hotkeys[action] ?? "");
      setCapturing(null);
    }
  });
});

function applyHotkeyField(action: HotkeyAction, value: string) {
  const el = document.getElementById(`hk-${action}`) as HTMLInputElement;
  el.value = value || "None";
  const err = document.getElementById(`err-${action}`) as HTMLElement;
  const msg = current?.hotkeyErrors?.[action] ?? "";
  err.textContent = msg;
}

function fillCities() {
  if (city.options.length > 1) return;
  for (const c of cities) {
    const opt = document.createElement("option");
    opt.value = `${c.name}|${c.country}`;
    opt.textContent = `${c.name}, ${c.country}`;
    city.appendChild(opt);
  }
}

function applyUi(data: UiPayload) {
  applying = true;
  current = data;
  warmth.value = String(data.warmth);
  warmthOut.textContent = String(data.warmth);
  dim.value = String(data.dim);
  dimOut.textContent = String(data.dim);
  autolaunch.checked = !!data.autolaunch;
  toggle.textContent = data.enabled ? "Disable" : "Enable";

  fullscreenBehavior.value = data.fullscreenBehavior;
  hideOnBorderless.checked = !!data.hideOnBorderlessFullscreen;
  syncBorderlessRow();

  scheduleEnabled.checked = !!data.schedule.enabled;
  scheduleMode.value = data.schedule.mode;
  scheduleStart.value = data.schedule.start;
  scheduleEnd.value = data.schedule.end;
  fadeMinutes.value = String(data.schedule.fadeMinutes);
  fadeOut.textContent = String(data.schedule.fadeMinutes);
  scheduleHint.textContent = data.scheduleHint ?? "";
  if (data.schedule.latitude != null)
    latitude.value = String(data.schedule.latitude);
  else latitude.value = "";
  if (data.schedule.longitude != null)
    longitude.value = String(data.schedule.longitude);
  else longitude.value = "";
  fillCities();
  const match = cities.find(
    (c) =>
      data.schedule.city === `${c.name}, ${c.country}` ||
      (c.lat === data.schedule.latitude && c.lng === data.schedule.longitude)
  );
  city.value = match ? `${match.name}|${match.country}` : "";
  syncScheduleMode();

  if (!capturing) {
    HOTKEY_ACTIONS.forEach((a) => applyHotkeyField(a, data.hotkeys[a] ?? ""));
  }

  updateChannel.value = data.updateChannel;
  if (data.appVersion) appVersion.textContent = data.appVersion;
  updateStatus.textContent = data.updateStatus ?? "";
  applying = false;
}

window.api.onApply((data) => applyUi(data));

document.addEventListener("DOMContentLoaded", async () => {
  try {
    cities = await window.api.getCities();
    fillCities();
  } catch (e) {
    console.error("[WarmNDim] getCities failed", e);
  }
  try {
    const v = await window.api.getAppVersion();
    appVersion.textContent = v;
  } catch {
    // ignore
  }
  try {
    const s = await window.api.getSettings();
    applyUi(s);
  } catch (e) {
    console.error("[WarmNDim] getSettings failed", e);
  }
});
