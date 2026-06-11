import { eq, and, gt, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { inflateRd, rateMatch, daysBetween } from '../../lib/glicko.js';
import { gameWonByMatchWinner, isScoredGame, type GameScore } from '../../lib/games.js';

export interface CreateMatchInput {
  winnerId: number;
  loserId: number;
  winnerScore?: number | null;
  loserScore?: number | null;
  isChallenge?: boolean;
  games?: GameScore[] | null;
  tournamentMatchId?: number | null;
}

export type CreateMatchResult =
  | { ok: true; match: typeof matches.$inferSelect; winner: { id: number; rating: number; challengeRank: number | null }; loser: { id: number; rating: number; challengeRank: number | null } }
  | { ok: false; status: number; error: string };

/**
 * Creates a match: validates inputs, computes Glicko-2 rating updates, inserts
 * the match row (with pre-match rating snapshots for undo), updates players,
 * and (for challenge matches) swaps challenge ranks if the lower-ranked player
 * won. Returns enough info to build the API response.
 */
export async function createMatch(
  input: CreateMatchInput,
): Promise<CreateMatchResult> {
  const {
    winnerId,
    loserId,
    winnerScore,
    loserScore,
    isChallenge,
    games,
    tournamentMatchId,
  } = input;

  if (!winnerId || !loserId) {
    return { ok: false, status: 400, error: 'Winner and loser are required' };
  }
  if (winnerId === loserId) {
    return {
      ok: false,
      status: 400,
      error: 'Winner and loser must be different players',
    };
  }

  const [winner] = await db.select().from(players).where(eq(players.id, winnerId));
  const [loser] = await db.select().from(players).where(eq(players.id, loserId));

  if (!winner || !loser) {
    return { ok: false, status: 404, error: 'Player not found' };
  }

  // Tournament matches are allowed to ignore vacation status (bracket is already set).
  if (tournamentMatchId == null && (winner.onVacation || loser.onVacation)) {
    return {
      ok: false,
      status: 400,
      error: 'Cannot log a match involving a player on vacation',
    };
  }

  if (isChallenge) {
    if (winner.challengeRank == null || loser.challengeRank == null) {
      return {
        ok: false,
        status: 400,
        error: 'Both players must have a challenge rank',
      };
    }
    const higherRanked =
      winner.challengeRank < loser.challengeRank ? winner : loser;
    const lowerRanked =
      winner.challengeRank < loser.challengeRank ? loser : winner;
    // Count non-vacationing players strictly between the two ranks; vacationers
    // are transparent so people below can challenge "past" them.
    const between = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(
          gt(players.challengeRank, higherRanked.challengeRank!),
          lt(players.challengeRank, lowerRanked.challengeRank!),
          eq(players.onVacation, false),
        ),
      );
    if (between.length > 1) {
      return {
        ok: false,
        status: 400,
        error:
          'Challenge matches can only be between players within 2 active ranks of each other',
      };
    }
  }

  // Validate games array if provided. Each game is either scored (both
  // point values present) or scoreless (both null + who won the game).
  let validatedGames: GameScore[] | null = null;
  let seriesWinnerScore: number | null = winnerScore ?? null;
  let seriesLoserScore: number | null = loserScore ?? null;

  if (Array.isArray(games) && games.length > 0) {
    for (const g of games) {
      const scoreless =
        g.winnerScore == null &&
        g.loserScore == null &&
        typeof g.wonByMatchWinner === 'boolean';
      if (scoreless) continue;
      if (!isScoredGame(g) || g.winnerScore < 0 || g.loserScore < 0) {
        return { ok: false, status: 400, error: 'Invalid game scores' };
      }
    }
    const gamesWonByWinner = games.filter(gameWonByMatchWinner).length;
    const gamesWonByLoser = games.length - gamesWonByWinner;
    if (gamesWonByWinner <= gamesWonByLoser) {
      return { ok: false, status: 400, error: 'Winner must have won more games' };
    }
    validatedGames = games;
    seriesWinnerScore = gamesWonByWinner;
    seriesLoserScore = gamesWonByLoser;
  }

  // Inflate each player's RD for time spent idle, then rate the match against
  // the inflated states. Snapshots store the *raw* pre-match row values so
  // undo restores them exactly (the idle inflation re-applies naturally on
  // their next match).
  const now = new Date();
  const winnerPre = inflateRd(
    { rating: winner.rating, rd: winner.rd, volatility: winner.volatility },
    daysBetween(winner.lastMatchAt, now),
  );
  const loserPre = inflateRd(
    { rating: loser.rating, rd: loser.rd, volatility: loser.volatility },
    daysBetween(loser.lastMatchAt, now),
  );
  const rated = rateMatch(winnerPre, loserPre);

  // All writes (match insert, both rating updates, rank swap) commit or roll
  // back together. Queries inside a transaction share one connection, so they
  // run sequentially.
  const swapRanks =
    !!isChallenge &&
    winner.challengeRank != null &&
    loser.challengeRank != null &&
    winner.challengeRank > loser.challengeRank;

  const match = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(matches)
      .values({
        winnerId,
        loserId,
        winnerScore: seriesWinnerScore,
        loserScore: seriesLoserScore,
        winnerRatingChange: rated.winner.rating - winner.rating,
        loserRatingChange: rated.loser.rating - loser.rating,
        winnerRatingBefore: winner.rating,
        winnerRdBefore: winner.rd,
        winnerVolBefore: winner.volatility,
        winnerLastMatchBefore: winner.lastMatchAt,
        loserRatingBefore: loser.rating,
        loserRdBefore: loser.rd,
        loserVolBefore: loser.volatility,
        loserLastMatchBefore: loser.lastMatchAt,
        isChallenge: !!isChallenge,
        games: validatedGames,
        winnerRankBefore: winner.challengeRank,
        loserRankBefore: loser.challengeRank,
        tournamentMatchId: tournamentMatchId ?? null,
        createdAt: now,
      })
      .returning();

    await tx
      .update(players)
      .set({
        rating: rated.winner.rating,
        rd: rated.winner.rd,
        volatility: rated.winner.volatility,
        lastMatchAt: now,
        ...(swapRanks ? { challengeRank: loser.challengeRank } : {}),
      })
      .where(eq(players.id, winnerId));
    await tx
      .update(players)
      .set({
        rating: rated.loser.rating,
        rd: rated.loser.rd,
        volatility: rated.loser.volatility,
        lastMatchAt: now,
        ...(swapRanks ? { challengeRank: winner.challengeRank } : {}),
      })
      .where(eq(players.id, loserId));

    return inserted;
  });

  const updatedWinnerRank = swapRanks ? loser.challengeRank : winner.challengeRank;
  const updatedLoserRank = swapRanks ? winner.challengeRank : loser.challengeRank;

  return {
    ok: true,
    match,
    winner: {
      id: winner.id,
      rating: rated.winner.rating,
      challengeRank: updatedWinnerRank,
    },
    loser: {
      id: loser.id,
      rating: rated.loser.rating,
      challengeRank: updatedLoserRank,
    },
  };
}
