// One-time backfill: replay the entire match history through Glicko-2 and
// write the results back — per-match rating changes and pre-match snapshots
// on every matches row, and final rating state on every players row.
//
// Run after `npm run db:push` (which adds the new columns):
//   npm run db:backfill-glicko
//
// Idempotent: re-running replays from scratch and overwrites the same values.

import { asc, eq } from 'drizzle-orm';
import { db } from './index.js';
import { players, matches } from './schema.js';
import {
  defaultState,
  inflateRd,
  rateMatch,
  daysBetween,
  type GlickoState,
} from '../lib/glicko.js';

async function main() {
  const [allPlayers, allMatches] = await Promise.all([
    db.select().from(players),
    db.select().from(matches).orderBy(asc(matches.createdAt)),
  ]);

  const state = new Map<number, GlickoState>();
  const lastMatchAt = new Map<number, Date | null>();
  for (const p of allPlayers) {
    state.set(p.id, defaultState());
    lastMatchAt.set(p.id, null);
  }

  console.log(`Replaying ${allMatches.length} matches for ${allPlayers.length} players...`);

  for (const m of allMatches) {
    const winner = state.get(m.winnerId);
    const loser = state.get(m.loserId);
    if (!winner || !loser) {
      console.warn(`Match ${m.id}: unknown player, skipping`);
      continue;
    }

    const winnerLast = lastMatchAt.get(m.winnerId) ?? null;
    const loserLast = lastMatchAt.get(m.loserId) ?? null;

    const winnerPre = inflateRd(winner, daysBetween(winnerLast, m.createdAt));
    const loserPre = inflateRd(loser, daysBetween(loserLast, m.createdAt));
    const rated = rateMatch(winnerPre, loserPre);

    await db
      .update(matches)
      .set({
        winnerRatingChange: rated.winner.rating - winner.rating,
        loserRatingChange: rated.loser.rating - loser.rating,
        winnerRatingBefore: winner.rating,
        winnerRdBefore: winner.rd,
        winnerVolBefore: winner.volatility,
        winnerLastMatchBefore: winnerLast,
        loserRatingBefore: loser.rating,
        loserRdBefore: loser.rd,
        loserVolBefore: loser.volatility,
        loserLastMatchBefore: loserLast,
      })
      .where(eq(matches.id, m.id));

    state.set(m.winnerId, rated.winner);
    state.set(m.loserId, rated.loser);
    lastMatchAt.set(m.winnerId, m.createdAt);
    lastMatchAt.set(m.loserId, m.createdAt);
  }

  for (const p of allPlayers) {
    const s = state.get(p.id)!;
    await db
      .update(players)
      .set({
        rating: s.rating,
        rd: s.rd,
        volatility: s.volatility,
        lastMatchAt: lastMatchAt.get(p.id) ?? null,
      })
      .where(eq(players.id, p.id));
  }

  const standings = allPlayers
    .map((p) => ({ name: p.name, ...state.get(p.id)! }))
    .sort((a, b) => b.rating - 2 * b.rd - (a.rating - 2 * a.rd));
  console.log('\nFinal standings (conservative rating = rating - 2×RD):');
  for (const s of standings) {
    console.log(
      `  ${s.name.padEnd(12)} ${Math.round(s.rating - 2 * s.rd)}  (${Math.round(s.rating)} ±${Math.round(s.rd)})`,
    );
  }
  console.log('\nBackfill complete.');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
