// Shared logic for nemesis / rival / friend badges, used by both the player
// profile UI and the stats API. The semantics here are the source of truth.

export interface H2HEntry {
  opponentId: number;
  wins: number; // wins by the subject player
  losses: number;
}

export interface BadgeMatch {
  winnerId: number;
  loserId: number;
  winnerEloChange: number;
  loserEloChange: number;
}

// Nemesis: opponent who has taken the most ELO from you (most negative net).
// Returns null if no opponent has a negative net against you.
export function computeNemesis(
  playerId: number,
  matches: BadgeMatch[],
  h2h: H2HEntry[],
): number | null {
  let nemesisId: number | null = null;
  let worstNet = 0;
  for (const entry of h2h) {
    const net = matches
      .filter(
        (m) =>
          m.winnerId === entry.opponentId || m.loserId === entry.opponentId,
      )
      .reduce(
        (sum, m) =>
          sum + (m.winnerId === playerId ? m.winnerEloChange : m.loserEloChange),
        0,
      );
    if (net < worstNet) {
      worstNet = net;
      nemesisId = entry.opponentId;
    }
  }
  return nemesisId;
}

// Rival: tightest head-to-head, scored as `total - 3 * |gap|`. Larger
// samples win even with small imbalance (9-8 beats 4-4), but one-sided
// matchups are heavily penalized (5-0 scores -10, loses to a single 1-1).
// Tie-break: smaller gap, then lowest opponent id.
const RIVAL_GAP_WEIGHT = 3;
export function computeRival(h2h: H2HEntry[]): number | null {
  if (h2h.length === 0) return null;

  let best: {
    id: number;
    score: number;
    gap: number;
  } | null = null;
  for (const h of h2h) {
    const total = h.wins + h.losses;
    const gap = Math.abs(h.wins - h.losses);
    const score = total - RIVAL_GAP_WEIGHT * gap;
    if (
      !best ||
      score > best.score ||
      (score === best.score && gap < best.gap) ||
      (score === best.score && gap === best.gap && h.opponentId < best.id)
    ) {
      best = { id: h.opponentId, score, gap };
    }
  }
  return best?.id ?? null;
}

// Friend: most total games played together, tiebreak by lowest opponent id.
export function computeFriend(h2h: H2HEntry[]): number | null {
  let friendId: number | null = null;
  let maxGames = -1;
  for (const entry of h2h) {
    const g = entry.wins + entry.losses;
    if (
      g > maxGames ||
      (g === maxGames && (friendId === null || entry.opponentId < friendId))
    ) {
      maxGames = g;
      friendId = entry.opponentId;
    }
  }
  return friendId;
}
