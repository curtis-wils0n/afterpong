import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { expectedScore } from '../../lib/glicko';
import type { Player } from '../types';

interface Props {
  players: Player[];
  isChallenge?: boolean;
  preselectedPlayers?: { challengerId: number; targetId: number };
  // When set, route the submission through the tournament logging endpoint.
  tournamentId?: number;
  tournamentMatchId?: number;
  onClose: () => void;
  onLogged: () => void;
}

export default function LogMatchModal({
  players,
  isChallenge: defaultIsChallenge = false,
  preselectedPlayers,
  tournamentId,
  tournamentMatchId,
  onClose,
  onLogged,
}: Props) {
  const [player1Id, setPlayer1Id] = useState<number | ''>(
    preselectedPlayers?.challengerId ?? '',
  );
  const [player2Id, setPlayer2Id] = useState<number | ''>(
    preselectedPlayers?.targetId ?? '',
  );
  type GameRow = {
    player1Score: string;
    player2Score: string;
    // Scoreless mode: which player won this game (no points recorded).
    scorelessWinner: 1 | 2 | null;
  };
  const emptyRow = (): GameRow => ({
    player1Score: '',
    player2Score: '',
    scorelessWinner: null,
  });
  const [gameScores, setGameScores] = useState<GameRow[]>([emptyRow()]);
  // When off, games are logged without point scores: each game just records
  // who won it.
  const [trackPoints, setTrackPoints] = useState(true);
  const isTournament = tournamentMatchId != null;
  // Tournament matches are never challenge matches.
  const [isChallenge, setIsChallenge] = useState(
    isTournament ? false : defaultIsChallenge,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Arrow key scoring: left = point for player 1, right = point for player 2
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (player1Id === '' || player2Id === '') return;
      if (!trackPoints) return;

      e.preventDefault();
      const field = e.key === 'ArrowLeft' ? 'player1Score' : 'player2Score';
      setGameScores((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        const current = Number(updated[lastIdx][field]) || 0;
        updated[lastIdx] = { ...updated[lastIdx], [field]: String(current + 1) };
        return updated;
      });
    },
    [player1Id, player2Id, trackPoints],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const challengePlayers = preselectedPlayers
    ? players.filter(
        (p) =>
          p.id === preselectedPlayers.challengerId ||
          p.id === preselectedPlayers.targetId,
      )
    : players;

  // Hide vacationing players from selection unless they're preselected (which
  // shouldn't happen) or this is a tournament match (bracket is fixed).
  const selectablePlayers = (isChallenge ? challengePlayers : players).filter(
    (p) => isTournament || preselectedPlayers || !p.onVacation,
  );
  const availablePlayers = selectablePlayers;

  const player1 = players.find((p) => p.id === player1Id);
  const player2 = players.find((p) => p.id === player2Id);

  // Count games won by each player
  const filledGames = gameScores.filter((g) =>
    trackPoints
      ? g.player1Score !== '' && g.player2Score !== ''
      : g.scorelessWinner != null,
  );
  const p1Wins = filledGames.filter((g) =>
    trackPoints
      ? Number(g.player1Score) > Number(g.player2Score)
      : g.scorelessWinner === 1,
  ).length;
  const p2Wins = filledGames.filter((g) =>
    trackPoints
      ? Number(g.player2Score) > Number(g.player1Score)
      : g.scorelessWinner === 2,
  ).length;

  const winnerId = p1Wins > p2Wins ? player1Id : p2Wins > p1Wins ? player2Id : null;
  const loserId = winnerId === player1Id ? player2Id : winnerId === player2Id ? player1Id : null;
  const winnerName = winnerId ? players.find((p) => p.id === winnerId)?.name : null;

  const canSubmit =
    player1Id !== '' &&
    player2Id !== '' &&
    player1Id !== player2Id &&
    winnerId !== null &&
    !submitting;

  const addGame = () => {
    setGameScores([...gameScores, emptyRow()]);
  };

  const removeGame = (index: number) => {
    setGameScores(gameScores.filter((_, i) => i !== index));
  };

  const updateGameScore = (
    index: number,
    field: 'player1Score' | 'player2Score',
    value: string,
  ) => {
    const updated = [...gameScores];
    updated[index] = { ...updated[index], [field]: value };
    setGameScores(updated);
  };

  // Scoreless mode: clicking a player marks them as that game's winner;
  // clicking the current winner again clears the game.
  const setGameWinner = (index: number, who: 1 | 2) => {
    const updated = [...gameScores];
    updated[index] = {
      ...updated[index],
      scorelessWinner: updated[index].scorelessWinner === who ? null : who,
    };
    setGameScores(updated);
  };

  const toggleTrackPoints = () => {
    if (trackPoints) {
      // Carry entered point scores over as game-winner picks.
      setGameScores((prev) =>
        prev.map((g) => {
          if (g.player1Score === '' || g.player2Score === '') {
            return { ...g, scorelessWinner: null };
          }
          const p1 = Number(g.player1Score);
          const p2 = Number(g.player2Score);
          return {
            ...g,
            scorelessWinner: p1 > p2 ? 1 : p2 > p1 ? 2 : null,
          };
        }),
      );
    }
    setTrackPoints(!trackPoints);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || winnerId === null || loserId === null) return;

    setSubmitting(true);
    setError('');
    try {
      // Map games from player1/player2 to winner/loser perspective. Scoreless
      // games carry no points — just who won each game.
      const games = filledGames.map((g) => {
        if (!trackPoints) {
          const gameWinner = g.scorelessWinner === 1 ? player1Id : player2Id;
          return {
            winnerScore: null,
            loserScore: null,
            wonByMatchWinner: gameWinner === winnerId,
          };
        }
        const p1 = Number(g.player1Score);
        const p2 = Number(g.player2Score);
        if (winnerId === player1Id) {
          return { winnerScore: p1, loserScore: p2 };
        } else {
          return { winnerScore: p2, loserScore: p1 };
        }
      });

      const payload = {
        winnerId: Number(winnerId),
        loserId: Number(loserId),
        isChallenge,
        games,
      };
      if (tournamentId != null && tournamentMatchId != null) {
        await api.tournaments.logMatch(tournamentId, tournamentMatchId, payload);
      } else {
        await api.matches.create(payload);
      }
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
        className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Log Match</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Player Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Player 1
              </label>
              <select
                value={player1Id}
                onChange={(e) =>
                  setPlayer1Id(e.target.value ? Number(e.target.value) : '')
                }
                disabled={!!preselectedPlayers}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <option value="">Select...</option>
                {availablePlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Player 2
              </label>
              <select
                value={player2Id}
                onChange={(e) =>
                  setPlayer2Id(e.target.value ? Number(e.target.value) : '')
                }
                disabled={!!preselectedPlayers}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <option value="">Select...</option>
                {availablePlayers
                  .filter((p) => p.id !== player1Id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Live Scoreboard */}
          {player1 && player2 && (
            <div className="text-center py-2">
              <div className="flex items-center justify-center gap-3">
                <span
                  className={`font-semibold ${p1Wins > p2Wins ? 'text-emerald-400' : 'text-slate-300'}`}
                >
                  {player1.name}
                </span>
                <span className="text-2xl font-bold font-mono tabular-nums">
                  <span
                    className={
                      p1Wins > p2Wins ? 'text-emerald-400' : 'text-slate-400'
                    }
                  >
                    {p1Wins}
                  </span>
                  <span className="text-slate-600 mx-1">-</span>
                  <span
                    className={
                      p2Wins > p1Wins ? 'text-emerald-400' : 'text-slate-400'
                    }
                  >
                    {p2Wins}
                  </span>
                </span>
                <span
                  className={`font-semibold ${p2Wins > p1Wins ? 'text-emerald-400' : 'text-slate-300'}`}
                >
                  {player2.name}
                </span>
              </div>
              {(() => {
                const p1Odds = Math.round(expectedScore(player1, player2) * 100);
                return (
                  <p className="text-xs text-slate-500 mt-1 tabular-nums">
                    win odds: <span className="text-slate-300">{p1Odds}%</span>
                    <span className="text-slate-600"> — </span>
                    <span className="text-slate-300">{100 - p1Odds}%</span>
                  </p>
                );
              })()}
              {trackPoints && (
                <p className="text-xs text-slate-600 mt-1">
                  Tip: press <kbd className="px-1 py-0.5 bg-slate-700 rounded text-slate-400">&larr;</kbd> <kbd className="px-1 py-0.5 bg-slate-700 rounded text-slate-400">&rarr;</kbd> arrow keys to score points
                </p>
              )}
            </div>
          )}

          {/* Game Scores */}
          {player1 && player2 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-slate-400">
                  {trackPoints ? 'Game Scores' : 'Games'}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTrackPoints}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      trackPoints
                        ? 'text-slate-400 bg-slate-700/60 hover:bg-slate-700'
                        : 'text-sky-300 bg-sky-500/10 hover:bg-sky-500/20'
                    }`}
                  >
                    {trackPoints ? 'Points: on' : 'Points: off'}
                  </button>
                  <button
                    type="button"
                    onClick={addGame}
                    className="text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded transition-colors"
                  >
                    + Add game
                  </button>
                </div>
              </div>
              {/* Column headers */}
              {trackPoints && (
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="w-6 shrink-0" />
                <span className="flex-1 text-xs text-slate-500 text-center truncate">
                  {player1.name}
                </span>
                <span className="w-4 shrink-0" />
                <span className="flex-1 text-xs text-slate-500 text-center truncate">
                  {player2.name}
                </span>
                {gameScores.length > 1 && <span className="w-5 shrink-0" />}
              </div>
              )}
              <div className="space-y-2">
                {gameScores.map((game, index) => {
                  const p1 = Number(game.player1Score);
                  const p2 = Number(game.player2Score);
                  const gameComplete =
                    game.player1Score !== '' && game.player2Score !== '';
                  const p1Won = trackPoints
                    ? gameComplete && p1 > p2
                    : game.scorelessWinner === 1;
                  const p2Won = trackPoints
                    ? gameComplete && p2 > p1
                    : game.scorelessWinner === 2;

                  if (!trackPoints) {
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-6 shrink-0">
                          G{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setGameWinner(index, 1)}
                          className={`flex-1 min-w-0 truncate rounded-lg px-3 py-1.5 text-sm border transition-colors ${
                            p1Won
                              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                              : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {player1.name}
                        </button>
                        <span className="text-slate-600 text-xs shrink-0">won</span>
                        <button
                          type="button"
                          onClick={() => setGameWinner(index, 2)}
                          className={`flex-1 min-w-0 truncate rounded-lg px-3 py-1.5 text-sm border transition-colors ${
                            p2Won
                              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                              : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {player2.name}
                        </button>
                        {gameScores.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeGame(index)}
                            className="text-slate-500 hover:text-red-400 text-sm w-5 shrink-0 text-center transition-colors"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-6 shrink-0">
                        G{index + 1}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={game.player1Score}
                        onChange={(e) =>
                          updateGameScore(index, 'player1Score', e.target.value)
                        }
                        className={`flex-1 min-w-0 bg-slate-700 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 text-center ${
                          p1Won
                            ? 'border-emerald-500/40'
                            : p2Won
                              ? 'border-red-500/30'
                              : 'border-slate-600'
                        }`}
                      />
                      <span className="text-slate-600 text-sm shrink-0">-</span>
                      <input
                        type="number"
                        min="0"
                        value={game.player2Score}
                        onChange={(e) =>
                          updateGameScore(index, 'player2Score', e.target.value)
                        }
                        className={`flex-1 min-w-0 bg-slate-700 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 text-center ${
                          p2Won
                            ? 'border-emerald-500/40'
                            : p1Won
                              ? 'border-red-500/30'
                              : 'border-slate-600'
                        }`}
                      />
                      {gameScores.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGame(index)}
                          className="text-slate-500 hover:text-red-400 text-sm w-5 shrink-0 text-center transition-colors"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isTournament ? (
            <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Tournament match — winner advances to the next round.
            </div>
          ) : !preselectedPlayers ? (
            <button
              type="button"
              onClick={() => setIsChallenge(!isChallenge)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                isChallenge
                  ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span>Challenge match</span>
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isChallenge ? 'bg-purple-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    isChallenge ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
          ) : (
            <div className="text-xs text-purple-400 bg-purple-400/10 border border-purple-500/30 rounded-lg px-3 py-2">
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
              disabled={!canSubmit}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {submitting
                ? 'Logging...'
                : winnerName
                  ? `Log Win for ${winnerName}`
                  : trackPoints
                    ? 'Enter scores...'
                    : 'Pick game winners...'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
