import type { Player, Match, MatchListResponse, PlayerProfile, StatsResponse } from '../types';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: getAuthHeaders(),
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  players: {
    list: (sort?: 'elo' | 'rank', includeStats?: boolean) => {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (includeStats) params.set('include', 'stats');
      const qs = params.toString();
      return fetchJSON<Player[]>(`/players${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => fetchJSON<PlayerProfile>(`/players/${id}`),
    create: (name: string) =>
      fetchJSON<Player>('/players', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  matches: {
    list: (opts?: { limit?: number; offset?: number; playerIds?: number[] }) => {
      const params = new URLSearchParams();
      if (opts?.limit != null) params.set('limit', String(opts.limit));
      if (opts?.offset != null) params.set('offset', String(opts.offset));
      if (opts?.playerIds && opts.playerIds.length > 0) {
        params.set('playerIds', opts.playerIds.join(','));
      }
      const qs = params.toString();
      return fetchJSON<MatchListResponse>(`/matches${qs ? `?${qs}` : ''}`);
    },
    create: (data: {
      winnerId: number;
      loserId: number;
      winnerScore?: number;
      loserScore?: number;
      isChallenge?: boolean;
      games?: { winnerScore: number; loserScore: number }[];
    }) =>
      fetchJSON<Match>('/matches', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteLast: () =>
      fetchJSON<Match>('/matches', { method: 'DELETE' }),
  },
  stats: {
    get: () => fetchJSON<StatsResponse>('/stats'),
  },
};
