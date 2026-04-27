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
import type { StatsResponse, PlayerRef } from '../types';

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

function StatCard({
  label,
  value,
  valueClass,
  tooltip,
  children,
}: {
  label: string;
  value?: string;
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
  peakElo: 'Highest ELO anyone has ever reached',
  biggestClimber:
    'Largest gap between a player’s lowest ever ELO and their current ELO',
  biggestFaller:
    'Largest gap between a player’s peak ELO and their current ELO',
  currentWinStreak: 'Longest active streak of consecutive wins',
  longestWinStreak: 'Longest streak of consecutive wins ever recorded',
  currentLossStreak: 'Longest active streak of consecutive losses',
  longestLossStreak: 'Longest streak of consecutive losses ever recorded',
  biggestUpset:
    'Single match where the winner gained the most ELO from one win',
  mostUpsetsCaused:
    'Career count of wins where the player was the underdog (gained more than 20 ELO)',
  mostSuccessfulClimbs:
    'Career count of challenge matches won as the lower-ranked challenger',
  bestDefender:
    'Career count of challenge matches won as the higher-ranked defender',
  biggestRivalry: 'Pair of players with the most total matches between them',
  dominator:
    'Largest gap between wins and losses in any head-to-head matchup',
  mostFriendly:
    'Player most often shown as the FRIEND badge on others’ profiles (most games together)',
  biggestVillain:
    'Player most often shown as the NEMESIS badge on others’ profiles (drained the most ELO)',
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

function EloHistoryChart({
  players,
}: {
  players: StatsResponse['eloHistory']['players'];
}) {
  const [windowKey, setWindowKey] = useState<WindowKey>('all');
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const series = useMemo(() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)!;
    const now = Date.now();
    const windowStart =
      opt.days != null ? now - opt.days * 24 * 60 * 60 * 1000 : null;

    return players.map((p) => {
      const pts = p.points.map((pt) => ({
        t: new Date(pt.t).getTime(),
        elo: pt.elo,
      }));

      if (windowStart == null) return { ...p, data: pts };

      // Most recent point at or before windowStart becomes the anchor at windowStart.
      let anchorElo: number | null = null;
      const inWindow: { t: number; elo: number }[] = [];
      for (const pt of pts) {
        if (pt.t <= windowStart) {
          anchorElo = pt.elo;
        } else {
          inWindow.push(pt);
        }
      }
      const data: { t: number; elo: number }[] = [];
      if (anchorElo != null) data.push({ t: windowStart, elo: anchorElo });
      data.push(...inWindow);
      return { ...p, data };
    });
  }, [players, windowKey]);

  const visibleSeries = series.filter((s) => s.data.length > 0);

  // Unified dataset: one row per distinct timestamp with each player's ELO
  // forward-filled. Lets the tooltip show every player at any hovered x.
  const combinedData = useMemo(() => {
    const allTimes = Array.from(
      new Set(visibleSeries.flatMap((s) => s.data.map((pt) => pt.t))),
    ).sort((a, b) => a - b);

    const cursors = visibleSeries.map(() => 0);
    const lastValues: (number | null)[] = visibleSeries.map(() => null);

    return allTimes.map((t) => {
      const row: Record<string, number | null> = { t };
      visibleSeries.forEach((s, i) => {
        while (cursors[i] < s.data.length && s.data[cursors[i]].t <= t) {
          lastValues[i] = s.data[cursors[i]].elo;
          cursors[i]++;
        }
        row[`p${s.id}`] = lastValues[i];
      });
      return row;
    });
  }, [visibleSeries]);

  const { domain, yDomain } = useMemo(() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)!;
    const now = Date.now();
    const allTimes: number[] = [];
    const allElos: number[] = [];
    for (const s of visibleSeries) {
      for (const pt of s.data) {
        allTimes.push(pt.t);
        allElos.push(pt.elo);
      }
    }
    const tStart =
      opt.days != null
        ? now - opt.days * 24 * 60 * 60 * 1000
        : (allTimes.length > 0 ? Math.min(...allTimes) : now);
    const tEnd = now;
    const eMin = allElos.length > 0 ? Math.min(...allElos) : 1000;
    const eMax = allElos.length > 0 ? Math.max(...allElos) : 1000;
    return {
      domain: [tStart, tEnd] as [number, number],
      yDomain: [eMin - 20, eMax + 20] as [number, number],
    };
  }, [visibleSeries, windowKey]);

  const formatTick = (t: number) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const colorById = new Map(
    visibleSeries.map((s, i) => [s.id, colorFor(i, visibleSeries.length)]),
  );
  const nameById = new Map(visibleSeries.map((s) => [s.id, s.name]));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-slate-400">ELO over time</h3>
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
      {visibleSeries.length === 0 ? (
        <div className="text-slate-600 text-sm py-12 text-center">
          No matches in this window.
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={combinedData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <XAxis
                  type="number"
                  dataKey="t"
                  domain={domain}
                  tickFormatter={formatTick}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDuplicatedCategory={false}
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
                          {new Date(label as number).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            },
                          )}
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
                {visibleSeries.map((s, i) => {
                  const color = colorFor(i, visibleSeries.length);
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
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-col gap-0.5 py-1 text-xs select-none min-w-[80px]">
            {visibleSeries.map((s, i) => {
              const color = colorFor(i, visibleSeries.length);
              const dimmed = hoveredId !== null && hoveredId !== s.id;
              return (
                <li
                  key={s.id}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-opacity ${
                    dimmed ? 'opacity-40' : ''
                  } hover:bg-slate-700/40`}
                >
                  <span
                    className="w-3 h-0.5 rounded"
                    style={{ backgroundColor: color }}
                  />
                  <span style={{ color }}>{s.name}</span>
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

      <EloHistoryChart players={stats.eloHistory.players} />

      {/* Players */}
      <h2 className="text-lg font-semibold mb-3">Players</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.players.peakElo ? (
          <StatCard
            label="Peak ELO"
            value={String(stats.players.peakElo.elo)}
            tooltip={TIPS.peakElo}
          >
            <PlayerLinks players={stats.players.peakElo.players} />
          </StatCard>
        ) : (
          <NoData label="Peak ELO" tooltip={TIPS.peakElo} />
        )}

        {stats.players.biggestClimber ? (
          <StatCard
            label="Biggest Climber"
            value={`+${stats.players.biggestClimber.climb}`}
            valueClass="text-emerald-400"
            tooltip={TIPS.biggestClimber}
          >
            <PlayerLink player={stats.players.biggestClimber.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestClimber.from} →{' '}
              {stats.players.biggestClimber.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Climber" tooltip={TIPS.biggestClimber} />
        )}

        {stats.players.biggestFaller ? (
          <StatCard
            label="Biggest Faller"
            value={`-${stats.players.biggestFaller.fall}`}
            valueClass="text-red-400"
            tooltip={TIPS.biggestFaller}
          >
            <PlayerLink player={stats.players.biggestFaller.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestFaller.from} →{' '}
              {stats.players.biggestFaller.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Faller" tooltip={TIPS.biggestFaller} />
        )}
      </div>

      {/* Streaks */}
      <h2 className="text-lg font-semibold mb-3">Streaks</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.streaks.currentWinStreak ? (
          <StatCard
            label="Current Longest Win Streak"
            value={`${stats.streaks.currentWinStreak.count}W`}
            valueClass="text-emerald-400"
            tooltip={TIPS.currentWinStreak}
          >
            <PlayerLinks players={stats.streaks.currentWinStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="Current Longest Win Streak"
            tooltip={TIPS.currentWinStreak}
          />
        )}

        {stats.streaks.longestWinStreak ? (
          <StatCard
            label="All-Time Longest Win Streak"
            value={`${stats.streaks.longestWinStreak.count}W`}
            valueClass="text-emerald-400"
            tooltip={TIPS.longestWinStreak}
          >
            <PlayerLinks players={stats.streaks.longestWinStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="All-Time Longest Win Streak"
            tooltip={TIPS.longestWinStreak}
          />
        )}

        {stats.streaks.currentLossStreak ? (
          <StatCard
            label="Current Longest Loss Streak"
            value={`${stats.streaks.currentLossStreak.count}L`}
            valueClass="text-red-400"
            tooltip={TIPS.currentLossStreak}
          >
            <PlayerLinks players={stats.streaks.currentLossStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="Current Longest Loss Streak"
            tooltip={TIPS.currentLossStreak}
          />
        )}

        {stats.streaks.longestLossStreak ? (
          <StatCard
            label="All-Time Longest Loss Streak"
            value={`${stats.streaks.longestLossStreak.count}L`}
            valueClass="text-red-400"
            tooltip={TIPS.longestLossStreak}
          >
            <PlayerLinks players={stats.streaks.longestLossStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="All-Time Longest Loss Streak"
            tooltip={TIPS.longestLossStreak}
          />
        )}
      </div>

      {/* Matches */}
      <h2 className="text-lg font-semibold mb-3">Matches</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {stats.matches.biggestUpset ? (
          <StatCard
            label="Biggest Upset"
            value={`+${stats.matches.biggestUpset.eloGain}`}
            valueClass="text-yellow-400"
            tooltip={TIPS.biggestUpset}
          >
            <PlayerLink player={stats.matches.biggestUpset.winner} />
            <span className="text-slate-600"> beat </span>
            <PlayerLink player={stats.matches.biggestUpset.loser} />
            <span className="text-slate-600">
              {' '}
              · {formatDate(stats.matches.biggestUpset.matchDate)}
            </span>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {stats.rivalries.biggestRivalry ? (
          <StatCard
            label="Biggest Rivalry"
            value={`${stats.rivalries.biggestRivalry.matches} matches`}
            valueClass="text-amber-400"
            tooltip={TIPS.biggestRivalry}
          >
            <PlayerLink player={stats.rivalries.biggestRivalry.p1} />
            <span className="text-slate-600"> vs </span>
            <PlayerLink player={stats.rivalries.biggestRivalry.p2} />
          </StatCard>
        ) : (
          <NoData label="Biggest Rivalry" tooltip={TIPS.biggestRivalry} />
        )}

        {stats.rivalries.dominator ? (
          <StatCard
            label="Dominator"
            value={`${stats.rivalries.dominator.wins}-${stats.rivalries.dominator.losses}`}
            valueClass="text-amber-400"
            tooltip={TIPS.dominator}
          >
            <PlayerLink player={stats.rivalries.dominator.dominator} />
            <span className="text-slate-600"> over </span>
            <PlayerLink player={stats.rivalries.dominator.victim} />
          </StatCard>
        ) : (
          <NoData label="Dominator" tooltip={TIPS.dominator} />
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
            <PlayerLinks players={stats.relationships.mostFriendly.players} />
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
            <PlayerLinks
              players={stats.relationships.biggestVillain.players}
            />
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
            <PlayerLinks players={stats.relationships.biggestOp.players} />
          </StatCard>
        ) : (
          <NoData label="Biggest Op" tooltip={TIPS.biggestOp} />
        )}
      </div>
    </div>
  );
}
