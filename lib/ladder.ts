// Challenge-ladder distance rules, shared by the API and the UI.

interface LadderPlayer {
  challengeRank: number | null;
  onVacation: boolean;
}

// Active (non-vacationing) placed players strictly between two ranks.
// Vacationers are transparent, so they don't count toward distance.
export function activePlayersBetween(
  players: LadderPlayer[],
  rankA: number,
  rankB: number,
): number {
  const lo = Math.min(rankA, rankB);
  const hi = Math.max(rankA, rankB);
  return players.filter(
    (p) =>
      !p.onVacation &&
      p.challengeRank != null &&
      p.challengeRank > lo &&
      p.challengeRank < hi,
  ).length;
}

// Challenges within 2 active ranks are normal. Longer-range challenges are
// allowed, but whoever loses has their rating drop multiplied by the active
// rank distance (3 apart = 3x, 4 apart = 4x, ...).
export function challengeLossMultiplier(activeBetween: number): number {
  return activeBetween > 1 ? activeBetween + 1 : 1;
}
