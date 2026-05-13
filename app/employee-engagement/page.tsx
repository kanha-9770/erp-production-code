'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Target,
  Lightbulb,
  AlertCircle,
  TrendingUp,
  MessageSquare,
} from "lucide-react";

export default function EmployeeEngagementPage() {
  const modules = [
    {
      title: "Self Target",
      description: "Set and track personal performance targets",
      icon: Target,
      href: "/employee-engagement/self-target",
      color: "bg-blue-50 border-blue-200",
      iconColor: "text-blue-600",
    },
    {
      title: "Self Initiative",
      description: "Document and manage self-initiated improvement projects",
      icon: Lightbulb,
      href: "/employee-engagement/self-initiative",
      color: "bg-yellow-50 border-yellow-200",
      iconColor: "text-yellow-600",
    },
    {
      title: "Problem Registration",
      description: "Register and track workplace problems for resolution",
      icon: AlertCircle,
      href: "/employee-engagement/problem-registration",
      color: "bg-red-50 border-red-200",
      iconColor: "text-red-600",
    },
    {
      title: "Kaizen",
      description: "Continuous improvement suggestions and implementation",
      icon: TrendingUp,
      href: "/employee-engagement/kaizen",
      color: "bg-green-50 border-green-200",
      iconColor: "text-green-600",
    },
    {
      title: "Employee Suggestion",
      description: "Submit and track employee suggestions for improvement",
      icon: MessageSquare,
      href: "/employee-engagement/employee-suggestion",
      color: "bg-purple-50 border-purple-200",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Employee Engagement
        </h1>
        <p className="mt-2 text-base text-gray-600">
          Manage employee engagement initiatives, set targets, register problems,
          and track continuous improvement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => {
          const IconComponent = module.icon;
          return (
            <Link key={module.href} href={module.href}>
              <Card className={`h-full border-2 cursor-pointer hover:shadow-lg transition-shadow ${module.color}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{module.title}</CardTitle>
                    <IconComponent className={`w-6 h-6 ${module.iconColor}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">{module.description}</p>
                  <Button
                    variant="outline"
                    className="mt-4 w-full"
                    asChild
                  >
                    <span>View Module</span>
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
