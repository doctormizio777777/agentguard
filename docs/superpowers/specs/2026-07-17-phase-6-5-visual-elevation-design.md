# Phase 6.5 Mission Control Visual Elevation Design

## Goal

Elevate the existing Mission Control dashboard into a credible security-product demo while preserving its layout, HTTP data flow, endpoints, and approval behavior.

## Direction

The chosen direction is **incident spotlight**: the expanded hijack event is the single visual signature and receives the strongest contrast, depth, and motion. KPI cards and operational panels stay restrained so they support the threat rather than compete with it.

Two alternatives were rejected:

- A broad neon control-room treatment would make every panel visually loud and weaken hierarchy.
- A minimal monochrome audit-console treatment would be credible but undersell the flagship hijack moment during a short judging session.

## Seed Contract

The deterministic dashboard database contains:

- A blocked `payment` for `500000` cents to `unknown-vendor.xyz`, with a `hijack_suspected` verdict at `0.97`, procurement-bot mission text, and reasoning that explicitly mentions beneficiary change, urgency language, and the unknown counterparty.
- A pending `payment` for `30000` cents to `gift-card-store.example`, with a `suspicious` verdict at `0.84`.

The gift-card merchant is added only to the demo database policy by `scripts/seed_dashboard.py`; the application default policy and policy engine remain unchanged. The ledger remains append-only and valid after seeding.

## Visual System

- Keep Inter as the only font family.
- Keep all color, shadow, and motion values in `frontend/app/globals.css` variables. JSX may set data-derived widths and animation indices only.
- Use a low-contrast radial security-room background, restrained inner surface highlights, tabular figures, and small uppercase operational labels.
- Reserve the danger glow and animated threat pulse for the hijack card and a non-zero blocked KPI.
- Respect `prefers-reduced-motion` by disabling non-essential animation.

## UI Behavior

- The hijack action remains expanded automatically on first fetch. Its alert shows an uppercase verdict, large confidence stat, blockquote-style reasoning, quoted mission, and `gpt-5.6-sol` chip.
- KPI sparklines use twelve client-computed UTC hourly buckets from the existing `/actions` payload. Actions count, allowed payment cents, pending count, and blocked count each use their matching series.
- KPI values count up only on first load.
- Initial feed rows fade in with a short stagger. IDs first observed after initial load slide in from the top and briefly highlight.
- The header shows `LIVE` while the tab is visible and polling; it shows `PAUSED` while hidden.
- Risk gauges animate on load and include ticks at 34 and 66.

## Testing and Verification

- A real seed integration test executes the script against a temporary SQLite database and asserts both flagship records plus chain integrity.
- Pure TypeScript utilities for hourly buckets and SVG points are tested with Node's built-in test runner; no npm package is added.
- Verification includes the full backend pytest suite, frontend utility tests, a production Next.js build, a real reseed, HTTP/SQLite proof, ledger verification, and browser inspection at desktop and mobile widths.

