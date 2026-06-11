import type { GameScore } from '../types';

// Games logged without point tracking use 1-0 placeholders (the winner of
// each game gets 1). A series has real point scores only if some game went
// past a single point — otherwise showing the per-game "(1-0, 0-1)" noise
// is misleading.
export function hasPointScores(games: GameScore[]): boolean {
  return games.some((g) => Math.max(g.winnerScore, g.loserScore) > 1);
}
