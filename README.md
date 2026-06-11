# pong-elo

Glicko-2 rating leaderboard, tournaments, and stats tracker for office ping pong.

## Prerequisites

- Node.js 20+
- [`just`](https://github.com/casey/just) — `brew install just` on macOS

## Setup

```sh
git clone git@github.com:jbreidfjord/afterpong.git
cd afterpong
just setup
```

Ask Jon for `.env` values and drop them in a `.env` file at the repo
root. The keys you need are listed in `.env.example`. The database
URLs should point at a personal Neon branch (or the shared
`local-dev` branch) — not prod.

## Run

```sh
just dev
```

Frontend + API on http://localhost:3001.

Use `just db-reset` to re-fork your Neon branch from prod when you
want fresh data.
