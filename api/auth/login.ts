import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { loginAttempts } from '../../db/schema.js';
import { signToken } from '../_lib/auth.js';
import type { Role } from '../_lib/auth.js';

// Rate limit: after MAX_FAILURES failed logins from one IP within WINDOW_MS,
// reject with 429 until the window expires. Backed by the login_attempts
// table so the limit holds across serverless instances and cold starts.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Vercel sets x-forwarded-for at the edge; client-supplied values are
  // overwritten, so the first entry is trustworthy.
  const ip =
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';

  const [attempts] = await db
    .select()
    .from(loginAttempts)
    .where(eq(loginAttempts.ip, ip));
  if (
    attempts &&
    attempts.count >= MAX_FAILURES &&
    Date.now() - attempts.windowStart.getTime() < WINDOW_MS
  ) {
    const retryAfter = Math.ceil(
      (attempts.windowStart.getTime() + WINDOW_MS - Date.now()) / 1000,
    );
    res.setHeader('Retry-After', String(retryAfter));
    return res
      .status(429)
      .json({ error: 'Too many failed attempts. Try again later.' });
  }

  let role: Role | null = null;
  if (password === process.env.ADMIN_PASSWORD) {
    role = 'admin';
  } else if (password === process.env.USER_PASSWORD) {
    role = 'user';
  }

  if (!role) {
    // Count the failure; expired windows restart rather than accumulate.
    const windowExpired = sql`${loginAttempts.windowStart} < now() - make_interval(secs => ${WINDOW_MS / 1000})`;
    await db
      .insert(loginAttempts)
      .values({ ip, count: 1 })
      .onConflictDoUpdate({
        target: loginAttempts.ip,
        set: {
          count: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${loginAttempts.count} + 1 END`,
          windowStart: sql`CASE WHEN ${windowExpired} THEN now() ELSE ${loginAttempts.windowStart} END`,
        },
      });
    return res.status(401).json({ error: 'Invalid password' });
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  const token = await signToken(role);
  return res.json({ token, role });
}
