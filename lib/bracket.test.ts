import { describe, it, expect } from 'vitest';
import {
  nextPowerOfTwo,
  generateBracketPositions,
  seedParticipants,
  buildRoundOneSlots,
} from './bracket.js';

describe('nextPowerOfTwo', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
  });
});

describe('generateBracketPositions', () => {
  it('produces standard 1-vs-N placement', () => {
    expect(generateBracketPositions(2)).toEqual([1, 2]);
    expect(generateBracketPositions(4)).toEqual([1, 4, 2, 3]);
    expect(generateBracketPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('rejects non-powers of two', () => {
    expect(() => generateBracketPositions(6)).toThrow();
  });
});

describe('seedParticipants', () => {
  it('snake-seeds by rating descending', () => {
    const seeded = seedParticipants(
      [
        { id: 1, rating: 1400 },
        { id: 2, rating: 1800 },
        { id: 3, rating: 1600 },
      ],
      'snake',
    );
    expect(seeded).toEqual([
      { playerId: 2, seed: 1 },
      { playerId: 3, seed: 2 },
      { playerId: 1, seed: 3 },
    ]);
  });
});

describe('buildRoundOneSlots', () => {
  it('gives byes to top seeds when the count is not a power of two', () => {
    const { bracketSize, slots, totalRounds } = buildRoundOneSlots(6);
    expect(bracketSize).toBe(8);
    expect(totalRounds).toBe(3);
    // Seed 1 and seed 2 face phantom (null) opponents.
    const seed1Slot = slots.find((s) => s.player1Seed === 1)!;
    const seed2Slot = slots.find((s) => s.player1Seed === 2)!;
    expect(seed1Slot.player2Seed).toBeNull();
    expect(seed2Slot.player2Seed).toBeNull();
  });
});
