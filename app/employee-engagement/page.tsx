import React from "react";
import { prisma } from "@/lib/prisma";
import DashboardClient from "./components/DashboardClient";
import { getValidatedSession } from "@/lib/auth/session";
import { isUserAdmin } from "@/lib/api-helpers";
import { buildScopedWhere } from "@/lib/hr/engagement-scope";

export default async function EmployeeEngagementDashboard() {
  // Review actions (Approve / Reject / Needs Info) are restricted to
  // Admin / HR. We resolve the current user here and pass `canReview`
  // down to the client component so the controls disable/hide for
  // standard employees while everyone can still see the read-only view.
  const session = await getValidatedSession();
  const currentUserId = session?.user?.id ?? null;
  const currentUserEmail = session?.user?.email ?? null;

  let canReview = false;
  let currentUserName = "Reviewer";
  let userOrgId = "__none__";

  if (currentUserId) {
    const me = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        organizationId: true,
        email: true,
        employee: { select: { employeeName: true, department: true } },
      },
    });
    userOrgId = me?.organizationId ?? "__none__";
    canReview = await isUserAdmin(currentUserId, me?.organizationId ?? null);
    // Treat anyone in an HR department as a reviewer too — matches the
    // "checking and reviewing by the admin and hr only" requirement
    // without needing a dedicated HR role flag.
    const dept = me?.employee?.department?.toLowerCase() ?? "";
    if (dept.includes("hr") || dept.includes("human resource")) canReview = true;
    currentUserName =
      me?.employee?.employeeName || me?.email || currentUserEmail || "Reviewer";
      
    if (!canReview && me?.employee?.id) {
      // Redirect regular employees to their personal dashboard
      const { redirect } = await import("next/navigation");
      redirect(`/employee-engagement/${me.employee.id}`);
    }
  }

  const where = currentUserId ? await buildScopedWhere(currentUserId, userOrgId) : { organizationId: "__none__" };

  const [
    kaizens,
    suggestions,
    problems,
    initiatives,
    targets
  ] = await Promise.all([
    prisma.engagementKaizen.findMany({ where, include: { user: { include: { employee: true } } } }),
    prisma.engagementSuggestion.findMany({ where, include: { user: { include: { employee: true } } } }),
    prisma.engagementProblem.findMany({ where, include: { user: { include: { employee: true } } } }),
    prisma.engagementInitiative.findMany({ where, include: { user: { include: { employee: true } } } }),
    prisma.engagementTarget.findMany({ where, include: { user: { include: { employee: true } } } }),
  ]);

  type ModuleKind = "Kaizen" | "Suggestion" | "Problem" | "Initiative" | "Target";
  const mapData = (item: any, type: ModuleKind) => {
    const emp = item.user?.employee || {};
    const avatarStr = emp.employeeName 
      ? emp.employeeName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()
      : "U";

    return {
      id: item.id,
      moduleType: type,
      title: item.title,
      category: item.category || (type === 'Kaizen' ? 'Process Improvement' : type === 'Target' ? 'Goal' : 'General'),
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      employeeId: emp.id || "Unknown",
      employeeName: emp.employeeName || item.user?.email || "Unknown User",
      department: emp.department || "N/A",
      avatar: avatarStr,
    };
  };

  const unifiedData = [
    ...kaizens.map((k) => mapData(k, "Kaizen")),
    ...suggestions.map((s) => mapData(s, "Suggestion")),
    ...problems.map((p) => mapData(p, "Problem")),
    ...initiatives.map((i) => mapData(i, "Initiative")),
    ...targets.map((t) => mapData(t, "Target")),
  ];

  return (
    <DashboardClient
      initialData={unifiedData}
      canReview={canReview}
      currentUserName={currentUserName}
    />
  );
}
