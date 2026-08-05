// One-time migration for the play-in feature: players who have never played a
// challenge match lose their auto-assigned ladder rank (they become
// "unplaced" and must play in), and the remaining placed players are
// re-ranked densely from 1. Idempotent.
//
//   npm run db:unplace-never-challenged

import { sql } from 'drizzle-orm';
import { db } from './index.js';

async function main() {
  await db.transaction(async (tx) => {
    const unplaced = await tx.execute(sql`
      UPDATE players SET challenge_rank = NULL
      WHERE challenge_rank IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM matches m
          WHERE m.is_challenge
            AND (m.winner_id = players.id OR m.loser_id = players.id)
        )
    `);
    const compacted = await tx.execute(sql`
      UPDATE players SET challenge_rank = ranked.new_rank
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY challenge_rank) AS new_rank
        FROM players
        WHERE challenge_rank IS NOT NULL
      ) ranked
      WHERE players.id = ranked.id AND players.challenge_rank <> ranked.new_rank
    `);
    console.log(
      `Unplaced ${unplaced.rowCount ?? '?'} player(s), re-ranked ${compacted.rowCount ?? '?'}.`,
    );
  });
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
