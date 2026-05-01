import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../../../db/index.js';
import {
  players,
  tournaments,
  tournamentMatches,
} from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../../../_lib/auth.js';
import { createMatch } from '../../../_lib/matchService.js';
import { advanceWinner } from '../../../_lib/tournamentService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const role = await requireAuth(req, res);
  if (!role) return;

  const tournamentId = Number(req.query.id);
  const tournamentMatchId = Number(req.query.matchId);
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }
  if (!Number.isFinite(tournamentMatchId) || tournamentMatchId <= 0) {
    return res.status(400).json({ error: 'Invalid tournament match ID' });
  }

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  if (tournament.status !== 'active') {
    return res.status(400).json({ error: 'Tournament is not active' });
  }

  const [tm] = await db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.id, tournamentMatchId));
  if (!tm || tm.tournamentId !== tournamentId) {
    return res.status(404).json({ error: 'Tournament match not found' });
  }
  if (tm.matchId != null) {
    return res
      .status(400)
      .json({ error: 'This tournament match has already been played' });
  }
  if (tm.player1Id == null || tm.player2Id == null) {
    return res
      .status(400)
      .json({ error: 'Both players must be determined before logging' });
  }

  const { winnerId, loserId, winnerScore, loserScore, games } =
    req.body as {
      winnerId?: number;
      loserId?: number;
      winnerScore?: number;
      loserScore?: number;
      games?: { winnerScore: number; loserScore: number }[];
    };

  // Validate that the winner/loser pair matches the bracket pairing
  const expectedPair = new Set([tm.player1Id, tm.player2Id]);
  if (
    !winnerId ||
    !loserId ||
    !expectedPair.has(winnerId) ||
    !expectedPair.has(loserId) ||
    winnerId === loserId
  ) {
    return res
      .status(400)
      .json({ error: 'Winner and loser must be the bracket pairing' });
  }

  // Tournament matches are never challenge matches — bracket pairings are
  // determined by seed, not by ladder rank, so they don't reorganize the ladder.
  const result = await createMatch({
    winnerId,
    loserId,
    winnerScore,
    loserScore,
    isChallenge: false,
    games,
    tournamentMatchId: tm.id,
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  // Update tournament match with the played match link + winner
  await db
    .update(tournamentMatches)
    .set({ matchId: result.match.id, winnerId })
    .where(eq(tournamentMatches.id, tm.id));

  // Advance the winner to the next round
  await advanceWinner(tournamentId, tm.round, tm.position, winnerId);

  // Reload current player records for the response
  const [winnerRow] = await db
    .select()
    .from(players)
    .where(eq(players.id, result.winner.id));
  const [loserRow] = await db
    .select()
    .from(players)
    .where(eq(players.id, result.loser.id));

  return res.status(201).json({
    ...result.match,
    winner: winnerRow,
    loser: loserRow,
  });
}
