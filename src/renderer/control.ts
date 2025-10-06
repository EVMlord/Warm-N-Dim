const warmth = document.getElementById("warmth") as HTMLInputElement;
const dim = document.getElementById("dim") as HTMLInputElement;
const warmthOut = document.getElementById("warmthOut") as HTMLOutputElement;
const dimOut = document.getElementById("dimOut") as HTMLOutputElement;
const toggle = document.getElementById("toggle") as HTMLButtonElement;
const autolaunch = document.getElementById("autolaunch") as HTMLInputElement;

function sendPatch(patch: Partial<Settings>) {
  window.api.sendSettings(patch);
}

// live updates for sliders
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

// keep UI in sync when settings change elsewhere
window.api.onApply((data) => {
  if (typeof data.warmth === "number") {
    warmth.value = String(data.warmth);
    warmthOut.textContent = String(data.warmth);
  }
  if (typeof data.dim === "number") {
    dim.value = String(data.dim);
    dimOut.textContent = String(data.dim);
  }
  if (typeof data.autolaunch === "boolean") {
    autolaunch.checked = data.autolaunch;
  }
});
