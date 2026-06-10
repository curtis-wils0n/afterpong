import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { TournamentDetail as TournamentDetailType, TournamentMatch, Player } from '../types';
import TournamentBracket from './TournamentBracket';
import LogMatchModal from './LogMatchModal';

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tournament, setTournament] = useState<TournamentDetailType | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [activeMatch, setActiveMatch] = useState<TournamentMatch | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);

  const fetchTournament = async () => {
    if (!id) return;
    try {
      const [t, p] = await Promise.all([
        api.tournaments.get(Number(id)),
        api.players.list(),
      ]);
      setTournament(t);
      setAllPlayers(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournament();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCancel = async () => {
    if (!tournament) return;
    if (
      !confirm(
        `Cancel and delete tournament "${tournament.name}"? Played matches will be kept (rating changes stay applied) but the bracket will be removed.`,
      )
    )
      return;
    try {
      await api.tournaments.delete(tournament.id);
      navigate('/tournaments');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel tournament');
    }
  };

  if (loading) {
    return <div className="text-center text-slate-500 py-12">Loading...</div>;
  }
  if (!tournament) {
    return (
      <div className="text-center text-slate-500 py-12">
        Tournament not found.
      </div>
    );
  }

  const isActive = tournament.status === 'active';

  return (
    <div>
      <Link
        to="/tournaments"
        className="text-sm text-slate-500 hover:text-slate-300 mb-4 inline-block"
      >
        &larr; All tournaments
      </Link>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold">{tournament.name}</h1>
            <div className="text-sm text-slate-500 mt-1">
              {tournament.seeding === 'snake' ? 'Snake seeding' : 'Random seeding'}
              {' · '}
              {tournament.participants.length} players
              {isActive ? ' · In progress' : ' · Completed'}
            </div>
          </div>
          {tournament.winner && (
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase tracking-wider">
                Champion
              </div>
              <div className="text-yellow-400 font-bold text-lg">
                {'\u{1F451}'} {tournament.winner.name}
              </div>
            </div>
          )}
        </div>
        {isAdmin && isActive && (
          <button
            onClick={handleCancel}
            className="mt-2 text-xs text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded transition-colors"
          >
            Cancel tournament
          </button>
        )}
      </div>

      <TournamentBracket
        matches={tournament.matches}
        onMatchClick={isActive ? setActiveMatch : undefined}
      />

      {activeMatch &&
        activeMatch.player1Id != null &&
        activeMatch.player2Id != null && (
          <LogMatchModal
            players={allPlayers}
            preselectedPlayers={{
              challengerId: activeMatch.player1Id,
              targetId: activeMatch.player2Id,
            }}
            tournamentMatchId={activeMatch.id}
            tournamentId={tournament.id}
            onClose={() => setActiveMatch(null)}
            onLogged={() => {
              setActiveMatch(null);
              fetchTournament();
            }}
          />
        )}
    </div>
  );
}
