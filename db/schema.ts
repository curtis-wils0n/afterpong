import { pgTable, serial, varchar, integer, doublePrecision, timestamp, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import type { GameScore } from '../lib/games.js';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  rating: doublePrecision('rating').notNull().default(1500),
  rd: doublePrecision('rd').notNull().default(350),
  volatility: doublePrecision('volatility').notNull().default(0.06),
  lastMatchAt: timestamp('last_match_at'),
  challengeRank: integer('challenge_rank'),
  onVacation: boolean('on_vacation').notNull().default(false),
  // Left the company: hidden from the leaderboard, ladder, and new matches;
  // match history and profile stats are kept.
  retired: boolean('retired').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Failed-login counter per client IP, backing the login rate limit. One row
// per IP; the row resets when a login succeeds or the window expires.
export const loginAttempts = pgTable('login_attempts', {
  ip: varchar('ip', { length: 64 }).primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start').notNull().defaultNow(),
});

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  winnerId: integer('winner_id').references(() => players.id).notNull(),
  loserId: integer('loser_id').references(() => players.id).notNull(),
  winnerScore: integer('winner_score'),
  loserScore: integer('loser_score'),
  winnerRatingChange: doublePrecision('winner_rating_change').notNull().default(0),
  loserRatingChange: doublePrecision('loser_rating_change').notNull().default(0),
  // Pre-match snapshots of both players' raw rating state (and last-match
  // time), so undo can restore the exact prior row without replaying history.
  winnerRatingBefore: doublePrecision('winner_rating_before'),
  winnerRdBefore: doublePrecision('winner_rd_before'),
  winnerVolBefore: doublePrecision('winner_vol_before'),
  winnerLastMatchBefore: timestamp('winner_last_match_before'),
  loserRatingBefore: doublePrecision('loser_rating_before'),
  loserRdBefore: doublePrecision('loser_rd_before'),
  loserVolBefore: doublePrecision('loser_vol_before'),
  loserLastMatchBefore: timestamp('loser_last_match_before'),
  isChallenge: boolean('is_challenge').notNull().default(false),
  games: jsonb('games').$type<GameScore[]>(),
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
