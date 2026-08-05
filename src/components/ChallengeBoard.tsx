import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { conservativeRating } from '../../lib/glicko';
import type { Player } from '../types';
import LogMatchModal from './LogMatchModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export default function ChallengeBoard() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenger, setSelectedChallenger] = useState<number | null>(null);
  const [showLogMatch, setShowLogMatch] = useState(false);
  const [challengeMatch, setChallengeMatch] = useState<{
    challengerId: number;
    targetId: number;
  } | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchPlayers = async () => {
    try {
      const data = await api.players.list('rank', true);
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
      toast.error(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setAdding(false);
    }
  };

  const getValidTargets = (player: Player): number[] => {
    if (player.onVacation) return [];
    if (player.challengeRank == null) {
      // Play-in: unplaced players can challenge the bottom 2 active placed players.
      return players
        .filter((p) => !p.onVacation && p.challengeRank != null)
        .sort((a, b) => b.challengeRank! - a.challengeRank!)
        .slice(0, 2)
        .map((p) => p.id);
    }
    if (player.challengeRank <= 1) return [];
    const targets: number[] = [];
    for (const other of players) {
      if (other.id === player.id) continue;
      if (other.onVacation) continue;
      if (other.challengeRank == null) continue;
      if (other.challengeRank >= player.challengeRank) continue;
      // Count active players strictly between the two ranks.
      const between = players.filter(
        (p) =>
          !p.onVacation &&
          p.challengeRank != null &&
          p.challengeRank > other.challengeRank! &&
          p.challengeRank < player.challengeRank!,
      ).length;
      if (between <= 1) {
        targets.push(other.id);
      }
    }
    return targets;
  };

  const selectedPlayer = players.find((p) => p.id === selectedChallenger);
  const validTargets = selectedPlayer ? getValidTargets(selectedPlayer) : [];

  // A player can challenge if there's at least one active player ranked above
  // them; unplaced players can play in against anyone placed.
  const canChallengeUp = (player: Player): boolean => {
    if (player.onVacation) return false;
    if (player.challengeRank == null) {
      return players.some((p) => !p.onVacation && p.challengeRank != null);
    }
    return players.some(
      (p) =>
        !p.onVacation &&
        p.challengeRank != null &&
        p.challengeRank < player.challengeRank!,
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Challenge Ladder</h1>
        <div className="flex items-center gap-2">
          {selectedChallenger && (
            <button
              onClick={() => setSelectedChallenger(null)}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Clear selection
            </button>
          )}
          <Button onClick={() => setShowLogMatch(true)} disabled={players.length < 2}>
            Log Match
          </Button>
        </div>
      </div>

      <form onSubmit={handleAddPlayer} className="mb-6 flex gap-2">
        <Input
          type="text"
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
          placeholder="Add a player..."
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={!newPlayerName.trim() || adding}>
          Add
        </Button>
      </form>

      {selectedChallenger && (
        <div className="bg-slate-800 border border-emerald-500/30 rounded-lg px-4 py-3 mb-4 text-sm text-slate-300">
          {selectedPlayer?.challengeRank == null
            ? 'Select an opponent highlighted in green to log a play-in match. Win to take their spot on the ladder; lose and you start at the bottom.'
            : 'Select an opponent highlighted in green to log a challenge match. Players can challenge up to 2 ranks above them.'}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : players.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No players yet. Add someone to get started!
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((player) => {
            const isSelected = selectedChallenger === player.id;
            const isValidTarget = validTargets.includes(player.id);
            const canChallenge = canChallengeUp(player);
            const isVacation = player.onVacation;

            return (
              <div key={player.id} className="flex items-center gap-2">
                <div
                  className={`flex-1 flex items-center gap-2 rounded-lg px-4 py-3 border transition-colors sm:gap-4 ${
                    isVacation
                      ? 'bg-slate-800/40 border-slate-700/50 opacity-50'
                      : isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50'
                        : isValidTarget
                          ? 'bg-emerald-500/5 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/15'
                          : 'bg-slate-800 border-slate-700'
                  }`}
                  onClick={() => {
                    if (isVacation) return;
                    if (isValidTarget) {
                      setChallengeMatch({
                        challengerId: selectedChallenger!,
                        targetId: player.id,
                      });
                    } else if (!selectedChallenger && canChallenge) {
                      setSelectedChallenger(player.id);
                    } else if (isSelected) {
                      setSelectedChallenger(null);
                    }
                  }}
                >
                  <span
                    className={`text-lg font-bold w-10 text-center ${
                      player.challengeRank === 1
                        ? 'text-yellow-400'
                        : player.challengeRank === 2
                          ? 'text-slate-300'
                          : player.challengeRank === 3
                            ? 'text-amber-600'
                            : 'text-slate-400'
                    }`}
                  >
                    {player.challengeRank == null
                      ? '–'
                      : player.challengeRank === 1
                        ? '\u{1F451}'
                        : player.challengeRank === 2
                          ? '\u{1F948}'
                          : player.challengeRank === 3
                            ? '\u{1F949}'
                            : `#${player.challengeRank}`}
                  </span>
                  <Link
                    to={`/players/${player.id}`}
                    className="flex-1 font-medium hover:text-emerald-400 transition-colors flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{player.name}</span>
                    {isVacation && (
                      <Badge color="sky" className="text-[10px] px-1.5">
                        VACATION
                      </Badge>
                    )}
                  </Link>
                  <div className="hidden w-20 shrink-0 sm:flex justify-end gap-0.5">
                    {player.defenses != null && player.defenses > 0 &&
                      Array.from({ length: player.defenses }, (_, i) => (
                        <span key={`d${i}`} className="text-sm" title={`${player.defenses} defense${player.defenses === 1 ? '' : 's'}`}>{'\u{1F6E1}\u{FE0F}'}</span>
                      ))
                    }
                    {player.challengeStreak != null && player.challengeStreak > 0 &&
                      Array.from({ length: player.challengeStreak }, (_, i) => (
                        <span key={`c${i}`} className="text-sm" title={`${player.challengeStreak} challenge win${player.challengeStreak === 1 ? '' : 's'}`}>{'\u{1F525}'}</span>
                      ))
                    }
                  </div>
                  <span className="text-sm text-slate-500 tabular-nums w-16 text-right shrink-0 sm:w-20">
                    {Math.round(conservativeRating(player))}
                  </span>
                </div>
                <div className="w-20 shrink-0 flex justify-end sm:w-24">
                  {!selectedChallenger && canChallenge && !isVacation && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setSelectedChallenger(player.id)}
                      className="text-slate-500 hover:text-emerald-400"
                    >
                      {player.challengeRank == null ? 'Play in' : 'Challenge up'}
                    </Button>
                  )}
                  {isValidTarget && (
                    <button
                      onClick={() =>
                        setChallengeMatch({
                          challengerId: selectedChallenger!,
                          targetId: player.id,
                        })
                      }
                      className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded hover:bg-emerald-500/20 transition-colors"
                    >
                      Log match
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showLogMatch && (
        <LogMatchModal
          players={players}
          onClose={() => setShowLogMatch(false)}
          onLogged={() => {
            setShowLogMatch(false);
            fetchPlayers();
          }}
        />
      )}

      {challengeMatch && (
        <LogMatchModal
          players={players}
          isChallenge
          preselectedPlayers={challengeMatch}
          onClose={() => setChallengeMatch(null)}
          onLogged={() => {
            setChallengeMatch(null);
            setSelectedChallenger(null);
            fetchPlayers();
          }}
        />
      )}
    </div>
  );
}
