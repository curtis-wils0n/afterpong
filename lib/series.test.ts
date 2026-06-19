import { describe, it, expect } from 'vitest';
import { inProgressGameProbability, seriesWinProbability } from './series.js';

describe('inProgressGameProbability', () => {
  it('reproduces the per-game probability from 0-0', () => {
    expect(inProgressGameProbability(0, 0, 11, 0.6)).toBeCloseTo(0.6, 3);
    expect(inProgressGameProbability(0, 0, 21, 0.6)).toBeCloseTo(0.6, 3);
    expect(inProgressGameProbability(0, 0, 11, 0.5)).toBeCloseTo(0.5, 3);
  });

  it('swings toward the player in the lead', () => {
    expect(inProgressGameProbability(8, 2, 11, 0.6)).toBeGreaterThan(0.9);
    expect(inProgressGameProbability(2, 8, 11, 0.6)).toBeLessThan(0.1);
  });

  it('is symmetric for an even baseline', () => {
    expect(inProgressGameProbability(5, 8, 11, 0.5)).toBeCloseTo(
      1 - inProgressGameProbability(8, 5, 11, 0.5),
      6,
    );
  });
});

describe('seriesWinProbability', () => {
  it('matches the per-game odds for a best-of-1', () => {
    expect(seriesWinProbability(0, 0, [0.6], 1)).toBeCloseTo(0.6, 6);
  });

  it('rewards the favorite more over a best-of-3', () => {
    // 3·0.36·0.4 + 0.216 = 0.648
    expect(seriesWinProbability(0, 0, [0.6, 0.6, 0.6], 2)).toBeCloseTo(0.648, 6);
  });

  it('folds in games already decided', () => {
    expect(seriesWinProbability(1, 0, [0.6, 0.6], 2)).toBeCloseTo(0.84, 6);
    expect(seriesWinProbability(0, 1, [0.6, 0.6], 2)).toBeCloseTo(0.36, 6);
  });

  it('returns a certainty once a side has clinched', () => {
    expect(seriesWinProbability(2, 0, [0.6], 2)).toBe(1);
    expect(seriesWinProbability(0, 2, [0.6], 2)).toBe(0);
  });
});
