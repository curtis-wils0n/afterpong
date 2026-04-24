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

// Rival: smallest win/loss gap; prefer opponents who have both beaten you
// and whom you have beaten; tie-break by most games at that gap, then lowest id.
// Requires at least 2 total games against the opponent.
export function computeRival(h2h: H2HEntry[]): number | null {
  const candidates = h2h
    .map((h) => ({
      id: h.opponentId,
      wins: h.wins,
      losses: h.losses,
      games: h.wins + h.losses,
      diff: Math.abs(h.wins - h.losses),
    }))
    .filter((h) => h.games >= 2);

  if (candidates.length === 0) return null;

  let pool = candidates.filter((h) => h.wins >= 1 && h.losses >= 1);
  if (pool.length === 0) pool = candidates;

  let best = pool[0]!;
  for (const h of pool) {
    if (h.diff < best.diff) best = h;
    else if (h.diff === best.diff && h.games > best.games) best = h;
    else if (h.diff === best.diff && h.games === best.games && h.id < best.id)
      best = h;
  }
  return best.id;
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
