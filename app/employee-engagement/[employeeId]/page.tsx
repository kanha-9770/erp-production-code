import React from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, Trophy, Crown, Medal, Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import EmployeeAwardsView, { type EmployeeSubmission } from "./employee-awards-view";
import { getValidatedSession } from "@/lib/auth/session";
import { isUserAdmin } from "@/lib/api-helpers";

export default async function EmployeeContributionDetail({ params }: { params: { employeeId: string } }) {
  const employeeId = params.employeeId;

  // Reviewer (Admin / HR) resolution — only Admin / HR may award points
  // and post reviews from the profile page. Standard employees still see
  // the read-only contribution history for their own profile.
  const session = await getValidatedSession();
  const currentUserId = session?.user?.id ?? null;
  let canReview = false;
  let currentUserName = "Reviewer";
  if (currentUserId) {
    const me = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        email: true,
        organizationId: true,
        employee: { select: { employeeName: true, department: true } },
      },
    });
    canReview = await isUserAdmin(currentUserId, me?.organizationId ?? null);
    const dept = me?.employee?.department?.toLowerCase() ?? "";
    if (dept.includes("hr") || dept.includes("human resource")) canReview = true;
    currentUserName =
      me?.employee?.employeeName || me?.email || session?.user?.email || "Reviewer";
  }

  const allUsers = await prisma.user.findMany({
    where: { employee: { isNot: null } },
    include: {
      employee: true,
      engagementKaizens: true,
      engagementSuggestions: true,
      engagementProblems: true,
      engagementInitiatives: true,
      engagementTargets: true,
    },
  });

  // Rank by total submission count. Points are entered manually by admin/HR
  // on each submission and are not aggregated here.
  const leaderboard = allUsers.map((user) => {
    const submissions =
      user.engagementTargets.length +
      user.engagementInitiatives.length +
      user.engagementProblems.length +
      user.engagementKaizens.length +
      user.engagementSuggestions.length;
    return { userId: user.id, employeeId: user.employee!.id, submissions };
  });

  leaderboard.sort((a, b) => b.submissions - a.submissions);

  const rankIndex = leaderboard.findIndex((entry) => entry.employeeId === employeeId);
  if (rankIndex === -1) return notFound();

  const rank = rankIndex + 1;
  const totalEmployees = leaderboard.length;

  const targetUser = allUsers.find(u => u.employee!.id === employeeId)!;
  const emp = targetUser.employee!;

  const totalSubmissions = leaderboard[rankIndex].submissions;

  const avatarStr = emp.employeeName
    ? emp.employeeName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";


  const renderRankBadge = () => {
    if (rank === 1) return <div className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 font-bold rounded-full border border-amber-200 text-sm"><Crown className="w-4 h-4" /> 1st Place</div>;
    if (rank === 2) return <div className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-700 font-bold rounded-full border border-slate-200 text-sm"><Medal className="w-4 h-4" /> 2nd Place</div>;
    if (rank === 3) return <div className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 font-bold rounded-full border border-orange-200 text-sm"><Medal className="w-4 h-4" /> 3rd Place</div>;
    return <div className="inline-flex items-center gap-1 px-3 py-1 bg-secondary text-secondary-foreground font-semibold rounded-full border text-sm">#{rank} Place</div>;
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center gap-4 pb-4 border-b">
        <Button variant="outline" size="icon" asChild>
          <Link href="/employee-engagement">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Employee Profile</h2>
          <p className="text-muted-foreground text-sm">Detailed breakdown of engagement activities and ranking.</p>
        </div>
      </div>

      {/* Profile header card */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border shadow-sm bg-background shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">{avatarStr}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <h3 className="text-xl font-semibold leading-tight truncate">{emp.employeeName}</h3>
                <p className="text-muted-foreground text-sm truncate">{emp.department} • {emp.id}</p>
                <div className="pt-1">{renderRankBadge()}</div>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 sm:w-auto">
              <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-primary/5 px-4 py-3 min-w-[150px]">
                <Activity className="h-5 w-5 text-primary shrink-0" />
                <div className="leading-tight">
                  <div className="text-xl font-bold text-primary tabular-nums">{totalSubmissions.toLocaleString()}</div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Total Submissions</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 min-w-[150px]">
                <Trophy className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="leading-tight">
                  <div className="text-xl font-bold text-foreground tabular-nums">#{rank}</div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Rank · of {totalEmployees}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Awards from Admin / HR + decorated submission history.
          Lives in a client component so it can read the points + reviews
          the reviewer recorded on the admin dashboard. */}
      <EmployeeAwardsView
        canReview={canReview}
        currentUserName={currentUserName}
        employee={{
          employeeId: emp.id,
          name: emp.employeeName || "—",
          department: emp.department || "—",
          teamName: null,
        }}
        submissions={[
          ...targetUser.engagementKaizens.map((s): EmployeeSubmission => ({
            id: s.id,
            displayId: (s as any).displayId || `NK-${s.id.substring(0, 6).toUpperCase()}`,
            endDate: (s as any).endDate ?? null,
            type: "Kaizen",
            title: s.title,
            category: "Process Improvement",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            referenceImage: s.referenceImage ?? null,
            beforeMedia: (s as any).beforeMedia ?? s.referenceImage ?? null,
            afterMedia: (s as any).afterMedia ?? null,
            details: {
              description: s.description,
              currentState: s.currentState,
              proposedState: s.proposedState,
              benefits: s.benefits,
              votes: s.votes,
            },
          })),
          ...targetUser.engagementSuggestions.map((s): EmployeeSubmission => ({
            id: s.id,
            displayId: (s as any).displayId || `ES-${s.id.substring(0, 6).toUpperCase()}`,
            endDate: (s as any).endDate ?? null,
            type: "Suggestion",
            title: s.title,
            category: s.category || "General",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            referenceImage: s.referenceImage ?? null,
            details: {
              suggestion: s.suggestion,
              feedback: s.feedback ?? null,
            },
          })),
          ...targetUser.engagementProblems.map((s): EmployeeSubmission => ({
            id: s.id,
            displayId: (s as any).displayId || `PR-${s.id.substring(0, 6).toUpperCase()}`,
            endDate: (s as any).endDate ?? null,
            type: "Problem",
            title: s.title,
            category: s.category || "Safety",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            referenceImage: s.referenceImage ?? null,
            details: {
              description: s.description,
              severity: s.severity,
              proposedSolution: s.proposedSolution,
            },
          })),
          ...targetUser.engagementInitiatives.map((s): EmployeeSubmission => ({
            id: s.id,
            displayId: (s as any).displayId || `SI-${s.id.substring(0, 6).toUpperCase()}`,
            endDate: s.endDate ?? null,
            type: "Initiative",
            title: s.title,
            category: s.category || "General",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            referenceImage: s.referenceImage ?? null,
            details: {
              description: s.description,
              startDate: s.startDate,
              endDate: s.endDate,
            },
          })),
          ...targetUser.engagementTargets.map((s): EmployeeSubmission => ({
            id: s.id,
            displayId: (s as any).displayId || `ST-${s.id.substring(0, 6).toUpperCase()}`,
            endDate: (s as any).endDate ?? null,
            type: "Target",
            title: s.title,
            category: "Goal",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
            referenceImage: s.referenceImage ?? null,
            details: {
              description: s.description,
              targetDate: s.targetDate,
              progress: s.progress,
            },
          })),
        ]}
      />
    </div>
  );
}
