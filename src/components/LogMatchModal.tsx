import { useState } from 'react';
import { api } from '../lib/api';
import type { Player } from '../types';

interface Props {
  players: Player[];
  isChallenge?: boolean;
  preselectedPlayers?: { challengerId: number; targetId: number };
  onClose: () => void;
  onLogged: () => void;
}

export default function LogMatchModal({
  players,
  isChallenge: defaultIsChallenge = false,
  preselectedPlayers,
  onClose,
  onLogged,
}: Props) {
  const [winnerId, setWinnerId] = useState<number | ''>(
    preselectedPlayers ? '' : '',
  );
  const [loserId, setLoserId] = useState<number | ''>('');
  const [winnerScore, setWinnerScore] = useState('');
  const [loserScore, setLoserScore] = useState('');
  const [isChallenge, setIsChallenge] = useState(defaultIsChallenge);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // For challenge matches with preselected players, restrict to those two
  const challengePlayers = preselectedPlayers
    ? players.filter(
        (p) =>
          p.id === preselectedPlayers.challengerId ||
          p.id === preselectedPlayers.targetId,
      )
    : players;

  const availablePlayers = isChallenge ? challengePlayers : players;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (winnerId === '' || loserId === '') return;
    if (winnerId === loserId) {
      setError('Winner and loser must be different');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.matches.create({
        winnerId: Number(winnerId),
        loserId: Number(loserId),
        ...(winnerScore ? { winnerScore: Number(winnerScore) } : {}),
        ...(loserScore ? { loserScore: Number(loserScore) } : {}),
        isChallenge,
      });
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log match');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Log Match</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Winner</label>
            <select
              value={winnerId}
              onChange={(e) =>
                setWinnerId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="">Select winner...</option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.elo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Loser</label>
            <select
              value={loserId}
              onChange={(e) =>
                setLoserId(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="">Select loser...</option>
              {availablePlayers
                .filter((p) => p.id !== winnerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.elo})
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Winner Score{' '}
                <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                value={winnerScore}
                onChange={(e) => setWinnerScore(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                placeholder="21"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Loser Score{' '}
                <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                value={loserScore}
                onChange={(e) => setLoserScore(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                placeholder="18"
              />
            </div>
          </div>

          {!preselectedPlayers && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isChallenge}
                onChange={(e) => setIsChallenge(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-300">Challenge match</span>
            </label>
          )}

          {isChallenge && preselectedPlayers && (
            <div className="text-xs text-purple-400 bg-purple-400/10 rounded-lg px-3 py-2">
              Challenge match — if the lower-ranked player wins, they take the
              higher rank.
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={winnerId === '' || loserId === '' || submitting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Logging...' : 'Log Match'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
