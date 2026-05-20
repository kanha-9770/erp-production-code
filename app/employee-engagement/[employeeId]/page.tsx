import React from "react";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Target, Lightbulb, AlertCircle, TrendingUp, MessageSquare, ChevronLeft, Trophy, Crown, Medal, User, Briefcase, Mail, Phone, MapPin, Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import EmployeeAwardsView, { type EmployeeSubmission } from "./employee-awards-view";

export default async function EmployeeContributionDetail({ params }: { params: { employeeId: string } }) {
  const employeeId = params.employeeId;

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

  const targets = targetUser.engagementTargets.length;
  const initiatives = targetUser.engagementInitiatives.length;
  const problems = targetUser.engagementProblems.length;
  const kaizens = targetUser.engagementKaizens.length;
  const suggestions = targetUser.engagementSuggestions.length;

  const totalSubmissions = leaderboard[rankIndex].submissions;

  const avatarStr = emp.employeeName
    ? emp.employeeName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : "U";

  const submodules = [
    { title: "Self Target", icon: Target, count: targets, color: "bg-blue-600", textClass: "text-blue-600" },
    { title: "Self Initiative", icon: Lightbulb, count: initiatives, color: "bg-emerald-600", textClass: "text-emerald-600" },
    { title: "Kaizen", icon: TrendingUp, count: kaizens, color: "bg-purple-600", textClass: "text-purple-600" },
    { title: "Employee Suggestion", icon: MessageSquare, count: suggestions, color: "bg-amber-600", textClass: "text-amber-600" },
    { title: "Problem Reg.", icon: AlertCircle, count: problems, color: "bg-rose-600", textClass: "text-rose-600" },
  ];

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

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Card */}
        <Card className="col-span-1 shadow-sm h-fit overflow-hidden">
          <div className="h-24 bg-muted/50 border-b" />
          <CardContent className="pt-0 flex flex-col items-center text-center relative">
            <Avatar className="h-20 w-20 border-4 border-background shadow-sm -mt-10 mb-3 bg-background">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xl">{avatarStr}</AvatarFallback>
            </Avatar>
            
            <h3 className="text-xl font-semibold">{emp.employeeName}</h3>
            <p className="text-muted-foreground text-sm">{emp.department} • {emp.id}</p>

            <div className="mt-4 mb-6">
              {renderRankBadge()}
            </div>

            <div className="w-full space-y-3">
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-md border border-primary/10">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Total Submissions</span>
                </div>
                <span className="text-lg font-bold text-primary">{totalSubmissions.toLocaleString()}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Company Rank</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-foreground">#{rank}</span>
                  <span className="text-xs text-muted-foreground block">of {totalEmployees}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contribution Breakdown */}
        <Card className="col-span-2 shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-semibold">Contribution Breakdown</CardTitle>
            <CardDescription>Submissions across different engagement modules</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {submodules.map((module) => {
                const percentage = totalSubmissions > 0 ? Math.round((module.count / totalSubmissions) * 100) : 0;
                return (
                  <div key={module.title} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3 font-medium">
                        <module.icon className={`h-4 w-4 ${module.textClass}`} />
                        <div className="flex flex-col">
                          <span>{module.title}</span>
                          <span className="text-xs text-muted-foreground font-normal">{module.count} submissions</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="font-semibold text-base">{module.count.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">{percentage}% of total</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full ${module.color} transition-all duration-500 ease-out`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        {/* Employment Details */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-sm">
              <div>
                <dt className="text-muted-foreground mb-1">Designation</dt>
                <dd className="font-medium">{emp.designation || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Department</dt>
                <dd className="font-medium">{emp.department || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Branch</dt>
                <dd className="font-medium">{emp.branch || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Employment Type</dt>
                <dd className="font-medium">{emp.employmentType || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Status</dt>
                <dd className="font-medium">
                  {emp.status ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">{emp.status}</span>
                  ) : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Date of Joining</dt>
                <dd className="font-medium">{emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString() : "N/A"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Contact & Personal Details */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Contact & Personal Info
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-sm">
              <div>
                <dt className="text-muted-foreground mb-1">Email Address</dt>
                <dd className="font-medium flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {emp.emailAddress1 || "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Phone Number</dt>
                <dd className="font-medium flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {emp.personalContact || "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Location</dt>
                <dd className="font-medium flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {emp.currentCity ? `${emp.currentCity}${emp.currentState ? `, ${emp.currentState}` : ''}` : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Gender</dt>
                <dd className="font-medium">{emp.gender || "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Date of Birth</dt>
                <dd className="font-medium">{emp.dob ? new Date(emp.dob).toLocaleDateString() : "N/A"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">Blood Group</dt>
                <dd className="font-medium">{emp.bloodGroup || "N/A"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Awards from Admin / HR + decorated submission history.
          Lives in a client component so it can read the points + reviews
          the reviewer recorded on the admin dashboard. */}
      <EmployeeAwardsView
        submissions={[
          ...targetUser.engagementKaizens.map((s): EmployeeSubmission => ({
            id: s.id,
            type: "Kaizen",
            title: s.title,
            category: "Process Improvement",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          })),
          ...targetUser.engagementSuggestions.map((s): EmployeeSubmission => ({
            id: s.id,
            type: "Suggestion",
            title: s.title,
            category: s.category || "General",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          })),
          ...targetUser.engagementProblems.map((s): EmployeeSubmission => ({
            id: s.id,
            type: "Problem",
            title: s.title,
            category: s.category || "Safety",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          })),
          ...targetUser.engagementInitiatives.map((s): EmployeeSubmission => ({
            id: s.id,
            type: "Initiative",
            title: s.title,
            category: s.category || "General",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          })),
          ...targetUser.engagementTargets.map((s): EmployeeSubmission => ({
            id: s.id,
            type: "Target",
            title: s.title,
            category: "Goal",
            status: s.status,
            createdAt: s.createdAt.toISOString(),
          })),
        ]}
      />
    </div>
  );
}
