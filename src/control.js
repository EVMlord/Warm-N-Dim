const warmth = document.getElementById("warmth");
const dim = document.getElementById("dim");
const warmthOut = document.getElementById("warmthOut");
const dimOut = document.getElementById("dimOut");
const toggle = document.getElementById("toggle");

function send() {
  window.api.sendSettings({
    warmth: Number(warmth.value),
    dim: Number(dim.value),
  });
}

warmth.addEventListener("input", () => {
  warmthOut.textContent = warmth.value;
  send();
});

dim.addEventListener("input", () => {
  dimOut.textContent = dim.value;
  send();
});

toggle.addEventListener("click", () => window.api.toggleOverlay());
