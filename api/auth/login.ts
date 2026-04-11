import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signToken } from '../_lib/auth.js';
import type { Role } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  let role: Role | null = null;
  if (password === process.env.ADMIN_PASSWORD) {
    role = 'admin';
  } else if (password === process.env.USER_PASSWORD) {
    role = 'user';
  }

  if (!role) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = await signToken(role);
  return res.json({ token, role });
}
