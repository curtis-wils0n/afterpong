# pong-elo

ELO leaderboard, tournaments, and stats tracker for office ping pong.

## Prerequisites

- Node.js 20+
- [`just`](https://github.com/casey/just) — `brew install just` on macOS
- Access to the `afterpong` Vercel project (ask Jon)

## Setup

```sh
git clone git@github.com:jbreidfjord/afterpong.git
cd afterpong
just setup
```

`just setup` installs deps, links the Vercel project, and pulls
environment variables into `.env`.

`.env` will point at the prod database. Before running anything, swap
`STORAGE_DATABASE_URL` and `STORAGE_DATABASE_URL_UNPOOLED` for an
isolated Neon branch — ask Jon for a personal branch or access to the
shared `local-dev` branch.

## Run

```sh
just dev
```

Frontend + API on http://localhost:3001.

Use `just db-reset` to re-fork your Neon branch from prod when you
want fresh data.
