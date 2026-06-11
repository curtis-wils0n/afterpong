import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isUpset } from '../../lib/glicko';
import { hasPointScores } from '../../lib/games';
import type { Match, Player } from '../types';

const PAGE_SIZE = 25;

export default function MatchHistory() {
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState(false);
  const [page, setPage] = useState(0);
  const [filter1, setFilter1] = useState<number | ''>('');
  const [filter2, setFilter2] = useState<number | ''>('');

  const filterIds = useMemo(() => {
    const ids: number[] = [];
    if (filter1 !== '') ids.push(filter1);
    if (filter2 !== '' && filter2 !== filter1) ids.push(filter2);
    return ids;
  }, [filter1, filter2]);

  const isFiltered = filterIds.length > 0;

  useEffect(() => {
    api.players.list().then(setPlayers).catch(console.error);
  }, []);

  const fetchMatches = () => {
    setLoading(true);
    api.matches
      .list({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        playerIds: filterIds.length > 0 ? filterIds : undefined,
      })
      .then((res) => {
        setMatches(res.matches);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter1, filter2]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [filter1, filter2]);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (match: Match) => {
    if (
      !confirm(
        `Delete ${match.winner?.name ?? 'winner'} def. ${match.loser?.name ?? 'loser'}? ` +
          'All ratings will be recomputed from the remaining history. Ladder positions are not changed.',
      )
    )
      return;
    setDeletingId(match.id);
    try {
      await api.matches.delete(match.id);
      fetchMatches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete match');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUndo = async () => {
    if (!confirm('Undo the most recent match? This will revert rating and ladder changes.')) return;
    setUndoing(true);
    try {
      await api.matches.deleteLast();
      fetchMatches();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to undo match');
    } finally {
      setUndoing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * PAGE_SIZE < total;
  const showUndo = isAdmin && !isFiltered && page === 0;

  const player2Options = players.filter((p) => p.id !== filter1);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Match History</h1>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">Player</label>
          <select
            value={filter1}
            onChange={(e) => setFilter1(e.target.value ? Number(e.target.value) : '')}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">All players</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">vs. Player (optional)</label>
          <select
            value={filter2}
            onChange={(e) => setFilter2(e.target.value ? Number(e.target.value) : '')}
            disabled={filter1 === ''}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          >
            <option value="">Any opponent</option>
            {player2Options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {(filter1 !== '' || filter2 !== '') && (
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilter1('');
                setFilter2('');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          {isFiltered ? 'No matches match these filters.' : 'No matches yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match, index) => (
            <div key={match.id} className="flex items-center gap-2">
              <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Link
                      to={`/players/${match.winnerId}`}
                      className="font-medium text-emerald-400 hover:text-emerald-300 truncate"
                    >
                      {match.winner?.name ?? `Player ${match.winnerId}`}
                    </Link>
                    <span className="text-slate-500 shrink-0">def.</span>
                    <Link
                      to={`/players/${match.loserId}`}
                      className="font-medium text-red-400 hover:text-red-300 truncate"
                    >
                      {match.loser?.name ?? `Player ${match.loserId}`}
                    </Link>
                    {match.games && match.games.length > 0 && hasPointScores(match.games) ? (
                      <span className="text-slate-400 text-sm shrink-0">
                        {match.winnerScore}-{match.loserScore}
                        {' '}
                        <span className="text-slate-500">
                          ({match.games.map(g => g.winnerScore != null ? `${g.winnerScore}-${g.loserScore}` : '\u2013').join(', ')})
                        </span>
                      </span>
                    ) : match.winnerScore != null && match.loserScore != null ? (
                      <span className="text-slate-400 text-sm shrink-0">
                        {match.winnerScore}-{match.loserScore}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0 ml-3">
                    {match.tournamentMatchId != null && (
                      <span className="text-amber-400 text-xs font-medium px-2 py-0.5 bg-amber-400/10 rounded-full">
                        TOURNAMENT
                      </span>
                    )}
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
                    <span className="text-emerald-400 tabular-nums">
                      +{Math.round(match.winnerRatingChange)}
                    </span>
                    <span className="text-red-400 tabular-nums">
                      {Math.round(match.loserRatingChange)}
                    </span>
                    {isAdmin && (
                      <span className="text-slate-500 text-xs w-28 text-right">
                        {formatDate(match.createdAt)}
                      </span>
                    )}
                    {isAdmin && match.tournamentMatchId == null && (
                      <button
                        onClick={() => handleDelete(match)}
                        disabled={deletingId === match.id}
                        title="Delete match and recompute ratings"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-slate-600 hover:text-red-400 text-sm w-4 disabled:opacity-50"
                      >
                        {deletingId === match.id ? '\u2026' : '\u00d7'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {index === 0 && showUndo && (
                <button
                  onClick={handleUndo}
                  disabled={undoing}
                  className="shrink-0 text-xs text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded transition-colors disabled:opacity-50"
                >
                  {undoing ? 'Undoing...' : 'Undo'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-slate-500">
            Page {page + 1} of {totalPages} · {total} {total === 1 ? 'match' : 'matches'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!canPrev || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
