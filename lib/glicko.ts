// Glicko-2 rating engine (http://www.glicko.net/glicko/glicko2.pdf).
//
// Each player carries a rating, a rating deviation (RD — how uncertain the
// rating is), and a volatility (how erratic their results have been). Updates
// run per match, and RD inflates with idle time so returning players
// re-converge quickly instead of anchoring at a stale rating.

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;

// System constant: how much volatility can change per update. 0.5 is the
// middle of Glickman's recommended 0.3–1.2 range; smaller = more stable.
const TAU = 0.5;
// Glicko-2 internal scale factor (rating points per internal unit).
const SCALE = 173.7178;
const MAX_RD = 350;
const CONVERGENCE_TOLERANCE = 1e-6;

export interface GlickoState {
  rating: number;
  rd: number;
  volatility: number;
}

export function defaultState(): GlickoState {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

// Probability that `a` beats `b`, accounting for both players' uncertainty.
export function expectedScore(
  a: Pick<GlickoState, 'rating' | 'rd'>,
  b: Pick<GlickoState, 'rating' | 'rd'>,
): number {
  const muA = (a.rating - DEFAULT_RATING) / SCALE;
  const muB = (b.rating - DEFAULT_RATING) / SCALE;
  const phi = Math.sqrt((a.rd / SCALE) ** 2 + (b.rd / SCALE) ** 2);
  return 1 / (1 + Math.exp(-g(phi) * (muA - muB)));
}

// Conservative rating used for ranking: we're 97.5% sure the player is at
// least this good. Low-game players rank low until the system knows them.
export function conservativeRating(s: Pick<GlickoState, 'rating' | 'rd'>): number {
  return s.rating - 2 * s.rd;
}

// Inflate RD for time spent idle (lichess-style continuous decay, with one
// "rating period" = one day). Keeps inactive players' ratings honest: the
// number stays put, but the system's confidence in it drains away.
export function inflateRd(state: GlickoState, daysIdle: number): GlickoState {
  if (daysIdle <= 0) return state;
  const phi = state.rd / SCALE;
  const inflated = Math.sqrt(phi * phi + state.volatility * state.volatility * daysIdle);
  return { ...state, rd: Math.min(inflated * SCALE, MAX_RD) };
}

// Glickman's iterative volatility update (step 5 of the Glicko-2 paper).
function newVolatility(phi: number, v: number, delta: number, volatility: number): number {
  const a = Math.log(volatility * volatility);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE_TOLERANCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

function updateOne(player: GlickoState, opponent: GlickoState, score: 0 | 1): GlickoState {
  const mu = (player.rating - DEFAULT_RATING) / SCALE;
  const phi = player.rd / SCALE;
  const muOpp = (opponent.rating - DEFAULT_RATING) / SCALE;
  const phiOpp = opponent.rd / SCALE;

  const gOpp = g(phiOpp);
  const e = 1 / (1 + Math.exp(-gOpp * (mu - muOpp)));
  const v = 1 / (gOpp * gOpp * e * (1 - e));
  const delta = v * gOpp * (score - e);

  const volatility = newVolatility(phi, v, delta, player.volatility);
  const phiStar = Math.min(Math.sqrt(phi * phi + volatility * volatility), MAX_RD / SCALE);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gOpp * (score - e);

  return {
    rating: DEFAULT_RATING + SCALE * muNew,
    rd: phiNew * SCALE,
    volatility,
  };
}

// Rate a single match. Both players are updated against the other's
// pre-match state. Call inflateRd() for each player's idle time first.
export function rateMatch(
  winner: GlickoState,
  loser: GlickoState,
): { winner: GlickoState; loser: GlickoState } {
  return {
    winner: updateOne(winner, loser, 1),
    loser: updateOne(loser, winner, 0),
  };
}

// A win is an upset when the winner's pre-match win probability was below
// this. 0.375 matches the spirit of the old ELO rule (gain > 20 with K=32).
export const UPSET_PROBABILITY = 0.375;

export function isUpset(match: {
  winnerRatingBefore: number | null;
  winnerRdBefore: number | null;
  loserRatingBefore: number | null;
  loserRdBefore: number | null;
}): boolean {
  if (
    match.winnerRatingBefore == null ||
    match.winnerRdBefore == null ||
    match.loserRatingBefore == null ||
    match.loserRdBefore == null
  ) {
    return false;
  }
  const winProb = expectedScore(
    { rating: match.winnerRatingBefore, rd: match.winnerRdBefore },
    { rating: match.loserRatingBefore, rd: match.loserRdBefore },
  );
  return winProb < UPSET_PROBABILITY;
}

export function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 0;
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}
