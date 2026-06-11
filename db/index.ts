import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema.js';

// The websocket driver (unlike neon-http) supports transactions, which the
// match write paths rely on. Node needs an explicit WebSocket implementation.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.STORAGE_DATABASE_URL! });
export const db = drizzle(pool, { schema });
