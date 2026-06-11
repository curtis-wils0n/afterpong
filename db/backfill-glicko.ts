// One-time backfill: replay the entire match history through Glicko-2 and
// write the results back — per-match rating changes and pre-match snapshots
// on every matches row, and final rating state on every players row.
//
// Run after `npm run db:migrate` (which adds the new columns):
//   npm run db:backfill-glicko
//
// Idempotent: re-running replays from scratch and overwrites the same values.

import { db } from './index.js';
import { players } from './schema.js';
import { recomputeRatings } from '../api/_lib/ratingService.js';
import { conservativeRating } from '../lib/glicko.js';

async function main() {
  console.log('Replaying match history...');
  await recomputeRatings(db);

  const allPlayers = await db.select().from(players);
  const standings = [...allPlayers].sort(
    (a, b) => conservativeRating(b) - conservativeRating(a),
  );
  console.log('\nFinal standings (conservative rating = rating - 2×RD):');
  for (const p of standings) {
    console.log(
      `  ${p.name.padEnd(12)} ${Math.round(conservativeRating(p))}  (${Math.round(p.rating)} ±${Math.round(p.rd)})`,
    );
  }
  console.log('\nBackfill complete.');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
