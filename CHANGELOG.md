# CHANGELOG

## [0.4.0-beta.1] – 2026‑08‑19

### Added

- Global hotkeys (toggle, open controls, optional warmth/dim bumps). Click-to-record in Controls.
- Schedule: fixed hours or local sunset→sunrise (`suncalc`, offline city presets). Optional fade.
- Fullscreen handling as a user choice: **Ask each time**, **Hide overlay**, or **Always stay on top**. Optional borderless/F11 detection.
- Update channel: Stable vs Beta (GitHub prereleases).
- Controls window is tabbed (Overlay / Schedule / Hotkeys / Updates).

### Changed

- Controls no longer open on every launch; first run still opens them. Tray click and a second instance still open controls.
- Toggle button reflects whether the overlay is enabled.
- Main process split into `src/lib/*`.
- Overlay z-order is re-asserted every 2s in always-on-top mode (Windows often steals it).
- Installer `afterPack` now strips SwiftShader (no software GL fallback).
- `package.json` license field is MIT (matches `LICENSE`).
- GitHub Actions **Release** workflow builds the Windows installer and publishes the GitHub release (run from the Actions tab).

### Fixed

- `powerMonitor` resume handler is registered after `app.whenReady()`.
- Auto-updater CJS load + file logger (from `dev` after 0.3.2).

## [0.3.2] – 2025‑10‑06

- Packaging/version bump on the updater path.

## [0.3.1] – 2025‑10‑05

- Main-process updater tweaks.

## [0.3.0] – 2025‑10‑05

### Added

- First public beta.
- Warmth & Dim sliders with live preview.
- Per‑display overlay windows (multi‑monitor).
- Tray menu with Toggle, Open controls, Launch at startup.
- **Debug → Flash overlay** to verify overlay presence.
- Settings persisted with `electron-store`.
- Auto‑update wiring via `electron-updater` (GitHub Releases).

### Fixed/Improved

- Preload compiled to **CJS**, renderer to classic **script** (no `export {}`), main as **ESM**.
- Robust asset resolution and startup path logs.

## [0.2.0] – 2025‑10‑04

### Changed

- Migrated the codebase to **TypeScript**.
- Introduced ambient typings for `window.api` and `Settings`.
- Added auto‑launch toggle using `app.setLoginItemSettings`.

## [0.1.0] – 2025‑10‑03

### Added

- Initial prototype with overlay/tint and basic controls (JavaScript).
