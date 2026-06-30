---
name: add-stat
description: Add a new stat to the Afterpong Stats page (or a player-profile stat) end to end. Use whenever asked to add/extend a stat, leaderboard metric, or Challenge Ladder / Rivalries / Probability / Clutch card — it encodes the backend→types→frontend wiring plus the standard bits (help tooltip, detail-hover, NoData fallback, responsive grid) that are easy to forget.
---

# Add a stat to Afterpong

Stats flow through **three files**. Touch all three or the build breaks / the card renders wrong. Always do the **Standard bits** — they're the things that get missed.

1. `api/stats/index.ts` — compute the stat from match data.
2. `src/types.ts` — add it to `StatsResponse` under the right section.
3. `src/components/Stats.tsx` — render the card (player-profile stats live in `src/components/PlayerProfile.tsx`).

## Standard bits (do ALL of these — this is the checklist that gets missed)

- [ ] **Help tooltip**: add a `TIPS.<key>` entry (one-line explanation, mention any minimum-games threshold) and pass `tooltip={TIPS.<key>}` to the `StatCard`. Every card has the `?` help icon.
- [ ] **Detail hover**: wrap the card's `value` in `<DetailValue entries={...}>` so hovering the value shows the underlying matches — same as every other card. This requires the backend to return a per-leader `matches` list (see below).
- [ ] **NoData fallback**: render `<NoData label="…" tooltip={TIPS.<key>} />` for the `null` case (a stat returns `null` when nobody qualifies).
- [ ] **Ties**: stats return `entries` (plural) because `pickAllMax` returns all players tied at the max — render every entry, don't assume one.
- [ ] **Types updated** in `src/types.ts` so `tsc` passes.
- [ ] **Responsive grid**: counts/rates grouped in `grid grid-cols-1 sm:grid-cols-N gap-3 sm:gap-4` rows; mobile must stack.
- [ ] **Verify**: `npx tsc -b` then `npx vite build` (see Verify section).

## Backend recipe (`api/stats/index.ts`)

Per-player numbers accumulate in the `acc` map (type `PlayerAcc`). Stats are then picked with `pickAllMax(playerList, p => <number>)` (returns `{ players, score } | null`; returns all players tied at the max).

**1. Accumulate.** Add field(s) to the `PlayerAcc` type, initialise them in the `acc.set(p.id, { … })` loop, and increment them in the per-match loop (the big `for` over matches). Remember a match has a `winner` and a `loser` — update both sides if the stat is symmetric (see the challenge climb/defense block for the pattern).

**2. Pick.** `const mostX = pickAllMax(playerList, (p) => acc.get(p.id)!.x);`
For **rate/average** stats, gate on a minimum sample so one lucky game can't hit 100% — return `-1` (or `-Infinity`) below the threshold:
```ts
const MIN_X = 5;
const bestRate = pickAllMax(playerList, (p) => {
  const a = acc.get(p.id)!;
  return a.xGames >= MIN_X ? a.xWins / a.xGames : -1;
});
```

**3. Detail matches.** Write a `xMatchesFor(pid): DetailMatch[]` that filters `matchesOf(pid)`, maps through `detailFromMatch(m, pid)`, and `.slice(-DETAIL_CAP)`. This feeds the **detail hover**.

**4. Wrap + attach to the response.** Use the existing helpers so the shape is consistent:
- **Count** stat → `wrapCountMatches(mostX, xMatchesFor)` → `{ entries: { player, matches }[], count } | null`.
- **Win-rate** stat → `wrapChallengeRate(bestRate, a => [wins, games], xMatchesFor)` → `{ entries: { player, wins, games, matches }[], rate } | null` (mirror this helper for new rate stats).
Add the field under the correct `ladder` / `players` / `matches` / `rivalries` / `probability` / `clutch` key in the returned object. Keep `null` semantics: `wrap*` returns `null` when `best` is null or below the floor.

## Types (`src/types.ts`)

Add the field to `StatsResponse` under the same section, `| null`, matching the wrap shape:
```ts
bestX: { entries: { player: PlayerRef; wins: number; games: number; matches: StreakMatch[] }[]; rate: number } | null;
// or for a count:
mostX: { entries: { player: PlayerRef; matches: StreakMatch[] }[]; count: number } | null;
```

## Frontend (`src/components/Stats.tsx`)

Add a `TIPS.<key>` line, then render inside the right section's grid:
```tsx
{stats.<section>.<key> ? (
  <StatCard
    label="Best X"
    value={
      <DetailValue entries={stats.<section>.<key>.entries}>
        {`${(stats.<section>.<key>.rate * 100).toFixed(1)}%`}  {/* or the count */}
      </DetailValue>
    }
    valueClass="text-emerald-400"
    tooltip={TIPS.<key>}
  >
    {/* leaders: PlayerLinks for counts, or a per-entry list for rates */}
    {stats.<section>.<key>.entries.map((e) => (
      <div key={e.player.id}>
        <PlayerLink player={e.player} />
        <span className="text-slate-600"> · {e.wins}-{e.games - e.wins}</span>
      </div>
    ))}
  </StatCard>
) : (
  <NoData label="Best X" tooltip={TIPS.<key>} />
)}
```
Building blocks already in the file: `StatCard` (card + `?` tooltip), `DetailValue` (value→matches hover), `NoData`, `PlayerLink`/`PlayerLinks`, `RelationshipSubjects` (per-player hover for rivalry-style stats), `StreakCard`. Reuse them — don't reinvent.

Player-profile stats (`PlayerProfile.tsx`) are computed client-side from `player.matches`; match that file's card patterns instead.

## Verify

This repo's `tsc -b` also typechecks `api/`. Pre-existing, unrelated errors to ignore: `Cannot find module 'vitest'` (test files) and `Cannot find module 'ws'` (db). Anything else is yours to fix.
```bash
npx tsc -b 2>&1 | grep -vE 'vitest|module .ws.' | grep 'error TS'   # expect no output
npx vite build                                                       # must succeed
```

## Workflow

Work on a branch and open a PR against `main` (the repo's default) unless told to ship straight to main. Keep Challenge-Ladder-style sections to tidy rows (e.g. counts in one `sm:grid-cols-2` row, rates in a `sm:grid-cols-3` row).
