import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import {
  players,
  matches,
  tournaments,
  tournamentParticipants,
  tournamentMatches,
} from '../../db/schema.js';
import { eq, inArray, asc } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  if (req.method === 'GET') {
    const role = await requireAuth(req, res);
    if (!role) return;
    return handleGet(id, res);
  }

  if (req.method === 'DELETE') {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    return handleDelete(id, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(id: number, res: VercelResponse) {
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id));

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const participants = await db
    .select()
    .from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(tournamentParticipants.seed));

  const tMatches = await db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, id))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.position));

  // Gather all player IDs
  const playerIds = new Set<number>();
  for (const p of participants) playerIds.add(p.playerId);
  for (const tm of tMatches) {
    if (tm.player1Id != null) playerIds.add(tm.player1Id);
    if (tm.player2Id != null) playerIds.add(tm.player2Id);
    if (tm.winnerId != null) playerIds.add(tm.winnerId);
  }
  if (tournament.winnerId != null) playerIds.add(tournament.winnerId);

  const playersList = playerIds.size
    ? await db.select().from(players).where(inArray(players.id, [...playerIds]))
    : [];
  const playerMap = Object.fromEntries(playersList.map((p) => [p.id, p]));

  // Gather match details for played matches
  const matchIds = tMatches
    .map((tm) => tm.matchId)
    .filter((mid): mid is number => mid != null);
  const linkedMatches = matchIds.length
    ? await db.select().from(matches).where(inArray(matches.id, matchIds))
    : [];
  const matchMap = Object.fromEntries(linkedMatches.map((m) => [m.id, m]));

  return res.json({
    ...tournament,
    winner:
      tournament.winnerId != null ? playerMap[tournament.winnerId] ?? null : null,
    participants: participants.map((p) => ({
      ...p,
      player: playerMap[p.playerId] ?? null,
    })),
    matches: tMatches.map((tm) => ({
      ...tm,
      player1: tm.player1Id != null ? playerMap[tm.player1Id] ?? null : null,
      player2: tm.player2Id != null ? playerMap[tm.player2Id] ?? null : null,
      match: tm.matchId != null ? matchMap[tm.matchId] ?? null : null,
    })),
  });
}

async function handleDelete(id: number, res: VercelResponse) {
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, id));

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Clear FK references on matches first
  const tMatches = await db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, id));
  const matchIds = tMatches
    .map((tm) => tm.matchId)
    .filter((mid): mid is number => mid != null);
  if (matchIds.length) {
    await db
      .update(matches)
      .set({ tournamentMatchId: null })
      .where(inArray(matches.id, matchIds));
  }

  // Delete child rows
  await db
    .delete(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, id));
  await db
    .delete(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, id));
  await db.delete(tournaments).where(eq(tournaments.id, id));

  return res.json({ ok: true });
}
