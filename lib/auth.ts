import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

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

export async function validateSession(token: string) {
  try {
    const session = await prisma.userSession.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            employee: true,
            organization: true,
            unitAssignments: {
              include: {
                role: true,
                unit: true,
              },
            },
          },
        },
      },
    })

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        // Clean up expired session
        await prisma.userSession.delete({
          where: { id: session.id },
        })
      }
      console.log("[validateSession] Session not found or expired")
      return null
    }

    console.log(`[validateSession] Valid session found for user: ${session.user.email}`)
    return session
  } catch (error) {
    console.error("[validateSession] Error validating session:", error)
    return null
  }
}

export async function deleteSession(token: string) {
  await prisma.userSession.delete({
    where: { token },
  })
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
