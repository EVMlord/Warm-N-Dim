declare global {
  type Settings = {
    enabled: boolean;
    warmth: number;
    dim: number;
    autolaunch: boolean;
  };

  interface Window {
    api: {
      sendSettings: (patch: Partial<Settings>) => void;
      toggleOverlay: () => void;
      onApply: (handler: (s: Settings) => void) => void;
      getSettings: () => Promise<Settings>;
      onDebugFlash: (handler: () => void) => void;
    };
  }
}
export {};
