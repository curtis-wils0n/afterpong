import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { eq, desc, inArray, and, or, sql } from 'drizzle-orm';
import { calculateEloChange } from '../../lib/elo.js';
import { requireAuth, requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
  } else {
    const role = await requireAuth(req, res);
    if (!role) return;
  }

  if (req.method === 'GET') {
    const limitParam = Number(req.query.limit);
    const offsetParam = Number(req.query.offset);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const playerIdsParam = typeof req.query.playerIds === 'string' ? req.query.playerIds : '';
    const filterIds = playerIdsParam
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n) && n > 0)
      .slice(0, 2);

    let whereClause = undefined;
    if (filterIds.length === 1) {
      const [a] = filterIds;
      whereClause = or(eq(matches.winnerId, a), eq(matches.loserId, a));
    } else if (filterIds.length === 2) {
      const [a, b] = filterIds;
      whereClause = or(
        and(eq(matches.winnerId, a), eq(matches.loserId, b)),
        and(eq(matches.winnerId, b), eq(matches.loserId, a)),
      );
    }

    const baseQuery = whereClause
      ? db.select().from(matches).where(whereClause)
      : db.select().from(matches);

    const countQuery = whereClause
      ? db.select({ count: sql<number>`count(*)::int` }).from(matches).where(whereClause)
      : db.select({ count: sql<number>`count(*)::int` }).from(matches);

    const [pageMatches, totalRows] = await Promise.all([
      baseQuery.orderBy(desc(matches.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    const total = totalRows[0]?.count ?? 0;

    const playerIds = new Set<number>();
    pageMatches.forEach(m => {
      playerIds.add(m.winnerId);
      playerIds.add(m.loserId);
    });

    const playersList = [...playerIds].length > 0
      ? await db.select().from(players).where(inArray(players.id, [...playerIds]))
      : [];

    const playerMap = Object.fromEntries(playersList.map(p => [p.id, p]));

    const matchesWithPlayers = pageMatches.map(m => ({
      ...m,
      winner: playerMap[m.winnerId],
      loser: playerMap[m.loserId],
    }));

    return res.json({ matches: matchesWithPlayers, total });
  }

  if (req.method === 'POST') {
    const { winnerId, loserId, winnerScore, loserScore, isChallenge, games } = req.body;

    if (!winnerId || !loserId) {
      return res.status(400).json({ error: 'Winner and loser are required' });
    }
    if (winnerId === loserId) {
      return res.status(400).json({ error: 'Winner and loser must be different players' });
    }

    const [winner] = await db.select().from(players).where(eq(players.id, winnerId));
    const [loser] = await db.select().from(players).where(eq(players.id, loserId));

    if (!winner || !loser) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Validate challenge match rules
    if (isChallenge) {
      if (winner.challengeRank == null || loser.challengeRank == null) {
        return res.status(400).json({ error: 'Both players must have a challenge rank' });
      }
      const higherRanked = winner.challengeRank < loser.challengeRank ? winner : loser;
      const lowerRanked = winner.challengeRank < loser.challengeRank ? loser : winner;
      const rankDiff = lowerRanked.challengeRank! - higherRanked.challengeRank!;
      if (rankDiff < 1 || rankDiff > 2) {
        return res.status(400).json({
          error: 'Challenge matches can only be between players within 2 ranks of each other',
        });
      }
    }

    // Validate games array if provided
    let validatedGames: { winnerScore: number; loserScore: number }[] | null = null;
    let seriesWinnerScore: number | null = winnerScore ?? null;
    let seriesLoserScore: number | null = loserScore ?? null;

    if (Array.isArray(games) && games.length > 0) {
      for (const g of games) {
        if (typeof g.winnerScore !== 'number' || typeof g.loserScore !== 'number' ||
            g.winnerScore < 0 || g.loserScore < 0) {
          return res.status(400).json({ error: 'Invalid game scores' });
        }
      }

      const gamesWonByWinner = games.filter((g: { winnerScore: number; loserScore: number }) => g.winnerScore > g.loserScore).length;
      const gamesWonByLoser = games.length - gamesWonByWinner;

      if (gamesWonByWinner <= gamesWonByLoser) {
        return res.status(400).json({ error: 'Winner must have won more games' });
      }

      validatedGames = games;
      seriesWinnerScore = gamesWonByWinner;
      seriesLoserScore = gamesWonByLoser;
    }

    const { winnerChange, loserChange } = calculateEloChange(winner.elo, loser.elo);

    // Insert match with pre-match ranks
    const [match] = await db.insert(matches).values({
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
    }).returning();

    // Update ELO
    await Promise.all([
      db.update(players).set({ elo: winner.elo + winnerChange }).where(eq(players.id, winnerId)),
      db.update(players).set({ elo: loser.elo + loserChange }).where(eq(players.id, loserId)),
    ]);

    // Handle challenge rank swap if lower-ranked player won
    if (isChallenge && winner.challengeRank != null && loser.challengeRank != null) {
      const winnerIsLowerRanked = winner.challengeRank > loser.challengeRank;
      if (winnerIsLowerRanked) {
        // Simple swap — only the two players exchange ranks
        await Promise.all([
          db.update(players)
            .set({ challengeRank: loser.challengeRank })
            .where(eq(players.id, winner.id)),
          db.update(players)
            .set({ challengeRank: winner.challengeRank })
            .where(eq(players.id, loser.id)),
        ]);
      }
    }

    return res.status(201).json({
      ...match,
      winner: { ...winner, elo: winner.elo + winnerChange },
      loser: { ...loser, elo: loser.elo + loserChange },
    });
  }

  if (req.method === 'DELETE') {
    // Get the most recent match
    const [latest] = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(1);

    if (!latest) {
      return res.status(404).json({ error: 'No matches to undo' });
    }

    const [winner] = await db.select().from(players).where(eq(players.id, latest.winnerId));
    const [loser] = await db.select().from(players).where(eq(players.id, latest.loserId));

    if (!winner || !loser) {
      return res.status(500).json({ error: 'Player not found' });
    }

    // Revert ELO
    await Promise.all([
      db.update(players)
        .set({ elo: winner.elo - latest.winnerEloChange })
        .where(eq(players.id, winner.id)),
      db.update(players)
        .set({ elo: loser.elo - latest.loserEloChange })
        .where(eq(players.id, loser.id)),
    ]);

    // Revert challenge rank swap if one happened
    if (
      latest.isChallenge &&
      latest.winnerRankBefore != null &&
      latest.loserRankBefore != null &&
      latest.winnerRankBefore > latest.loserRankBefore // lower-ranked player won = swap happened
    ) {
      // Simple swap back to original ranks
      await Promise.all([
        db.update(players)
          .set({ challengeRank: latest.winnerRankBefore })
          .where(eq(players.id, winner.id)),
        db.update(players)
          .set({ challengeRank: latest.loserRankBefore })
          .where(eq(players.id, loser.id)),
      ]);
    }

    // Delete the match
    await db.delete(matches).where(eq(matches.id, latest.id));

    return res.json(latest);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
