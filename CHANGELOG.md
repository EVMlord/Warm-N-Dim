# CHANGELOG

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
