import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './components/Login';
import Leaderboard from './components/Leaderboard';
import MatchHistory from './components/MatchHistory';
import ChallengeBoard from './components/ChallengeBoard';
import PlayerProfile from './components/PlayerProfile';

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
      <Routes>
        <Route path="/" element={<ChallengeBoard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/matches" element={<MatchHistory />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
