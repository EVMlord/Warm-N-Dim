import { contextBridge, ipcRenderer } from "electron";

// Narrow unknown -> Settings at runtime
function isSettings(v: unknown): v is Settings {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.enabled === "boolean" &&
    typeof o.warmth === "number" &&
    typeof o.dim === "number" &&
    typeof o.autolaunch === "boolean"
  );
}

contextBridge.exposeInMainWorld("api", {
  sendSettings: (patch: Partial<Settings>) =>
    ipcRenderer.send("settings:change", patch),

  toggleOverlay: () => ipcRenderer.send("overlay:toggle"),

  onApply: (handler: (s: Settings) => void) =>
    ipcRenderer.on("apply", (_e, data: unknown) => {
      if (isSettings(data)) handler(data);
      else console.warn("[WarmNDim] Invalid settings payload:", data);
    }),

  getSettings: async (): Promise<Settings> => {
    const s = await ipcRenderer.invoke("settings:get");
    if (isSettings(s)) return s;
    throw new Error("Invalid settings payload from main");
  },

  onDebugFlash: (handler: () => void) =>
    ipcRenderer.on("debug:flash", () => handler()),
});
