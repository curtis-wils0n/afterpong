import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { isUpset } from '../../lib/elo';
import {
  computeNemesis,
  computeRival,
  computeFriend,
} from '../../lib/badges';
import type { PlayerProfile as PlayerProfileType } from '../types';

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<PlayerProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedH2H, setExpandedH2H] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.players
      .get(Number(id))
      .then(setPlayer)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

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

  const opponentMap = new Map<number, string>();
  player.headToHead.forEach((h) => {
    opponentMap.set(h.opponent.id, h.opponent.name);
  });

  // Compute ELO history from matches (oldest to newest)
  const eloHistory = (() => {
    if (player.matches.length === 0) return [];

    const chronological = [...player.matches].reverse();
    let startElo = player.elo;
    for (const m of player.matches) {
      const change = m.winnerId === player.id ? m.winnerEloChange : m.loserEloChange;
      startElo -= change;
    }

    const points: { label: string; elo: number; opponent: string; date: string }[] = [
      { label: 'Start', elo: startElo, opponent: '', date: '' },
    ];

    let currentElo = startElo;
    for (const m of chronological) {
      const won = m.winnerId === player.id;
      const change = won ? m.winnerEloChange : m.loserEloChange;
      currentElo += change;
      const opponentId = won ? m.loserId : m.winnerId;
      points.push({
        label: `#${points.length}`,
        elo: currentElo,
        opponent: opponentMap.get(opponentId) || `Player #${opponentId}`,
        date: new Date(m.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      });
    }

    return points;
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
            <h1 className="text-2xl font-bold">{player.name}</h1>
            {player.challengeRank != null && (
              <span className="text-sm text-slate-400">
                Ladder Rank #{player.challengeRank}
              </span>
            )}
          </div>
          <span className="text-3xl font-mono font-bold">{player.elo}</span>
        </div>
        <div className="grid grid-cols-4 gap-4 text-center">
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

      {/* ELO Chart */}
      {eloHistory.length > 1 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h3 className="text-sm text-slate-400 mb-3">ELO History</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={eloHistory}>
              <XAxis dataKey="label" hide />
              <YAxis
                domain={['dataMin - 20', 'dataMax + 20']}
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
                formatter={(value) => [`${value}`, 'ELO']}
                labelFormatter={(_label, payload) => {
                  const data = payload?.[0]?.payload as { opponent?: string; date?: string } | undefined;
                  if (!data?.opponent) return '';
                  return `vs ${data.opponent} · ${data.date}`;
                }}
              />
              <Line
                type="monotone"
                dataKey="elo"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10b981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Streak & Form */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm text-slate-400 mb-2">Current Streak</h3>
          {player.streak ? (
            <span
              className={`text-2xl font-bold ${player.streak.type === 'W' ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {player.streak.count}
              {player.streak.type}
            </span>
          ) : (
            <span className="text-slate-500">No matches</span>
          )}
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm text-slate-400 mb-2">Recent Form</h3>
          <div className="flex gap-1">
            {player.recentForm.length > 0 ? (
              player.recentForm.map((result, i) => (
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
              ))
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

                const netElo = h2hMatches.reduce((sum, m) => {
                  const change = m.winnerId === player.id
                    ? m.winnerEloChange
                    : m.loserEloChange;
                  return sum + change;
                }, 0);

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
                          <span className="text-red-400 text-xs font-medium px-2 py-0.5 bg-red-400/10 rounded-full">
                            NEMESIS
                          </span>
                        )}
                        {h2h.opponent.id === rivalId && (
                          <span className="text-amber-400 text-xs font-medium px-2 py-0.5 bg-amber-400/10 rounded-full">
                            RIVAL
                          </span>
                        )}
                        {h2h.opponent.id === friendId && (
                          <span className="text-sky-400 text-xs font-medium px-2 py-0.5 bg-sky-400/10 rounded-full">
                            FRIEND
                          </span>
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
                        <span className="text-sm">
                          <span className="text-emerald-400">{h2h.wins}W</span>
                          <span className="text-slate-600 mx-1">-</span>
                          <span className="text-red-400">{h2h.losses}L</span>
                        </span>
                        <span className="text-slate-700">|</span>
                        <span className={`text-xs font-mono tabular-nums ${netElo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {netElo >= 0 ? '+' : ''}{netElo}
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
                          const eloChange = won
                            ? match.winnerEloChange
                            : match.loserEloChange;
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
                                {match.games && match.games.length > 0 ? (
                                  <span className="text-slate-500 text-sm">
                                    {won
                                      ? `${match.winnerScore}-${match.loserScore}`
                                      : `${match.loserScore}-${match.winnerScore}`}
                                    {' '}
                                    ({match.games.map(g =>
                                      won ? `${g.winnerScore}-${g.loserScore}` : `${g.loserScore}-${g.winnerScore}`
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
                                {match.isChallenge && (
                                  <span className="text-purple-400 text-xs font-medium px-1.5 py-0.5 bg-purple-400/10 rounded-full">
                                    CHALLENGE
                                  </span>
                                )}
                                {isUpset(match) && (
                                  <span className="text-yellow-400 text-xs font-medium px-1.5 py-0.5 bg-yellow-400/10 rounded-full">
                                    UPSET
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-sm font-mono tabular-nums ${eloChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                              >
                                {eloChange >= 0 ? '+' : ''}
                                {eloChange}
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
            {player.matches.map((match) => {
              const won = match.winnerId === player.id;
              const eloChange = won
                ? match.winnerEloChange
                : match.loserEloChange;
              const opponentId = won ? match.loserId : match.winnerId;
              const opponentName =
                opponentMap.get(opponentId) || `Player #${opponentId}`;

              return (
                <div
                  key={match.id}
                  className={`bg-slate-800 border rounded-lg px-4 py-3 ${
                    won ? 'border-emerald-500/20' : 'border-red-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
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
                      <span className="text-sm">
                        vs{' '}
                        <Link
                          to={`/players/${opponentId}`}
                          className="hover:text-emerald-400 transition-colors"
                        >
                          {opponentName}
                        </Link>
                      </span>
                      {match.games && match.games.length > 0 ? (
                        <span className="text-slate-500 text-sm">
                          {won
                            ? `${match.winnerScore}-${match.loserScore}`
                            : `${match.loserScore}-${match.winnerScore}`}
                          {' '}
                          ({match.games.map(g =>
                            won ? `${g.winnerScore}-${g.loserScore}` : `${g.loserScore}-${g.winnerScore}`
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
                    </div>
                    <div className="flex items-center gap-2">
                      {match.isChallenge && (
                        <span className="text-purple-400 text-xs font-medium px-2 py-0.5 bg-purple-400/10 rounded-full">
                          CHALLENGE
                        </span>
                      )}
                      {isUpset(match) && (
                        <span className="text-yellow-400 text-xs font-medium px-2 py-0.5 bg-yellow-400/10 rounded-full">
                          UPSET
                        </span>
                      )}
                      <span
                        className={`text-sm font-mono tabular-nums ${eloChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {eloChange >= 0 ? '+' : ''}
                        {eloChange}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
