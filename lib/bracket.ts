// Single-elimination bracket helpers, shared between API and frontend preview.

export type Seeding = 'snake' | 'random';

export interface SeededParticipant {
  playerId: number;
  seed: number; // 1 = top seed
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard recursive bracket placement.
// For n=2 returns [1, 2]; for n=4 returns [1, 4, 2, 3]; for n=8 returns [1, 8, 4, 5, 2, 7, 3, 6].
// Take pairs of consecutive entries to get round 1 matchups.
export function generateBracketPositions(bracketSize: number): number[] {
  if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new Error('bracketSize must be a power of two ≥ 2');
  }
  if (bracketSize === 2) return [1, 2];
  const inner = generateBracketPositions(bracketSize / 2);
  const result: number[] = [];
  for (const s of inner) {
    result.push(s);
    result.push(bracketSize + 1 - s);
  }
  return result;
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Seeds the participants based on the chosen mode.
// Snake: ELO descending (highest ELO = seed 1).
// Random: shuffled order.
export function seedParticipants(
  players: { id: number; elo: number }[],
  seeding: Seeding,
): SeededParticipant[] {
  let ordered: { id: number; elo: number }[];
  if (seeding === 'snake') {
    ordered = [...players].sort((a, b) => b.elo - a.elo);
  } else {
    ordered = shuffle(players);
  }
  return ordered.map((p, i) => ({ playerId: p.id, seed: i + 1 }));
}

export interface BracketSlot {
  round: number; // 1-indexed
  position: number; // 0-indexed within round
  player1Seed: number | null; // null = bye phantom slot
  player2Seed: number | null;
}

// Generates the round-1 slots for a bracket. Higher rounds are computed by the caller
// (and start with both players null until a winner advances).
export function buildRoundOneSlots(
  participantCount: number,
): { bracketSize: number; slots: BracketSlot[]; totalRounds: number } {
  const bracketSize = nextPowerOfTwo(participantCount);
  const positions = generateBracketPositions(bracketSize);
  const slots: BracketSlot[] = [];
  for (let i = 0; i < positions.length; i += 2) {
    const player1Seed = positions[i] <= participantCount ? positions[i] : null;
    const player2Seed =
      positions[i + 1] <= participantCount ? positions[i + 1] : null;
    slots.push({
      round: 1,
      position: i / 2,
      player1Seed,
      player2Seed,
    });
  }
  const totalRounds = Math.log2(bracketSize);
  return { bracketSize, slots, totalRounds };
}
