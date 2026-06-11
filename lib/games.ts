// Shared helpers for per-game records, used by the API, stats, and frontend.
//
// A game either has real point scores (winnerScore/loserScore numbers) or is
// scoreless — points weren't tracked, but who won the game is recorded in
// wonByMatchWinner. Scores are relative to the *match* winner, so a game the
// match winner lost has winnerScore < loserScore.

export interface GameScore {
  winnerScore: number | null;
  loserScore: number | null;
  // Only meaningful for scoreless games (both scores null).
  wonByMatchWinner?: boolean;
}

export function isScoredGame(
  g: GameScore,
): g is GameScore & { winnerScore: number; loserScore: number } {
  return typeof g.winnerScore === 'number' && typeof g.loserScore === 'number';
}

export function gameWonByMatchWinner(g: GameScore): boolean {
  return isScoredGame(g) ? g.winnerScore > g.loserScore : !!g.wonByMatchWinner;
}

// True if any game in the series carries real point scores. (Legacy data may
// still contain 1-0 placeholder scores; a max score of 1 isn't a real game.)
export function hasPointScores(games: GameScore[]): boolean {
  return games.some(
    (g) => isScoredGame(g) && Math.max(g.winnerScore, g.loserScore) > 1,
  );
}
