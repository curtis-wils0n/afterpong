import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
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
  children,
}: {
  label: string;
  value?: string;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm text-slate-400 mb-2">{label}</h3>
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

function NoData({ label }: { label: string }) {
  return (
    <StatCard label={label}>
      <span className="text-slate-600">No data yet</span>
    </StatCard>
  );
}

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
          >
            <PlayerLinks players={stats.players.peakElo.players} />
          </StatCard>
        ) : (
          <NoData label="Peak ELO" />
        )}

        {stats.players.biggestClimber ? (
          <StatCard
            label="Biggest Climber"
            value={`+${stats.players.biggestClimber.climb}`}
            valueClass="text-emerald-400"
          >
            <PlayerLink player={stats.players.biggestClimber.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestClimber.from} →{' '}
              {stats.players.biggestClimber.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Climber" />
        )}

        {stats.players.biggestFaller ? (
          <StatCard
            label="Biggest Faller"
            value={`-${stats.players.biggestFaller.fall}`}
            valueClass="text-red-400"
          >
            <PlayerLink player={stats.players.biggestFaller.player} />
            <span className="text-slate-600">
              {' '}
              · {stats.players.biggestFaller.from} →{' '}
              {stats.players.biggestFaller.to}
            </span>
          </StatCard>
        ) : (
          <NoData label="Biggest Faller" />
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
          >
            <PlayerLinks players={stats.streaks.currentWinStreak.players} />
          </StatCard>
        ) : (
          <NoData label="Current Longest Win Streak" />
        )}

        {stats.streaks.longestWinStreak ? (
          <StatCard
            label="All-Time Longest Win Streak"
            value={`${stats.streaks.longestWinStreak.count}W`}
            valueClass="text-emerald-400"
          >
            <PlayerLinks players={stats.streaks.longestWinStreak.players} />
          </StatCard>
        ) : (
          <NoData label="All-Time Longest Win Streak" />
        )}

        {stats.streaks.currentLossStreak ? (
          <StatCard
            label="Current Longest Loss Streak"
            value={`${stats.streaks.currentLossStreak.count}L`}
            valueClass="text-red-400"
          >
            <PlayerLinks players={stats.streaks.currentLossStreak.players} />
          </StatCard>
        ) : (
          <NoData label="Current Longest Loss Streak" />
        )}

        {stats.streaks.longestLossStreak ? (
          <StatCard
            label="All-Time Longest Loss Streak"
            value={`${stats.streaks.longestLossStreak.count}L`}
            valueClass="text-red-400"
          >
            <PlayerLinks players={stats.streaks.longestLossStreak.players} />
          </StatCard>
        ) : (
          <NoData label="All-Time Longest Loss Streak" />
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
          <NoData label="Biggest Upset" />
        )}

        {stats.matches.mostUpsetsCaused ? (
          <StatCard
            label="Most Upsets Caused"
            value={String(stats.matches.mostUpsetsCaused.count)}
            valueClass="text-yellow-400"
          >
            <PlayerLinks players={stats.matches.mostUpsetsCaused.players} />
          </StatCard>
        ) : (
          <NoData label="Most Upsets Caused" />
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
          >
            <PlayerLinks players={stats.ladder.mostSuccessfulClimbs.players} />
          </StatCard>
        ) : (
          <NoData label="Most Successful Climbs" />
        )}

        {stats.ladder.bestDefender ? (
          <StatCard
            label="Best Defender"
            value={String(stats.ladder.bestDefender.count)}
            valueClass="text-sky-400"
          >
            <PlayerLinks players={stats.ladder.bestDefender.players} />
          </StatCard>
        ) : (
          <NoData label="Best Defender" />
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
          >
            <PlayerLink player={stats.rivalries.biggestRivalry.p1} />
            <span className="text-slate-600"> vs </span>
            <PlayerLink player={stats.rivalries.biggestRivalry.p2} />
          </StatCard>
        ) : (
          <NoData label="Biggest Rivalry" />
        )}

        {stats.rivalries.dominator ? (
          <StatCard
            label="Dominator"
            value={`${stats.rivalries.dominator.wins}-0`}
            valueClass="text-amber-400"
          >
            <PlayerLink player={stats.rivalries.dominator.dominator} />
            <span className="text-slate-600"> over </span>
            <PlayerLink player={stats.rivalries.dominator.victim} />
          </StatCard>
        ) : (
          <NoData label="Dominator" />
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
          >
            <PlayerLinks players={stats.relationships.mostFriendly.players} />
          </StatCard>
        ) : (
          <NoData label="Most Friendly" />
        )}

        {stats.relationships.biggestVillain ? (
          <StatCard
            label="Biggest Villain"
            value={String(stats.relationships.biggestVillain.count)}
            valueClass="text-red-400"
          >
            <PlayerLinks
              players={stats.relationships.biggestVillain.players}
            />
          </StatCard>
        ) : (
          <NoData label="Biggest Villain" />
        )}

        {stats.relationships.biggestOp ? (
          <StatCard
            label="Biggest Op"
            value={String(stats.relationships.biggestOp.count)}
            valueClass="text-amber-400"
          >
            <PlayerLinks players={stats.relationships.biggestOp.players} />
          </StatCard>
        ) : (
          <NoData label="Biggest Op" />
        )}
      </div>
    </div>
  );
}
