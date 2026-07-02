import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { isUpset, expectedScore, conservativeRating } from '../../lib/glicko';
import { hasPointScores } from '../../lib/games';
import { niceAxis } from '../lib/chart';
import {
  computeNemesis,
  computeRival,
  computeFriend,
} from '../../lib/badges';
import HoverTooltip from './Tooltip';
import { Badge } from '@/components/ui/badge';
import type { PlayerProfile as PlayerProfileType } from '../types';

type WindowKey = 'all' | '90d' | '30d' | '7d';
const WINDOW_OPTIONS: { key: WindowKey; label: string; days: number | null }[] = [
  { key: 'all', label: 'All-time', days: null },
  { key: '90d', label: '90d', days: 90 },
  { key: '30d', label: '30d', days: 30 },
  { key: '7d', label: '7d', days: 7 },
];

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedH2H, setExpandedH2H] = useState<number | null>(null);
  const [updatingVacation, setUpdatingVacation] = useState(false);
  const [windowKey, setWindowKey] = useState<WindowKey>('all');
  const MATCH_PAGE_SIZE = 20;
  const [visibleMatchCount, setVisibleMatchCount] = useState(MATCH_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setVisibleMatchCount(MATCH_PAGE_SIZE);
    api.players
      .get(Number(id))
      .then(setPlayer)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleMatchCount((c) => c + MATCH_PAGE_SIZE);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [player]);

  const handleToggleVacation = async () => {
    if (!player || updatingVacation) return;
    setUpdatingVacation(true);
    try {
      const updated = await api.players.setVacation(player.id, !player.onVacation);
      setPlayer({ ...player, onVacation: updated.onVacation });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update vacation status');
    } finally {
      setUpdatingVacation(false);
    }
  };

  if (loading)
    return (
      <div className="text-center text-slate-500 py-12">Loading...</div>
    );
  if (!player)
    return (
      <div className="text-center text-slate-500 py-12">Player not found.</div>
    );

  const winRate =
    player.wins + player.losses > 0
      ? Math.round((player.wins / (player.wins + player.losses)) * 100)
      : 0;

  const sumRatingChange = (count: number) =>
    Math.round(
      player.matches.slice(0, count).reduce(
        (sum, m) =>
          sum + (m.winnerId === player.id ? m.winnerRatingChange : m.loserRatingChange),
        0,
      ),
    );

  const streakRating = player.streak ? sumRatingChange(player.streak.count) : 0;
  const recentFormRating = sumRatingChange(player.recentForm.length);

  const opponentMap = new Map<number, string>();
  player.headToHead.forEach((h) => {
    opponentMap.set(h.opponent.id, h.opponent.name);
  });

  // Compute rating history from matches (oldest to newest)
  const ratingHistory = (() => {
    if (player.matches.length === 0) return [];

    const chronological = [...player.matches].reverse();
    let startRating = player.rating;
    for (const m of player.matches) {
      const change = m.winnerId === player.id ? m.winnerRatingChange : m.loserRatingChange;
      startRating -= change;
    }

    // The player's RD before a given match is stored on the match row; the RD
    // *after* match i is approximated by match i+1's before-value, with the
    // current RD closing out the series.
    const rdBeforeOf = (m: (typeof chronological)[number]) =>
      m.winnerId === player.id ? m.winnerRdBefore : m.loserRdBefore;
    const startRd = chronological.length > 0 ? rdBeforeOf(chronological[0]) : null;

    const points: {
      label: string;
      rating: number;
      band: [number, number] | null;
      opponent: string;
      date: string;
      ts: number | null;
    }[] = [
      {
        label: 'Start',
        rating: Math.round(startRating),
        band:
          startRd != null
            ? [Math.round(startRating - 2 * startRd), Math.round(startRating + 2 * startRd)]
            : null,
        opponent: '',
        date: '',
        ts: null,
      },
    ];

    let currentRating = startRating;
    chronological.forEach((m, i) => {
      const won = m.winnerId === player.id;
      const change = won ? m.winnerRatingChange : m.loserRatingChange;
      currentRating += change;
      const next = chronological[i + 1];
      const rdAfter = next != null ? rdBeforeOf(next) : player.rd;
      const opponentId = won ? m.loserId : m.winnerId;
      points.push({
        label: `#${points.length}`,
        rating: Math.round(currentRating),
        band:
          rdAfter != null
            ? [Math.round(currentRating - 2 * rdAfter), Math.round(currentRating + 2 * rdAfter)]
            : null,
        opponent: opponentMap.get(opponentId) || `Player #${opponentId}`,
        date: new Date(m.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        ts: new Date(m.createdAt).getTime(),
      });
    });

    return points;
  })();

  // Windowed slice of the rating history for the chart. Carries the last point
  // before the window as a baseline so the line enters at the right rating.
  const chartData = (() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)!;
    if (opt.days == null) return ratingHistory;
    const cutoff = Date.now() - opt.days * 24 * 60 * 60 * 1000;
    const within = ratingHistory.filter((pt) => pt.ts != null && pt.ts >= cutoff);
    const before = ratingHistory.filter((pt) => pt.ts == null || pt.ts < cutoff);
    const baseline = before.length
      ? [{ ...before[before.length - 1], label: 'Start', opponent: '', date: '' }]
      : [];
    return [...baseline, ...within];
  })();

  const yAxis = (() => {
    const source = chartData.length > 0 ? chartData : ratingHistory;
    const values = source.flatMap((pt) =>
      pt.band ? [pt.band[0], pt.band[1]] : [pt.rating],
    );
    return niceAxis(Math.min(...values), Math.max(...values));
  })();

  const peakRating = ratingHistory.length > 0
    ? Math.max(...ratingHistory.map((p) => p.rating))
    : null;
  const minRating = ratingHistory.length > 0
    ? Math.min(...ratingHistory.map((p) => p.rating))
    : null;

  // Longest career win / loss streaks (max consecutive results).
  const { longestWinStreak, longestLossStreak } = (() => {
    let maxW = 0;
    let maxL = 0;
    let curW = 0;
    let curL = 0;
    for (const m of player.matches) {
      if (m.winnerId === player.id) {
        curW += 1;
        curL = 0;
        if (curW > maxW) maxW = curW;
      } else {
        curL += 1;
        curW = 0;
        if (curL > maxL) maxL = curL;
      }
    }
    return { longestWinStreak: maxW, longestLossStreak: maxL };
  })();

  // Win/loss record and net skill change over the chart's selected window.
  const rangeStats = (() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)!;
    const cutoff = opt.days != null ? Date.now() - opt.days * 24 * 60 * 60 * 1000 : null;
    const inRange =
      cutoff == null
        ? player.matches
        : player.matches.filter((m) => new Date(m.createdAt).getTime() >= cutoff);
    const wins = inRange.filter((m) => m.winnerId === player.id).length;
    const losses = inRange.length - wins;
    const net = Math.round(
      inRange.reduce(
        (sum, m) =>
          sum + (m.winnerId === player.id ? m.winnerRatingChange : m.loserRatingChange),
        0,
      ),
    );
    const rate = inRange.length > 0 ? Math.round((wins / inRange.length) * 100) : 0;
    return { wins, losses, net, rate, count: inRange.length };
  })();

  return (
    <div>
      <Link
        to="/"
        className="text-sm text-slate-500 hover:text-slate-300 mb-4 inline-block"
      >
        &larr; Back to leaderboard
      </Link>

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{player.name}</h1>
              {player.onVacation && (
                <Badge
                  color="sky"
                  title="Hidden from new matches. Ladder position is held until they return."
                >
                  ON VACATION
                </Badge>
              )}
              <button
                type="button"
                onClick={handleToggleVacation}
                disabled={updatingVacation}
                title="Hidden from new matches while on vacation. Ladder position is held."
                className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                  player.onVacation
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                }`}
              >
                {updatingVacation
                  ? 'Updating...'
                  : player.onVacation
                    ? 'Back from vacation'
                    : 'Set on vacation'}
              </button>
            </div>
            {player.challengeRank != null && (
              <span className="text-sm text-slate-400">
                Ladder Rank #{player.challengeRank}
              </span>
            )}
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-2 justify-end">
              <span className="text-3xl font-mono font-bold">
                {Math.round(conservativeRating(player))}
              </span>
              {peakRating != null && minRating != null && (
                <span className="text-xs font-mono tabular-nums text-slate-600">
                  <span className="text-emerald-400/40">▲{peakRating}</span>
                  {' '}
                  <span className="text-red-400/40">▼{minRating}</span>
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              skill {Math.round(player.rating)} ±
              {Math.round(player.rating) - Math.round(conservativeRating(player))}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center sm:gap-4">
          <div>
            <div className="text-2xl font-bold">
              {player.wins + player.losses}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Played
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">
              {player.wins}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Wins
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">
              {player.losses}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Losses
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold">{winRate}%</div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Win Rate
            </div>
          </div>
        </div>
      </div>

      {/* Rating Chart */}
      {ratingHistory.length > 1 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-slate-400">Skill History</h3>
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
          {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <XAxis dataKey="label" hide />
              <YAxis
                domain={yAxis.domain}
                ticks={yAxis.ticks}
                tick={{ fill: '#64748b', fontSize: 12 }}
                width={40}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
                labelStyle={{ display: 'none' }}
                formatter={(value, _name, item) => {
                  const band = (item?.payload as { band?: [number, number] | null } | undefined)?.band;
                  const unc = band ? Math.round((band[1] - band[0]) / 2) : null;
                  return [unc != null ? `${value} \u00b1${unc}` : `${value}`, 'Skill'];
                }}
                labelFormatter={(_label, payload) => {
                  const data = payload?.[0]?.payload as { opponent?: string; date?: string } | undefined;
                  if (!data?.opponent) return '';
                  return `vs ${data.opponent} · ${data.date}`;
                }}
              />
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="#10b981"
                fillOpacity={0.08}
                activeDot={false}
                tooltipType="none"
              />
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10b981' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-sm text-slate-600">
              No matches in this window.
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-emerald-400 font-medium">{rangeStats.wins}W</span>
              <span className="text-slate-600 mx-1">-</span>
              <span className="text-red-400 font-medium">{rangeStats.losses}L</span>
            </span>
            <span className="text-slate-500">{rangeStats.rate}% win rate</span>
            <span
              className={`font-mono tabular-nums ${rangeStats.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {rangeStats.net >= 0 ? '+' : ''}
              {rangeStats.net} skill
            </span>
          </div>
        </div>
      )}

      {/* Streak & Form */}
      <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-2 sm:gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm text-slate-400 mb-2">Current Streak</h3>
          {player.streak ? (
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`text-2xl font-bold ${player.streak.type === 'W' ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {player.streak.count}
                {player.streak.type}
              </span>
              <span
                className={`text-sm font-mono tabular-nums ${streakRating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {streakRating >= 0 ? '+' : ''}
                {streakRating}
              </span>
            </div>
          ) : (
            <span className="text-slate-500">No matches</span>
          )}
          {player.matches.length > 0 && (
            <div className="text-xs text-slate-500 mt-2">
              Longest{' '}
              <span className="text-emerald-400 font-medium">{longestWinStreak}W</span>
              <span className="mx-1 text-slate-600">·</span>
              <span className="text-red-400 font-medium">{longestLossStreak}L</span>
            </div>
          )}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col">
          <h3 className="text-sm text-slate-400 mb-2">Recent Form</h3>
          <div className="flex-1 flex items-center">
            {player.recentForm.length > 0 ? (
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex gap-1">
                  {player.recentForm.map((result, i) => (
                    <span
                      key={i}
                      className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
                        result === 'W'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {result}
                    </span>
                  ))}
                </div>
                <span
                  className={`text-sm font-mono tabular-nums ${recentFormRating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {recentFormRating >= 0 ? '+' : ''}
                  {recentFormRating}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">No matches</span>
            )}
          </div>
        </div>
      </div>

      {/* Head to Head */}
      {player.headToHead.length > 0 && (() => {
        const h2hEntries = player.headToHead.map((h) => ({
          opponentId: h.opponent.id,
          wins: h.wins,
          losses: h.losses,
        }));
        const nemesisId = computeNemesis(player.id, player.matches, h2hEntries);
        const rivalId = computeRival(h2hEntries);
        const friendId = computeFriend(h2hEntries);

        const h2hBorderClass = (opponentId: number) =>
          opponentId === nemesisId
            ? 'border-red-500/30'
            : opponentId === rivalId
              ? 'border-amber-500/30'
              : opponentId === friendId
                ? 'border-sky-500/30'
                : 'border-slate-700';

        return (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Head to Head</h2>
            <div className="space-y-2">
              {player.headToHead.map((h2h) => {
                const isExpanded = expandedH2H === h2h.opponent.id;
                const h2hMatches = player.matches.filter(
                  (m) =>
                    m.winnerId === h2h.opponent.id ||
                    m.loserId === h2h.opponent.id,
                );

                const netRating = Math.round(
                  h2hMatches.reduce((sum, m) => {
                    const change = m.winnerId === player.id
                      ? m.winnerRatingChange
                      : m.loserRatingChange;
                    return sum + change;
                  }, 0),
                );

                const totalGames = h2h.wins + h2h.losses;
                const actualPct =
                  totalGames > 0
                    ? Math.round((h2h.wins / totalGames) * 100)
                    : 0;
                const expectedPct = Math.round(
                  expectedScore(player, h2h.opponent) * 100,
                );

                return (
                  <div key={h2h.opponent.id}>
                    <div
                      onClick={() =>
                        setExpandedH2H(isExpanded ? null : h2h.opponent.id)
                      }
                      className={`flex items-center justify-between bg-slate-800 border rounded-lg px-4 py-3 hover:bg-slate-700 transition-colors cursor-pointer ${h2hBorderClass(h2h.opponent.id)} ${isExpanded ? 'rounded-b-none' : ''}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{h2h.opponent.name}</span>
                        {h2h.opponent.id === nemesisId && (
                          <Badge color="red">NEMESIS</Badge>
                        )}
                        {h2h.opponent.id === rivalId && (
                          <Badge color="amber">RIVAL</Badge>
                        )}
                        {h2h.opponent.id === friendId && (
                          <Badge color="sky">FRIEND</Badge>
                        )}
                        <Link
                          to={`/players/${h2h.opponent.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-500 hover:text-emerald-400 text-xs transition-colors"
                        >
                          View profile
                        </Link>
                      </div>
                      <div className="flex items-center gap-3">
                        <HoverTooltip
                          content={
                            <div className="space-y-1">
                              <div>
                                <span className="text-slate-500">Actual: </span>
                                <span className="text-slate-200">
                                  {actualPct}%
                                </span>
                                <span
                                  className={`ml-1 font-mono ${
                                    actualPct - expectedPct > 0
                                      ? 'text-emerald-400'
                                      : actualPct - expectedPct < 0
                                        ? 'text-red-400'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  ({actualPct - expectedPct >= 0 ? '+' : ''}
                                  {actualPct - expectedPct}%)
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">
                                  Expected:{' '}
                                </span>
                                <span className="text-slate-200">
                                  {expectedPct}%
                                </span>
                              </div>
                            </div>
                          }
                        >
                          <span className="text-sm cursor-help">
                            <span className="text-emerald-400">
                              {h2h.wins}W
                            </span>
                            <span className="text-slate-600 mx-1">-</span>
                            <span className="text-red-400">{h2h.losses}L</span>
                          </span>
                        </HoverTooltip>
                        <span className="text-slate-700">|</span>
                        <span className={`text-xs font-mono tabular-nums ${netRating >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {netRating >= 0 ? '+' : ''}{netRating}
                        </span>
                        <span className="text-slate-500 text-xs">
                          {isExpanded ? '\u25B2' : '\u25BC'}
                        </span>
                      </div>
                    </div>
                    {isExpanded && h2hMatches.length > 0 && (
                      <div
                        className={`bg-slate-800/50 border border-t-0 rounded-b-lg px-4 py-2 space-y-1 ${h2hBorderClass(h2h.opponent.id)}`}
                      >
                        {h2hMatches.map((match) => {
                          const won = match.winnerId === player.id;
                          const ratingChange = Math.round(
                            won ? match.winnerRatingChange : match.loserRatingChange,
                          );
                          return (
                            <div
                              key={match.id}
                              className="flex items-center justify-between py-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                    won
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-red-500/20 text-red-400'
                                  }`}
                                >
                                  {won ? 'W' : 'L'}
                                </span>
                                {match.games && match.games.length > 0 && hasPointScores(match.games) ? (
                                  <span className="text-slate-500 text-sm">
                                    {won
                                      ? `${match.winnerScore}-${match.loserScore}`
                                      : `${match.loserScore}-${match.winnerScore}`}
                                    {' '}
                                    ({match.games.map(g =>
                                      g.winnerScore == null ? '\u2013' : won ? `${g.winnerScore}-${g.loserScore}` : `${g.loserScore}-${g.winnerScore}`
                                    ).join(', ')})
                                  </span>
                                ) : match.winnerScore != null &&
                                  match.loserScore != null ? (
                                    <span className="text-slate-500 text-sm">
                                      {won
                                        ? `${match.winnerScore}-${match.loserScore}`
                                        : `${match.loserScore}-${match.winnerScore}`}
                                    </span>
                                  ) : null}
                                {match.tournamentMatchId != null && (
                                  <Badge color="amber" className="px-1.5">TOURNAMENT</Badge>
                                )}
                                {match.isChallenge && (
                                  <Badge color="purple" className="px-1.5">CHALLENGE</Badge>
                                )}
                                {isUpset(match) && (
                                  <Badge color="yellow" className="px-1.5">UPSET</Badge>
                                )}
                              </div>
                              <span
                                className={`text-sm font-mono tabular-nums ${ratingChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                              >
                                {ratingChange >= 0 ? '+' : ''}
                                {ratingChange}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {player.matches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Match History</h2>
          <div className="space-y-2">
            {player.matches.slice(0, visibleMatchCount).map((match) => {
              const won = match.winnerId === player.id;
              const ratingChange = Math.round(
                won ? match.winnerRatingChange : match.loserRatingChange,
              );
              const opponentId = won ? match.loserId : match.winnerId;
              const opponentName =
                opponentMap.get(opponentId) || `Player #${opponentId}`;

              const isTournament = match.tournamentMatchId != null;
              const hasBadges = isTournament || match.isChallenge || isUpset(match);

              const wl = (
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    won
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {won ? 'W' : 'L'}
                </span>
              );

              const nameEl = (
                <span className="text-sm truncate">
                  vs{' '}
                  <Link
                    to={`/players/${opponentId}`}
                    className="hover:text-emerald-400 transition-colors"
                  >
                    {opponentName}
                  </Link>
                </span>
              );

              const score =
                match.games && match.games.length > 0 && hasPointScores(match.games) ? (
                  <span className="text-slate-500 text-sm">
                    {won
                      ? `${match.winnerScore}-${match.loserScore}`
                      : `${match.loserScore}-${match.winnerScore}`}{' '}
                    ({match.games
                      .map((g) =>
                        g.winnerScore == null
                          ? '\u2013'
                          : won
                            ? `${g.winnerScore}-${g.loserScore}`
                            : `${g.loserScore}-${g.winnerScore}`,
                      )
                      .join(', ')})
                  </span>
                ) : match.winnerScore != null && match.loserScore != null ? (
                  <span className="text-slate-500 text-sm">
                    {won
                      ? `${match.winnerScore}-${match.loserScore}`
                      : `${match.loserScore}-${match.winnerScore}`}
                  </span>
                ) : null;

              const badges = (
                <>
                  {isTournament && <Badge color="amber">TOURNAMENT</Badge>}
                  {match.isChallenge && <Badge color="purple">CHALLENGE</Badge>}
                  {isUpset(match) && <Badge color="yellow">UPSET</Badge>}
                </>
              );

              const delta = (
                <span
                  className={`text-sm font-mono tabular-nums ${ratingChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {ratingChange >= 0 ? '+' : ''}
                  {ratingChange}
                </span>
              );

              return (
                <div
                  key={match.id}
                  className={`bg-slate-800 border rounded-lg px-4 py-3 ${
                    won ? 'border-emerald-500/20' : 'border-red-500/20'
                  }`}
                >
                  {/* Desktop: single row */}
                  <div className="hidden sm:flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {wl}
                      {nameEl}
                      {score}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {badges}
                      {delta}
                    </div>
                  </div>

                  {/* Mobile: stacked */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        {wl}
                        {nameEl}
                      </span>
                      <span className="shrink-0">{delta}</span>
                    </div>
                    {score && <div>{score}</div>}
                    {hasBadges && (
                      <div className="flex flex-wrap items-center gap-2">{badges}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {visibleMatchCount < player.matches.length && (
            <div ref={loadMoreRef} className="h-8 flex items-center justify-center text-xs text-slate-600">
              Loading more...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
