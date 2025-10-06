// Receives settings and paints two layers:
// 1) black dim layer (dim)
// 2) warm tint layer (warmth)

function apply(s: Settings) {
  const dimDiv = document.getElementById("dim") as HTMLDivElement;
  const tintDiv = document.getElementById("tint") as HTMLDivElement;

  if (!s || !s.enabled) {
    dimDiv.style.opacity = "0";
    tintDiv.style.opacity = "0";
    return;
  }

  // Convert 0-100 -> opacity strengths. Tune as you like.
  const dimOpacity = Math.min(0.9, ((s.dim ?? 0) / 100) * 0.85);
  const warmthOpacity = Math.min(0.9, ((s.warmth ?? 0) / 100) * 0.6);

  dimDiv.style.opacity = String(dimOpacity);

  // Warm orange tone; tweak RGB for your taste.
  tintDiv.style.backgroundColor = "rgb(255, 140, 60)";
  tintDiv.style.opacity = String(warmthOpacity);
}

// Pull once on load (covers any missed push)
document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (window?.api?.getSettings) {
      const s = await window.api.getSettings();
      apply(s);
    }
  } catch (e) {
    console.error("[WarmNDim] getSettings failed:", e);
  }
});

if (window?.api?.onApply) {
  window.api.onApply(apply);
}

// Debug: flash overlay
if (window?.api?.onDebugFlash) {
  window.api.onDebugFlash(() => {
    const flash = document.getElementById("flash") as HTMLDivElement;
    if (!flash) return;
    flash.style.opacity = "1";
    setTimeout(() => {
      flash.style.opacity = "0";
    }, 300);
  });
}

// mark that overlay JS actually ran
console.log("[WarmNDim] overlay script loaded");
