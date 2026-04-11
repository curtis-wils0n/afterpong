import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const navItems = [
  { path: '/', label: 'Ladder' },
  { path: '/leaderboard', label: 'Leaderboard' },
  { path: '/matches', label: 'Matches' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <nav className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Afterpong
          </Link>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="ml-3 flex items-center gap-2">
              {isAdmin && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                  Admin
                </span>
              )}
              <button
                onClick={logout}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
