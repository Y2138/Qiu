'use server';

import { prisma } from './prisma';
import { verifyToken, getAuthCookie } from './auth';

export async function getCurrentUserServer() {
  const token = await getAuthCookie();
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUserServer();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
