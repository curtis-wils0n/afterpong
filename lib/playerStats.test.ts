import { describe, it, expect } from 'vitest';
import { computePlayerRecordStats, type PlayerStatsMatch } from './playerStats.js';

// Original per-player, 3-pass implementation (pre-refactor), used here only
// as an oracle to check the single-pass version against random match logs.
function bruteForceStats(playerId: number, allMatches: PlayerStatsMatch[]) {
  let wins = 0;
  let losses = 0;
  for (const m of allMatches) {
    if (m.winnerId === playerId) wins++;
    if (m.loserId === playerId) losses++;
  }

  let defenses = 0;
  for (const m of allMatches) {
    if (!m.isChallenge) continue;
    if (m.winnerId !== playerId && m.loserId !== playerId) continue;
    if (m.winnerRankBefore == null || m.loserRankBefore == null) continue;
    const playerIsWinner = m.winnerId === playerId;
    const defenderRank = Math.min(m.winnerRankBefore, m.loserRankBefore);
    const playerWasDefender = playerIsWinner
      ? m.winnerRankBefore === defenderRank
      : m.loserRankBefore === defenderRank;
    if (playerWasDefender && playerIsWinner) {
      defenses++;
    } else if (!playerWasDefender && !playerIsWinner) {
      continue;
    } else {
      break;
    }
  }

  let challengeStreak = 0;
  for (const m of allMatches) {
    if (!m.isChallenge) continue;
    if (m.winnerId !== playerId && m.loserId !== playerId) continue;
    if (m.winnerRankBefore == null || m.loserRankBefore == null) continue;
    const playerIsWinner = m.winnerId === playerId;
    const defenderRank = Math.min(m.winnerRankBefore, m.loserRankBefore);
    const playerWasChallenger = playerIsWinner
      ? m.winnerRankBefore !== defenderRank
      : m.loserRankBefore !== defenderRank;
    if (playerWasChallenger && playerIsWinner) {
      challengeStreak++;
    } else if (playerWasChallenger && !playerIsWinner) {
      break;
    } else {
      continue;
    }
  }

  return { wins, losses, defenses, challengeStreak };
}

function randomMatches(playerCount: number, matchCount: number, seed: number): PlayerStatsMatch[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const matches: PlayerStatsMatch[] = [];
  for (let i = 0; i < matchCount; i++) {
    const a = 1 + Math.floor(rand() * playerCount);
    let b = 1 + Math.floor(rand() * playerCount);
    while (b === a) b = 1 + Math.floor(rand() * playerCount);
    const isChallenge = rand() < 0.6;
    const winnerFirst = rand() < 0.5;
    // challengeRank is unique per player, so the two ranks in a real match
    // are never equal — pick distinct values to match that invariant.
    const rankA = 1 + Math.floor(rand() * 5);
    let rankB = 1 + Math.floor(rand() * 5);
    while (rankB === rankA) rankB = 1 + Math.floor(rand() * 5);
    matches.push({
      winnerId: winnerFirst ? a : b,
      loserId: winnerFirst ? b : a,
      isChallenge,
      winnerRankBefore: isChallenge ? (winnerFirst ? rankA : rankB) : null,
      loserRankBefore: isChallenge ? (winnerFirst ? rankB : rankA) : null,
    });
  }
  // Newest-first, matching the API's `orderBy(desc(createdAt))`.
  return matches.reverse();
}

describe('computePlayerRecordStats', () => {
  it('matches the brute-force per-player computation across random match logs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const matches = randomMatches(6, 40, seed);
      const result = computePlayerRecordStats(matches);
      for (let playerId = 1; playerId <= 6; playerId++) {
        const expected = bruteForceStats(playerId, matches);
        const actual = result.get(playerId) ?? { wins: 0, losses: 0, defenses: 0, challengeStreak: 0 };
        expect(actual, `seed=${seed} player=${playerId}`).toEqual(expected);
      }
    }
  });

  it('counts play-ins: the unplaced player (null rank) is the challenger', () => {
    // Newest-first: player 3 (rank 12) defends against unplaced player 4,
    // then unplaced player 1 beats rank-13 player 2 (play-in win).
    const matches: PlayerStatsMatch[] = [
      { winnerId: 3, loserId: 4, isChallenge: true, winnerRankBefore: 12, loserRankBefore: null },
      { winnerId: 1, loserId: 2, isChallenge: true, winnerRankBefore: null, loserRankBefore: 13 },
    ];
    const result = computePlayerRecordStats(matches);
    expect(result.get(1)).toEqual({ wins: 1, losses: 0, defenses: 0, challengeStreak: 1 });
    expect(result.get(2)).toEqual({ wins: 0, losses: 1, defenses: 0, challengeStreak: 0 });
    expect(result.get(3)).toEqual({ wins: 1, losses: 0, defenses: 1, challengeStreak: 0 });
    expect(result.get(4)).toEqual({ wins: 0, losses: 1, defenses: 0, challengeStreak: 0 });
  });
});
