// Live best-of-N series odds for the match-logging modal.
//
// Everything here starts from a single per-game win probability `p` (supplied
// by the rating model) and folds in the live state of a match — games already
// decided, the points on the table in the game in progress, and the games not
// yet started — so the odds shown move as a match is scored.

// Probability player 1 wins a game from `s1`-`s2` to `target`, win by 2, with
// each point won independently with probability `r`. Once both players reach
// target - 1 the game is at deuce, where only the lead matters and a tie
// resolves by the win-by-2 geometric series — that closed form also caps the
// recursion. Memoized over the pre-deuce states.
function gameWinProbability(
  s1: number,
  s2: number,
  target: number,
  r: number,
): number {
  // Win-by-2 from a tied deuce: take both points (r^2) to win, drop both to
  // lose, split them and you're back to a tie. Solving P = r^2 + 2r(1-r)P.
  const pTie = (r * r) / (r * r + (1 - r) * (1 - r));
  const memo = new Map<number, number>();
  const rec = (a: number, b: number): number => {
    if (a >= target && a - b >= 2) return 1;
    if (b >= target && b - a >= 2) return 0;
    if (a >= target - 1 && b >= target - 1) {
      const lead = a - b; // in {-1, 0, 1}; |lead| >= 2 is already absorbed
      if (lead >= 1) return r + (1 - r) * pTie; // one point from the win
      if (lead <= -1) return r * pTie; // facing game point
      return pTie;
    }
    const key = a * (target + 2) + b;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const v = r * rec(a + 1, b) + (1 - r) * rec(a, b + 1);
    memo.set(key, v);
    return v;
  };
  return rec(s1, s2);
}

// The per-point win probability that reproduces a per-game win probability `p`
// for a game to `target` from 0-0. gameWinProbability is monotonic in `r`, so
// bisect.
function perPointProbability(p: number, target: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (gameWinProbability(0, 0, target, mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Probability player 1 wins a game already in progress at `s1`-`s2` (to
// `target`, win by 2), given the per-game baseline `p`.
export function inProgressGameProbability(
  s1: number,
  s2: number,
  target: number,
  p: number,
): number {
  return gameWinProbability(s1, s2, target, perPointProbability(p, target));
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
