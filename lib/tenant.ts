import { prisma } from "@/lib/prisma"

export type AuthUser = { id: string; organizationId: string | null }

/**
 * Extract the current user identity from the Request.
 * Priority:
 * 1) x-user-id header
 * 2) Authorization: Bearer <userId>
 * 3) Cookies: userId or auth_user_id
 * 4) Dev query param ?userId=
 * 5) Dev JSON body { userId }
 * 6) x-user-email (DB lookup)
 * 7) Dev env fallbacks: DEV_USER_ID or DEV_USER_EMAIL (non-production)
 */
export async function getUserFromRequest(req: Request): Promise<AuthUser> {
  const headers = req.headers

  // Headers: x-user-id
  const headerId = headers.get("x-user-id") || headers.get("x-userid")

  // Authorization: Bearer <userId>
  const auth = headers.get("authorization")
  const bearer = auth && auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null

  // Cookies
  const cookie = headers.get("cookie") || ""
  const cookieMap = Object.fromEntries(
    cookie
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [k, ...rest] = c.split("=")
        return [k, decodeURIComponent(rest.join("=") || "")]
      }),
  )
  const cookieId = cookieMap["userId"] || cookieMap["auth_user_id"]

  // Dev query param
  let queryId: string | null = null
  try {
    const url = new URL(req.url)
    queryId = url.searchParams.get("userId")
  } catch {
    // ignore
  }

  // Dev JSON body: { userId }
  let bodyId: string | null = null
  try {
    if (req.method !== "GET") {
      const cloned = req.clone()
      const ct = cloned.headers.get("content-type") || ""
      if (ct.includes("application/json")) {
        const j = (await cloned.json().catch(() => null)) as { userId?: string; email?: string } | null
        if (j?.userId && typeof j.userId === "string") {
          bodyId = j.userId
        }
      }
    }
  } catch {
    // ignore
  }

  // Optional email header fallback
  const headerEmail = headers.get("x-user-email")

  // Dev-only env fallbacks
  const devId = process.env.NODE_ENV !== "production" ? process.env.DEV_USER_ID || null : null
  const devEmail = process.env.NODE_ENV !== "production" ? process.env.DEV_USER_EMAIL || null : null

  // Choose identity source
  const userId = headerId || bearer || cookieId || queryId || bodyId || devId || null

  // Resolve user by id first if present
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true },
    })
    if (!user) {
      throw new HttpError(401, "Unauthorized: user not found for provided identity")
    }
    return user
  }

  // Resolve by email as a fallback (header or dev env)
  const email = headerEmail || devEmail || null
  if (email) {
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, organizationId: true },
    })
    if (!user) throw new HttpError(401, "Unauthorized: user not found by email")
    return user
  }

  // Nothing found
  throw new HttpError(401, "Unauthorized: no user identity provided (send x-user-id or Authorization: Bearer <userId>)")
}

/**
 * Map special org ids ("org_default", "current") to the caller's primary organizationId.
 * Ensures the organization exists and returns normalized ids.
 */
export async function resolveAuthorizedOrgId(
  req: Request,
  rawOrgId: string,
): Promise<{ userId: string; orgId: string }> {
  const user = await getUserFromRequest(req)

  let orgId = rawOrgId
  if (rawOrgId === "org_default" || rawOrgId === "current") {
    if (!user.organizationId) {
      throw new HttpError(404, "No primary organization for user")
    }
    orgId = user.organizationId
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  })
  if (!org) throw new HttpError(404, "Organization not found")

  return { userId: user.id, orgId: org.id }
}

/**
 * Read access: user must be a member of the organization.
 * Membership is defined as:
 *  - user.organizationId === orgId (primary org), or
 *  - any UserUnitAssignment within any unit of that org.
 */
export async function authorizeOrgMember(req: Request, rawOrgId: string): Promise<{ userId: string; orgId: string }> {
  const { userId, orgId } = await resolveAuthorizedOrgId(req, rawOrgId)

  // Primary organization grants membership
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  })
  if (user?.organizationId === orgId) {
    return { userId, orgId }
  }

  // Otherwise require any assignment within this org
  const assigned = await prisma.userUnitAssignment.findFirst({
    where: { userId, unit: { organizationId: orgId } },
    select: { id: true },
  })
  if (!assigned) {
    throw new HttpError(403, "Forbidden: not a member of this organization")
  }

  return { userId, orgId }
}

/**
 * Write access: user must be an Admin within the organization.
 * Admin is defined as:
 *  - user.organizationId === orgId (bootstrapped primary org), OR
 *  - any UserUnitAssignment in the org where Role.name === "Admin".
 */
export async function authorizeOrgAdmin(req: Request, rawOrgId: string): Promise<{ userId: string; orgId: string }> {
  const { userId, orgId } = await resolveAuthorizedOrgId(req, rawOrgId)

  // Primary org => treat as admin by bootstrap convention
  const primary = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  })
  if (primary?.organizationId === orgId) {
    return { userId, orgId }
  }

  // Else must have Admin role within any unit of this org
  const adminAssignment = await prisma.userUnitAssignment.findFirst({
    where: {
      userId,
      unit: { organizationId: orgId },
      role: { name: "Admin" },
    },
    select: { id: true },
  })
  if (!adminAssignment) {
    throw new HttpError(403, "Forbidden: admin role required in this organization")
  }

  return { userId, orgId }
}

/**
 * HttpError provides a status code for clean API responses.
 */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Convert an error into a JSON Response with proper status.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { "content-type": "application/json" },
    })
  }
  console.error("[v0] Unexpected error:", err)
  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  })
}
