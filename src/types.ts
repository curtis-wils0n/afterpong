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

export interface PlayerRef {
  id: number;
  name: string;
}

export interface StatsResponse {
  streaks: {
    currentWinStreak: { players: PlayerRef[]; count: number } | null;
    longestWinStreak: { players: PlayerRef[]; count: number } | null;
    currentLossStreak: { players: PlayerRef[]; count: number } | null;
    longestLossStreak: { players: PlayerRef[]; count: number } | null;
  };
  matches: {
    biggestUpset: {
      winner: PlayerRef;
      loser: PlayerRef;
      eloGain: number;
      matchDate: string;
    } | null;
    mostUpsetsCaused: { players: PlayerRef[]; count: number } | null;
  };
  players: {
    peakElo: { players: PlayerRef[]; elo: number } | null;
    biggestClimber: {
      player: PlayerRef;
      climb: number;
      from: number;
      to: number;
    } | null;
    biggestFaller: {
      player: PlayerRef;
      fall: number;
      from: number;
      to: number;
    } | null;
  };
  ladder: {
    mostSuccessfulClimbs: { players: PlayerRef[]; count: number } | null;
    bestDefender: { players: PlayerRef[]; count: number } | null;
  };
  rivalries: {
    biggestRivalry: { p1: PlayerRef; p2: PlayerRef; matches: number } | null;
    dominator: {
      dominator: PlayerRef;
      victim: PlayerRef;
      wins: number;
      losses: number;
    } | null;
  };
  relationships: {
    mostFriendly: { players: PlayerRef[]; count: number } | null;
    biggestVillain: { players: PlayerRef[]; count: number } | null;
    biggestOp: { players: PlayerRef[]; count: number } | null;
  };
  eloHistory: {
    players: {
      id: number;
      name: string;
      points: { t: string; elo: number }[];
    }[];
  };
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
