export interface Player {
  id: number;
  name: string;
  elo: number;
  challengeRank: number | null;
  createdAt: string;
  wins?: number;
  losses?: number;
  defenses?: number;
  challengeStreak?: number;
}

export interface GameScore {
  winnerScore: number;
  loserScore: number;
}

export interface Match {
  id: number;
  winnerId: number;
  loserId: number;
  winnerScore: number | null;
  loserScore: number | null;
  winnerEloChange: number;
  loserEloChange: number;
  isChallenge: boolean;
  games: GameScore[] | null;
  createdAt: string;
  winner?: Player;
  loser?: Player;
}

export interface PlayerProfile extends Player {
  wins: number;
  losses: number;
  streak: { count: number; type: 'W' | 'L' } | null;
  recentForm: ('W' | 'L')[];
  headToHead: {
    opponent: Player;
    wins: number;
    losses: number;
  }[];
  matches: Match[];
}
