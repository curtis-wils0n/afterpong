// One-time cleanup: convert legacy placeholder game scores (the old way of
// logging a game without points — 1-0, 2-1, etc.) into the explicit
// scoreless form: { winnerScore: null, loserScore: null, wonByMatchWinner }.
//
// A real table-tennis game can't finish with both players under 11, so any
// game whose max score is below 11 is a placeholder. Idempotent: converted
// games no longer match.
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
          WHEN GREATEST((e->>'winnerScore')::int, (e->>'loserScore')::int) < 11
          THEN jsonb_build_object(
            'winnerScore', null,
            'loserScore', null,
            'wonByMatchWinner', (e->>'winnerScore')::int > (e->>'loserScore')::int
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
        WHERE GREATEST((e->>'winnerScore')::int, (e->>'loserScore')::int) < 11
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
