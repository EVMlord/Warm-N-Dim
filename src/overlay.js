// Receives settings and paints two layers:
// 1) black dim layer (dim)
// 2) warm tint layer (warmth)

function apply({ enabled, warmth, dim }) {
  const dimDiv = document.getElementById("dim");
  const tintDiv = document.getElementById("tint");

  if (!enabled) {
    dimDiv.style.opacity = "0";
    tintDiv.style.opacity = "0";
    return;
  }

  // Convert 0-100 -> opacity strengths. Tune as you like.
  const dimOpacity = Math.min(0.9, ((dim || 0) / 100) * 0.85);
  const warmthOpacity = Math.min(0.9, ((warmth || 0) / 100) * 0.6);

  dimDiv.style.opacity = String(dimOpacity);

  // Warm orange tone; tweak RGB for your taste.
  tintDiv.style.backgroundColor = "rgb(255, 140, 60)";
  tintDiv.style.opacity = String(warmthOpacity);
}

window.api.onApply(apply);
