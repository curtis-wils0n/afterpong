import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
} from 'recharts';
import { api } from '../lib/api';
import Tooltip from './Tooltip';
import type {
  StatsResponse,
  PlayerRef,
  StreakEntry,
  StreakMatch,
} from '../types';

function PlayerLink({ player }: { player: PlayerRef }) {
  return (
    <Link
      to={`/players/${player.id}`}
      className="hover:text-emerald-400 transition-colors"
    >
      {player.name}
    </Link>
  );
}

function PlayerLinks({ players }: { players: PlayerRef[] }) {
  return (
    <>
      {players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span className="text-slate-600">, </span>}
          <PlayerLink player={p} />
        </span>
      ))}
    </>
  );
}

function RelationshipSubjects<T extends { player: PlayerRef }>({
  subjects,
  tooltip,
}: {
  subjects: T[];
  tooltip: (subject: T) => React.ReactNode;
}) {
  return (
    <>
      {subjects.map((s, i) => (
        <span key={s.player.id}>
          {i > 0 && <span className="text-slate-600">, </span>}
          <Tooltip align="center" widthClass="w-max max-w-[16rem]" content={tooltip(s)}>
            <PlayerLink player={s.player} />
          </Tooltip>
        </span>
      ))}
    </>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  tooltip,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  valueClass?: string;
  tooltip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-4">
      {tooltip && (
        <span className="absolute top-2 right-2">
          <Tooltip content={tooltip}>
            <button
              type="button"
              tabIndex={0}
              aria-label={tooltip}
              className="w-4 h-4 flex items-center justify-center rounded-full bg-slate-700/50 text-slate-500 hover:text-slate-300 text-[10px] font-bold cursor-help select-none"
            >
              ?
            </button>
          </Tooltip>
        </span>
      )}
      <h3 className="text-sm text-slate-400 mb-2 pr-6">{label}</h3>
      {value !== undefined && (
        <div
          className={`text-2xl font-bold font-mono tabular-nums ${valueClass ?? ''}`}
        >
          {value}
        </div>
      )}
      {children && (
        <div className="text-sm text-slate-500 mt-1">{children}</div>
      )}
    </div>
  );
}

function NoData({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <StatCard label={label} tooltip={tooltip}>
      <span className="text-slate-600">No data yet</span>
    </StatCard>
  );
}

const TIPS = {
  peakRating: 'Highest skill rating anyone has reached (placement games excluded)',
  currentTopRating: 'Highest skill rating of any active player right now',
  biggestClimber:
    'Largest gap between a player’s lowest rating and their current rating, once established (placement games excluded)',
  biggestFaller:
    'Largest gap between a player’s peak rating and their current rating, once established (placement games excluded)',
  biggestDailyClimber:
    'Largest net rating gained by any player on a single day (placement games excluded)',
  biggestDailyFaller:
    'Largest net rating lost by any player on a single day (placement games excluded)',
  currentWinStreak: 'Longest active streak of consecutive wins',
  longestWinStreak: 'Longest streak of consecutive wins ever recorded',
  currentLossStreak: 'Longest active streak of consecutive losses',
  longestLossStreak: 'Longest streak of consecutive losses ever recorded',
  biggestUpset:
    'Single match where the winner had the lowest pre-match win probability',
  mostUpsetsCaused:
    'Career count of wins where the player was the underdog (under 37.5% to win going in)',
  highestWinRate:
    'Highest win percentage among players with at least 10 matches',
  mostSuccessfulClimbs:
    'Career count of challenge matches won as the lower-ranked challenger',
  bestDefender:
    'Career count of challenge matches won as the higher-ranked defender',
  giantSlayer:
    'Career wins above expectation: how many more matches a player has won than the ratings predicted (min 10 rated games)',
  mostImprobableStreak:
    'Win streak (3+) with the lowest combined probability — every win\u2019s pre-match odds multiplied together',
  upsetMagnet: 'Most losses suffered as the clear favorite (the mirror of Most Upsets Caused)',
  hardestSchedule:
    'Lowest average pre-match win probability — who consistently plays up (min 10 rated games)',
  chaosAgent:
    'Player whose results the rating model predicts worst — average surprise per game (min 10 rated games)',
  clutchRecord:
    'Best record in deciding games of a best-of series, e.g. game 3 at 1-1 (min 5 deciders)',
  comebackArtist: 'Most series wins after losing the first game',
  bagels: 'Most 11-0 shutout games dealt (games logged without point scores don\u2019t count)',
  biggestRivalry: 'Pair of players with the most total matches between them',
  dominator:
    'Largest gap between wins and losses in any head-to-head matchup',
  tightestRivalry:
    'Closest head-to-head matchup, weighted to favor more games',
  mostFriendly:
    'Player most often shown as the FRIEND badge on others’ profiles (most games together)',
  biggestVillain:
    'Player most often shown as the NEMESIS badge on others’ profiles (drained the most rating)',
  biggestOp:
    'Player most often shown as the RIVAL badge on others’ profiles (closest matchup)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function StreakMatchList({
  matches,
  isWin,
  showOdds = false,
}: {
  matches: StreakMatch[];
  isWin: boolean;
  showOdds?: boolean;
}) {
  const scoreClass = (m: StreakMatch) =>
    (m.won ?? isWin) ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="flex flex-col gap-1">
      {matches.map((m, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-slate-600">vs</span>
          <span className="text-slate-300 truncate">{m.opponent.name}</span>
          <span className="ml-auto flex items-center gap-2">
            {m.playerScore != null && m.opponentScore != null && (
              <span className={`tabular-nums ${scoreClass(m)}`}>
                {m.playerScore}-{m.opponentScore}
              </span>
            )}
            {showOdds && m.winProb != null && (
              <span className="text-yellow-400/80 tabular-nums">
                {Math.round(m.winProb * 100)}%
              </span>
            )}
            <span className="text-slate-600 tabular-nums">
              {formatDateShort(m.date)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function streakTooltipContent(entries: StreakEntry[], isWin: boolean) {
  if (entries.length === 1) {
    return <StreakMatchList matches={entries[0].matches} isWin={isWin} />;
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={e.player.id}>
          <div className="text-slate-200 font-medium mb-1">{e.player.name}</div>
          <StreakMatchList matches={e.matches} isWin={isWin} />
        </div>
      ))}
    </div>
  );
}

function detailTooltipContent(
  entries: { player: PlayerRef; matches: StreakMatch[] }[],
  showOdds: boolean,
) {
  if (entries.length === 1) {
    return (
      <StreakMatchList matches={entries[0].matches} isWin showOdds={showOdds} />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={e.player.id}>
          <div className="text-slate-200 font-medium mb-1">{e.player.name}</div>
          <StreakMatchList matches={e.matches} isWin showOdds={showOdds} />
        </div>
      ))}
    </div>
  );
}

function DetailValue({
  entries,
  showOdds,
  children,
}: {
  entries: { player: PlayerRef; matches: StreakMatch[] }[];
  showOdds?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      align="left"
      widthClass="w-72"
      content={detailTooltipContent(entries, showOdds ?? false)}
    >
      <span className="cursor-help">{children}</span>
    </Tooltip>
  );
}

function StreakCard({
  label,
  count,
  suffix,
  valueClass,
  tooltip,
  entries,
  isWin,
}: {
  label: string;
  count: number;
  suffix: 'W' | 'L';
  valueClass: string;
  tooltip: string;
  entries: StreakEntry[];
  isWin: boolean;
}) {
  return (
    <StatCard
      label={label}
      tooltip={tooltip}
      valueClass={valueClass}
      value={
        <Tooltip
          align="left"
          widthClass="w-72"
          content={streakTooltipContent(entries, isWin)}
        >
          <span className="cursor-help">
            {count}
            {suffix}
          </span>
        </Tooltip>
      }
    >
      {entries.map((e) => (
        <div key={e.player.id}>
          <PlayerLink player={e.player} />
          <span className="text-slate-600">
            {' '}
            ·{' '}
            {e.endDate
              ? `${formatDateShort(e.startDate)} → ${formatDateShort(e.endDate)}`
              : `since ${formatDateShort(e.startDate)}`}
          </span>
        </div>
      ))}
    </StatCard>
  );
}

function formatDay(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type WindowKey = 'all' | '90d' | '30d' | '7d';
const WINDOW_OPTIONS: { key: WindowKey; label: string; days: number | null }[] =
  [
    { key: 'all', label: 'All-time', days: null },
    { key: '90d', label: '90d', days: 90 },
    { key: '30d', label: '30d', days: 30 },
    { key: '7d', label: '7d', days: 7 },
  ];

function colorFor(index: number, total: number) {
  const hue = Math.round((index * 360) / Math.max(total, 1));
  return `hsl(${hue}, 70%, 60%)`;
}

// Returns YYYY-MM-DD in the viewer's local timezone so days line up with
// what someone seeing match timestamps in their browser would expect.
function localDayKey(t: number) {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(dayKey: string) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function RatingHistoryChart({
  players,
}: {
  players: StatsResponse['ratingHistory']['players'];
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>('all');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  // Per-player series: one point per local day where they actually played
  // (drop the synthetic createdAt point — it's not a game day). Days with
  // no games never enter the data, so the X axis collapses dead stretches.
  // For windowed views, also anchor each player at the window start with
  // their pre-window rating so lines span the full timeframe instead of
  // starting at the first in-window match.
  const series = useMemo(() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)!;
    const now = Date.now();
    const windowStart =
      opt.days != null ? now - opt.days * 24 * 60 * 60 * 1000 : null;

    return players.map((p) => {
      // p.points[0] is the synthetic { createdAt, 1500 } from the API.
      const matchPts = p.points.slice(1);
      const byDay = new Map<string, { day: string; t: number; rating: number }>();
      let preWindowRating: number | null = null;
      for (const pt of matchPts) {
        const t = new Date(pt.t).getTime();
        if (windowStart != null && t < windowStart) {
          preWindowRating = pt.rating;
          continue;
        }
        const day = localDayKey(t);
        const prev = byDay.get(day);
        if (!prev || prev.t <= t) byDay.set(day, { day, t, rating: pt.rating });
      }
      if (windowStart != null && preWindowRating != null) {
        const anchorDay = localDayKey(windowStart);
        if (!byDay.has(anchorDay)) {
          byDay.set(anchorDay, {
            day: anchorDay,
            t: windowStart,
            rating: preWindowRating,
          });
        }
      }
      const data = [...byDay.values()].sort((a, b) => a.t - b.t);
      return { ...p, data };
    });
  }, [players, windowKey]);

  // Players that have any data in the current window — these populate the
  // legend. `visibleSeries` is the subset the user hasn't toggled off.
  const eligibleSeries = series.filter((s) => s.data.length > 0);
  const visibleSeries = eligibleSeries.filter((s) => !hiddenIds.has(s.id));

  // Union of game days across visible players, in chronological order.
  const dayKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of visibleSeries) for (const pt of s.data) set.add(pt.day);
    return [...set].sort();
  }, [visibleSeries]);

  // One row per game-day. Each player's value is forward-filled from their
  // most recent point at-or-before that day so the tooltip can show every
  // visible player, and idx provides uniform x spacing.
  const combinedData = useMemo(() => {
    const cursors = visibleSeries.map(() => 0);
    const last: (number | null)[] = visibleSeries.map(() => null);

    return dayKeys.map((day, idx) => {
      const row: Record<string, number | string | null> = { idx, day };
      visibleSeries.forEach((s, i) => {
        while (cursors[i] < s.data.length && s.data[cursors[i]].day <= day) {
          last[i] = s.data[cursors[i]].rating;
          cursors[i]++;
        }
        row[`p${s.id}`] = last[i];
      });
      return row;
    });
  }, [visibleSeries, dayKeys]);

  const yDomain = useMemo(() => {
    const ratingVals: number[] = [];
    for (const s of visibleSeries) for (const pt of s.data) ratingVals.push(pt.rating);
    if (ratingVals.length === 0) return [1480, 1520] as [number, number];
    return [Math.min(...ratingVals) - 20, Math.max(...ratingVals) + 20] as [number, number];
  }, [visibleSeries]);

  // Colors are stable per legend slot regardless of which lines are hidden.
  const colorById = new Map(
    eligibleSeries.map((s, i) => [s.id, colorFor(i, eligibleSeries.length)]),
  );
  const nameById = new Map(eligibleSeries.map((s) => [s.id, s.name]));

  const tickInterval = Math.max(0, Math.ceil(dayKeys.length / 8) - 1);

  const toggleHidden = (id: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6 h-[520px] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-slate-400">Skill over time</h3>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setWindowKey(opt.key)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                windowKey === opt.key
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {eligibleSeries.length === 0 ? (
        <div className="text-slate-600 text-sm flex-1 flex items-center justify-center">
          No matches in this window.
        </div>
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="flex-1 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={combinedData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <XAxis
                  type="number"
                  dataKey="idx"
                  domain={[0, Math.max(0, dayKeys.length - 1)]}
                  ticks={dayKeys.map((_, i) => i)}
                  interval={tickInterval}
                  tickFormatter={(idx: number) =>
                    dayKeys[idx] ? formatDayLabel(dayKeys[idx]) : ''
                  }
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  width={48}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  cursor={{ stroke: '#475569', strokeDasharray: '3 3' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const idx = label as number;
                    const day = dayKeys[idx];
                    const items = payload
                      .filter((it) => it.value != null)
                      .map((it) => {
                        const id = Number(String(it.dataKey).slice(1));
                        return {
                          id,
                          name: nameById.get(id) ?? '',
                          color: colorById.get(id) ?? '#94a3b8',
                          value: Math.round(it.value as number),
                        };
                      })
                      .sort((a, b) => b.value - a.value);
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
                        <div className="text-slate-300 font-medium mb-1.5">
                          {day ? formatDayLabel(day) : ''}
                        </div>
                        {items.map((it) => (
                          <div
                            key={it.id}
                            className={`flex items-center gap-3 py-0.5 ${
                              hoveredId !== null && hoveredId !== it.id
                                ? 'opacity-40'
                                : ''
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: it.color }}
                            />
                            <span style={{ color: it.color }}>{it.name}</span>
                            <span className="text-slate-300 ml-auto tabular-nums">
                              {it.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {visibleSeries.map((s) => {
                  const color = colorById.get(s.id) ?? '#94a3b8';
                  const dimmed = hoveredId !== null && hoveredId !== s.id;
                  const highlighted = hoveredId === s.id;
                  return (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={`p${s.id}`}
                      name={s.name}
                      stroke={color}
                      strokeWidth={highlighted ? 3 : 2}
                      strokeOpacity={dimmed ? 0.2 : 1}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="thin-scrollbar flex flex-col gap-0.5 py-1 text-xs select-none min-w-[80px] overflow-y-auto">
            {eligibleSeries.map((s) => {
              const color = colorById.get(s.id) ?? '#94a3b8';
              const hidden = hiddenIds.has(s.id);
              const dimmed = !hidden && hoveredId !== null && hoveredId !== s.id;
              return (
                <li
                  key={s.id}
                  onClick={() => toggleHidden(s.id)}
                  onMouseEnter={() => !hidden && setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-opacity ${
                    hidden ? 'opacity-30' : dimmed ? 'opacity-40' : ''
                  } hover:bg-slate-700/40`}
                  title={hidden ? 'Click to show' : 'Click to hide'}
                >
                  <span
                    className="w-3 h-0.5 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    style={{ color }}
                    className={hidden ? 'line-through' : ''}
                  >
                    {s.name}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats
      .get()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center text-slate-500 py-12">Loading...</div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-slate-500 py-12">
        Could not load stats.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Stats</h1>

      <RatingHistoryChart players={stats.ratingHistory.players} />

      {/* Players */}
      <h2 className="text-lg font-semibold mb-3">Players</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.players.peakRating ? (
          <StatCard
            label="All-Time Peak Rating"
            value={String(stats.players.peakRating.rating)}
            tooltip={TIPS.peakRating}
          >
            <PlayerLinks players={stats.players.peakRating.players} />
          </StatCard>
        ) : (
          <NoData label="All-Time Peak Rating" tooltip={TIPS.peakRating} />
        )}

        {stats.players.biggestClimber ? (
          <StatCard
            label="Biggest Climb"
            value={`+${stats.players.biggestClimber.climb}`}
            valueClass="text-emerald-400"
            tooltip={TIPS.biggestClimber}
          >
            {stats.players.biggestClimber.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.from} → {e.to}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Biggest Climb" tooltip={TIPS.biggestClimber} />
        )}

        {stats.players.biggestFaller ? (
          <StatCard
            label="Biggest Fall"
            value={`-${stats.players.biggestFaller.fall}`}
            valueClass="text-red-400"
            tooltip={TIPS.biggestFaller}
          >
            {stats.players.biggestFaller.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.from} → {e.to}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Biggest Fall" tooltip={TIPS.biggestFaller} />
        )}

        {stats.players.currentTopRating ? (
          <StatCard
            label="Current Top Rating"
            value={String(stats.players.currentTopRating.rating)}
            tooltip={TIPS.currentTopRating}
          >
            <PlayerLinks players={stats.players.currentTopRating.players} />
          </StatCard>
        ) : (
          <NoData label="Current Top Rating" tooltip={TIPS.currentTopRating} />
        )}

        {stats.players.biggestDailyClimber ? (
          <StatCard
            label="Biggest Single-Day Climb"
            value={`+${stats.players.biggestDailyClimber.climb}`}
            valueClass="text-emerald-400"
            tooltip={TIPS.biggestDailyClimber}
          >
            {stats.players.biggestDailyClimber.entries.map((e, i) => (
              <div key={`${e.player.id}-${e.day}-${i}`}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.from} → {e.to} · {formatDay(e.day)}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData
            label="Biggest Single-Day Climb"
            tooltip={TIPS.biggestDailyClimber}
          />
        )}

        {stats.players.biggestDailyFaller ? (
          <StatCard
            label="Biggest Single-Day Fall"
            value={`-${stats.players.biggestDailyFaller.fall}`}
            valueClass="text-red-400"
            tooltip={TIPS.biggestDailyFaller}
          >
            {stats.players.biggestDailyFaller.entries.map((e, i) => (
              <div key={`${e.player.id}-${e.day}-${i}`}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.from} → {e.to} · {formatDay(e.day)}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData
            label="Biggest Single-Day Fall"
            tooltip={TIPS.biggestDailyFaller}
          />
        )}
      </div>

      {/* Streaks */}
      <h2 className="text-lg font-semibold mb-3">Streaks</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.streaks.currentWinStreak ? (
          <StreakCard
            label="Current Longest Win Streak"
            count={stats.streaks.currentWinStreak.count}
            suffix="W"
            valueClass="text-emerald-400"
            tooltip={TIPS.currentWinStreak}
            entries={stats.streaks.currentWinStreak.entries}
            isWin
          />
        ) : (
          <NoData
            label="Current Longest Win Streak"
            tooltip={TIPS.currentWinStreak}
          />
        )}

        {stats.streaks.longestWinStreak ? (
          <StreakCard
            label="All-Time Longest Win Streak"
            count={stats.streaks.longestWinStreak.count}
            suffix="W"
            valueClass="text-emerald-400"
            tooltip={TIPS.longestWinStreak}
            entries={stats.streaks.longestWinStreak.entries}
            isWin
          />
        ) : (
          <NoData
            label="All-Time Longest Win Streak"
            tooltip={TIPS.longestWinStreak}
          />
        )}

        {stats.streaks.currentLossStreak ? (
          <StreakCard
            label="Current Longest Loss Streak"
            count={stats.streaks.currentLossStreak.count}
            suffix="L"
            valueClass="text-red-400"
            tooltip={TIPS.currentLossStreak}
            entries={stats.streaks.currentLossStreak.entries}
            isWin={false}
          />
        ) : (
          <NoData
            label="Current Longest Loss Streak"
            tooltip={TIPS.currentLossStreak}
          />
        )}

        {stats.streaks.longestLossStreak ? (
          <StreakCard
            label="All-Time Longest Loss Streak"
            count={stats.streaks.longestLossStreak.count}
            suffix="L"
            valueClass="text-red-400"
            tooltip={TIPS.longestLossStreak}
            entries={stats.streaks.longestLossStreak.entries}
            isWin={false}
          />
        ) : (
          <NoData
            label="All-Time Longest Loss Streak"
            tooltip={TIPS.longestLossStreak}
          />
        )}
      </div>

      {/* Matches */}
      <h2 className="text-lg font-semibold mb-3">Matches</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.matches.biggestUpset ? (
          <StatCard
            label="Biggest Upset"
            value={`${Math.round(stats.matches.biggestUpset.winnerOdds * 100)}% odds`}
            valueClass="text-yellow-400"
            tooltip={TIPS.biggestUpset}
          >
            {stats.matches.biggestUpset.entries.map((e, i) => (
              <div key={`${e.winner.id}-${e.loser.id}-${e.matchDate}-${i}`}>
                <PlayerLink player={e.winner} />
                <span className="text-slate-600"> beat </span>
                <PlayerLink player={e.loser} />
                <span className="text-slate-600">
                  {' '}
                  · {formatDate(e.matchDate)}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Biggest Upset" tooltip={TIPS.biggestUpset} />
        )}

        {stats.matches.mostUpsetsCaused ? (
          <StatCard
            label="Most Upsets Caused"
            value={String(stats.matches.mostUpsetsCaused.count)}
            valueClass="text-yellow-400"
            tooltip={TIPS.mostUpsetsCaused}
          >
            <PlayerLinks players={stats.matches.mostUpsetsCaused.players} />
          </StatCard>
        ) : (
          <NoData label="Most Upsets Caused" tooltip={TIPS.mostUpsetsCaused} />
        )}

        {stats.matches.highestWinRate ? (
          <StatCard
            label="Highest Win Rate"
            value={`${(stats.matches.highestWinRate.rate * 100).toFixed(1)}%`}
            valueClass="text-emerald-400"
            tooltip={TIPS.highestWinRate}
          >
            {stats.matches.highestWinRate.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.wins}-{e.losses}
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Highest Win Rate" tooltip={TIPS.highestWinRate} />
        )}
      </div>

      {/* Probability */}
      <h2 className="text-lg font-semibold mb-3">Against the Odds</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.probability.giantSlayer ? (
          <StatCard
            label="Giant Slayer"
            value={
              <DetailValue entries={stats.probability.giantSlayer.entries} showOdds>
                +{stats.probability.giantSlayer.wae} wins
              </DetailValue>
            }
            valueClass="text-yellow-400"
            tooltip={TIPS.giantSlayer}
          >
            {stats.probability.giantSlayer.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · +{e.wae} over {e.games} games
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Giant Slayer" tooltip={TIPS.giantSlayer} />
        )}

        {stats.probability.mostImprobableStreak ? (
          <StatCard
            label="Most Improbable Streak"
            value={
              <Tooltip
                align="left"
                widthClass="w-72"
                content={
                  <StreakMatchList
                    matches={stats.probability.mostImprobableStreak.matches}
                    isWin
                    showOdds
                  />
                }
              >
                <span className="cursor-help">
                  1 in {Math.round(1 / stats.probability.mostImprobableStreak.probability).toLocaleString()}
                </span>
              </Tooltip>
            }
            valueClass="text-yellow-400"
            tooltip={TIPS.mostImprobableStreak}
          >
            <div>
              <PlayerLink player={stats.probability.mostImprobableStreak.player} />
              <span className="text-slate-600">
                {' '}
                · {stats.probability.mostImprobableStreak.count} straight ·{' '}
                {formatDate(stats.probability.mostImprobableStreak.startDate)} –{' '}
                {formatDate(stats.probability.mostImprobableStreak.endDate)}
              </span>
            </div>
          </StatCard>
        ) : (
          <NoData label="Most Improbable Streak" tooltip={TIPS.mostImprobableStreak} />
        )}

        {stats.probability.upsetMagnet ? (
          <StatCard
            label="Upset Magnet"
            value={
              <DetailValue entries={stats.probability.upsetMagnet.entries} showOdds>
                {stats.probability.upsetMagnet.count}
              </DetailValue>
            }
            valueClass="text-red-400"
            tooltip={TIPS.upsetMagnet}
          >
            <PlayerLinks players={stats.probability.upsetMagnet.entries.map((e) => e.player)} />
          </StatCard>
        ) : (
          <NoData label="Upset Magnet" tooltip={TIPS.upsetMagnet} />
        )}

        {stats.probability.hardestSchedule ? (
          <StatCard
            label="Hardest Schedule"
            value={
              <Tooltip
                align="left"
                widthClass="w-72"
                content={
                  <div className="flex flex-col gap-1">
                    {stats.probability.hardestSchedule.entries[0].opponents.map((o) => (
                      <div key={o.opponent.id} className="flex items-center gap-2">
                        <span className="text-slate-600">vs</span>
                        <span className="text-slate-300 truncate">{o.opponent.name}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-slate-400 tabular-nums">×{o.games}</span>
                          <span className="text-yellow-400/80 tabular-nums">
                            {Math.round(o.avgWinProb * 100)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                }
              >
                <span className="cursor-help">
                  {Math.round(stats.probability.hardestSchedule.avgWinProb * 100)}% avg odds
                </span>
              </Tooltip>
            }
            tooltip={TIPS.hardestSchedule}
          >
            {stats.probability.hardestSchedule.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600"> · {e.games} games</span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Hardest Schedule" tooltip={TIPS.hardestSchedule} />
        )}

        {stats.probability.chaosAgent ? (
          <StatCard
            label="Chaos Agent"
            value={
              <DetailValue entries={stats.probability.chaosAgent.entries} showOdds>
                {stats.probability.chaosAgent.brier.toFixed(2)}
              </DetailValue>
            }
            valueClass="text-purple-400"
            tooltip={TIPS.chaosAgent}
          >
            {stats.probability.chaosAgent.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600"> · {e.games} games</span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Chaos Agent" tooltip={TIPS.chaosAgent} />
        )}
      </div>

      {/* Clutch */}
      <h2 className="text-lg font-semibold mb-3">Clutch</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.clutch.clutchRecord ? (
          <StatCard
            label="Clutch Rating"
            value={
              <DetailValue entries={stats.clutch.clutchRecord.entries}>
                {Math.round(stats.clutch.clutchRecord.rate * 100)}%
              </DetailValue>
            }
            valueClass="text-emerald-400"
            tooltip={TIPS.clutchRecord}
          >
            {stats.clutch.clutchRecord.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                <span className="text-slate-600">
                  {' '}
                  · {e.wins}-{e.losses} in deciders
                </span>
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Clutch Rating" tooltip={TIPS.clutchRecord} />
        )}

        {stats.clutch.comebackArtist ? (
          <StatCard
            label="Comeback Artist"
            value={
              <DetailValue entries={stats.clutch.comebackArtist.entries}>
                {stats.clutch.comebackArtist.count}
              </DetailValue>
            }
            valueClass="text-emerald-400"
            tooltip={TIPS.comebackArtist}
          >
            <PlayerLinks players={stats.clutch.comebackArtist.entries.map((e) => e.player)} />
          </StatCard>
        ) : (
          <NoData label="Comeback Artist" tooltip={TIPS.comebackArtist} />
        )}

        {stats.clutch.bagels ? (
          <StatCard
            label="Bagels Dealt"
            value={
              <DetailValue entries={stats.clutch.bagels.entries}>
                {stats.clutch.bagels.count}
              </DetailValue>
            }
            valueClass="text-amber-400"
            tooltip={TIPS.bagels}
          >
            <PlayerLinks players={stats.clutch.bagels.entries.map((e) => e.player)} />
          </StatCard>
        ) : (
          <NoData label="Bagels Dealt" tooltip={TIPS.bagels} />
        )}
      </div>

      {/* Challenge Ladder */}
      <h2 className="text-lg font-semibold mb-3">Challenge Ladder</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.ladder.mostSuccessfulClimbs ? (
          <StatCard
            label="Most Successful Climbs"
            value={String(stats.ladder.mostSuccessfulClimbs.count)}
            valueClass="text-emerald-400"
            tooltip={TIPS.mostSuccessfulClimbs}
          >
            <PlayerLinks players={stats.ladder.mostSuccessfulClimbs.players} />
          </StatCard>
        ) : (
          <NoData
            label="Most Successful Climbs"
            tooltip={TIPS.mostSuccessfulClimbs}
          />
        )}

        {stats.ladder.bestDefender ? (
          <StatCard
            label="Best Defender"
            value={String(stats.ladder.bestDefender.count)}
            valueClass="text-sky-400"
            tooltip={TIPS.bestDefender}
          >
            <PlayerLinks players={stats.ladder.bestDefender.players} />
          </StatCard>
        ) : (
          <NoData label="Best Defender" tooltip={TIPS.bestDefender} />
        )}
      </div>

      {/* Rivalries */}
      <h2 className="text-lg font-semibold mb-3">Rivalries</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.rivalries.biggestRivalry ? (
          <StatCard
            label="Most Head-to-Head Matches"
            value={`${stats.rivalries.biggestRivalry.matches} matches`}
            valueClass="text-amber-400"
            tooltip={TIPS.biggestRivalry}
          >
            {stats.rivalries.biggestRivalry.pairs.map((pair) => (
              <div key={`${pair.p1.id}-${pair.p2.id}`}>
                <PlayerLink player={pair.p1} />
                <span className="text-slate-600"> vs </span>
                <PlayerLink player={pair.p2} />
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Most Head-to-Head Matches" tooltip={TIPS.biggestRivalry} />
        )}

        {stats.rivalries.dominator ? (
          <StatCard
            label="Dominator"
            value={
              stats.rivalries.dominator.pairs.length === 1
                ? `${stats.rivalries.dominator.pairs[0].wins}-${stats.rivalries.dominator.pairs[0].losses}`
                : `+${stats.rivalries.dominator.gap}`
            }
            valueClass="text-amber-400"
            tooltip={TIPS.dominator}
          >
            {stats.rivalries.dominator.pairs.map((pair) => (
              <div key={`${pair.dominator.id}-${pair.victim.id}`}>
                <PlayerLink player={pair.dominator} />
                <span className="text-slate-600"> over </span>
                <PlayerLink player={pair.victim} />
                {stats.rivalries.dominator!.pairs.length > 1 && (
                  <span className="text-slate-600">
                    {' '}
                    ({pair.wins}-{pair.losses})
                  </span>
                )}
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Dominator" tooltip={TIPS.dominator} />
        )}

        {stats.rivalries.tightestRivalry ? (
          <StatCard
            label="Tightest Rivalry"
            value={`${stats.rivalries.tightestRivalry.wins}-${stats.rivalries.tightestRivalry.losses}`}
            valueClass="text-amber-400"
            tooltip={TIPS.tightestRivalry}
          >
            {stats.rivalries.tightestRivalry.pairs.map((pair) => (
              <div key={`${pair.leader.id}-${pair.trailer.id}`}>
                <PlayerLink player={pair.leader} />
                <span className="text-slate-600"> vs </span>
                <PlayerLink player={pair.trailer} />
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Tightest Rivalry" tooltip={TIPS.tightestRivalry} />
        )}
      </div>

      {/* Relationships */}
      <h2 className="text-lg font-semibold mb-3">Relationships</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.relationships.mostFriendly ? (
          <StatCard
            label="Most Friendly"
            value={String(stats.relationships.mostFriendly.count)}
            valueClass="text-sky-400"
            tooltip={TIPS.mostFriendly}
          >
            {stats.relationships.mostFriendly.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                {e.with.length > 0 && (
                  <>
                    <span className="text-slate-600"> · </span>
                    <RelationshipSubjects
                      subjects={e.with}
                      tooltip={(s) => (
                        <>
                          <span className="font-mono tabular-nums text-slate-200">
                            {s.matches}
                          </span>{' '}
                          {s.matches === 1 ? 'match' : 'matches'}
                        </>
                      )}
                    />
                  </>
                )}
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Most Friendly" tooltip={TIPS.mostFriendly} />
        )}

        {stats.relationships.biggestVillain ? (
          <StatCard
            label="Biggest Villain"
            value={String(stats.relationships.biggestVillain.count)}
            valueClass="text-red-400"
            tooltip={TIPS.biggestVillain}
          >
            {stats.relationships.biggestVillain.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                {e.with.length > 0 && (
                  <>
                    <span className="text-slate-600"> · </span>
                    <RelationshipSubjects
                      subjects={e.with}
                      tooltip={(s) => (
                        <>
                          <span className="font-mono tabular-nums text-red-400">
                            -{s.ratingDrained}
                          </span>{' '}
                          rating
                        </>
                      )}
                    />
                  </>
                )}
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Biggest Villain" tooltip={TIPS.biggestVillain} />
        )}

        {stats.relationships.biggestOp ? (
          <StatCard
            label="Biggest Op"
            value={String(stats.relationships.biggestOp.count)}
            valueClass="text-amber-400"
            tooltip={TIPS.biggestOp}
          >
            {stats.relationships.biggestOp.entries.map((e) => (
              <div key={e.player.id}>
                <PlayerLink player={e.player} />
                {e.with.length > 0 && (
                  <>
                    <span className="text-slate-600"> · </span>
                    <RelationshipSubjects
                      subjects={e.with}
                      tooltip={(s) => (
                        <>
                          {e.player.name}{' '}
                          <span className="font-mono tabular-nums text-amber-400">
                            {s.wins}–{s.losses}
                          </span>{' '}
                          {s.player.name}
                        </>
                      )}
                    />
                  </>
                )}
              </div>
            ))}
          </StatCard>
        ) : (
          <NoData label="Biggest Op" tooltip={TIPS.biggestOp} />
        )}
      </div>
    </div>
  );
}
