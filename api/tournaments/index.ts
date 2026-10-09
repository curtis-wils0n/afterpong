import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import {
  players,
  tournaments,
  tournamentParticipants,
  tournamentMatches,
} from '../../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../_lib/auth.js';
import { conservativeRating } from '../../lib/glicko.js';
import {
  buildRoundOneSlots,
  seedParticipants,
  type Seeding,
} from '../../lib/bracket.js';
import { advanceWinner } from '../_lib/tournamentService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const role = await requireAuth(req, res);
    if (!role) return;
    return handleList(res);
  }

  if (req.method === 'POST') {
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;
    return handleCreate(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(res: VercelResponse) {
  const allTournaments = await db
    .select()
    .from(tournaments)
    .orderBy(desc(tournaments.createdAt));

  const winnerIds = allTournaments
    .map((t) => t.winnerId)
    .filter((id): id is number => id != null);
  const winners = winnerIds.length
    ? await db.select().from(players).where(inArray(players.id, winnerIds))
    : [];
  const winnerMap = Object.fromEntries(winners.map((p) => [p.id, p]));

  const enriched = allTournaments.map((t) => ({
    ...t,
    winner: t.winnerId != null ? winnerMap[t.winnerId] ?? null : null,
  }));

  return res.json(enriched);
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const { name, seeding, playerIds } = req.body as {
    name?: string;
    seeding?: Seeding;
    playerIds?: number[];
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (seeding !== 'snake' && seeding !== 'random') {
    return res.status(400).json({ error: 'Invalid seeding' });
  }
  if (!Array.isArray(playerIds) || playerIds.length < 2) {
    return res.status(400).json({ error: 'At least 2 players are required' });
  }

  // Reject if there's already an active tournament
  const [existing] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.status, 'active'))
    .limit(1);
  if (existing) {
    return res
      .status(409)
      .json({ error: 'There is already an active tournament' });
  }

  const participantPlayers = await db
    .select()
    .from(players)
    .where(inArray(players.id, playerIds));

  if (participantPlayers.length !== playerIds.length) {
    return res.status(400).json({ error: 'Some players were not found' });
  }
  if (participantPlayers.some((p) => p.retired)) {
    return res.status(400).json({ error: 'Retired players cannot join a tournament' });
  }

  // Seed participants
  const seeded = seedParticipants(
    participantPlayers.map((p) => ({ id: p.id, rating: conservativeRating(p) })),
    seeding,
  );
  const seedToPlayer = new Map(seeded.map((s) => [s.seed, s.playerId]));

  // Insert tournament
  const [tournament] = await db
    .insert(tournaments)
    .values({ name: name.trim(), seeding, status: 'active' })
    .returning();

  // Insert participants
  await db.insert(tournamentParticipants).values(
    seeded.map((s) => ({
      tournamentId: tournament.id,
      playerId: s.playerId,
      seed: s.seed,
    })),
  );

  // Build the bracket. Insert all rounds upfront with empty slots for later rounds.
  const { bracketSize, slots, totalRounds } = buildRoundOneSlots(
    seeded.length,
  );

  // Round 1 inserts
  type InsertedTM = typeof tournamentMatches.$inferSelect;
  const round1Inserted: InsertedTM[] = [];
  for (const slot of slots) {
    const player1Id =
      slot.player1Seed != null ? seedToPlayer.get(slot.player1Seed) ?? null : null;
    const player2Id =
      slot.player2Seed != null ? seedToPlayer.get(slot.player2Seed) ?? null : null;
    // Bye: one slot null and the other has a player → auto-advance
    let winnerId: number | null = null;
    if (player1Id != null && player2Id == null) winnerId = player1Id;
    else if (player2Id != null && player1Id == null) winnerId = player2Id;
    const [row] = await db
      .insert(tournamentMatches)
      .values({
        tournamentId: tournament.id,
        round: slot.round,
        position: slot.position,
        player1Id,
        player2Id,
        winnerId,
      })
      .returning();
    round1Inserted.push(row);
  }

  // Insert empty placeholders for rounds 2..totalRounds
  const allRoundInsertions: InsertedTM[] = [...round1Inserted];
  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = bracketSize / Math.pow(2, round);
    for (let position = 0; position < matchCount; position++) {
      const [row] = await db
        .insert(tournamentMatches)
        .values({
          tournamentId: tournament.id,
          round,
          position,
        })
        .returning();
      allRoundInsertions.push(row);
    }
  }

  // Apply byes upward — if a round-1 match has a winner (bye), advance them now
  for (const tm of round1Inserted) {
    if (tm.winnerId != null) {
      await advanceWinner(tournament.id, tm.round, tm.position, tm.winnerId);
    }
  }

  // If only 1 player and no matches, immediately complete the tournament
  // (won't happen with the ≥2 validation, but covers a 2-player edge case where
  // the final is round 1 and no advancement needed)
  if (totalRounds === 0) {
    return res.status(400).json({ error: 'Bracket too small' });
  }

  return res
    .status(201)
    .json({ tournamentId: tournament.id });
}

