declare global {
  type HotkeyAction =
    | "toggle"
    | "openControls"
    | "dimUp"
    | "dimDown"
    | "warmthUp"
    | "warmthDown";

  type HotkeyMap = Record<HotkeyAction, string>;

  type ScheduleMode = "fixed" | "sunset";

  type ScheduleSettings = {
    enabled: boolean;
    mode: ScheduleMode;
    start: string;
    end: string;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    fadeMinutes: number;
  };

  type FullscreenBehavior = "always-on-top" | "hide" | "ask";

  type Settings = {
    enabled: boolean;
    warmth: number;
    dim: number;
    autolaunch: boolean;
    hotkeys: HotkeyMap;
    schedule: ScheduleSettings;
    fullscreenBehavior: FullscreenBehavior;
    hideOnBorderlessFullscreen: boolean;
    updateChannel: "stable" | "beta";
  };

  type UiPayload = Settings & {
    hotkeyErrors?: Partial<Record<HotkeyAction, string>>;
    scheduleHint?: string;
    appVersion?: string;
    updateStatus?: string;
  };

  type City = {
    name: string;
    country: string;
    lat: number;
    lng: number;
  };

  interface Window {
    api: {
      sendSettings: (patch: Partial<Settings>) => void;
      toggleOverlay: () => void;
      onApply: (handler: (s: UiPayload) => void) => void;
      getSettings: () => Promise<Settings>;
      onDebugFlash: (handler: () => void) => void;
      getCities: () => Promise<City[]>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => void;
      setHotkeyRecording: (recording: boolean) => void;
      fullscreenPromptChoice: (choice: FullscreenBehavior) => void;
    };
  }
}
export {};
