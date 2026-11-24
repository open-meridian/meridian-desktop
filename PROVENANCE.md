# Provenance

Where meridian-desktop's code comes from. Copyright 2026 Societal Lab Inc., AGPL-3.0-or-later.

## Written for this repository
Everything under `src/`, `test/`, `scripts/` and `.github/` was written for this repository by the Open Meridian
project, from the accepted design `spec/the-desktop-shows-the-same-pages` (meridian-design) and the task
`design/the-workspace`.

## Carried over from the project's own work
- **The desktop spike** (private, 2026-11-18, the project's own throwaway code): the Electron hardening settings
  (web preferences, every permission denied, the fuse list), the `app://` page handler and the narrow preload
  pattern. The spike's single-view layout (a shell page framing the plugin page) is not used; see the spec, finding 3.
- **`ci/first_run.py`** and the shape of `ci/deployment.sh`: from `open-meridian/opencode`'s
  `open-meridian/ci/`, written by the project for that fork's own check.
- **`test/e2e/stand-in.mjs`** copies the paths, cookie names and CSS classes the desktop meets in
  `meridian-core`'s dashboard (AGPL-3.0, the same holder), not its code.

## Clean room (ruling 1096)
No reference project's source was read for any part of this repository. In particular, nothing comes from
OpenFin, FDC3-Sail, Dockview or any other desktop agent: L1 has no linking, and when linking comes (L2), FDC3-Sail
(Apache-2.0, beta) is a reference for the relay's logic only, recorded here when it is used.

## Third-party packages
- Shipped: Electron (MIT; Chromium's notices in `LICENSES.chromium.html`) and `electron-updater` (MIT) with its
  dependencies. Each one's licence and notice is in `resources/notices/THIRD_PARTY_NOTICES.txt` of every build,
  written by `scripts/notices.mjs` and checked by `scripts/check-licences.mjs` (S10).
- Build and test only, never shipped: `electron-builder` (MIT), `@electron/fuses` (MIT), `@playwright/test`
  (Apache-2.0).
- No chart library: the desktop draws no chart of its own (a plugin's charts are in the plugin's own pages, under
  that plugin's licences).
- No Dockview package. Should one come in, only Dockview's MIT packages may; `dockview-enterprise`, which is
  proprietary, never does, shipped or not. `scripts/check-licences.mjs` refuses it anywhere in the lock file or the
  manifest (`scripts/forbidden-packages.mjs`).
