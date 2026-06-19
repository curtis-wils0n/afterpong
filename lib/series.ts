// Live best-of-N series odds for the match-logging modal.
//
// Everything here starts from a single per-game win probability `p` (supplied
// by the rating model) and folds in the live state of a match — games already
// decided, the points on the table in the game in progress, and the games not
// yet started — so the odds shown move as a match is scored.

// Probability of winning a race to `n1` points while the opponent races to
// `n2`, each point won independently with probability `r`. Models a game as
// first-to-target and ignores the win-by-2 deuce tail, which barely moves a
// live estimate. Uses a running negative-binomial term to avoid large
// factorials.
function raceWinProbability(r: number, n1: number, n2: number): number {
  if (n1 <= 0) return 1;
  if (n2 <= 0) return 0;
  // j = 0 term: C(n1 - 1, 0) * r^n1.
  let term = r ** n1;
  let sum = term;
  for (let j = 1; j < n2; j++) {
    // term_j / term_{j-1} = ((n1 + j - 1) / j) * (1 - r)
    term *= ((n1 + j - 1) / j) * (1 - r);
    sum += term;
  }
  return sum;
}

// The per-point win probability that reproduces a per-game win probability `p`
// for a first-to-`target` game from 0-0. raceWinProbability is monotonic in
// `r`, so bisect.
function perPointProbability(p: number, target: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (raceWinProbability(mid, target, target) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Probability player 1 wins a game already in progress at `s1`-`s2` (first to
// `target`), given the per-game baseline `p`.
export function inProgressGameProbability(
  s1: number,
  s2: number,
  target: number,
  p: number,
): number {
  const r = perPointProbability(p, target);
  return raceWinProbability(r, Math.max(1, target - s1), Math.max(1, target - s2));
}

// Probability player 1 wins a best-of-N series given the games each side has
// already won (`p1Decided`, `p2Decided`), the player-1 win probability of each
// game still undecided (`undecidedProbs`, one entry per remaining game), and
// the number of game wins needed to clinch. Because `needed` is always a strict
// majority, only one side can reach it, so summing the outcomes where player 1
// gets enough wins gives the clinch probability directly.
export function seriesWinProbability(
  p1Decided: number,
  p2Decided: number,
  undecidedProbs: number[],
  needed: number,
): number {
  if (p1Decided >= needed) return 1;
  if (p2Decided >= needed) return 0;
  // dist[k] = probability that exactly k of the undecided games go to player 1.
  let dist = [1];
  for (const q of undecidedProbs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - q);
      next[k + 1] += dist[k] * q;
    }
    dist = next;
  }
  let win = 0;
  for (let k = needed - p1Decided; k < dist.length; k++) win += dist[k];
  return win;
}
