# meridian-desktop

The Open Meridian desktop application. Read `README.md` for what it is, and
meridian-design's `spec/the-desktop-shows-the-same-pages.md` for what it must do.

## Code structure (standing rules, 2026-11-20)

Each rule is enforced by its check in `npm run check` and in CI, and each check is red on a planted violation.
`CONTRIBUTING.md` states every rule in full.

- **S2 file size:** a new hand-written file stays under 1,500 lines. An existing one grows past that only with a
  `Size-Exception:` trailer.
- **S5 pins:** every dependency is pinned exactly, by version or full SHA. Never by a range, a branch or a sibling
  checkout.
- **S10 licences:** only allowed licences ship, and the notices ship with them. No proprietary package (for example
  `dockview-enterprise`) ever enters the app.
- **S7 tests:** a fix carries a `Failing-First: <test>` trailer naming a test that failed before it.

A change to a baseline or an allowlist carries a trailer saying why.
