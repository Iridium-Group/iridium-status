# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-11-19

### Added

- `services.json` with checks for the Iridium website, the documentation site, and the
  Iridium-Group GitHub organization, plus validation with defaults.
- HTTP checker with timeouts, expected status codes, optional body text, retries, and a degraded
  state for slow responses.
- `data/status.json` snapshot and capped rolling `data/history.json`.
- Static site generator for `dist/index.html`: overall state, per-service 30-day uptime bars,
  latency and last check time, no JavaScript, using the Iridium design tokens.
- `ci.yml` (format, typecheck, test, build) and `check.yml` (scheduled checks every 30 minutes,
  data commits with `[skip ci]`, GitHub Pages deploy).
- Test suite using a local HTTP server fixture.
