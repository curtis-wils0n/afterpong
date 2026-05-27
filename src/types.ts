export interface Player {
  id: number;
  name: string;
  elo: number;
  challengeRank: number | null;
  onVacation: boolean;
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
  tournamentMatchId: number | null;
  createdAt: string;
  winner?: Player;
  loser?: Player;
}

export type TournamentSeeding = 'snake' | 'random';
export type TournamentStatus = 'active' | 'completed';

export interface Tournament {
  id: number;
  name: string;
  seeding: TournamentSeeding;
  status: TournamentStatus;
  winnerId: number | null;
  createdAt: string;
  completedAt: string | null;
  winner?: Player | null;
}

export interface TournamentParticipant {
  id: number;
  tournamentId: number;
  playerId: number;
  seed: number;
  player?: Player | null;
}

export interface TournamentMatch {
  id: number;
  tournamentId: number;
  round: number;
  position: number;
  player1Id: number | null;
  player2Id: number | null;
  matchId: number | null;
  winnerId: number | null;
  createdAt: string;
  player1?: Player | null;
  player2?: Player | null;
  match?: Match | null;
}

export interface TournamentDetail extends Tournament {
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
}

export interface MatchListResponse {
  matches: Match[];
  total: number;
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
      entries: {
        winner: PlayerRef;
        loser: PlayerRef;
        matchDate: string;
      }[];
      eloGain: number;
    } | null;
    mostUpsetsCaused: { players: PlayerRef[]; count: number } | null;
    highestWinRate: { players: PlayerRef[]; rate: number } | null;
  };
  players: {
    peakElo: { players: PlayerRef[]; elo: number } | null;
    currentTopElo: { players: PlayerRef[]; elo: number } | null;
    biggestClimber: {
      entries: { player: PlayerRef; from: number; to: number }[];
      climb: number;
    } | null;
    biggestFaller: {
      entries: { player: PlayerRef; from: number; to: number }[];
      fall: number;
    } | null;
    biggestDailyClimber: {
      entries: { player: PlayerRef; day: string; from: number; to: number }[];
      climb: number;
    } | null;
    biggestDailyFaller: {
      entries: { player: PlayerRef; day: string; from: number; to: number }[];
      fall: number;
    } | null;
  };
  ladder: {
    mostSuccessfulClimbs: { players: PlayerRef[]; count: number } | null;
    bestDefender: { players: PlayerRef[]; count: number } | null;
  };
  rivalries: {
    biggestRivalry: {
      pairs: { p1: PlayerRef; p2: PlayerRef }[];
      matches: number;
    } | null;
    dominator: {
      pairs: {
        dominator: PlayerRef;
        victim: PlayerRef;
        wins: number;
        losses: number;
      }[];
      gap: number;
    } | null;
    tightestRivalry: {
      pairs: { leader: PlayerRef; trailer: PlayerRef }[];
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
