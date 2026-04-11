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
    const orderBy = sort === 'rank'
      ? asc(players.challengeRank)
      : desc(players.elo);
    const allPlayers = await db.select().from(players).orderBy(orderBy);

    if (!includeStats) {
      return res.json(allPlayers);
    }

    // Fetch all matches for stats computation
    const allMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt));

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
        if (m.winnerRankBefore == null || m.loserRankBefore == null) continue;

        const playerIsWinner = m.winnerId === player.id;
        // The defender is the one with the lower rank number (higher position)
        const defenderRank = Math.min(m.winnerRankBefore, m.loserRankBefore);
        const playerWasDefender = playerIsWinner
          ? m.winnerRankBefore === defenderRank
          : m.loserRankBefore === defenderRank;

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
        if (m.winnerRankBefore == null || m.loserRankBefore == null) continue;

        const playerIsWinner = m.winnerId === player.id;
        const defenderRank = Math.min(m.winnerRankBefore, m.loserRankBefore);
        const playerWasChallenger = playerIsWinner
          ? m.winnerRankBefore !== defenderRank
          : m.loserRankBefore !== defenderRank;

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
      const [maxRankRow] = await db
        .select({ maxRank: sql<number>`COALESCE(MAX(${players.challengeRank}), 0)` })
        .from(players);
      const newRank = Number(maxRankRow.maxRank) + 1;

      const [player] = await db.insert(players).values({
        name: name.trim(),
        challengeRank: newRank,
      }).returning();
      return res.status(201).json(player);
    } catch {
      return res.status(409).json({ error: 'Player already exists' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
