import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db/index.js';
import { players, matches } from '../../db/schema.js';
import { asc } from 'drizzle-orm';
import { isUpset } from '../../lib/elo.js';
import {
  computeNemesis,
  computeRival,
  computeFriend,
} from '../../lib/badges.js';
import { requireAuth } from '../_lib/auth.js';

type PlayerRef = { id: number; name: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const role = await requireAuth(req, res);
  if (!role) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [allPlayers, allMatches] = await Promise.all([
    db.select().from(players),
    db.select().from(matches).orderBy(asc(matches.createdAt)),
  ]);

  const playerMap = new Map<number, PlayerRef>(
    allPlayers.map((p) => [p.id, { id: p.id, name: p.name }]),
  );
  const getRef = (id: number): PlayerRef =>
    playerMap.get(id) ?? { id, name: `Player #${id}` };

  // Per-player accumulators
  type StreakMatchRef = {
    opponentId: number;
    playerScore: number | null;
    opponentScore: number | null;
    date: string;
  };
  type PlayerAcc = {
    currentElo: number;
    peakElo: number;
    peakDate: string;
    minElo: number;
    currentWinStreak: number;
    currentLossStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
    currentWinStreakStart: string | null;
    currentWinStreakMatches: StreakMatchRef[];
    longestWinStreakStart: string | null;
    longestWinStreakEnd: string | null;
    longestWinStreakMatches: StreakMatchRef[];
    currentLossStreakStart: string | null;
    currentLossStreakMatches: StreakMatchRef[];
    longestLossStreakStart: string | null;
    longestLossStreakEnd: string | null;
    longestLossStreakMatches: StreakMatchRef[];
    climbs: number;
    defenses: number;
    upsetsCaused: number;
    wins: number;
    losses: number;
  };

  const acc = new Map<number, PlayerAcc>();
  const eloHistory = new Map<number, { t: string; elo: number }[]>();
  // Per-player daily start/end ELO, keyed by Mountain-time day (YYYY-MM-DD).
  // Updated as matches are processed in chronological order, so endElo lands
  // on the last match of the day.
  type DailyAcc = { day: string; startElo: number; endElo: number };
  const dailyByPlayer = new Map<number, Map<string, DailyAcc>>();
  const mtDayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (const p of allPlayers) {
    acc.set(p.id, {
      currentElo: 1000,
      peakElo: 1000,
      peakDate: p.createdAt.toISOString(),
      minElo: 1000,
      currentWinStreak: 0,
      currentLossStreak: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      currentWinStreakStart: null,
      currentWinStreakMatches: [],
      longestWinStreakStart: null,
      longestWinStreakEnd: null,
      longestWinStreakMatches: [],
      currentLossStreakStart: null,
      currentLossStreakMatches: [],
      longestLossStreakStart: null,
      longestLossStreakEnd: null,
      longestLossStreakMatches: [],
      climbs: 0,
      defenses: 0,
      upsetsCaused: 0,
      wins: 0,
      losses: 0,
    });
    eloHistory.set(p.id, [{ t: p.createdAt.toISOString(), elo: 1000 }]);
  }

  // Rivalry pair map
  const pairMap = new Map<
    string,
    { p1Id: number; p2Id: number; p1Wins: number; p2Wins: number }
  >();

  let biggestUpsetGain = -Infinity;
  const biggestUpsetMatches: (typeof allMatches)[number][] = [];

  // Single chronological pass
  for (const m of allMatches) {
    const winner = acc.get(m.winnerId);
    const loser = acc.get(m.loserId);
    if (!winner || !loser) continue;

    // Update ELO
    const winnerEloBefore = winner.currentElo;
    const loserEloBefore = loser.currentElo;
    winner.currentElo += m.winnerEloChange;
    loser.currentElo += m.loserEloChange;

    const ts = m.createdAt.toISOString();
    eloHistory.get(m.winnerId)!.push({ t: ts, elo: winner.currentElo });
    eloHistory.get(m.loserId)!.push({ t: ts, elo: loser.currentElo });

    // Daily start/end ELO buckets (Mountain-time day)
    const mtDay = mtDayFmt.format(m.createdAt);
    for (const [pid, before, after] of [
      [m.winnerId, winnerEloBefore, winner.currentElo],
      [m.loserId, loserEloBefore, loser.currentElo],
    ] as const) {
      let dayMap = dailyByPlayer.get(pid);
      if (!dayMap) {
        dayMap = new Map();
        dailyByPlayer.set(pid, dayMap);
      }
      const existing = dayMap.get(mtDay);
      if (!existing) {
        dayMap.set(mtDay, { day: mtDay, startElo: before, endElo: after });
      } else {
        existing.endElo = after;
      }
    }

    // Track peak and min
    if (winner.currentElo > winner.peakElo) {
      winner.peakElo = winner.currentElo;
      winner.peakDate = m.createdAt.toISOString();
    }
    if (loser.currentElo < loser.minElo) {
      loser.minElo = loser.currentElo;
    }
    if (winner.currentElo < winner.minElo) {
      winner.minElo = winner.currentElo;
    }
    if (loser.currentElo > loser.peakElo) {
      loser.peakElo = loser.currentElo;
      loser.peakDate = m.createdAt.toISOString();
    }

    // Win/loss counters
    winner.wins += 1;
    loser.losses += 1;

    // Streaks
    if (winner.currentWinStreak === 0) {
      winner.currentWinStreakStart = ts;
      winner.currentWinStreakMatches = [];
    }
    winner.currentWinStreakMatches.push({
      opponentId: m.loserId,
      playerScore: m.winnerScore,
      opponentScore: m.loserScore,
      date: ts,
    });
    winner.currentWinStreak += 1;
    if (winner.currentWinStreak > winner.longestWinStreak) {
      winner.longestWinStreak = winner.currentWinStreak;
      winner.longestWinStreakStart = winner.currentWinStreakStart;
      winner.longestWinStreakEnd = ts;
      winner.longestWinStreakMatches = [...winner.currentWinStreakMatches];
    }
    winner.currentLossStreak = 0;
    winner.currentLossStreakStart = null;
    winner.currentLossStreakMatches = [];

    if (loser.currentLossStreak === 0) {
      loser.currentLossStreakStart = ts;
      loser.currentLossStreakMatches = [];
    }
    loser.currentLossStreakMatches.push({
      opponentId: m.winnerId,
      playerScore: m.loserScore,
      opponentScore: m.winnerScore,
      date: ts,
    });
    loser.currentLossStreak += 1;
    if (loser.currentLossStreak > loser.longestLossStreak) {
      loser.longestLossStreak = loser.currentLossStreak;
      loser.longestLossStreakStart = loser.currentLossStreakStart;
      loser.longestLossStreakEnd = ts;
      loser.longestLossStreakMatches = [...loser.currentLossStreakMatches];
    }
    loser.currentWinStreak = 0;
    loser.currentWinStreakStart = null;
    loser.currentWinStreakMatches = [];

    // Upsets caused
    if (isUpset(m)) {
      winner.upsetsCaused += 1;
    }

    // Challenge ladder stats
    if (
      m.isChallenge &&
      m.winnerRankBefore != null &&
      m.loserRankBefore != null
    ) {
      // Challenger is the lower-ranked (higher rank number) player
      if (m.winnerRankBefore > m.loserRankBefore) {
        winner.climbs += 1;
      } else {
        winner.defenses += 1;
      }
    }

    // Biggest upset (collect all matches tied at the max ELO gain)
    if (m.winnerEloChange > biggestUpsetGain) {
      biggestUpsetGain = m.winnerEloChange;
      biggestUpsetMatches.length = 0;
      biggestUpsetMatches.push(m);
    } else if (m.winnerEloChange === biggestUpsetGain) {
      biggestUpsetMatches.push(m);
    }

    // Rivalry
    const lo = Math.min(m.winnerId, m.loserId);
    const hi = Math.max(m.winnerId, m.loserId);
    const key = `${lo}-${hi}`;
    let pair = pairMap.get(key);
    if (!pair) {
      pair = { p1Id: lo, p2Id: hi, p1Wins: 0, p2Wins: 0 };
      pairMap.set(key, pair);
    }
    if (m.winnerId === pair.p1Id) pair.p1Wins += 1;
    else pair.p2Wins += 1;
  }

  // Build per-player h2h structures so we can run the badge helpers.
  const playerH2H = new Map<
    number,
    { matches: typeof allMatches; h2h: { opponentId: number; wins: number; losses: number }[] }
  >();
  for (const p of allPlayers) {
    const playerMatches = allMatches.filter(
      (m) => m.winnerId === p.id || m.loserId === p.id,
    );
    const h2hMap = new Map<number, { wins: number; losses: number }>();
    for (const m of playerMatches) {
      const opponentId = m.winnerId === p.id ? m.loserId : m.winnerId;
      const won = m.winnerId === p.id;
      const rec = h2hMap.get(opponentId) ?? { wins: 0, losses: 0 };
      if (won) rec.wins += 1;
      else rec.losses += 1;
      h2hMap.set(opponentId, rec);
    }
    const h2h = [...h2hMap.entries()].map(([opponentId, rec]) => ({
      opponentId,
      ...rec,
    }));
    playerH2H.set(p.id, { matches: playerMatches, h2h });
  }

  // Count badge designations per opponent and track who designated whom.
  const friendCounts = new Map<number, number>();
  const nemesisCounts = new Map<number, number>();
  const rivalCounts = new Map<number, number>();
  const friendOf = new Map<number, number[]>();
  const nemesisOf = new Map<number, number[]>();
  const rivalOf = new Map<number, number[]>();

  const addSubject = (
    map: Map<number, number[]>,
    targetId: number,
    subjectId: number,
  ) => {
    const list = map.get(targetId);
    if (list) list.push(subjectId);
    else map.set(targetId, [subjectId]);
  };

  for (const p of allPlayers) {
    const data = playerH2H.get(p.id)!;
    const nemesisId = computeNemesis(p.id, data.matches, data.h2h);
    const rivalId = computeRival(data.h2h);
    const friendId = computeFriend(data.h2h);

    if (nemesisId !== null) {
      nemesisCounts.set(nemesisId, (nemesisCounts.get(nemesisId) ?? 0) + 1);
      addSubject(nemesisOf, nemesisId, p.id);
    }
    if (rivalId !== null) {
      rivalCounts.set(rivalId, (rivalCounts.get(rivalId) ?? 0) + 1);
      addSubject(rivalOf, rivalId, p.id);
    }
    if (friendId !== null) {
      friendCounts.set(friendId, (friendCounts.get(friendId) ?? 0) + 1);
      addSubject(friendOf, friendId, p.id);
    }
  }

  // Reduce to the stats
  // Collect all players tied at the maximum score
  const pickAllMax = (
    items: typeof allPlayers,
    score: (p: (typeof allPlayers)[number]) => number,
  ): { players: PlayerRef[]; score: number } | null => {
    let bestScore = -Infinity;
    const winners: PlayerRef[] = [];
    for (const item of items) {
      const s = score(item);
      if (s > bestScore) {
        bestScore = s;
        winners.length = 0;
        winners.push(getRef(item.id));
      } else if (s === bestScore) {
        winners.push(getRef(item.id));
      }
    }
    if (winners.length === 0) return null;
    return { players: winners, score: bestScore };
  };

  const playerList = allPlayers;

  const currentWin = pickAllMax(playerList, (p) => acc.get(p.id)!.currentWinStreak);
  const longestWin = pickAllMax(playerList, (p) => acc.get(p.id)!.longestWinStreak);
  const currentLoss = pickAllMax(
    playerList,
    (p) => acc.get(p.id)!.currentLossStreak,
  );
  const longestLoss = pickAllMax(
    playerList,
    (p) => acc.get(p.id)!.longestLossStreak,
  );
  const mostUpsets = pickAllMax(playerList, (p) => acc.get(p.id)!.upsetsCaused);
  const mostClimbs = pickAllMax(playerList, (p) => acc.get(p.id)!.climbs);
  const mostFriendly = pickAllMax(playerList, (p) => friendCounts.get(p.id) ?? 0);
  const biggestVillain = pickAllMax(
    playerList,
    (p) => nemesisCounts.get(p.id) ?? 0,
  );
  const biggestOp = pickAllMax(playerList, (p) => rivalCounts.get(p.id) ?? 0);
  const bestDefender = pickAllMax(playerList, (p) => acc.get(p.id)!.defenses);
  const peak = pickAllMax(playerList, (p) => acc.get(p.id)!.peakElo);
  const currentTop = pickAllMax(playerList, (p) => acc.get(p.id)!.currentElo);
  // Win-rate stat requires a minimum match count so a single lucky win
  // doesn't crown someone at 100%.
  const MIN_WIN_RATE_MATCHES = 10;
  const highWinRate = pickAllMax(playerList, (p) => {
    const a = acc.get(p.id)!;
    const total = a.wins + a.losses;
    if (total < MIN_WIN_RATE_MATCHES) return -1;
    return a.wins / total;
  });
  const climber = pickAllMax(playerList, (p) => {
    const a = acc.get(p.id)!;
    return a.currentElo - a.minElo;
  });
  const faller = pickAllMax(playerList, (p) => {
    const a = acc.get(p.id)!;
    return a.peakElo - a.currentElo;
  });

  type DailyEntry = {
    player: PlayerRef;
    day: string;
    from: number;
    to: number;
  };
  let bestDailyClimb = 0;
  const dailyClimbEntries: DailyEntry[] = [];
  let bestDailyFall = 0;
  const dailyFallEntries: DailyEntry[] = [];
  for (const [pid, days] of dailyByPlayer) {
    for (const d of days.values()) {
      const delta = d.endElo - d.startElo;
      if (delta > 0) {
        if (delta > bestDailyClimb) {
          bestDailyClimb = delta;
          dailyClimbEntries.length = 0;
          dailyClimbEntries.push({
            player: getRef(pid),
            day: d.day,
            from: d.startElo,
            to: d.endElo,
          });
        } else if (delta === bestDailyClimb) {
          dailyClimbEntries.push({
            player: getRef(pid),
            day: d.day,
            from: d.startElo,
            to: d.endElo,
          });
        }
      } else if (delta < 0) {
        const fall = -delta;
        if (fall > bestDailyFall) {
          bestDailyFall = fall;
          dailyFallEntries.length = 0;
          dailyFallEntries.push({
            player: getRef(pid),
            day: d.day,
            from: d.startElo,
            to: d.endElo,
          });
        } else if (fall === bestDailyFall) {
          dailyFallEntries.push({
            player: getRef(pid),
            day: d.day,
            from: d.startElo,
            to: d.endElo,
          });
        }
      }
    }
  }
  const biggestDailyClimber =
    bestDailyClimb > 0
      ? { entries: dailyClimbEntries, climb: bestDailyClimb }
      : null;
  const biggestDailyFaller =
    bestDailyFall > 0
      ? { entries: dailyFallEntries, fall: bestDailyFall }
      : null;

  // Biggest rivalry and dominator
  // Score `total - TIGHTNESS_GAP_WEIGHT * gap` rewards larger sample sizes
  // while penalizing imbalance, so 9-8 (score 14) outranks 4-4 (score 8) but
  // loses to 7-7 (score 14, tie-broken by gap → 7-7 wins).
  const TIGHTNESS_GAP_WEIGHT = 3;

  let biggestMatches = -Infinity;
  const biggestPairs: { p1: PlayerRef; p2: PlayerRef }[] = [];
  let maxGap = -Infinity;
  const dominatorPairs: {
    dominator: PlayerRef;
    victim: PlayerRef;
    wins: number;
    losses: number;
  }[] = [];
  let tightestScore = -Infinity;
  let tightestGap = Infinity;
  const tightestPairs: { leader: PlayerRef; trailer: PlayerRef }[] = [];
  let tightestWins = 0;
  let tightestLosses = 0;

  for (const pair of pairMap.values()) {
    const total = pair.p1Wins + pair.p2Wins;
    const gap = Math.abs(pair.p1Wins - pair.p2Wins);
    const wins = Math.max(pair.p1Wins, pair.p2Wins);
    const losses = Math.min(pair.p1Wins, pair.p2Wins);
    const leaderSide = pair.p1Wins >= pair.p2Wins ? pair.p1Id : pair.p2Id;
    const trailerSide = pair.p1Wins >= pair.p2Wins ? pair.p2Id : pair.p1Id;

    // Biggest rivalry: most total matches.
    if (total > biggestMatches) {
      biggestMatches = total;
      biggestPairs.length = 0;
      biggestPairs.push({ p1: getRef(pair.p1Id), p2: getRef(pair.p2Id) });
    } else if (total === biggestMatches) {
      biggestPairs.push({ p1: getRef(pair.p1Id), p2: getRef(pair.p2Id) });
    }

    // Dominator: largest absolute win gap. Records may differ across ties
    // (e.g. 5-0 and 7-2 both have gap 5).
    if (pair.p1Wins !== pair.p2Wins) {
      if (gap > maxGap) {
        maxGap = gap;
        dominatorPairs.length = 0;
        dominatorPairs.push({
          dominator: getRef(leaderSide),
          victim: getRef(trailerSide),
          wins,
          losses,
        });
      } else if (gap === maxGap) {
        dominatorPairs.push({
          dominator: getRef(leaderSide),
          victim: getRef(trailerSide),
          wins,
          losses,
        });
      }
    }

    // Tightest rivalry: max score, tie-break on smaller gap. After both
    // tie-breakers, all tied pairs share the same wins/losses record.
    const score = total - TIGHTNESS_GAP_WEIGHT * gap;
    if (score > tightestScore || (score === tightestScore && gap < tightestGap)) {
      tightestScore = score;
      tightestGap = gap;
      tightestWins = wins;
      tightestLosses = losses;
      tightestPairs.length = 0;
      tightestPairs.push({
        leader: getRef(leaderSide),
        trailer: getRef(trailerSide),
      });
    } else if (score === tightestScore && gap === tightestGap) {
      tightestPairs.push({
        leader: getRef(leaderSide),
        trailer: getRef(trailerSide),
      });
    }
  }

  const biggestRivalry =
    biggestPairs.length > 0
      ? { pairs: biggestPairs, matches: biggestMatches }
      : null;
  const dominator =
    dominatorPairs.length > 0
      ? { pairs: dominatorPairs, gap: maxGap }
      : null;
  const tightestRivalry =
    tightestPairs.length > 0
      ? {
          pairs: tightestPairs,
          wins: tightestWins,
          losses: tightestLosses,
        }
      : null;

  // Wrap multi-player count stats (null when score is 0)
  const wrapCount = (
    best: { players: PlayerRef[]; score: number } | null,
  ): { players: PlayerRef[]; count: number } | null => {
    if (!best || best.score <= 0) return null;
    return { players: best.players, count: best.score };
  };

  type StreakKind = 'currentWin' | 'longestWin' | 'currentLoss' | 'longestLoss';
  const wrapStreak = (
    best: { players: PlayerRef[]; score: number } | null,
    kind: StreakKind,
  ) => {
    if (!best || best.score <= 0) return null;
    return {
      entries: best.players.map((pl) => {
        const a = acc.get(pl.id)!;
        const start =
          kind === 'currentWin'
            ? a.currentWinStreakStart
            : kind === 'longestWin'
              ? a.longestWinStreakStart
              : kind === 'currentLoss'
                ? a.currentLossStreakStart
                : a.longestLossStreakStart;
        const end =
          kind === 'longestWin'
            ? a.longestWinStreakEnd
            : kind === 'longestLoss'
              ? a.longestLossStreakEnd
              : null;
        const matches =
          kind === 'currentWin'
            ? a.currentWinStreakMatches
            : kind === 'longestWin'
              ? a.longestWinStreakMatches
              : kind === 'currentLoss'
                ? a.currentLossStreakMatches
                : a.longestLossStreakMatches;
        return {
          player: pl,
          startDate: start ?? '',
          ...(end ? { endDate: end } : {}),
          matches: matches.map((mm) => ({
            opponent: getRef(mm.opponentId),
            playerScore: mm.playerScore,
            opponentScore: mm.opponentScore,
            date: mm.date,
          })),
        };
      }),
      count: best.score,
    };
  };

  // Head-to-head record of `aId` against `bId` (a's wins/losses vs b).
  const h2hVs = (aId: number, bId: number): { wins: number; losses: number } => {
    const e = playerH2H.get(aId)?.h2h.find((x) => x.opponentId === bId);
    return { wins: e?.wins ?? 0, losses: e?.losses ?? 0 };
  };

  // Net ELO `drainerId` has taken off `victimId` across their matchups.
  const eloDrainedFrom = (drainerId: number, victimId: number): number => {
    const data = playerH2H.get(victimId);
    if (!data) return 0;
    const net = data.matches
      .filter((m) => m.winnerId === drainerId || m.loserId === drainerId)
      .reduce(
        (sum, m) =>
          sum + (m.winnerId === victimId ? m.winnerEloChange : m.loserEloChange),
        0,
      );
    return Math.max(0, -net);
  };

  // Wrap relationship stats with the players who chose each winner, enriched
  // with the pairwise metric and sorted strongest-first.
  const wrapRelationship = <D extends object>(
    best: { players: PlayerRef[]; score: number } | null,
    fromMap: Map<number, number[]>,
    detailFor: (winnerId: number, subjectId: number) => D,
    sortKey: (detail: D) => number,
  ):
    | {
        entries: { player: PlayerRef; with: (D & { player: PlayerRef })[] }[];
        count: number;
      }
    | null => {
    if (!best || best.score <= 0) return null;
    return {
      entries: best.players.map((pl) => ({
        player: pl,
        with: (fromMap.get(pl.id) ?? [])
          .map((subjectId) => ({
            player: getRef(subjectId),
            ...detailFor(pl.id, subjectId),
          }))
          .sort((a, b) => sortKey(b) - sortKey(a)),
      })),
      count: best.score,
    };
  };

  const response = {
    streaks: {
      currentWinStreak: wrapStreak(currentWin, 'currentWin'),
      longestWinStreak: wrapStreak(longestWin, 'longestWin'),
      currentLossStreak: wrapStreak(currentLoss, 'currentLoss'),
      longestLossStreak: wrapStreak(longestLoss, 'longestLoss'),
    },
    matches: {
      biggestUpset:
        biggestUpsetMatches.length > 0
          ? {
              entries: biggestUpsetMatches.map((m) => ({
                winner: getRef(m.winnerId),
                loser: getRef(m.loserId),
                matchDate: m.createdAt.toISOString(),
              })),
              eloGain: biggestUpsetGain,
            }
          : null,
      mostUpsetsCaused: wrapCount(mostUpsets),
      highestWinRate:
        highWinRate && highWinRate.score >= 0
          ? {
              entries: highWinRate.players.map((pl) => ({
                player: pl,
                wins: acc.get(pl.id)!.wins,
                losses: acc.get(pl.id)!.losses,
              })),
              rate: highWinRate.score,
            }
          : null,
    },
    players: {
      peakElo:
        peak && peak.score > 1000
          ? {
              players: peak.players,
              elo: peak.score,
            }
          : null,
      currentTopElo:
        currentTop && currentTop.score > 1000
          ? {
              players: currentTop.players,
              elo: currentTop.score,
            }
          : null,
      biggestClimber:
        climber && climber.score > 0
          ? {
              entries: climber.players.map((pl) => ({
                player: pl,
                from: acc.get(pl.id)!.minElo,
                to: acc.get(pl.id)!.currentElo,
              })),
              climb: climber.score,
            }
          : null,
      biggestFaller:
        faller && faller.score > 0
          ? {
              entries: faller.players.map((pl) => ({
                player: pl,
                from: acc.get(pl.id)!.peakElo,
                to: acc.get(pl.id)!.currentElo,
              })),
              fall: faller.score,
            }
          : null,
      biggestDailyClimber,
      biggestDailyFaller,
    },
    ladder: {
      mostSuccessfulClimbs: wrapCount(mostClimbs),
      bestDefender: wrapCount(bestDefender),
    },
    rivalries: {
      biggestRivalry,
      dominator,
      tightestRivalry,
    },
    relationships: {
      // Most matches played together first.
      mostFriendly: wrapRelationship(
        mostFriendly,
        friendOf,
        (winnerId, subjectId) => {
          const { wins, losses } = h2hVs(winnerId, subjectId);
          return { matches: wins + losses };
        },
        (d) => d.matches,
      ),
      // Most ELO drained first.
      biggestVillain: wrapRelationship(
        biggestVillain,
        nemesisOf,
        (winnerId, subjectId) => ({
          eloDrained: eloDrainedFrom(winnerId, subjectId),
        }),
        (d) => d.eloDrained,
      ),
      // Closest rivalry first (computeRival's tightness score: total - 3·gap).
      biggestOp: wrapRelationship(
        biggestOp,
        rivalOf,
        (winnerId, subjectId) => h2hVs(winnerId, subjectId),
        (d) => d.wins + d.losses - 3 * Math.abs(d.wins - d.losses),
      ),
    },
    eloHistory: {
      players: allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        points: eloHistory.get(p.id) ?? [],
      })),
    },
  };

  return res.json(response);
}
