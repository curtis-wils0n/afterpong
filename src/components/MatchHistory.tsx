import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isUpset, preMatchWinnerOdds } from '../../lib/glicko';
import { hasPointScores } from '../../lib/games';
import type { Match, Player } from '../types';
import LogMatchModal from './LogMatchModal';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PAGE_SIZE = 25;

// Blend the odds chip from slate-500 (routine result, >=50%) toward the
// upset yellow-400 as the winner's odds drop (fully yellow at <=10%).
function oddsColor(odds: number): string {
  const t = Math.min(1, Math.max(0, (0.5 - odds) / 0.4));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(100, 250)}, ${mix(116, 204)}, ${mix(139, 21)})`;
}

export default function MatchHistory() {
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showLogMatch, setShowLogMatch] = useState(false);
  const [filter1, setFilter1] = useState<number | ''>('');
  const [filter2, setFilter2] = useState<number | ''>('');

  const filterIds = useMemo(() => {
    const ids: number[] = [];
    if (filter1 !== '') ids.push(filter1);
    if (filter2 !== '' && filter2 !== filter1) ids.push(filter2);
    return ids;
  }, [filter1, filter2]);

  const isFiltered = filterIds.length > 0;
  const hasMore = matches.length < total;

  useEffect(() => {
    api.players.list().then(setPlayers).catch(console.error);
  }, []);

  // Load (or reload) the first page whenever the filters change.
  useEffect(() => {
    setLoading(true);
    api.matches
      .list({
        limit: PAGE_SIZE,
        offset: 0,
        playerIds: filterIds.length > 0 ? filterIds : undefined,
      })
      .then((res) => {
        setMatches(res.matches);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter1, filter2]);

  const loadMore = () => {
    if (loading || loadingMore) return;
    const offset = matches.length;
    setLoadingMore(true);
    api.matches
      .list({
        limit: PAGE_SIZE,
        offset,
        playerIds: filterIds.length > 0 ? filterIds : undefined,
      })
      .then((res) => {
        setMatches((prev) => [...prev, ...res.matches]);
        // Guard against a stale/over-counted total looping the observer forever.
        setTotal(res.matches.length === 0 ? offset : res.total);
      })
      .catch(console.error)
      .finally(() => setLoadingMore(false));
  };

  // Quietly re-fetch the rows we've already loaded (preserving scroll depth)
  // after a mutation that changes the list.
  const reload = () => {
    const count = Math.max(PAGE_SIZE, matches.length);
    api.matches
      .list({
        limit: count,
        offset: 0,
        playerIds: filterIds.length > 0 ? filterIds : undefined,
      })
      .then((res) => {
        setMatches(res.matches);
        setTotal(res.total);
      })
      .catch(console.error);
  };

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, matches.length, filterIds]);

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
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete match');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUndo = async () => {
    if (!confirm('Undo the most recent match? This will revert rating and ladder changes.')) return;
    setUndoing(true);
    try {
      await api.matches.deleteLast();
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to undo match');
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

  const showUndo = isAdmin && !isFiltered;

  const player2Options = players.filter((p) => p.id !== filter1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Match History</h1>
        <Button onClick={() => setShowLogMatch(true)} disabled={players.length < 2}>
          Log Match
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">Player</label>
          <Combobox
            options={[
              { value: 'all', label: 'All players' },
              ...players.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
            value={filter1 === '' ? 'all' : String(filter1)}
            onChange={(v) => setFilter1(v === 'all' ? '' : Number(v))}
            searchPlaceholder="Search players…"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">vs. Player (optional)</label>
          <Combobox
            options={[
              { value: 'all', label: 'Any opponent' },
              ...player2Options.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
            value={filter2 === '' ? 'all' : String(filter2)}
            onChange={(v) => setFilter2(v === 'all' ? '' : Number(v))}
            disabled={filter1 === ''}
            searchPlaceholder="Search players…"
          />
        </div>
        {(filter1 !== '' || filter2 !== '') && (
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setFilter1('');
                setFilter2('');
              }}
              className="text-xs px-3 py-2 bg-slate-700/50 hover:bg-slate-700 hover:text-slate-200"
            >
              Clear
            </Button>
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
        <>
          <div className="space-y-2">
            {matches.map((match, index) => {
              const odds = preMatchWinnerOdds(match);
              const isTournament = match.tournamentMatchId != null;
              const showMeta =
                odds != null || isTournament || match.isChallenge || isUpset(match) || isAdmin;

              const matchup = (
                <>
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
                </>
              );

              const score =
                match.games && match.games.length > 0 && hasPointScores(match.games) ? (
                  <span className="text-slate-400 text-sm shrink-0">
                    {match.winnerScore}-{match.loserScore}{' '}
                    <span className="text-slate-500">
                      ({match.games
                        .map((g) =>
                          g.winnerScore != null ? `${g.winnerScore}-${g.loserScore}` : '–',
                        )
                        .join(', ')})
                    </span>
                  </span>
                ) : match.winnerScore != null && match.loserScore != null ? (
                  <span className="text-slate-400 text-sm shrink-0">
                    {match.winnerScore}-{match.loserScore}
                  </span>
                ) : null;

              const chips = (
                <>
                  {odds != null && (
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: oddsColor(odds) }}
                      title="Winner's pre-match win odds"
                    >
                      {Math.round(odds * 100)}%
                    </span>
                  )}
                  {isTournament && (
                    <Badge color="amber">TOURNAMENT</Badge>
                  )}
                  {match.isChallenge && (
                    <Badge color="purple">CHALLENGE</Badge>
                  )}
                  {isUpset(match) && (
                    <Badge color="yellow">UPSET</Badge>
                  )}
                </>
              );

              const deltas = (
                <>
                  <span className="text-emerald-400 tabular-nums">
                    +{Math.round(match.winnerRatingChange)}
                  </span>
                  <span className="text-red-400 tabular-nums">
                    {Math.round(match.loserRatingChange)}
                  </span>
                </>
              );

              const dateEl = isAdmin ? (
                <span className="text-slate-500 text-xs whitespace-nowrap">
                  {formatDate(match.createdAt)}
                </span>
              ) : null;

              // The most recent match (unfiltered) undoes — reverting rating
              // *and* ladder changes. Any other match is a plain delete that
              // recomputes ratings but leaves ladder positions untouched.
              const isMostRecent = index === 0 && showUndo;
              const actionBusy = isMostRecent ? undoing : deletingId === match.id;
              const actionBtn =
                isMostRecent || (isAdmin && !isTournament) ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => (isMostRecent ? handleUndo() : handleDelete(match))}
                    disabled={actionBusy}
                    title={
                      isMostRecent
                        ? 'Undo most recent match (reverts rating and ladder changes)'
                        : 'Delete match and recompute ratings'
                    }
                    className="w-4 shrink-0 text-slate-600 opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    {actionBusy ? '…' : '×'}
                  </Button>
                ) : null;

              return (
                <div key={match.id} className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 group">
                    {/* Desktop: single row */}
                    <div className="hidden sm:flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {matchup}
                        {score}
                      </div>
                      <div className="flex items-center gap-3 text-sm shrink-0 ml-3">
                        {chips}
                        {deltas}
                        {dateEl && <span className="w-28 text-right">{dateEl}</span>}
                        {actionBtn}
                      </div>
                    </div>

                    {/* Mobile: stacked */}
                    <div className="flex flex-col gap-1 sm:hidden">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                          {matchup}
                        </div>
                        {actionBtn}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {score ?? <span />}
                        <span className="flex items-center gap-2 shrink-0 text-sm">{deltas}</span>
                      </div>
                      {showMeta && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          {chips}
                          {dateEl && <span className="ml-auto">{dateEl}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore ? (
            <div ref={sentinelRef} className="py-4 text-center text-sm text-slate-500">
              {loadingMore ? 'Loading more…' : ''}
            </div>
          ) : (
            <div className="mt-4 text-center text-sm text-slate-500">
              {total} {total === 1 ? 'match' : 'matches'}
            </div>
          )}
        </>
      )}

      {showLogMatch && (
        <LogMatchModal
          players={players}
          onClose={() => setShowLogMatch(false)}
          onLogged={() => {
            setShowLogMatch(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
