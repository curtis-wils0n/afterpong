import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './components/Login';
import Leaderboard from './components/Leaderboard';
import MatchHistory from './components/MatchHistory';
import ChallengeBoard from './components/ChallengeBoard';

// Lazy-load the chart-heavy and rarely-first pages so recharts stays out of
// the main bundle.
const PlayerProfile = lazy(() => import('./components/PlayerProfile'));
const Stats = lazy(() => import('./components/Stats'));
const Tournaments = lazy(() => import('./components/Tournaments'));
const TournamentDetail = lazy(() => import('./components/TournamentDetail'));
const Docs = lazy(() => import('./components/Docs'));

export default function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Suspense
        fallback={<div className="text-center text-slate-500 py-12">Loading...</div>}
      >
      <Routes>
        <Route path="/" element={<ChallengeBoard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
