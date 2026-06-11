// One-time cleanup: convert legacy 1-0 placeholder game scores (the old
// convention for "game logged without points") into the explicit scoreless
// form: { winnerScore: null, loserScore: null, wonByMatchWinner }.
//
// A real table-tennis game can't end 1-0, so any game whose two scores sum
// to 1 is a placeholder. Idempotent: converted games no longer match.
//
//   npm run db:normalize-scoreless

import { sql } from 'drizzle-orm';
import { db } from './index.js';

async function main() {
  const result = await db.execute(sql`
    UPDATE matches
    SET games = (
      SELECT jsonb_agg(
        CASE
          WHEN ((e->>'winnerScore')::int + (e->>'loserScore')::int) = 1
          THEN jsonb_build_object(
            'winnerScore', null,
            'loserScore', null,
            'wonByMatchWinner', (e->>'winnerScore')::int = 1
          )
          ELSE e
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(games) WITH ORDINALITY AS t(e, ord)
    )
    WHERE games IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(games) e
        WHERE ((e->>'winnerScore')::int + (e->>'loserScore')::int) = 1
      )
  `);
  console.log(`Normalized placeholder games. Rows updated: ${result.rowCount ?? '?'}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
