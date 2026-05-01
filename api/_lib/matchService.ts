import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { calculateEloChange } from '../../lib/elo.js';

export interface CreateMatchInput {
  winnerId: number;
  loserId: number;
  winnerScore?: number | null;
  loserScore?: number | null;
  isChallenge?: boolean;
  games?: { winnerScore: number; loserScore: number }[] | null;
  tournamentMatchId?: number | null;
}

export type CreateMatchResult =
  | { ok: true; match: typeof matches.$inferSelect; winner: { id: number; elo: number; challengeRank: number | null }; loser: { id: number; elo: number; challengeRank: number | null } }
  | { ok: false; status: number; error: string };

/**
 * Creates a match: validates inputs, computes ELO change, inserts the match row,
 * updates player ELOs, and (for challenge matches) swaps challenge ranks if the
 * lower-ranked player won. Returns enough info to build the API response.
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
    const rankDiff = lowerRanked.challengeRank! - higherRanked.challengeRank!;
    if (rankDiff < 1 || rankDiff > 2) {
      return {
        ok: false,
        status: 400,
        error:
          'Challenge matches can only be between players within 2 ranks of each other',
      };
    }
  }

  // Validate games array if provided
  let validatedGames: { winnerScore: number; loserScore: number }[] | null = null;
  let seriesWinnerScore: number | null = winnerScore ?? null;
  let seriesLoserScore: number | null = loserScore ?? null;

  if (Array.isArray(games) && games.length > 0) {
    for (const g of games) {
      if (
        typeof g.winnerScore !== 'number' ||
        typeof g.loserScore !== 'number' ||
        g.winnerScore < 0 ||
        g.loserScore < 0
      ) {
        return { ok: false, status: 400, error: 'Invalid game scores' };
      }
    }
    const gamesWonByWinner = games.filter((g) => g.winnerScore > g.loserScore)
      .length;
    const gamesWonByLoser = games.length - gamesWonByWinner;
    if (gamesWonByWinner <= gamesWonByLoser) {
      return { ok: false, status: 400, error: 'Winner must have won more games' };
    }
    validatedGames = games;
    seriesWinnerScore = gamesWonByWinner;
    seriesLoserScore = gamesWonByLoser;
  }

  const { winnerChange, loserChange } = calculateEloChange(
    winner.elo,
    loser.elo,
  );

  const [match] = await db
    .insert(matches)
    .values({
      winnerId,
      loserId,
      winnerScore: seriesWinnerScore,
      loserScore: seriesLoserScore,
      winnerEloChange: winnerChange,
      loserEloChange: loserChange,
      isChallenge: !!isChallenge,
      games: validatedGames,
      winnerRankBefore: winner.challengeRank,
      loserRankBefore: loser.challengeRank,
      tournamentMatchId: tournamentMatchId ?? null,
    })
    .returning();

  await Promise.all([
    db
      .update(players)
      .set({ elo: winner.elo + winnerChange })
      .where(eq(players.id, winnerId)),
    db
      .update(players)
      .set({ elo: loser.elo + loserChange })
      .where(eq(players.id, loserId)),
  ]);

  // Challenge rank swap if the lower-ranked player won
  let updatedWinnerRank = winner.challengeRank;
  let updatedLoserRank = loser.challengeRank;
  if (
    isChallenge &&
    winner.challengeRank != null &&
    loser.challengeRank != null &&
    winner.challengeRank > loser.challengeRank
  ) {
    await Promise.all([
      db
        .update(players)
        .set({ challengeRank: loser.challengeRank })
        .where(eq(players.id, winner.id)),
      db
        .update(players)
        .set({ challengeRank: winner.challengeRank })
        .where(eq(players.id, loser.id)),
    ]);
    updatedWinnerRank = loser.challengeRank;
    updatedLoserRank = winner.challengeRank;
  }

  return {
    ok: true,
    match,
    winner: {
      id: winner.id,
      elo: winner.elo + winnerChange,
      challengeRank: updatedWinnerRank,
    },
    loser: {
      id: loser.id,
      elo: loser.elo + loserChange,
      challengeRank: updatedLoserRank,
    },
  };
}
