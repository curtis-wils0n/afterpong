import { describe, it, expect } from 'vitest';
import {
  isScoredGame,
  gameWonByMatchWinner,
  hasPointScores,
  type GameScore,
} from './games.js';

const scored = (winnerScore: number, loserScore: number): GameScore => ({
  winnerScore,
  loserScore,
});
const scoreless = (wonByMatchWinner: boolean): GameScore => ({
  winnerScore: null,
  loserScore: null,
  wonByMatchWinner,
});

describe('isScoredGame', () => {
  it('detects scored and scoreless games', () => {
    expect(isScoredGame(scored(11, 7))).toBe(true);
    expect(isScoredGame(scoreless(true))).toBe(false);
  });
});

describe('gameWonByMatchWinner', () => {
  it('uses point scores when present', () => {
    expect(gameWonByMatchWinner(scored(11, 7))).toBe(true);
    expect(gameWonByMatchWinner(scored(7, 11))).toBe(false);
  });

  it('uses the explicit flag for scoreless games', () => {
    expect(gameWonByMatchWinner(scoreless(true))).toBe(true);
    expect(gameWonByMatchWinner(scoreless(false))).toBe(false);
  });
});

describe('hasPointScores', () => {
  it('is true when any game has a real score', () => {
    expect(hasPointScores([scoreless(true), scored(11, 9)])).toBe(true);
  });

  it('is false for scoreless series', () => {
    expect(hasPointScores([scoreless(true), scoreless(false)])).toBe(false);
  });

  it('treats sub-11 legacy placeholders (1-0, 2-1) as scoreless', () => {
    expect(hasPointScores([scored(1, 0)])).toBe(false);
    expect(hasPointScores([scored(2, 1)])).toBe(false);
    expect(hasPointScores([scored(11, 0)])).toBe(true);
    expect(hasPointScores([scored(12, 10)])).toBe(true);
  });
});
