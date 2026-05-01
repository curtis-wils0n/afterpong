import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches, tournamentMatches, tournaments } from '../../db/schema.js';
import { eq, desc, inArray, and, or, sql, type SQL } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../_lib/auth.js';
import { createMatch } from '../_lib/matchService.js';

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

    let whereClause: SQL<unknown> | undefined = undefined;
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

    const result = await createMatch({
      winnerId,
      loserId,
      winnerScore,
      loserScore,
      isChallenge,
      games,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const [winnerRow] = await db.select().from(players).where(eq(players.id, result.winner.id));
    const [loserRow] = await db.select().from(players).where(eq(players.id, result.loser.id));

    return res.status(201).json({
      ...result.match,
      winner: winnerRow,
      loser: loserRow,
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

    // If this match is part of a tournament, check that the next round hasn't been played.
    let tournamentMatch: typeof tournamentMatches.$inferSelect | undefined;
    let nextRoundMatch: typeof tournamentMatches.$inferSelect | undefined;
    if (latest.tournamentMatchId != null) {
      [tournamentMatch] = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.id, latest.tournamentMatchId));

      if (tournamentMatch) {
        // Find next-round match (round + 1, position floor(position/2))
        const [next] = await db
          .select()
          .from(tournamentMatches)
          .where(
            and(
              eq(tournamentMatches.tournamentId, tournamentMatch.tournamentId),
              eq(tournamentMatches.round, tournamentMatch.round + 1),
              eq(tournamentMatches.position, Math.floor(tournamentMatch.position / 2)),
            ),
          );
        nextRoundMatch = next;
        if (nextRoundMatch && nextRoundMatch.matchId != null) {
          return res.status(400).json({
            error:
              'Cannot undo this tournament match — the next round has already been played. Undo that match first.',
          });
        }
      }
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

    // Revert tournament bracket advancement
    if (tournamentMatch) {
      // Clear the played match link on the tournament match
      await db
        .update(tournamentMatches)
        .set({ matchId: null, winnerId: null })
        .where(eq(tournamentMatches.id, tournamentMatch.id));

      // If the winner had advanced to the next round, clear that slot
      if (nextRoundMatch && tournamentMatch.winnerId != null) {
        const advancedAsP1 = nextRoundMatch.player1Id === tournamentMatch.winnerId;
        const advancedAsP2 = nextRoundMatch.player2Id === tournamentMatch.winnerId;
        if (advancedAsP1) {
          await db
            .update(tournamentMatches)
            .set({ player1Id: null })
            .where(eq(tournamentMatches.id, nextRoundMatch.id));
        } else if (advancedAsP2) {
          await db
            .update(tournamentMatches)
            .set({ player2Id: null })
            .where(eq(tournamentMatches.id, nextRoundMatch.id));
        }
      }

      // If this was the final and the tournament was completed, revert it to active
      if (!nextRoundMatch) {
        await db
          .update(tournaments)
          .set({ status: 'active', winnerId: null, completedAt: null })
          .where(eq(tournaments.id, tournamentMatch.tournamentId));
      }
    }

    // Delete the match
    await db.delete(matches).where(eq(matches.id, latest.id));

    return res.json(latest);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
