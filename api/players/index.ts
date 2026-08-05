import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { desc, asc, sql } from 'drizzle-orm';
import { requireAuth } from '../_lib/auth.js';

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

    // The defender in a challenge is the lower-ranked (better) player; in a
    // play-in the unplaced player (null rank) is always the challenger.
    const winnerWasDefender = (m: (typeof allMatches)[number]): boolean =>
      m.winnerRankBefore != null &&
      (m.loserRankBefore == null || m.winnerRankBefore < m.loserRankBefore);

    const playersWithStats = allPlayers.map(player => {
      let wins = 0;
      let losses = 0;
      for (const m of allMatches) {
        if (m.winnerId === player.id) wins++;
        if (m.loserId === player.id) losses++;
      }

      // Defense streak: iterate challenge matches newest-first
      let defenses = 0;
      for (const m of allMatches) {
        if (!m.isChallenge) continue;
        if (m.winnerId !== player.id && m.loserId !== player.id) continue;
        if (m.winnerRankBefore == null && m.loserRankBefore == null) continue;

        const playerIsWinner = m.winnerId === player.id;
        const playerWasDefender = playerIsWinner
          ? winnerWasDefender(m)
          : !winnerWasDefender(m);

        if (playerWasDefender && playerIsWinner) {
          // Defender won — successful defense
          defenses++;
        } else if (!playerWasDefender && !playerIsWinner) {
          // Challenger lost — rank unchanged, skip
          continue;
        } else {
          // Defender lost OR Challenger won — rank changed, stop
          break;
        }
      }

      // Challenge win streak: consecutive wins as the challenger
      let challengeStreak = 0;
      for (const m of allMatches) {
        if (!m.isChallenge) continue;
        if (m.winnerId !== player.id && m.loserId !== player.id) continue;
        if (m.winnerRankBefore == null && m.loserRankBefore == null) continue;

        const playerIsWinner = m.winnerId === player.id;
        const playerWasChallenger = playerIsWinner
          ? !winnerWasDefender(m)
          : winnerWasDefender(m);

        if (playerWasChallenger && playerIsWinner) {
          // Challenger won — streak continues
          challengeStreak++;
        } else if (playerWasChallenger && !playerIsWinner) {
          // Challenger lost — failed challenge, stop
          break;
        } else {
          // Defender (won or lost) — doesn't affect climb streak, skip
          continue;
        }
      }

      return { ...player, wins, losses, defenses, challengeStreak };
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
