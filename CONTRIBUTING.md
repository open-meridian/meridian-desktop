# Contributing to meridian-desktop

meridian-desktop is AGPL-3.0-or-later, an extension of meridian-core. The design it follows is
`spec/the-desktop-shows-the-same-pages` in meridian-design; a change to what the desktop does starts there.

## What never changes
- A deployment's page gets no preload, no IPC, no `<webview>` and no Node. `contextIsolation`, `sandbox` and
  `webSecurity` are on everywhere, and every permission is denied unless the spec allows it.
- The desktop calls no path on a deployment that a browser does not, and offers a page no API.
- No `ignore-certificate-errors`, and plain http only for `localhost` and `*.localhost`.

## Code structure (the rules that apply here)
Each is checked in CI and fails the build:
- **S2 File size.** A hand-written file stays under 1,500 lines (`scripts/check-structure.mjs`).
- **S4 Interims name their end.** A stop-gap carries a marker, `INTERIM(vNN): reason`, naming the version it ends
  in and why it exists. The register `tools/interims.tsv` is generated from the markers. The repository's roadmap
  version is in `tools/code-structure.toml`; a marker for that version or an earlier one fails the build, so the
  stop-gap is removed before the version ships. Moving a marker to a later version needs the product owner's word
  and a commit trailer saying so (`npm run check:interims`, `tools/code_structure.py`).
- **S5 Pins are immutable.** Every dependency is an exact version, locked with its integrity, from the npm
  registry; every action a workflow uses is pinned to a full commit SHA (`scripts/check-structure.mjs`).
- **S10 Licences by layer.** No AGPL code reaches an Apache-licensed library: this repository publishes no library.
  Every shipped package carries an allowed licence, and its notices ship in every build
  (`scripts/check-licences.mjs`, `scripts/notices.mjs`, and ci's package job). `dockview-enterprise` never enters,
  shipped or not, and a Dockview package would have to be MIT (`scripts/forbidden-packages.mjs`). The provenance
  file is kept current.

## Checks
- `npm run check`: structure, interims, licences, names (no persona and no upstream trademark is published as
  a name of ours: `scripts/check-names.mjs`), unit tests.
- `npm run test:desktop`: the desktop driven by Playwright against stand-in deployments; ci also runs it against
  a real deployment from the released CLI and chart.
- `npm run test:browser`: the browser check of the desktop's own pages at 375, 582 and 1280 wide, and at the
  narrowest a desktop window may be made. Their colours are the plugin UI kit's tokens, under the kit's names
  (`test/unit/strip-tokens.test.mjs`).
