import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Match } from '../types';

export default function MatchHistory() {
  const { isAdmin } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState(false);

  const fetchMatches = () => {
    api.matches
      .list()
      .then(setMatches)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleUndo = async () => {
    if (!confirm('Undo the most recent match? This will revert ELO and ladder changes.')) return;
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Match History</h1>
      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : matches.length === 0 ? (
        <div className="text-center text-slate-500 py-12">No matches yet.</div>
      ) : (
        <div className="space-y-2">
          {matches.map((match, index) => (
            <div key={match.id} className="flex items-center gap-2">
              <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
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
                    {match.winnerScore != null && match.loserScore != null && (
                      <span className="text-slate-400 text-sm shrink-0">
                        {match.winnerScore}-{match.loserScore}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0 ml-3">
                    {match.isChallenge && (
                      <span className="text-purple-400 text-xs font-medium px-2 py-0.5 bg-purple-400/10 rounded-full">
                        CHALLENGE
                      </span>
                    )}
                    {match.winnerEloChange > 20 && (
                      <span className="text-yellow-400 text-xs font-medium px-2 py-0.5 bg-yellow-400/10 rounded-full">
                        UPSET
                      </span>
                    )}
                    <span className="text-emerald-400 tabular-nums">
                      +{match.winnerEloChange}
                    </span>
                    <span className="text-red-400 tabular-nums">
                      {match.loserEloChange}
                    </span>
                    <span className="text-slate-500 text-xs w-28 text-right">
                      {formatDate(match.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              {index === 0 && isAdmin && (
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
    </div>
  );
}
