# Warm-N-Dim

A tiny Windows utility that overlays a warm tint and an extra-dim black layer on top of everything. Great for late-night coding, reading, or minimizing eye strain.

- Reduce perceived brightness **below** the system minimum
- Warm the screen (blue‑light reduction) with a configurable intensity
- **Always‑on‑top**, **click‑through** overlay that won’t block interaction
- **Multi‑monitor** support (one overlay per display)
- Tray controls, **Launch at startup**, **Debug → Flash overlay**
- **Settings persist** between restarts
- **Auto‑update ready** via GitHub Releases

> Built with **Electron** + **TypeScript**. App identity: `dev.evmlord.warmndim`.

---

## Quick start (users)

1. Download and run the installer.
2. Find **Warm N Dim** in your system tray.
3. Click **Open controls** and adjust **Warmth** and **Dim**.
4. (Optional) Tick **Launch at startup**.

**Tray menu**: Toggle overlay, Open controls, Launch at startup, Debug → Flash overlay, Quit.

---

## How it works

We draw two transparent, click‑through windows over each display:

- **Dim layer**: black with adjustable opacity
- **Warm tint**: warm orange with adjustable opacity

This reduces perceived brightness and blue light without changing physical backlight levels.

---

## Build from source (contributors)

**Requirements**: Windows 10/11 x64, Node 18+ (LTS), pnpm (or npm).

```bash
pnpm i
pnpm dev   # watch + run Electron (tsc for main/preload/renderer)
pnpm dist  # build signed/unsigned installer (NSIS)
```

### Project layout

```
dist/                     # compiled app used by Electron and packaged build
src/
  main.ts                 # Electron main (ESM)
  preload.ts              # Preload (compiled to CJS)
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
scripts/
  afterPack.cjs           # optional trimming of locales/extra assets
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
- Tray menu includes **Check for updates…**.

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

---

## License

**MIT** — © EVMlord. See `LICENSE`.

---
