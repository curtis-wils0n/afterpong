import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { matches } from '../../db/schema.js';
import { requireAdmin } from '../_lib/auth.js';
import { recomputeRatings } from '../_lib/ratingService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isAdmin = await requireAdmin(req, res);
  if (!isAdmin) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid match id' });
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, id));
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  // Tournament matches drive bracket state; only the latest-match undo knows
  // how to safely revert advancement.
  if (match.tournamentMatchId != null) {
    return res.status(400).json({
      error:
        'Tournament matches can only be removed by undoing the latest match.',
    });
  }

  // Delete and replay the rest of history so every later snapshot, rating
  // change, and final player rating stays consistent. Ladder positions are
  // intentionally untouched (historical swaps are not unwound).
  await db.transaction(async (tx) => {
    await tx.delete(matches).where(eq(matches.id, id));
    await recomputeRatings(tx, { rewriteSince: match.createdAt });
  });

  return res.json({ ok: true });
}
