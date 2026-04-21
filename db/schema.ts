import { pgTable, serial, varchar, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
