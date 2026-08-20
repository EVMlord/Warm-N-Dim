# Warm-N-Dim

A tiny Windows utility that overlays a warm tint and an extra-dim black layer on top of everything. Great for late-night coding, reading, or minimizing eye strain.

- Reduce perceived brightness **below** the system minimum
- Warm the screen (blue‑light reduction) with a configurable intensity
- **Click‑through** overlay that won’t block interaction
- **Multi‑monitor** support (one overlay per display)
- **Global hotkeys** (toggle, open controls, optional warmth/dim bumps)
- **Schedule** — fixed hours or local sunset→sunrise (offline city list)
- **Fullscreen** — ask, hide overlay, or always stay on top
- Tray controls, **Launch at startup**, **Debug → Flash overlay**
- **Settings persist** between restarts
- **Auto‑update** via GitHub Releases, optional **beta** channel

> Built with **Electron** + **TypeScript**. App identity: `dev.evmlord.warmndim`.

---

## Quick start (users)

1. Download and run the installer.
2. Find **Warm N Dim** in your system tray.
3. Click **Open controls** (or press **Ctrl+Alt+Shift+W**) and adjust **Warmth** and **Dim**.
4. (Optional) Tick **Launch at startup**, set a schedule, or pick how fullscreen apps are handled.

The control window opens on **first run** only. After that the app stays in the tray; click the tray icon or start a second instance to reopen controls.

**Tray menu**: Toggle overlay, Open controls, Launch at startup, Include beta updates, Debug (flash, click-through, fullscreen probe, DevTools, logs), Check for updates, Quit.

**Default hotkeys**: `Ctrl+Alt+W` toggle overlay, `Ctrl+Alt+Shift+W` open controls. Rebind (or clear) them in Controls → Hotkeys. They do not fire inside exclusive-fullscreen games (OS limitation).

---

## How it works

We draw two transparent, click‑through windows over each display:

- **Dim layer**: black with adjustable opacity
- **Warm tint**: warm orange with adjustable opacity

This reduces perceived brightness and blue light without changing physical backlight levels.

Windows often steals z-order from always-on-top windows. Overlay → **Fullscreen apps** lets you choose:

- **Ask each time** (default) — prompt when a fullscreen app is detected
- **Hide overlay** — hide until that app exits (better for games)
- **Always stay on top** — keep the overlay and re-assert z-order every couple of seconds

Sunset/sunrise is computed **locally** (`suncalc` + a shipped city list). No geolocation or extra network calls.

---

## Build from source (contributors)

**Requirements**: Windows 10/11 x64, Node 18+ (LTS), pnpm (or npm).

```bash
pnpm i
pnpm test  # unit tests (schedule / fullscreen math / settings migrate)
pnpm dev   # watch + run Electron (tsc for main/preload/renderer)
pnpm dist  # build signed/unsigned installer (NSIS)
```

### Project layout

```
dist/                     # compiled app used by Electron and packaged build
src/
  main.ts                 # Electron main entry (ESM)
  lib/                    # settings, overlays, tray, updater, hotkeys, schedule, fullscreen
  preload.ts              # Preload (compiled to CJS)
  data/cities.json        # offline city presets for sunset mode
  renderer/
    control.html
    control.ts            # no imports/exports; compiled as classic script
    overlay.html
    overlay.ts            # no imports/exports; compiled as classic script
    styles.css
  types/
    globals.d.ts           # ambient types (Settings, window.api)
icons/
  icon.ico
docs/
  SIGNING.md              # unsigned vs OV/EV, GH_TOKEN, beta vs stable
scripts/
  afterPack.cjs           # strip extra locales, PDF viewer, SwiftShader
  release.cjs             # loads .env then builds & publishes
```

### Build configuration

- Separate tsconfigs:
  - `tsconfig.main.json` → **ESM** for main
  - `tsconfig.preload.json` → **CJS** for preload (Electron `require()` compatibility)
  - `tsconfig.renderer.json` → `module: "None"` for classic browser scripts
- `electron-builder` with NSIS target, `appId: dev.evmlord.warmndim`.

---

## Environment variables (.env)

Create a local `.env` (never commit it) for releases/signing:

```ini
# GitHub token for publishing releases (repo scope)
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional Windows code signing (OV .pfx file)
CSC_LINK=file:///C:/secure/certs/evmlord-code-signing.p12
CSC_KEY_PASSWORD=your_password
```

> Use **Option A (PFX)** for OV certs. For EV hardware tokens, set `certificateSubjectName` in `package.json → build.win` instead of using `CSC_*`.

**Release command** (loads `.env`):

```bash
pnpm release
```

---

## Auto‑updates

- Uses `electron-updater` + **GitHub Releases**.
- On startup, the app checks for updates and downloads in the background. When ready, you’ll be prompted to restart.
- Tray menu includes **Check for updates…** and **Include beta updates**.
- Controls → **Updates** picks **Stable** or **Beta**. Beta follows GitHub prereleases (`0.4.0-beta.1`, etc.). After publishing a hyphenated version, confirm the GitHub release is marked **Pre-release**.

Code signing is optional. See [docs/SIGNING.md](docs/SIGNING.md).

**Publish config** (in `package.json → build.publish`):

```json
[{ "provider": "github", "owner": "evmlord", "repo": "warm-n-dim" }]
```

---

## Troubleshooting

- **DevTools Autofill warnings**: harmless (Chromium DevTools tries to enable unsupported Autofill APIs).
- **7‑Zip symlink error during `pnpm dist`**: enable **Windows Developer Mode** or run terminal **as Administrator**. Then delete `%LOCALAPPDATA%/electron-builder/Cache` and try again.
- **Overlay doesn’t change**: ensure the app logs show it is loading from `dist/…` paths and that `dist/renderer/*.js` exist. Use tray **Debug → Flash overlay** and **Open overlay DevTools** to verify.

---

## Privacy

- No data collection. No network calls except for checking updates (GitHub Releases).
- Sunset times are computed on-device from a latitude/longitude you set (or a preset city). The city list is shipped with the app.

---

## License

**MIT** — © EVMlord. See `LICENSE`.

---
