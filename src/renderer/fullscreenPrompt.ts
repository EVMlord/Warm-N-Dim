const hideBtn = document.getElementById("choice-hide") as HTMLButtonElement;
const topBtn = document.getElementById("choice-top") as HTMLButtonElement;
const askBtn = document.getElementById("choice-ask") as HTMLButtonElement;

function choose(choice: FullscreenBehavior): void {
  window.api.fullscreenPromptChoice(choice);
}

hideBtn.addEventListener("click", () => choose("hide"));
topBtn.addEventListener("click", () => choose("always-on-top"));
askBtn.addEventListener("click", () => choose("ask"));
