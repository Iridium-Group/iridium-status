<p align="center"><img src="./.github/assets/iridium-mark.svg" width="96" alt="Iridium Group"></p>

<h1 align="center">iridium-status</h1>

<p align="center">
  <a href="https://github.com/Iridium-Group/iridium-status/actions/workflows/ci.yml"><img src="https://github.com/Iridium-Group/iridium-status/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Iridium-Group/iridium-status/actions/workflows/check.yml"><img src="https://github.com/Iridium-Group/iridium-status/actions/workflows/check.yml/badge.svg" alt="Status checks"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

A static status page for Iridium services, updated by scheduled GitHub Actions checks.

Part of [Iridium Group](https://github.com/Iridium-Group): open web infrastructure for
browser-based networking and proxy applications.

**Status: Development.** The page is published to https://iridium-group.github.io/iridium-status/
once GitHub Pages is enabled for this repository.

## Contents

- [How it works](#how-it-works)
- [Monitored services](#monitored-services)
- [Configuration](#configuration)
- [Data files](#data-files)
- [The page](#the-page)
- [Development](#development)
- [Deployment](#deployment)
- [License](#license)

## How it works

1. Every 30 minutes the [`check.yml`](./.github/workflows/check.yml) workflow runs
   `npm run check`. It sends one HTTP request to each service in
   [`services.json`](./services.json), with a timeout, an expected status, and an optional
   retry, and records the result and latency.
2. The results are written to [`data/status.json`](./data/status.json) and appended to
   [`data/history.json`](./data/history.json), which keeps a capped number of entries per service.
   The workflow commits the data back to `main` with `[skip ci]`.
3. `npm run build` renders `dist/index.html`, a single static page with no JavaScript, and copies
   the data files next to it. The workflow deploys `dist/` with `actions/deploy-pages`.

The checker and the site generator are plain TypeScript run directly by Node (type stripping). There
are no runtime dependencies.

## Monitored services

| ID        | Service             | URL                                           |
| --------- | ------------------- | --------------------------------------------- |
| `website` | Website             | https://iridium-group.github.io/iridium/      |
| `docs`    | Documentation       | https://iridium-group.github.io/iridium-docs/ |
| `github`  | GitHub organization | https://github.com/Iridium-Group              |

## Configuration

`services.json` has a few top-level settings, a `defaults` block, and a `services` list. Any
service field except `id`, `name`, `url`, `description` and `link` can be set in `defaults`.

| Field             | Default            | Meaning                                                                   |
| ----------------- | ------------------ | ------------------------------------------------------------------------- |
| `title`           | `"Iridium Status"` | Page title.                                                               |
| `historyLimit`    | `2880`             | Entries kept per service (2880 is 60 days at one check every 30 minutes). |
| `days`            | `30`               | Days shown in each uptime bar.                                            |
| `services[].id`   | required           | Lowercase letters, digits and dashes. Used as the history key.            |
| `services[].name` | required           | Display name.                                                             |
| `services[].url`  | required           | `http` or `https` URL to check.                                           |
| `description`     | none               | Short line under the name.                                                |
| `link`            | `url`              | Where the service name links to.                                          |
| `method`          | `"GET"`            | `GET` or `HEAD`.                                                          |
| `expectStatus`    | `200`              | Accepted status code, or a list of them. Redirects are followed first.    |
| `expectText`      | none               | Text the response body must contain (`GET` only, first 1 MiB).            |
| `timeoutMs`       | `10000`            | The request is aborted after this long.                                   |
| `degradedAfterMs` | `3000`             | Slower responses count as degraded.                                       |
| `retries`         | `1`                | Extra attempts before a failed check is recorded as down.                 |

Removing a service from `services.json` also removes its history on the next run.

## Data files

`data/status.json` holds the latest result for each service:

```json
{
  "version": 1,
  "updatedAt": "2026-11-19T00:30:04.512Z",
  "overall": "operational",
  "services": [
    {
      "id": "website",
      "state": "up",
      "checkedAt": "2026-11-19T00:30:04.210Z",
      "status": 200,
      "latencyMs": 182,
      "attempts": 1,
      "name": "Website",
      "url": "https://iridium-group.github.io/iridium/",
      "uptime": 1
    }
  ]
}
```

- `state` is `up`, `degraded` (accepted but slower than `degradedAfterMs`) or `down`. Failed and
  degraded checks carry an `error` string.
- `overall` is `operational`, `degraded`, `partial` (some services down), `major` (all down) or
  `unknown` (no checks yet).
- `uptime` is the share of kept history where the service was up or degraded.

`data/history.json` maps each service ID to compact entries, oldest first:
`{ "t": "<ISO time>", "s": "up", "ms": 182, "c": 200 }`. Both files are also published next to the
page, at `/iridium-status/status.json` and `/iridium-status/history.json`.

## The page

- Overall state, last check time, and for each service its current state, latest and median
  latency, HTTP status, last error, and a bar of daily uptime over the last 30 UTC days.
- Uses the Iridium design tokens and base styles from the
  [`iridium`](https://github.com/Iridium-Group/iridium) website's `ui/` kit, copied verbatim into
  [`site/`](./site/), so the page matches the Iridium look. Styles are inlined; there are no web
  font or script requests.
- Works without JavaScript. Each uptime bar is an image with a text summary for screen readers,
  states are written out in text as well as colour, and there is a skip link and a visible focus
  ring.
- Asset and data links use the base path `/iridium-status/` (set `STATUS_BASE_PATH` to change it).

## Development

Requires Node.js 22.18 or newer and npm.

```sh
npm ci                 # install
npm test               # run the test suite (local HTTP fixture, no real network)
npm run typecheck      # TypeScript, including tests
npm run format         # format with Prettier
npm run format:check   # what CI runs
npm run check          # check the real services and update data/
npm run build          # render dist/index.html from services.json and data/
```

`npm run check` and `npm run build` read `STATUS_CONFIG`, `STATUS_DATA_DIR`, `STATUS_OUT_DIR` and
`STATUS_BASE_PATH` when set, so you can try a run without touching `data/`:

```sh
STATUS_DATA_DIR=/tmp/status npm run check
STATUS_DATA_DIR=/tmp/status STATUS_BASE_PATH=/ npm run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Deployment

- [`ci.yml`](./.github/workflows/ci.yml) runs format, typecheck, tests and build on Node 22 and 24
  for pushes to `main` and pull requests.
- [`check.yml`](./.github/workflows/check.yml) runs on a 30-minute schedule, on manual dispatch, and
  on pushes to `main` that change more than data or Markdown. It checks the services, commits
  `data/` back, builds, and deploys to GitHub Pages.

To publish, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Until
then the deploy job fails, while checks and data commits keep working. GitHub runs scheduled
workflows on a best-effort basis, so gaps of a few minutes between checks are normal, and it pauses
them after 60 days without repository activity (the data commits count as activity).

## License

[MIT](./LICENSE)
