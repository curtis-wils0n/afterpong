export interface PlayerStatsMatch {
  winnerId: number;
  loserId: number;
  isChallenge: boolean;
  winnerRankBefore: number | null;
  loserRankBefore: number | null;
}

export interface PlayerRecordStats {
  wins: number;
  losses: number;
  defenses: number;
  challengeStreak: number;
}

/**
 * Single chronological pass over matches (must be newest-first) building
 * per-player win/loss/defense-streak/challenge-streak accumulators. Replaces
 * doing 3 full scans of allMatches per player.
 */
export function computePlayerRecordStats(
  matches: PlayerStatsMatch[],
): Map<number, PlayerRecordStats> {
  const acc = new Map<
    number,
    PlayerRecordStats & { defenseStreakDone: boolean; challengeStreakDone: boolean }
  >();
  const getAcc = (id: number) => {
    let a = acc.get(id);
    if (!a) {
      a = { wins: 0, losses: 0, defenses: 0, challengeStreak: 0, defenseStreakDone: false, challengeStreakDone: false };
      acc.set(id, a);
    }
    return a;
  };

  for (const m of matches) {
    getAcc(m.winnerId).wins++;
    getAcc(m.loserId).losses++;

    if (!m.isChallenge || (m.winnerRankBefore == null && m.loserRankBefore == null)) continue;
    // The defender is the lower-ranked (better) player; in a play-in the
    // unplaced player (null rank) is always the challenger.
    const winnerWasDefender =
      m.winnerRankBefore != null &&
      (m.loserRankBefore == null || m.winnerRankBefore < m.loserRankBefore);

    const winnerAcc = getAcc(m.winnerId);
    const loserAcc = getAcc(m.loserId);

    if (winnerWasDefender) {
      // Defender won — defense streak continues. Challenger lost — their
      // challenge streak stops; no effect on their defense streak.
      if (!winnerAcc.defenseStreakDone) winnerAcc.defenses++;
      if (!loserAcc.challengeStreakDone) loserAcc.challengeStreakDone = true;
    } else {
      // Challenger (winner) won — their challenge streak continues, their
      // defense streak stops. Defender (loser) lost — their defense streak
      // stops; no effect on their challenge streak.
      if (!winnerAcc.challengeStreakDone) winnerAcc.challengeStreak++;
      if (!winnerAcc.defenseStreakDone) winnerAcc.defenseStreakDone = true;
      if (!loserAcc.defenseStreakDone) loserAcc.defenseStreakDone = true;
    }
  }

  const result = new Map<number, PlayerRecordStats>();
  for (const [id, { wins, losses, defenses, challengeStreak }] of acc) {
    result.set(id, { wins, losses, defenses, challengeStreak });
  }
  return result;
}
