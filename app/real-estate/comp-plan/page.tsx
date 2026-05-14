"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useGetPlansQuery } from "@/lib/api/real-estate/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowLeft, FileText, Printer } from "lucide-react";
import {
  PlanPreviewDocument,
  PlanPreviewPrintStyles,
} from "@/components/real-estate/plan-designer/plan-preview-document";

export default function AgentCompPlanPage() {
  const { data, isLoading, isError } = useGetPlansQuery({ status: "ACTIVE" });
  const activePlan = data?.data?.[0];

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !activePlan) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center space-y-4">
            <div className="mx-auto rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 p-4 w-fit ring-1 ring-amber-500/20">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                No active compensation plan
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your organization has not activated a compensation plan yet.
                Please check back later or contact your admin.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/real-estate">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Real Estate
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <div className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md print:hidden">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button asChild variant="ghost" size="sm">
              <Link href="/real-estate">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Compensation Plan
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:inline">
              Use your browser's print dialog to save as PDF.
            </span>
            <Button onClick={handlePrint} size="sm">
              <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-6 py-8 print:p-0 print:max-w-none">
        <PlanPreviewDocument plan={activePlan} />
      </div>

      <PlanPreviewPrintStyles />
    </div>
  );
}
