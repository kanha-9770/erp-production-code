// // File: lib/database/users.ts

// import { prisma } from '@/lib/prisma';

// export type UserListItem = {
//   id: string;
//   first_name: string;
//   last_name: string;
//   email: string;
//   department?: string | null;
//   location?: string | null;
//   status: string;
//   unitAssignments: Array<{
//     unitId: string;
//     unit: { name: string };
//     roleId: string;
//   }>;
//   userRoles: Array<{
//     roleId: string;
//     role: { id: string; name: string };
//   }>;
// };

// export async function getUsersForOrganization(
//   organizationId: string
// ): Promise<UserListItem[]> {
//   if (!organizationId?.trim()) {
//     throw new Error('organizationId is required');
//   }

//   return prisma.user.findMany({
//     where: {
//       organizationId,
//     },
//     select: {
//       id: true,
//       first_name: true,
//       last_name: true,
//       email: true,
//       department: true,
//       location: true,
//       status: true,
//       unitAssignments: {
//         select: {
//           unitId: true,
//           unit: { select: { name: true } },
//           roleId: true,
//         },
//       },
//       userRoles: {
//         select: {
//           roleId: true,
//           role: { select: { id: true, name: true } },
//         },
//       },
//     },
//     orderBy: [
//       { first_name: 'asc' },
//       { last_name: 'asc' },
//     ],
//   });
// }