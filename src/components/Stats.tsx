import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import Tooltip from './Tooltip';
import type { StatsResponse, PlayerRef } from '../types';

function PlayerLink({ player }: { player: PlayerRef }) {
  return (
    <Link
      to={`/players/${player.id}`}
      className="hover:text-emerald-400 transition-colors"
    >
      {player.name}
    </Link>
  );
}

function PlayerLinks({ players }: { players: PlayerRef[] }) {
  return (
    <>
      {players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span className="text-slate-600">, </span>}
          <PlayerLink player={p} />
        </span>
      ))}
    </>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  tooltip,
  children,
}: {
  label: string;
  value?: string;
  valueClass?: string;
  tooltip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-4">
      {tooltip && (
        <span className="absolute top-2 right-2">
          <Tooltip content={tooltip}>
            <button
              type="button"
              tabIndex={0}
              aria-label={tooltip}
              className="w-4 h-4 flex items-center justify-center rounded-full bg-slate-700/50 text-slate-500 hover:text-slate-300 text-[10px] font-bold cursor-help select-none"
            >
              ?
            </button>
          </Tooltip>
        </span>
      )}
      <h3 className="text-sm text-slate-400 mb-2 pr-6">{label}</h3>
      {value !== undefined && (
        <div
          className={`text-2xl font-bold font-mono tabular-nums ${valueClass ?? ''}`}
        >
          {value}
        </div>
      )}
      {children && (
        <div className="text-sm text-slate-500 mt-1">{children}</div>
      )}
    </div>
  );
}

function NoData({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <StatCard label={label} tooltip={tooltip}>
      <span className="text-slate-600">No data yet</span>
    </StatCard>
  );
}

const TIPS = {
  peakElo: 'Highest ELO anyone has ever reached',
  biggestClimber:
    'Largest gap between a player’s lowest ever ELO and their current ELO',
  biggestFaller:
    'Largest gap between a player’s peak ELO and their current ELO',
  currentWinStreak: 'Longest active streak of consecutive wins',
  longestWinStreak: 'Longest streak of consecutive wins ever recorded',
  currentLossStreak: 'Longest active streak of consecutive losses',
  longestLossStreak: 'Longest streak of consecutive losses ever recorded',
  biggestUpset:
    'Single match where the winner gained the most ELO from one win',
  mostUpsetsCaused:
    'Career count of wins where the player was the underdog (gained more than 20 ELO)',
  mostSuccessfulClimbs:
    'Career count of challenge matches won as the lower-ranked challenger',
  bestDefender:
    'Career count of challenge matches won as the higher-ranked defender',
  biggestRivalry: 'Pair of players with the most total matches between them',
  dominator:
    'Largest gap between wins and losses in any head-to-head matchup',
  mostFriendly:
    'Player most often shown as the FRIEND badge on others’ profiles (most games together)',
  biggestVillain:
    'Player most often shown as the NEMESIS badge on others’ profiles (drained the most ELO)',
  biggestOp:
    'Player most often shown as the RIVAL badge on others’ profiles (closest matchup)',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Stats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats
      .get()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center text-slate-500 py-12">Loading...</div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center text-slate-500 py-12">
        Could not load stats.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Stats</h1>

      {/* Players */}
      <h2 className="text-lg font-semibold mb-3">Players</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.players.peakElo ? (
          <StatCard
            label="Peak ELO"
            value={String(stats.players.peakElo.elo)}
            tooltip={TIPS.peakElo}
          >
            <PlayerLinks players={stats.players.peakElo.players} />
          </StatCard>
        ) : (
          <NoData label="Peak ELO" tooltip={TIPS.peakElo} />
        )}

        {stats.players.biggestClimber ? (
          <StatCard
            label="Biggest Climber"
            value={`+${stats.players.biggestClimber.climb}`}
            valueClass="text-emerald-400"
            tooltip={TIPS.biggestClimber}
          >
            <PlayerLink player={stats.players.biggestClimber.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestClimber.from} →{' '}
              {stats.players.biggestClimber.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Climber" tooltip={TIPS.biggestClimber} />
        )}

        {stats.players.biggestFaller ? (
          <StatCard
            label="Biggest Faller"
            value={`-${stats.players.biggestFaller.fall}`}
            valueClass="text-red-400"
            tooltip={TIPS.biggestFaller}
          >
            <PlayerLink player={stats.players.biggestFaller.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestFaller.from} →{' '}
              {stats.players.biggestFaller.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Faller" tooltip={TIPS.biggestFaller} />
        )}
      </div>

      {/* Streaks */}
      <h2 className="text-lg font-semibold mb-3">Streaks</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.streaks.currentWinStreak ? (
          <StatCard
            label="Current Longest Win Streak"
            value={`${stats.streaks.currentWinStreak.count}W`}
            valueClass="text-emerald-400"
            tooltip={TIPS.currentWinStreak}
          >
            <PlayerLinks players={stats.streaks.currentWinStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="Current Longest Win Streak"
            tooltip={TIPS.currentWinStreak}
          />
        )}

        {stats.streaks.longestWinStreak ? (
          <StatCard
            label="All-Time Longest Win Streak"
            value={`${stats.streaks.longestWinStreak.count}W`}
            valueClass="text-emerald-400"
            tooltip={TIPS.longestWinStreak}
          >
            <PlayerLinks players={stats.streaks.longestWinStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="All-Time Longest Win Streak"
            tooltip={TIPS.longestWinStreak}
          />
        )}

        {stats.streaks.currentLossStreak ? (
          <StatCard
            label="Current Longest Loss Streak"
            value={`${stats.streaks.currentLossStreak.count}L`}
            valueClass="text-red-400"
            tooltip={TIPS.currentLossStreak}
          >
            <PlayerLinks players={stats.streaks.currentLossStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="Current Longest Loss Streak"
            tooltip={TIPS.currentLossStreak}
          />
        )}

        {stats.streaks.longestLossStreak ? (
          <StatCard
            label="All-Time Longest Loss Streak"
            value={`${stats.streaks.longestLossStreak.count}L`}
            valueClass="text-red-400"
            tooltip={TIPS.longestLossStreak}
          >
            <PlayerLinks players={stats.streaks.longestLossStreak.players} />
          </StatCard>
        ) : (
          <NoData
            label="All-Time Longest Loss Streak"
            tooltip={TIPS.longestLossStreak}
          />
        )}
      </div>

      {/* Matches */}
      <h2 className="text-lg font-semibold mb-3">Matches</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {stats.matches.biggestUpset ? (
          <StatCard
            label="Biggest Upset"
            value={`+${stats.matches.biggestUpset.eloGain}`}
            valueClass="text-yellow-400"
            tooltip={TIPS.biggestUpset}
          >
            <PlayerLink player={stats.matches.biggestUpset.winner} />
            <span className="text-slate-600"> beat </span>
            <PlayerLink player={stats.matches.biggestUpset.loser} />
            <span className="text-slate-600">
              {' '}
              · {formatDate(stats.matches.biggestUpset.matchDate)}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Upset" tooltip={TIPS.biggestUpset} />
        )}

        {stats.matches.mostUpsetsCaused ? (
          <StatCard
            label="Most Upsets Caused"
            value={String(stats.matches.mostUpsetsCaused.count)}
            valueClass="text-yellow-400"
            tooltip={TIPS.mostUpsetsCaused}
          >
            <PlayerLinks players={stats.matches.mostUpsetsCaused.players} />
          </StatCard>
        ) : (
          <NoData label="Most Upsets Caused" tooltip={TIPS.mostUpsetsCaused} />
        )}
      </div>

      {/* Challenge Ladder */}
      <h2 className="text-lg font-semibold mb-3">Challenge Ladder</h2>
      <div className="grid grid-cols-2 gap-4 mb-6">
        {stats.ladder.mostSuccessfulClimbs ? (
          <StatCard
            label="Most Successful Climbs"
            value={String(stats.ladder.mostSuccessfulClimbs.count)}
            valueClass="text-emerald-400"
            tooltip={TIPS.mostSuccessfulClimbs}
          >
            <PlayerLinks players={stats.ladder.mostSuccessfulClimbs.players} />
          </StatCard>
        ) : (
          <NoData
            label="Most Successful Climbs"
            tooltip={TIPS.mostSuccessfulClimbs}
          />
        )}

        {stats.ladder.bestDefender ? (
          <StatCard
            label="Best Defender"
            value={String(stats.ladder.bestDefender.count)}
            valueClass="text-sky-400"
            tooltip={TIPS.bestDefender}
          >
            <PlayerLinks players={stats.ladder.bestDefender.players} />
          </StatCard>
        ) : (
          <NoData label="Best Defender" tooltip={TIPS.bestDefender} />
        )}
      </div>

      {/* Rivalries */}
      <h2 className="text-lg font-semibold mb-3">Rivalries</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {stats.rivalries.biggestRivalry ? (
          <StatCard
            label="Biggest Rivalry"
            value={`${stats.rivalries.biggestRivalry.matches} matches`}
            valueClass="text-amber-400"
            tooltip={TIPS.biggestRivalry}
          >
            <PlayerLink player={stats.rivalries.biggestRivalry.p1} />
            <span className="text-slate-600"> vs </span>
            <PlayerLink player={stats.rivalries.biggestRivalry.p2} />
          </StatCard>
        ) : (
          <NoData label="Biggest Rivalry" tooltip={TIPS.biggestRivalry} />
        )}

        {stats.rivalries.dominator ? (
          <StatCard
            label="Dominator"
            value={`${stats.rivalries.dominator.wins}-${stats.rivalries.dominator.losses}`}
            valueClass="text-amber-400"
            tooltip={TIPS.dominator}
          >
            <PlayerLink player={stats.rivalries.dominator.dominator} />
            <span className="text-slate-600"> over </span>
            <PlayerLink player={stats.rivalries.dominator.victim} />
          </StatCard>
        ) : (
          <NoData label="Dominator" tooltip={TIPS.dominator} />
        )}
      </div>

      {/* Relationships */}
      <h2 className="text-lg font-semibold mb-3">Relationships</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.relationships.mostFriendly ? (
          <StatCard
            label="Most Friendly"
            value={String(stats.relationships.mostFriendly.count)}
            valueClass="text-sky-400"
            tooltip={TIPS.mostFriendly}
          >
            <PlayerLinks players={stats.relationships.mostFriendly.players} />
          </StatCard>
        ) : (
          <NoData label="Most Friendly" tooltip={TIPS.mostFriendly} />
        )}

        {stats.relationships.biggestVillain ? (
          <StatCard
            label="Biggest Villain"
            value={String(stats.relationships.biggestVillain.count)}
            valueClass="text-red-400"
            tooltip={TIPS.biggestVillain}
          >
            <PlayerLinks
              players={stats.relationships.biggestVillain.players}
            />
          </StatCard>
        ) : (
          <NoData label="Biggest Villain" tooltip={TIPS.biggestVillain} />
        )}

        {stats.relationships.biggestOp ? (
          <StatCard
            label="Biggest Op"
            value={String(stats.relationships.biggestOp.count)}
            valueClass="text-amber-400"
            tooltip={TIPS.biggestOp}
          >
            <PlayerLinks players={stats.relationships.biggestOp.players} />
          </StatCard>
        ) : (
          <NoData label="Biggest Op" tooltip={TIPS.biggestOp} />
        )}
      </div>
    </div>
  );
}
