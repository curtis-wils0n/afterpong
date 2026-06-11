import { asc, eq } from 'drizzle-orm';
import type { db as Database } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import {
  defaultState,
  inflateRd,
  rateMatch,
  daysBetween,
  type GlickoState,
} from '../../lib/glicko.js';

// Works with either the root db handle or a transaction handle.
type Executor = Pick<typeof Database, 'select' | 'update'>;

/**
 * Replays the entire match history through the Glicko-2 engine and writes the
 * results back: per-match rating changes + pre-match snapshots, and final
 * rating state on every player. This is how history edits (deleting or
 * fixing a match) stay consistent — earlier snapshots are unaffected, so
 * `rewriteSince` limits match-row writes to the part of history that can
 * have changed. Player rows are always rewritten.
 */
export async function recomputeRatings(
  db: Executor,
  opts: { rewriteSince?: Date } = {},
): Promise<void> {
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

  for (const m of allMatches) {
    const winner = state.get(m.winnerId);
    const loser = state.get(m.loserId);
    if (!winner || !loser) continue;

    const winnerLast = lastMatchAt.get(m.winnerId) ?? null;
    const loserLast = lastMatchAt.get(m.loserId) ?? null;

    const winnerPre = inflateRd(winner, daysBetween(winnerLast, m.createdAt));
    const loserPre = inflateRd(loser, daysBetween(loserLast, m.createdAt));
    const rated = rateMatch(winnerPre, loserPre);

    if (opts.rewriteSince == null || m.createdAt >= opts.rewriteSince) {
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
    }

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
}
