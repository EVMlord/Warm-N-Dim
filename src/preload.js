const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sendSettings: (patch) => ipcRenderer.send("settings:change", patch),
  toggleOverlay: () => ipcRenderer.send("overlay:toggle"),
  onApply: (handler) => ipcRenderer.on("apply", (_e, data) => handler(data)),
});
