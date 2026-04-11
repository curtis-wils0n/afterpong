const K_FACTOR = 32;

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
