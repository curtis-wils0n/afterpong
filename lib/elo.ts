export const K_FACTOR = 32;

// A match is a meaningful upset when the winner gained noticeably more ELO
// than the equal-rated expectation (K_FACTOR * 0.5 = 16). 20 corresponds to
// roughly a ~100 ELO skill gap, enough to feel like a real upset.
export const UPSET_THRESHOLD = 20;

export function isUpset(match: { winnerEloChange: number }): boolean {
  return match.winnerEloChange > UPSET_THRESHOLD;
}

export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

export function calculateEloChange(winnerElo: number, loserElo: number): { winnerChange: number; loserChange: number } {
  const expectedWinner = calculateExpectedScore(winnerElo, loserElo);
  const expectedLoser = calculateExpectedScore(loserElo, winnerElo);

  const winnerChange = Math.round(K_FACTOR * (1 - expectedWinner));
  const loserChange = Math.round(K_FACTOR * (0 - expectedLoser));

  return { winnerChange, loserChange };
}
