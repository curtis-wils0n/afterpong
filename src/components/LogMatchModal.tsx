import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { expectedScore, blendedWinProbability } from '../../lib/glicko';
import {
  inProgressGameProbability,
  seriesWinProbability,
} from '../../lib/series';
import type { Player, Match } from '../types';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Game targets the modal can score to.
const GAME_TARGETS = [11, 21] as const;

function ScoreStepChevron({ up }: { up?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
    </svg>
  );
}

// ponytail: scores are the only numeric inputs, so this stepper lives here
// rather than as a ui/NumberInput primitive. Promote it if another numeric
// input shows up.
function ScoreInput({
  value,
  onChange,
  borderClass,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  borderClass: string;
  label: string;
}) {
  const step = (dir: number) => {
    const n = parseInt(value, 10);
    onChange(String(Math.max(0, (Number.isNaN(n) ? 0 : n) + dir)));
  };
  return (
    <div
      className={`relative flex flex-1 min-w-0 items-stretch rounded-lg border bg-slate-700 ${borderClass} focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/40`}
    >
      <input
        type="number"
        inputMode="numeric"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full min-w-0 bg-transparent py-1.5 pl-2 pr-6 text-center text-sm text-slate-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="absolute inset-y-0 right-0 flex w-6 flex-col border-l border-slate-600/70">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Increase ${label}`}
          onClick={() => step(1)}
          className="flex flex-1 items-center justify-center text-slate-400 transition-colors hover:bg-slate-600/50 hover:text-emerald-400"
        >
          <ScoreStepChevron up />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Decrease ${label}`}
          onClick={() => step(-1)}
          className="flex flex-1 items-center justify-center border-t border-slate-600/70 text-slate-400 transition-colors hover:bg-slate-600/50 hover:text-emerald-400"
        >
          <ScoreStepChevron />
        </button>
      </div>
    </div>
  );
}

// Per-game head-to-head record for `player1Id` across matches that are all
// between the two selected players. Games are stored in match-winner
// perspective, so flip them to player 1's view. Legacy rows with no per-game
// array count as a single game won by the match winner.
function pairGameRecord(
  matches: Match[],
  player1Id: number,
): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const p1IsMatchWinner = m.winnerId === player1Id;
    const games =
      m.games && m.games.length > 0
        ? m.games
        : [{ winnerScore: 1, loserScore: 0 }];
    for (const g of games) {
      const matchWinnerWonGame =
        g.winnerScore != null && g.loserScore != null
          ? g.winnerScore > g.loserScore
          : (g.wonByMatchWinner ?? true);
      if (p1IsMatchWinner === matchWinnerWonGame) wins++;
      else losses++;
    }
  }
  return { wins, losses };
}

// Winner of a single game under first-to-`target`, win-by-2 rules, or null if
// the game isn't decided yet (still in progress, or a deuce that hasn't broken
// by two). Empty inputs come in as 0.
function gameWinnerByTarget(
  s1: number,
  s2: number,
  target: number,
): 1 | 2 | null {
  if (Math.max(s1, s2) >= target && Math.abs(s1 - s2) >= 2) {
    return s1 > s2 ? 1 : 2;
  }
  return null;
}

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
  // Points per game; drives game-complete detection and the live odds.
  const [gameTarget, setGameTarget] = useState<number>(11);
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
  // Player 1's per-game head-to-head record against player 2, used to nudge the
  // live odds toward the pair's real matchup. null until both are selected.
  const [h2h, setH2h] = useState<{ wins: number; losses: number } | null>(null);

  // Pull the pair's prior matches whenever the selection changes. With both
  // ids set, the matches endpoint returns only games between the two.
  useEffect(() => {
    if (player1Id === '' || player2Id === '') {
      setH2h(null);
      return;
    }
    let cancelled = false;
    api.matches
      .list({ playerIds: [player1Id, player2Id], limit: 1000 })
      .then((res) => {
        if (!cancelled) setH2h(pairGameRecord(res.matches, player1Id));
      })
      .catch(() => {
        if (!cancelled) setH2h(null);
      });
    return () => {
      cancelled = true;
    };
  }, [player1Id, player2Id]);

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
        // Score into the current game: the first one not yet decided. Once a
        // game reaches the target, points roll onto the next game.
        const idx = prev.findIndex(
          (g) =>
            gameWinnerByTarget(
              Number(g.player1Score) || 0,
              Number(g.player2Score) || 0,
              gameTarget,
            ) === null,
        );
        if (idx === -1) return prev;
        const updated = [...prev];
        const current = Number(updated[idx][field]) || 0;
        updated[idx] = { ...updated[idx], [field]: String(current + 1) };
        return updated;
      });
    },
    [player1Id, player2Id, trackPoints, gameTarget],
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

  // A game's winner (1, 2, or null if undecided). In points mode a game is
  // won by reaching the target; in scoreless mode it's whoever was tapped.
  const outcomeOf = (g: GameRow): 1 | 2 | null =>
    trackPoints
      ? gameWinnerByTarget(
          Number(g.player1Score) || 0,
          Number(g.player2Score) || 0,
          gameTarget,
        )
      : g.scorelessWinner;

  // Count games won by each player
  const decidedGames = gameScores.filter((g) => outcomeOf(g) !== null);
  const p1Wins = gameScores.filter((g) => outcomeOf(g) === 1).length;
  const p2Wins = gameScores.filter((g) => outcomeOf(g) === 2).length;
  // The game points currently land in — first undecided row.
  const currentGameIndex = gameScores.findIndex((g) => outcomeOf(g) === null);

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

  // Pad out to a best-of-3 so the common case is one click, not two.
  const setBestOfThree = () => {
    setGameScores((prev) =>
      prev.length >= 3
        ? prev
        : [...prev, ...Array.from({ length: 3 - prev.length }, emptyRow)],
    );
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
      const games = decidedGames.map((g) => {
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Match</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Player Selection */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Player 1
              </label>
              <Combobox
                options={availablePlayers.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                }))}
                value={player1Id === '' ? undefined : String(player1Id)}
                onChange={(v) => setPlayer1Id(Number(v))}
                disabled={!!preselectedPlayers}
                placeholder="Select..."
                searchPlaceholder="Search players…"
                className="bg-slate-700 border-slate-600 disabled:opacity-70"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Player 2
              </label>
              <Combobox
                options={availablePlayers
                  .filter((p) => p.id !== player1Id)
                  .map((p) => ({ value: String(p.id), label: p.name }))}
                value={player2Id === '' ? undefined : String(player2Id)}
                onChange={(v) => setPlayer2Id(Number(v))}
                disabled={!!preselectedPlayers}
                placeholder="Select..."
                searchPlaceholder="Search players…"
                className="bg-slate-700 border-slate-600 disabled:opacity-70"
              />
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
                // Live series odds: decided games are locked in, the game in
                // progress is run as a point race, and games not yet started
                // use the flat per-game odds. The flat odds start from Glicko
                // and are nudged toward the pair's real per-game head-to-head
                // record (Beta-Binomial shrinkage), so a lopsided matchup the
                // global rating misses shows up here.
                const h2hGames = h2h ? h2h.wins + h2h.losses : 0;
                const p = h2h
                  ? blendedWinProbability(
                      expectedScore(player1, player2),
                      h2h.wins,
                      h2h.losses,
                    )
                  : expectedScore(player1, player2);
                const needed = Math.floor(gameScores.length / 2) + 1;
                const undecidedProbs = gameScores
                  .filter((g) => outcomeOf(g) === null)
                  .map((g) => {
                    const s1 = Number(g.player1Score) || 0;
                    const s2 = Number(g.player2Score) || 0;
                    return trackPoints && (s1 > 0 || s2 > 0)
                      ? inProgressGameProbability(s1, s2, gameTarget, p)
                      : p;
                  });
                const p1Odds = Math.round(
                  seriesWinProbability(p1Wins, p2Wins, undecidedProbs, needed) *
                    100,
                );
                const label = gameScores.length > 1 ? 'series odds' : 'win odds';
                return (
                  <>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      {label}:{' '}
                      <span className="text-slate-300">{p1Odds}%</span>
                      <span className="text-slate-600"> — </span>
                      <span className="text-slate-300">{100 - p1Odds}%</span>
                    </p>
                    {h2hGames > 0 && (
                      <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                        head-to-head: {h2h!.wins}-{h2h!.losses} games
                      </p>
                    )}
                  </>
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
                <div className="flex items-center gap-2 flex-wrap justify-end">
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
                  {trackPoints && (
                    <div className="flex rounded overflow-hidden border border-slate-600 text-xs">
                      {GAME_TARGETS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setGameTarget(t)}
                          className={`px-2 py-1 transition-colors ${
                            gameTarget === t
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          to {t}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={setBestOfThree}
                    className="text-xs text-slate-400 hover:text-slate-200 bg-slate-700/60 hover:bg-slate-700 px-2 py-1 rounded transition-colors"
                  >
                    Best of 3
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
                  const outcome = outcomeOf(game);
                  const p1Won = outcome === 1;
                  const p2Won = outcome === 2;
                  // First undecided game: where points are landing right now.
                  const isCurrent = trackPoints && index === currentGameIndex;
                  const gameLabelClass = `text-xs w-6 shrink-0 ${
                    isCurrent ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                  }`;

                  if (!trackPoints) {
                    return (
                      <div key={index} className="flex items-center gap-2">
                        <span className={gameLabelClass}>G{index + 1}</span>
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
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => removeGame(index)}
                            className="shrink-0"
                          >
                            &times;
                          </Button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="flex items-center gap-2">
                      <span className={gameLabelClass}>G{index + 1}</span>
                      <ScoreInput
                        value={game.player1Score}
                        onChange={(v) => updateGameScore(index, 'player1Score', v)}
                        label={`Game ${index + 1} player 1 score`}
                        borderClass={
                          p1Won
                            ? 'border-emerald-500/40'
                            : p2Won
                              ? 'border-red-500/30'
                              : 'border-slate-600'
                        }
                      />
                      <span className="text-slate-600 text-sm shrink-0">-</span>
                      <ScoreInput
                        value={game.player2Score}
                        onChange={(v) => updateGameScore(index, 'player2Score', v)}
                        label={`Game ${index + 1} player 2 score`}
                        borderClass={
                          p2Won
                            ? 'border-emerald-500/40'
                            : p1Won
                              ? 'border-red-500/30'
                              : 'border-slate-600'
                        }
                      />
                      {gameScores.length > 1 && (
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => removeGame(index)}
                          className="shrink-0"
                        >
                          &times;
                        </Button>
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
            <Button type="button" variant="secondary" size="sm" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit} className="flex-1">
              {submitting
                ? 'Logging...'
                : winnerName
                  ? `Log Win for ${winnerName}`
                  : trackPoints
                    ? 'Enter scores...'
                    : 'Pick game winners...'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
