import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Tournament } from '../types';
import CreateTournamentModal from './CreateTournamentModal';
import { Button } from '@/components/ui/button';

export default function Tournaments() {
  const { isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = async () => {
    try {
      const data = await api.tournaments.list();
      setTournaments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, []);

  const active = tournaments.find((t) => t.status === 'active') ?? null;
  const past = tournaments
    .filter((t) => t.status === 'completed')
    .sort((a, b) => {
      const aDate = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bDate = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bDate - aDate;
    });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tournaments</h1>
        {isAdmin && !active && (
          <Button onClick={() => setShowCreate(true)}>Create Tournament</Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-12">Loading...</div>
      ) : (
        <>
          {active && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Active</h2>
              <Link
                to={`/tournaments/${active.id}`}
                className="block bg-slate-800 border border-emerald-500/30 rounded-lg p-4 hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-lg">{active.name}</div>
                    <div className="text-sm text-slate-500">
                      Started {formatDate(active.createdAt)} · Seeding:{' '}
                      {active.seeding === 'snake' ? 'Snake' : 'Random'}
                    </div>
                  </div>
                  <span className="text-emerald-400 text-sm font-medium">
                    In progress &rarr;
                  </span>
                </div>
              </Link>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Past Tournaments</h2>
              <div className="space-y-2">
                {past.map((t) => (
                  <Link
                    key={t.id}
                    to={`/tournaments/${t.id}`}
                    className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 hover:bg-slate-700 transition-colors"
                  >
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        {t.completedAt ? formatDate(t.completedAt) : ''}
                      </div>
                    </div>
                    {t.winner && (
                      <div className="text-sm">
                        <span className="text-slate-500">Champion: </span>
                        <span className="text-yellow-400 font-medium">
                          {'\u{1F451}'} {t.winner.name}
                        </span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!active && past.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              No tournaments yet.
              {isAdmin
                ? ' Click "Create Tournament" to start one.'
                : ' Ask an admin to start one.'}
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateTournamentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetch();
          }}
        />
      )}
    </div>
  );
}
