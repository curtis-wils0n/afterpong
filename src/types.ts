export interface Player {
  id: number;
  name: string;
  rating: number;
  rd: number;
  volatility: number;
  lastMatchAt: string | null;
  challengeRank: number | null;
  onVacation: boolean;
  createdAt: string;
  wins?: number;
  losses?: number;
  defenses?: number;
  challengeStreak?: number;
}

export interface GameScore {
  winnerScore: number | null;
  loserScore: number | null;
  // Only meaningful for scoreless games (both scores null).
  wonByMatchWinner?: boolean;
}

export interface Match {
  id: number;
  winnerId: number;
  loserId: number;
  winnerScore: number | null;
  loserScore: number | null;
  winnerRatingChange: number;
  loserRatingChange: number;
  winnerRatingBefore: number | null;
  winnerRdBefore: number | null;
  winnerVolBefore: number | null;
  loserRatingBefore: number | null;
  loserRdBefore: number | null;
  loserVolBefore: number | null;
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

export interface StreakMatch {
  opponent: PlayerRef;
  playerScore: number | null;
  opponentScore: number | null;
  date: string;
}

export interface StreakEntry {
  player: PlayerRef;
  startDate: string;
  endDate?: string;
  matches: StreakMatch[];
}

export interface StatsResponse {
  streaks: {
    currentWinStreak: { entries: StreakEntry[]; count: number } | null;
    longestWinStreak: { entries: StreakEntry[]; count: number } | null;
    currentLossStreak: { entries: StreakEntry[]; count: number } | null;
    longestLossStreak: { entries: StreakEntry[]; count: number } | null;
  };
  matches: {
    biggestUpset: {
      entries: {
        winner: PlayerRef;
        loser: PlayerRef;
        matchDate: string;
      }[];
      winnerOdds: number;
    } | null;
    mostUpsetsCaused: { players: PlayerRef[]; count: number } | null;
    highestWinRate: {
      entries: { player: PlayerRef; wins: number; losses: number }[];
      rate: number;
    } | null;
  };
  players: {
    peakRating: { players: PlayerRef[]; rating: number } | null;
    currentTopRating: { players: PlayerRef[]; rating: number } | null;
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
    mostFriendly: {
      entries: {
        player: PlayerRef;
        with: { player: PlayerRef; matches: number }[];
      }[];
      count: number;
    } | null;
    biggestVillain: {
      entries: {
        player: PlayerRef;
        with: { player: PlayerRef; ratingDrained: number }[];
      }[];
      count: number;
    } | null;
    biggestOp: {
      entries: {
        player: PlayerRef;
        with: { player: PlayerRef; wins: number; losses: number }[];
      }[];
      count: number;
    } | null;
  };
  probability: {
    giantSlayer: {
      entries: { player: PlayerRef; wae: number; games: number }[];
      wae: number;
    } | null;
    mostImprobableStreak: {
      player: PlayerRef;
      count: number;
      probability: number;
      startDate: string;
      endDate: string;
    } | null;
    upsetMagnet: { players: PlayerRef[]; count: number } | null;
    hardestSchedule: {
      entries: { player: PlayerRef; games: number }[];
      avgWinProb: number;
    } | null;
    chaosAgent: {
      entries: { player: PlayerRef; games: number }[];
      brier: number;
    } | null;
  };
  clutch: {
    clutchRecord: {
      entries: { player: PlayerRef; wins: number; losses: number }[];
      rate: number;
    } | null;
    comebackArtist: { players: PlayerRef[]; count: number } | null;
    bagels: { players: PlayerRef[]; count: number } | null;
  };
  ratingHistory: {
    players: {
      id: number;
      name: string;
      points: { t: string; rating: number }[];
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
