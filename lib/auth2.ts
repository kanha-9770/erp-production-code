import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_COOKIE = 'auth-token';
const SESSION_EXPIRY_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

function generateSessionToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await prisma.userSession.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/**
 * validateSession - Core session validation that accepts a raw token string.
 * Used by both getSession() (Server Components / Server Actions via cookies())
 * and Route Handlers (via request.cookies).
 */
export async function validateSession(token: string) {
  try {
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            organization: true,
            unitAssignments: {
              include: {
                role: true,
                unit: true,
              },
            },
            permissions: true,
            employee: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.userSession.delete({ where: { id: session.id } }).catch(() => {});
      }
      return null;
    }

    return session;
  } catch (error) {
    console.error('validateSession error:', error);
    return null;
  }
}

/**
 * getSession - For Server Components, Server Actions, and middleware.
 * Reads the auth-token cookie automatically via next/headers cookies().
 */
export async function getSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token) return null;

    return validateSession(token);
  } catch (error) {
    console.error('getSession error:', error);
    return null;
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.userSession.deleteMany({ where: { token } });
  }

  cookieStore.delete(SESSION_COOKIE);
}
