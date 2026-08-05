import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { desc, asc, sql } from 'drizzle-orm';
import { requireAuth } from '../_lib/auth.js';
import { computePlayerRecordStats } from '../../lib/playerStats.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const role = await requireAuth(req, res);
  if (!role) return;

  if (req.method === 'GET') {
    const sort = req.query.sort;
    const includeStats = req.query.include === 'stats';
    // Default sort is the conservative rating (rating − 2×RD) — the same
    // number the leaderboard displays. Rank sort puts unplaced players
    // (NULL rank) last, oldest first.
    const orderBy = sort === 'rank'
      ? [asc(players.challengeRank), asc(players.createdAt)]
      : [desc(sql`${players.rating} - 2 * ${players.rd}`)];
    const allPlayers = await db.select().from(players).orderBy(...orderBy);

    if (!includeStats) {
      return res.json(allPlayers);
    }

    // Fetch all matches for stats computation
    const allMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt));

    // allMatches is newest-first (orderBy desc createdAt), which the streak
    // logic in computePlayerRecordStats relies on.
    const statsById = computePlayerRecordStats(allMatches);
    const playersWithStats = allPlayers.map(player => {
      const s = statsById.get(player.id);
      return {
        ...player,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        defenses: s?.defenses ?? 0,
        challengeStreak: s?.challengeStreak ?? 0,
      };
    });

    return res.json(playersWithStats);
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    try {
      // New players start unplaced (no challenge rank) and enter the ladder
      // via a play-in challenge.
      const [player] = await db.insert(players).values({
        name: name.trim(),
      }).returning();
      return res.status(201).json(player);
    } catch {
      return res.status(409).json({ error: 'Player already exists' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
