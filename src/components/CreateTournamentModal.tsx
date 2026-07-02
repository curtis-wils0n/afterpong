import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { seedParticipants, buildRoundOneSlots } from '../../lib/bracket';
import { conservativeRating } from '../../lib/glicko';
import type { Player, TournamentSeeding } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTournamentModal({ onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [seeding, setSeeding] = useState<TournamentSeeding>('snake');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [players, setPlayers] = useState<Player[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.players
      .list('rating')
      .then(setPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load players'));
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPlayers = players.filter((p) => selected.has(p.id));

  // Live preview of seed order. For random seeding we just show "Random" instead
  // of trying to display a shuffle that won't match what the server picks.
  const previewSeeds = useMemo(() => {
    if (seeding !== 'snake') return [];
    return seedParticipants(
      selectedPlayers.map((p) => ({ id: p.id, rating: conservativeRating(p) })),
      'snake',
    );
  }, [selectedPlayers, seeding]);

  const previewBracket = useMemo(() => {
    if (selectedPlayers.length < 2) return null;
    return buildRoundOneSlots(selectedPlayers.length);
  }, [selectedPlayers.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selected.size < 2 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.tournaments.create({
        name: name.trim(),
        seeding,
        playerIds: [...selected],
      });
      onCreated();
      navigate(`/tournaments/${result.tournamentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
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
        className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Create Tournament</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spring 2026 Showdown"
              className="w-full bg-slate-700 border-slate-600"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Seeding</label>
            <div className="flex gap-2">
              {(['snake', 'random'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeeding(s)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    seeding === s
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {s === 'snake' ? 'Snake (by rating)' : 'Random'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Participants{' '}
              <span className="text-slate-600">({selected.size} selected)</span>
            </label>
            <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto sm:grid-cols-2 bg-slate-900/50 border border-slate-700 rounded-lg p-2">
              {players.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`text-left px-2 py-1.5 rounded text-sm transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <span className="inline-block w-4 text-slate-500">
                      {isSelected ? '✓' : ''}
                    </span>
                    {p.name}{' '}
                    <span className="text-slate-600 text-xs">({Math.round(conservativeRating(p))})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {previewBracket && (
            <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 text-xs space-y-1">
              <div className="text-slate-400">
                Bracket size: <span className="text-slate-200">{previewBracket.bracketSize}</span>
                {' · '}
                Round 1 matches:{' '}
                <span className="text-slate-200">
                  {previewBracket.slots.filter(
                    (s) => s.player1Seed != null && s.player2Seed != null,
                  ).length}
                </span>
                {' · '}
                Byes:{' '}
                <span className="text-slate-200">
                  {previewBracket.bracketSize - selectedPlayers.length}
                </span>
              </div>
              {seeding === 'snake' && previewSeeds.length > 0 && (
                <div className="text-slate-500">
                  Seeds:{' '}
                  {previewSeeds
                    .map((s) => {
                      const player = selectedPlayers.find(
                        (p) => p.id === s.playerId,
                      );
                      return `#${s.seed} ${player?.name ?? '?'}`;
                    })
                    .join(', ')}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || selected.size < 2 || submitting}
              className="flex-1"
            >
              {submitting ? 'Creating...' : 'Create Tournament'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
