import type { TournamentMatch } from '../types';

interface Props {
  matches: TournamentMatch[];
  onMatchClick?: (match: TournamentMatch) => void;
}

const ROUND_NAMES: Record<number, string> = {
  1: 'Round 1',
};

function roundLabel(round: number, totalRounds: number) {
  if (round === totalRounds) return 'Final';
  if (round === totalRounds - 1) return 'Semifinals';
  if (round === totalRounds - 2) return 'Quarterfinals';
  return ROUND_NAMES[round] ?? `Round ${round}`;
}

export default function TournamentBracket({ matches, onMatchClick }: Props) {
  if (matches.length === 0) {
    return (
      <div className="text-center text-slate-500 py-12">No matches yet</div>
    );
  }

  // Group matches by round
  const rounds = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    const list = rounds.get(m.round) ?? [];
    list.push(m);
    rounds.set(m.round, list);
  }
  const roundEntries = [...rounds.entries()].sort(([a], [b]) => a - b);
  const totalRounds = Math.max(...rounds.keys());

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4 min-w-max">
        {roundEntries.map(([round, roundMatches]) => (
          <div key={round} className="flex flex-col gap-3 min-w-[12rem]">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              {roundLabel(round, totalRounds)}
            </h3>
            <div className="flex flex-col gap-3 justify-around flex-1">
              {roundMatches
                .sort((a, b) => a.position - b.position)
                .map((m) => (
                  <BracketMatchCard
                    key={m.id}
                    match={m}
                    onClick={onMatchClick}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  onClick,
}: {
  match: TournamentMatch;
  onClick?: (m: TournamentMatch) => void;
}) {
  const isPlayed = match.matchId != null;
  const canLog =
    !isPlayed && match.player1Id != null && match.player2Id != null;

  const slotClass = (playerId: number | null) => {
    if (playerId == null) return 'text-slate-600';
    if (isPlayed && match.winnerId === playerId)
      return 'text-emerald-400 font-semibold';
    if (isPlayed && match.winnerId !== playerId) return 'text-slate-500';
    return 'text-slate-200';
  };

  const baseClass =
    'bg-slate-800 border rounded-lg overflow-hidden transition-colors';
  const stateClass = canLog
    ? 'border-emerald-500/40 hover:border-emerald-500 cursor-pointer hover:bg-slate-700'
    : isPlayed
      ? 'border-slate-700'
      : 'border-slate-700';

  // Show series score if available
  const winnerScore = match.match?.winnerScore;
  const loserScore = match.match?.loserScore;
  const winnerIsPlayer1 = match.winnerId === match.player1Id;
  const player1ScoreDisplay = isPlayed
    ? winnerIsPlayer1
      ? winnerScore
      : loserScore
    : null;
  const player2ScoreDisplay = isPlayed
    ? winnerIsPlayer1
      ? loserScore
      : winnerScore
    : null;

  return (
    <div
      className={`${baseClass} ${stateClass}`}
      onClick={canLog && onClick ? () => onClick(match) : undefined}
    >
      <BracketSlot
        name={
          match.player1?.name ??
          (match.player1Id == null && match.round === 1 ? 'BYE' : 'TBD')
        }
        score={player1ScoreDisplay}
        className={slotClass(match.player1Id)}
      />
      <div className="border-t border-slate-700/60" />
      <BracketSlot
        name={
          match.player2?.name ??
          (match.player2Id == null && match.round === 1 ? 'BYE' : 'TBD')
        }
        score={player2ScoreDisplay}
        className={slotClass(match.player2Id)}
      />
    </div>
  );
}

function BracketSlot({
  name,
  score,
  className,
}: {
  name: string;
  score: number | null | undefined;
  className: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className={`truncate ${className}`}>{name}</span>
      {score != null && (
        <span className="text-xs font-mono tabular-nums text-slate-400 ml-2">
          {score}
        </span>
      )}
    </div>
  );
}
