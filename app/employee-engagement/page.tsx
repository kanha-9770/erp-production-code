import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Lightbulb, AlertCircle, TrendingUp, MessageSquare, Award, Calculator, BarChart3, Users, Crown, Medal } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function EmployeeEngagementDashboard() {
  const users = await prisma.user.findMany({
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

  const formula = { selfTarget: 25, selfInitiative: 15, problemRegistration: 5, kaizen: 20, employeeSuggestion: 10 };

  let totalTargets = 0;
  let totalInitiatives = 0;
  let totalProblems = 0;
  let totalKaizens = 0;
  let totalSuggestions = 0;

  const employeeData = users.map((user) => {
    const targets = user.engagementTargets.length;
    const initiatives = user.engagementInitiatives.length;
    const problems = user.engagementProblems.length;
    const kaizens = user.engagementKaizens.length;
    const suggestions = user.engagementSuggestions.length;

    totalTargets += targets;
    totalInitiatives += initiatives;
    totalProblems += problems;
    totalKaizens += kaizens;
    totalSuggestions += suggestions;

    const points = (targets * formula.selfTarget) +
                   (initiatives * formula.selfInitiative) +
                   (problems * formula.problemRegistration) +
                   (kaizens * formula.kaizen) +
                   (suggestions * formula.employeeSuggestion);

    const emp = user.employee!;
    const avatarStr = emp.employeeName 
      ? emp.employeeName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
      : "U";

    return {
      id: emp.id,
      name: emp.employeeName || "Unknown",
      department: emp.department || "N/A",
      avatar: avatarStr,
      points: points,
      submodules: { target: targets, initiative: initiatives, problem: problems, kaizen: kaizens, suggestion: suggestions }
    };
  });

  employeeData.sort((a, b) => b.points - a.points);

  const currentStats = { selfTarget: totalTargets, selfInitiative: totalInitiatives, problemRegistration: totalProblems, kaizen: totalKaizens, employeeSuggestion: totalSuggestions };

  const pointsEarned = {
    selfTarget: currentStats.selfTarget * formula.selfTarget,
    selfInitiative: currentStats.selfInitiative * formula.selfInitiative,
    problemRegistration: currentStats.problemRegistration * formula.problemRegistration,
    kaizen: currentStats.kaizen * formula.kaizen,
    employeeSuggestion: currentStats.employeeSuggestion * formula.employeeSuggestion,
  };

  const totalPoints = Object.values(pointsEarned).reduce((a, b) => a + b, 0);

  const submodules = [
    { title: "Self Target", icon: Target, pointsPerUnit: formula.selfTarget, count: currentStats.selfTarget, earned: pointsEarned.selfTarget, description: "Personal performance targets", color: "bg-blue-600", textClass: "text-blue-600" },
    { title: "Self Initiative", icon: Lightbulb, pointsPerUnit: formula.selfInitiative, count: currentStats.selfInitiative, earned: pointsEarned.selfInitiative, description: "Self-initiated improvements", color: "bg-emerald-600", textClass: "text-emerald-600" },
    { title: "Kaizen", icon: TrendingUp, pointsPerUnit: formula.kaizen, count: currentStats.kaizen, earned: pointsEarned.kaizen, description: "Continuous improvement", color: "bg-purple-600", textClass: "text-purple-600" },
    { title: "Employee Suggestion", icon: MessageSquare, pointsPerUnit: formula.employeeSuggestion, count: currentStats.employeeSuggestion, earned: pointsEarned.employeeSuggestion, description: "Suggestions for improvement", color: "bg-amber-600", textClass: "text-amber-600" },
    { title: "Problem Reg.", icon: AlertCircle, pointsPerUnit: formula.problemRegistration, count: currentStats.problemRegistration, earned: pointsEarned.problemRegistration, description: "Workplace problems resolution", color: "bg-rose-600", textClass: "text-rose-600" },
  ];

  const getRankIcon = (index: number) => {
    if (index === 0) return <div className="flex items-center justify-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-700 font-bold rounded-md text-xs border border-amber-200"><Crown className="w-3 h-3"/> 1st</div>;
    if (index === 1) return <div className="flex items-center justify-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-700 font-bold rounded-md text-xs border border-slate-200"><Medal className="w-3 h-3"/> 2nd</div>;
    if (index === 2) return <div className="flex items-center justify-center gap-1.5 px-2 py-1 bg-orange-100 text-orange-700 font-bold rounded-md text-xs border border-orange-200"><Medal className="w-3 h-3"/> 3rd</div>;
    return <span className="text-muted-foreground font-medium text-sm">#{index + 1}</span>;
  };

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-4 border-b">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight">Engagement Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of employee contributions, points distribution, and company-wide rankings.
          </p>
        </div>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Activities</span>
            <span className="text-xl font-bold">{Object.values(currentStats).reduce((a, b) => a + b, 0).toLocaleString()}</span>
          </div>
          <div className="h-10 w-px bg-border"></div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-primary uppercase tracking-wider font-semibold">Total Points</span>
            <span className="text-xl font-bold text-primary">{totalPoints.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Points Distribution Card */}
        <Card className="col-span-4 shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Calculator className="h-5 w-5 text-muted-foreground" />
              Points Distribution
            </CardTitle>
            <CardDescription>
              Breakdown of total points across active engagement modules
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {submodules.map((module) => {
                const percentage = totalPoints > 0 ? Math.round((module.earned / totalPoints) * 100) : 0;
                return (
                  <div key={module.title} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3 font-medium">
                        <module.icon className={`h-4 w-4 ${module.textClass}`} />
                        <span>{module.title}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{percentage}%</span>
                        <span className="text-muted-foreground ml-2 text-xs">({module.earned.toLocaleString()} pts)</span>
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

        {/* Static Formula Rules Card */}
        <Card className="col-span-3 shadow-sm">
          <CardHeader className="pb-4 border-b">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Target className="h-5 w-5 text-muted-foreground" />
              Formula Weights
            </CardTitle>
            <CardDescription>Points awarded per individual activity</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {submodules.map((module) => (
                <div key={module.title} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors border border-transparent">
                  <div className="flex items-center gap-3">
                    <module.icon className={`h-4 w-4 ${module.textClass}`} />
                    <div>
                      <p className="text-sm font-medium">{module.title}</p>
                      <p className="text-xs text-muted-foreground">{module.description}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-semibold bg-background">
                    +{module.pointsPerUnit} pts
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {submodules.map((module) => (
          <Card key={module.title} className="shadow-sm transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {module.title}
              </CardTitle>
              <module.icon className={`h-4 w-4 ${module.textClass}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{module.count}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {module.earned.toLocaleString()} points generated
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employee Wise Points Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Users className="h-5 w-5 text-muted-foreground" />
                Employee Leaderboard
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                Top performing employees based on engagement points
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[80px] text-center">Rank</TableHead>
                <TableHead className="w-[250px]">Employee</TableHead>
                <TableHead className="text-center text-xs uppercase tracking-wider">Self Target</TableHead>
                <TableHead className="text-center text-xs uppercase tracking-wider">Initiative</TableHead>
                <TableHead className="text-center text-xs uppercase tracking-wider">Kaizen</TableHead>
                <TableHead className="text-center text-xs uppercase tracking-wider">Problem Reg.</TableHead>
                <TableHead className="text-center text-xs uppercase tracking-wider">Suggestion</TableHead>
                <TableHead className="text-right pr-6 font-semibold">Total Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeData.map((emp, index) => (
                <TableRow key={emp.id} className="hover:bg-muted/50 transition-colors cursor-pointer group">
                  <TableCell className="text-center">
                    {getRankIcon(index)}
                  </TableCell>
                  <TableCell className="py-3 font-medium">
                    <Link href={`/employee-engagement/${emp.id}`} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{emp.avatar}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium group-hover:text-primary transition-colors">{emp.name}</span>
                        <span className="text-xs text-muted-foreground">{emp.department} • {emp.id}</span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground font-medium">{emp.submodules.target}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground font-medium">{emp.submodules.initiative}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground font-medium">{emp.submodules.kaizen}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground font-medium">{emp.submodules.problem}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm text-muted-foreground font-medium">{emp.submodules.suggestion}</span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <span className="font-semibold text-primary">{emp.points.toLocaleString()}</span>
                  </TableCell>
                </TableRow>
              ))}
              {employeeData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    No engagement data found. Start logging activities to see the leaderboard.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
