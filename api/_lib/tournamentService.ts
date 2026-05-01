import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tournaments, tournamentMatches } from '../../db/schema.js';

// Advance the winner of (round, position) to the next round's appropriate slot.
// If there is no next round, mark the tournament completed.
export async function advanceWinner(
  tournamentId: number,
  round: number,
  position: number,
  winnerId: number,
): Promise<void> {
  const [next] = await db
    .select()
    .from(tournamentMatches)
    .where(
      and(
        eq(tournamentMatches.tournamentId, tournamentId),
        eq(tournamentMatches.round, round + 1),
        eq(tournamentMatches.position, Math.floor(position / 2)),
      ),
    );

  if (!next) {
    // No next round — this was the final match
    await db
      .update(tournaments)
      .set({ status: 'completed', winnerId, completedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));
    return;
  }

  // Even position → player1 slot of next; odd → player2
  const slot = position % 2 === 0 ? 'player1Id' : 'player2Id';
  await db
    .update(tournamentMatches)
    .set({ [slot]: winnerId })
    .where(eq(tournamentMatches.id, next.id));
}
