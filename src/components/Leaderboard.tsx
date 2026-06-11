import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { conservativeRating } from '../../lib/glicko';
import type { Player } from '../types';
import LogMatchModal from './LogMatchModal';

const displayRating = (p: Player) => Math.round(conservativeRating(p));
// Shown uncertainty is 2×RD, derived so the arithmetic is exact on screen:
// leaderboard score = skill − ±.
const displaySkill = (p: Player) => Math.round(p.rating);
const displayUncertainty = (p: Player) => displaySkill(p) - displayRating(p);

export default function Leaderboard() {
  // ?log=1 (the PWA "Log a match" shortcut) opens the modal immediately.
  const [searchParams, setSearchParams] = useSearchParams();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogMatch, setShowLogMatch] = useState(searchParams.get('log') === '1');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchPlayers = async () => {
    try {
      const data = await api.players.list('rating', true);
      setPlayers(data);
    } catch (err) {
      console.error('Failed to fetch players:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, []);

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || adding) return;
    setAdding(true);
    try {
      await api.players.create(newPlayerName.trim());
      setNewPlayerName('');
      await fetchPlayers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setAdding(false);
    }
  };

  // Compute display ranks accounting for ties
  const displayRanks: number[] = [];
  for (let i = 0; i < players.length; i++) {
    if (i === 0) {
      displayRanks.push(1);
    } else if (displayRating(players[i]) === displayRating(players[i - 1])) {
      displayRanks.push(displayRanks[i - 1]);
    } else {
      displayRanks.push(i + 1);
    }
  }

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-slate-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-slate-500';
  };

  const getRankLabel = (rank: number, index: number) => {
    // Hide rank if it's a tie and not the first with this rank
    if (index > 0 && displayRanks[index] === displayRanks[index - 1]) return '';
    if (rank === 1) return '\u{1F451}';
    if (rank === 2) return '\u{1F948}';
    if (rank === 3) return '\u{1F949}';
    return `#${rank}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <button
          onClick={() => setShowLogMatch(true)}
          disabled={players.length < 2}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Log Match
        </button>
      </div>

      <form onSubmit={handleAddPlayer} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
          placeholder="Add a player..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={!newPlayerName.trim() || adding}
          className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : players.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No players yet. Add someone to get started!
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player, index) => (
            <Link
              key={player.id}
              to={`/players/${player.id}`}
              className={`flex items-center gap-4 border rounded-lg px-4 py-3 transition-colors group ${
                player.onVacation
                  ? 'bg-slate-800/40 border-slate-700/50 opacity-50 hover:opacity-80 hover:bg-slate-800'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
              }`}
            >
              <span
                className={`text-lg font-bold w-10 text-center ${getRankStyle(displayRanks[index])}`}
              >
                {getRankLabel(displayRanks[index], index)}
              </span>
              <span className="flex-1 font-medium group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                <span>{player.name}</span>
                {player.onVacation && (
                  <span className="text-sky-400 text-[10px] font-medium px-1.5 py-0.5 bg-sky-400/10 rounded-full">
                    VACATION
                  </span>
                )}
              </span>
              {player.wins != null && player.losses != null && (
                <span className="text-sm text-slate-500 tabular-nums">
                  <span className="text-emerald-400">{player.wins}W</span>
                  <span className="text-slate-600 mx-0.5">-</span>
                  <span className="text-red-400">{player.losses}L</span>
                </span>
              )}
              <span className="text-right">
                <span className="block text-lg font-mono font-bold tabular-nums leading-tight">
                  {displayRating(player)}
                </span>
                <span className="block text-[10px] font-mono text-slate-500 tabular-nums leading-tight">
                  {displaySkill(player)} ±{displayUncertainty(player)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {showLogMatch && (
        <LogMatchModal
          players={players}
          onClose={() => {
            setShowLogMatch(false);
            if (searchParams.has('log')) setSearchParams({}, { replace: true });
          }}
          onLogged={() => {
            setShowLogMatch(false);
            if (searchParams.has('log')) setSearchParams({}, { replace: true });
            fetchPlayers();
          }}
        />
      )}
    </div>
  );
}
