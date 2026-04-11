import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jwtVerify, SignJWT } from 'jose';

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export type Role = 'user' | 'admin';

export async function signToken(role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret());
}

export async function verifyAuth(req: VercelRequest): Promise<{ role: Role } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  try {
    const { payload } = await jwtVerify(header.slice(7), getSecret());
    const role = payload.role as string;
    if (role === 'user' || role === 'admin') return { role };
    return null;
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<Role | null> {
  const auth = await verifyAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return auth.role;
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const role = await requireAuth(req, res);
  if (role === null) return false;
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}
