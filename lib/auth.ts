import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import jwt from "jsonwebtoken"
import { buildKey, cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache"

// Environment variable for JWT secret
const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-key"

export interface SessionPayload {
  userId: string
  email: string
  sessionId: string
}

export interface AuthContext {
  userId: string
  userEmail: string
  roleId: string | null
  roleIds: string[]
  roleName?: string
  permissions: any[]
}

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword)
}

export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function createSession(userId: string, ipAddress: string, userAgent: string) {
  const token = generateSessionToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

  const session = await prisma.userSession.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
  })

  return session
}

// Cache key for a session by token. Lives in the `auth` namespace which has
// its own dedicated Upstash DB, so a forms/HR cache outage can't slow login.
const sessionCacheKey = (token: string) => buildKey("auth", "session", token)
// Logout, password change, and role updates already invalidate the session
// explicitly (deleteSession / invalidateAllSessionsForUser), so a short TTL
// isn't needed for correctness — it just caused a steady miss rate that re-ran
// the deep session include. 5 min cuts that miss rate ~5× on the gate that
// fronts every authenticated request.
const SESSION_CACHE_TTL_S = 300

export async function validateSession(token: string) {
  // L1/L2 cache check — Redis returns the full session graph in one round-trip.
  // Date fields come back as ISO strings (JSON has no Date type) so we rehydrate
  // the two fields we actually compare on (expiresAt). Other Date fields are
  // left as strings — callers that don't compare dates won't notice.
  type CachedSession = Awaited<ReturnType<typeof loadSessionFromDb>>;
  const cached = await cacheGet<CachedSession>("auth", sessionCacheKey(token));
  if (cached) {
    // Cache hit. Cheap expiry check using the stored ISO string.
    const exp = new Date(cached.expiresAt as unknown as string);
    if (exp >= new Date()) {
      // Re-attach Date types where the schema declared them so downstream
      // consumers see what they expect.
      (cached as any).expiresAt = exp;
      return cached;
    }
    // Cached session is now expired — drop it and fall through to the DB
    // path (which will also clean up the row).
    void cacheInvalidate("auth", sessionCacheKey(token));
  }

  try {
    const session = await loadSessionFromDb(token);
    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await prisma.userSession.delete({ where: { id: session.id } });
      void cacheInvalidate("auth", sessionCacheKey(token));
      return null;
    }

    // Populate cache for subsequent requests on this token. Fire-and-forget.
    void cacheSet("auth", sessionCacheKey(token), session, SESSION_CACHE_TTL_S);
    return session;
  } catch (error) {
    console.error("[validateSession] Error validating session:", error);
    return null;
  }
}

// Internal — the un-cached DB load. Kept as a named function so its return
// type can be inferred by the cache typedef above.
async function loadSessionFromDb(token: string) {
  return prisma.userSession.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          employee: true,
          organization: true,
          ownedOrganization: true,
          unitAssignments: {
            include: {
              role: true,
              unit: true,
            },
          },
        },
      },
    },
  });
}

export async function deleteSession(token: string) {
  await prisma.userSession.delete({ where: { token } });
  // Invalidate cache so a logged-out cookie can't keep working until TTL expiry.
  await cacheInvalidate("auth", sessionCacheKey(token));
}

/**
 * Invalidates ALL cached sessions for a user. Call from force-logout flows
 * and password-change flows. Cheaper than scanning Redis: we read the user's
 * active session tokens from the DB (cheap, indexed query) and delete those
 * specific cache keys.
 */
export async function invalidateAllSessionsForUser(userId: string) {
  const sessions = await prisma.userSession.findMany({
    where: { userId },
    select: { token: true },
  });
  if (sessions.length === 0) return;
  await cacheInvalidate(
    "auth",
    ...sessions.map((s) => sessionCacheKey(s.token))
  );
}

export async function cleanupExpiredSessions() {
  await prisma.userSession.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  })
}

// JWT utilities for additional token verification
export function generateJWT(payload: any, secret?: string, expiresIn = "7d"): string {
  const jwtSecret = secret || JWT_SECRET
  return jwt.sign(payload, jwtSecret, { expiresIn })
}

export function verifyJWT(token: string, secret?: string): any {
  const jwtSecret = secret || JWT_SECRET
  try {
    return jwt.verify(token, jwtSecret)
  } catch (error) {
    return null
  }
}

// Enhanced session validation with JWT support
export async function validateSessionWithJWT(token: string, jwtSecret?: string) {
  // First validate session in database
  const session = await validateSession(token)

  if (!session) {
    return null
  }

  // Optional JWT validation if secret provided
  if (jwtSecret) {
    const jwtToken = generateJWT(
      {
        userId: session.userId,
        sessionId: session.id,
        email: session.user.email,
      },
      jwtSecret,
    )

    return {
      ...session,
      jwtToken,
    }
  }

  return session
}
