import { pgTable, serial, varchar, integer, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  elo: integer('elo').notNull().default(1000),
  challengeRank: integer('challenge_rank'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  winnerId: integer('winner_id').references(() => players.id).notNull(),
  loserId: integer('loser_id').references(() => players.id).notNull(),
  winnerScore: integer('winner_score'),
  loserScore: integer('loser_score'),
  winnerEloChange: integer('winner_elo_change').notNull(),
  loserEloChange: integer('loser_elo_change').notNull(),
  isChallenge: boolean('is_challenge').notNull().default(false),
  games: jsonb('games').$type<{ winnerScore: number; loserScore: number }[]>(),
  winnerRankBefore: integer('winner_rank_before'),
  loserRankBefore: integer('loser_rank_before'),
  tournamentMatchId: integer('tournament_match_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tournamentSeeding = pgEnum('tournament_seeding', ['snake', 'random']);
export const tournamentStatus = pgEnum('tournament_status', ['active', 'completed']);

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  seeding: tournamentSeeding('seeding').notNull(),
  status: tournamentStatus('status').notNull().default('active'),
  winnerId: integer('winner_id').references(() => players.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const tournamentParticipants = pgTable('tournament_participants', {
  id: serial('id').primaryKey(),
  tournamentId: integer('tournament_id').references(() => tournaments.id).notNull(),
  playerId: integer('player_id').references(() => players.id).notNull(),
  seed: integer('seed').notNull(),
});

export const tournamentMatches = pgTable('tournament_matches', {
  id: serial('id').primaryKey(),
  tournamentId: integer('tournament_id').references(() => tournaments.id).notNull(),
  round: integer('round').notNull(),
  position: integer('position').notNull(),
  player1Id: integer('player1_id').references(() => players.id),
  player2Id: integer('player2_id').references(() => players.id),
  matchId: integer('match_id').references(() => matches.id),
  winnerId: integer('winner_id').references(() => players.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
