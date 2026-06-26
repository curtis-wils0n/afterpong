import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  defaultState,
  expectedScore,
  conservativeRating,
  inflateRd,
  rateMatch,
  isUpset,
  daysBetween,
  UPSET_PROBABILITY,
  blendedWinProbability,
  H2H_PRIOR_GAMES,
} from './glicko.js';

describe('expectedScore', () => {
  it('is 0.5 for identical players', () => {
    expect(expectedScore(defaultState(), defaultState())).toBeCloseTo(0.5, 10);
  });

  it('is symmetric: E(a,b) + E(b,a) = 1', () => {
    const a = { rating: 1700, rd: 80 };
    const b = { rating: 1450, rd: 200 };
    expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
  });

  it('favors the higher-rated player', () => {
    const strong = { rating: 1800, rd: 60 };
    const weak = { rating: 1300, rd: 60 };
    expect(expectedScore(strong, weak)).toBeGreaterThan(0.9);
  });

  it('pulls probabilities toward 0.5 when uncertainty is high', () => {
    const certain = expectedScore({ rating: 1800, rd: 30 }, { rating: 1500, rd: 30 });
    const uncertain = expectedScore({ rating: 1800, rd: 350 }, { rating: 1500, rd: 350 });
    expect(uncertain).toBeLessThan(certain);
    expect(uncertain).toBeGreaterThan(0.5);
  });
});

describe('blendedWinProbability', () => {
  it('returns the Glicko prediction unchanged with no shared history', () => {
    expect(blendedWinProbability(0.36, 0, 0)).toBe(0.36);
  });

  it('pulls toward the empirical record as games accumulate', () => {
    // 0.36 prior, player has lost the matchup 2-7 at the game level.
    const blended = blendedWinProbability(0.36, 2, 7, 5);
    expect(blended).toBeCloseTo((5 * 0.36 + 2) / (5 + 9), 10);
    expect(blended).toBeLessThan(0.36);
  });

  it('pulls upward when the underdog owns the matchup', () => {
    expect(blendedWinProbability(0.36, 7, 2, 5)).toBeGreaterThan(0.36);
  });

  it('moves further with more games at the same win rate', () => {
    const few = blendedWinProbability(0.5, 0, 3, 5);
    const many = blendedWinProbability(0.5, 0, 12, 5);
    expect(many).toBeLessThan(few);
    expect(few).toBeLessThan(0.5);
  });

  it('a heavier prior resists the record more', () => {
    const light = blendedWinProbability(0.5, 0, 5, 2);
    const heavy = blendedWinProbability(0.5, 0, 5, 20);
    expect(heavy).toBeGreaterThan(light);
  });

  it('defaults the prior weight to H2H_PRIOR_GAMES', () => {
    expect(blendedWinProbability(0.42, 3, 1)).toBe(
      blendedWinProbability(0.42, 3, 1, H2H_PRIOR_GAMES),
    );
  });

  it('stays within [0, 1]', () => {
    expect(blendedWinProbability(0.99, 0, 50)).toBeGreaterThanOrEqual(0);
    expect(blendedWinProbability(0.01, 50, 0)).toBeLessThanOrEqual(1);
  });
});

describe('conservativeRating', () => {
  it('is rating minus 2x RD', () => {
    expect(conservativeRating(defaultState())).toBe(DEFAULT_RATING - 2 * DEFAULT_RD);
    expect(conservativeRating({ rating: 1983, rd: 100 })).toBe(1783);
  });
});

describe('inflateRd', () => {
  it('does nothing for zero idle days', () => {
    const s = { rating: 1600, rd: 80, volatility: 0.06 };
    expect(inflateRd(s, 0)).toEqual(s);
  });

  it('grows RD with idle time', () => {
    const s = { rating: 1600, rd: 80, volatility: 0.06 };
    const after10 = inflateRd(s, 10);
    const after100 = inflateRd(s, 100);
    expect(after10.rd).toBeGreaterThan(80);
    expect(after100.rd).toBeGreaterThan(after10.rd);
    expect(after10.rating).toBe(1600);
    expect(after10.volatility).toBe(0.06);
  });

  it('matches the Glicko-2 formula: phi′ = sqrt(phi² + days·vol²)', () => {
    const SCALE = 173.7178;
    const s = { rating: 1600, rd: 80, volatility: 0.06 };
    const days = 25;
    const phi = s.rd / SCALE;
    const expected = Math.sqrt(phi * phi + s.volatility ** 2 * days) * SCALE;
    expect(inflateRd(s, days).rd).toBeCloseTo(expected, 8);
  });

  it('caps RD at 350', () => {
    const s = { rating: 1600, rd: 340, volatility: 0.06 };
    expect(inflateRd(s, 100000).rd).toBe(350);
  });
});

describe('rateMatch', () => {
  // Reference values cross-checked against an independent Glicko-2
  // implementation (per-match update, both players fresh at 1500/350/0.06).
  it('produces the known result for two fresh players', () => {
    const { winner, loser } = rateMatch(defaultState(), defaultState());
    expect(winner.rating).toBeCloseTo(1662.212, 2);
    expect(loser.rating).toBeCloseTo(1337.788, 2);
    expect(winner.rd).toBeCloseTo(290.231, 2);
    expect(loser.rd).toBeCloseTo(290.231, 2);
    expect(winner.volatility).toBeCloseTo(DEFAULT_VOLATILITY, 4);
  });

  it('moves the uncertain player more than the established one', () => {
    const veteran = { rating: 1500, rd: 60, volatility: 0.06 };
    const rookie = { rating: 1500, rd: 350, volatility: 0.06 };
    const { winner, loser } = rateMatch(veteran, rookie);
    expect(winner.rating - 1500).toBeLessThan(1500 - loser.rating);
  });

  it('shrinks both players’ RD', () => {
    const a = { rating: 1600, rd: 200, volatility: 0.06 };
    const b = { rating: 1400, rd: 150, volatility: 0.06 };
    const { winner, loser } = rateMatch(a, b);
    expect(winner.rd).toBeLessThan(200);
    expect(loser.rd).toBeLessThan(150);
  });

  it('pays little for an expected win and a lot for a surprise', () => {
    const strong = { rating: 1900, rd: 80, volatility: 0.06 };
    const weak = { rating: 1200, rd: 80, volatility: 0.06 };
    const expectedWin = rateMatch(strong, weak).winner.rating - strong.rating;
    const surpriseWin = rateMatch(weak, strong).winner.rating - weak.rating;
    expect(expectedWin).toBeLessThan(2);
    expect(surpriseWin).toBeGreaterThan(20);
  });
});

describe('isUpset', () => {
  const established = (rating: number) => ({ rating, rd: 80 });

  it('is false without snapshots', () => {
    expect(
      isUpset({
        winnerRatingBefore: null,
        winnerRdBefore: null,
        loserRatingBefore: null,
        loserRdBefore: null,
      }),
    ).toBe(false);
  });

  it('is true when a heavy underdog wins', () => {
    expect(
      isUpset({
        winnerRatingBefore: 1300,
        winnerRdBefore: 80,
        loserRatingBefore: 1700,
        loserRdBefore: 80,
      }),
    ).toBe(true);
  });

  it('is false when the favorite wins', () => {
    expect(
      isUpset({
        winnerRatingBefore: 1700,
        winnerRdBefore: 80,
        loserRatingBefore: 1300,
        loserRdBefore: 80,
      }),
    ).toBe(false);
  });

  it('matches the documented probability threshold', () => {
    // Find a pairing whose win prob straddles the threshold and check both sides.
    const winner = established(1450);
    const justFavoredEnough = established(1500);
    const prob = expectedScore(winner, justFavoredEnough);
    expect(
      isUpset({
        winnerRatingBefore: winner.rating,
        winnerRdBefore: winner.rd,
        loserRatingBefore: justFavoredEnough.rating,
        loserRdBefore: justFavoredEnough.rd,
      }),
    ).toBe(prob < UPSET_PROBABILITY);
  });
});

describe('daysBetween', () => {
  it('is 0 for a null start', () => {
    expect(daysBetween(null, new Date())).toBe(0);
  });

  it('converts elapsed time to fractional days', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-03T12:00:00Z');
    expect(daysBetween(from, to)).toBeCloseTo(2.5, 10);
  });

  it('clamps negative intervals to 0', () => {
    const from = new Date('2026-01-02T00:00:00Z');
    const to = new Date('2026-01-01T00:00:00Z');
    expect(daysBetween(from, to)).toBe(0);
  });
});
