// lib/utils/user-employee-sync.ts
import { prisma } from "@/lib/prisma";

/**
 * Mirror a User's shared identity/contact fields onto their linked Employee
 * record so Employee Master shows the same values the user set on /profile.
 *
 * This is the same field mapping the admin `updateUser` handler applies — it
 * lives here so the self-service /profile routes (update-profile, upload-avatar,
 * remove-avatar) can reuse it instead of each duplicating the logic.
 *
 * Only the fields present in `changes` are pushed, so a partial edit never
 * blanks the other side. updateMany is a no-op when the user has no Employee row.
 *
 * | User field            | → | Employee field   |
 * | first_name            | → | firstName        |
 * | last_name             | → | lastName         |
 * | department            | → | department       |
 * | phone                 | → | personalContact  |
 * | avatar                | → | employeeImage    |
 * | email                 | → | emailAddress1    |
 * | first_name+last_name  | → | employeeName     |
 *
 * Call this AFTER the User row has been updated, so the recomposed
 * `employeeName` reflects the freshly-saved names.
 */
export async function syncUserToEmployee(
  userId: string,
  changes: {
    first_name?: string | null;
    last_name?: string | null;
    department?: string | null;
    phone?: string | null;
    avatar?: string | null;
    email?: string | null;
  }
): Promise<void> {
  const employeeSync: Record<string, any> = {};
  if (changes.email !== undefined) employeeSync.emailAddress1 = changes.email;
  if (changes.first_name !== undefined) employeeSync.firstName = changes.first_name;
  if (changes.last_name !== undefined) employeeSync.lastName = changes.last_name;
  if (changes.department !== undefined) employeeSync.department = changes.department;
  if (changes.phone !== undefined) employeeSync.personalContact = changes.phone;
  if (changes.avatar !== undefined) employeeSync.employeeImage = changes.avatar;

  // Recompose the employee display name when either name part changed. Read the
  // names back from the (already-updated) User so a single-field edit still
  // produces the full name.
  if (changes.first_name !== undefined || changes.last_name !== undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true },
    });
    const full = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
    if (full) employeeSync.employeeName = full;
  }

  if (Object.keys(employeeSync).length > 0) {
    await prisma.employee.updateMany({ where: { userId }, data: employeeSync });
  }
}
