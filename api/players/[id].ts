import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { eq, or, desc, inArray, gt, sql } from 'drizzle-orm';
import { requireAuth, requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = Number(req.query.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid player ID' });

  if (req.method === 'PATCH' && req.body?.retired !== undefined) {
    // Retiring gives up the ladder spot, so it's admin-only.
    const isAdmin = await requireAdmin(req, res);
    if (!isAdmin) return;

    const { retired } = req.body;
    if (typeof retired !== 'boolean') {
      return res.status(400).json({ error: 'retired must be a boolean' });
    }
    const updated = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.id, id)).for('update');
      if (!player) return undefined;
      // Retiring drops them off the ladder and closes the gap. Un-retiring
      // leaves them unplaced; they re-enter via play-in.
      if (retired && player.challengeRank != null) {
        await tx
          .update(players)
          .set({ challengeRank: sql`${players.challengeRank} - 1` })
          .where(gt(players.challengeRank, player.challengeRank));
      }
      const [row] = await tx
        .update(players)
        .set({ retired, ...(retired ? { challengeRank: null } : {}) })
        .where(eq(players.id, id))
        .returning();
      return row;
    });
    if (!updated) return res.status(404).json({ error: 'Player not found' });
    return res.json(updated);
  }

  if (req.method === 'PATCH') {
    // Any authenticated user can toggle a player's vacation status.
    const role = await requireAuth(req, res);
    if (!role) return;

    const { onVacation } = req.body ?? {};
    if (typeof onVacation !== 'boolean') {
      return res.status(400).json({ error: 'onVacation must be a boolean' });
    }
    const [updated] = await db
      .update(players)
      .set({ onVacation })
      .where(eq(players.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Player not found' });
    return res.json(updated);
  }

  const role = await requireAuth(req, res);
  if (!role) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const playerMatches = await db
    .select()
    .from(matches)
    .where(or(eq(matches.winnerId, id), eq(matches.loserId, id)))
    .orderBy(desc(matches.createdAt));

  const wins = playerMatches.filter(m => m.winnerId === id).length;
  const losses = playerMatches.filter(m => m.loserId === id).length;

  // Current streak
  let streak = 0;
  let streakType: 'W' | 'L' | null = null;
  for (const match of playerMatches) {
    const won = match.winnerId === id;
    if (streakType === null) {
      streakType = won ? 'W' : 'L';
      streak = 1;
    } else if ((won && streakType === 'W') || (!won && streakType === 'L')) {
      streak++;
    } else {
      break;
    }
  }

  // Recent form (last 5)
  const recentForm = playerMatches.slice(0, 5).map(m => m.winnerId === id ? 'W' as const : 'L' as const);

  // Head-to-head records
  const h2hMap = new Map<number, { wins: number; losses: number }>();
  for (const match of playerMatches) {
    const opponentId = match.winnerId === id ? match.loserId : match.winnerId;
    const won = match.winnerId === id;
    const record = h2hMap.get(opponentId) || { wins: 0, losses: 0 };
    if (won) record.wins++;
    else record.losses++;
    h2hMap.set(opponentId, record);
  }

  const opponentIds = [...h2hMap.keys()];
  const opponents = opponentIds.length > 0
    ? await db.select().from(players).where(inArray(players.id, opponentIds))
    : [];

  const headToHead = opponents.map(opp => ({
    opponent: opp,
    ...h2hMap.get(opp.id)!,
  }));

  return res.json({
    ...player,
    wins,
    losses,
    streak: streakType ? { count: streak, type: streakType } : null,
    recentForm,
    headToHead,
    matches: playerMatches,
  });
}
