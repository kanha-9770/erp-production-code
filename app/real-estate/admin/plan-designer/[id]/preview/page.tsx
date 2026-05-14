"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetPlanQuery } from "@/lib/api/real-estate/plans";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Printer } from "lucide-react";
import {
  PlanPreviewDocument,
  PlanPreviewPrintStyles,
} from "@/components/real-estate/plan-designer/plan-preview-document";

export default function PlanPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading } = useGetPlanQuery(id);
  const plan = data?.data;

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (isLoading || !plan) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white">
      <div className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md print:hidden">
        <div className="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/real-estate/admin/plan-designer/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to editor
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Use your browser's print dialog to save as PDF.
            </span>
            <Button onClick={handlePrint} size="sm">
              <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-6 py-8 print:p-0 print:max-w-none">
        <PlanPreviewDocument plan={plan} />
      </div>

      <PlanPreviewPrintStyles />
    </div>
  );
}
