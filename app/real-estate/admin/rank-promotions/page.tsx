"use client";

/**
 * Rank promotion admin (FR-2.7) — preview the candidates whose criteria are
 * met for the next rank, then promote in one click. Promotions log to
 * RankPromotionLog and credit any rank-up bonus to the agent's wallet.
 */

import Link from "next/link";
import { useState } from "react";
import { useEvaluateRankPromotionsMutation } from "@/lib/api/real-estate/compliance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Sparkles,
  PlayCircle,
  CheckCircle2,
  Trophy,
  Info,
} from "lucide-react";
import { formatCurrency } from "@/components/real-estate/constants";
import type { PromotionResult } from "@/lib/api/real-estate/types";

export default function RankPromotionsPage() {
  const { toast } = useToast();
  const [evaluate] = useEvaluateRankPromotionsMutation();
  const [previewing, setPreviewing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [results, setResults] = useState<PromotionResult[] | null>(null);
  const [mode, setMode] = useState<"PREVIEW" | "AUTO" | null>(null);

  const onPreview = async () => {
    setPreviewing(true);
    try {
      const out = await evaluate("PREVIEW").unwrap();
      setResults(out.data);
      setMode("PREVIEW");
      toast({
        title: `${out.data.length} agent${out.data.length === 1 ? "" : "s"} qualify`,
        description:
          out.data.length === 0
            ? "No promotions found this round."
            : "Review the list, then click Promote to apply.",
      });
    } catch (e: any) {
      toast({
        title: "Could not evaluate",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const onPromote = async () => {
    if (!confirm("Promote every qualifying agent now? Each promotion creates a RankPromotionLog row and credits the rank-up bonus (if any) to the agent's wallet.")) return;
    setPromoting(true);
    try {
      const out = await evaluate("AUTO").unwrap();
      setResults(out.data);
      setMode("AUTO");
      toast({
        title: `Promoted ${out.data.length} agent${out.data.length === 1 ? "" : "s"}`,
      });
    } catch (e: any) {
      toast({
        title: "Could not promote",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/real-estate" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 sm:gap-3">
              <Sparkles className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
              Rank promotions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Evaluate every active agent against the criteria for their next
              rank. Preview first; then promote in bulk.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onPreview} disabled={previewing || promoting}>
            <PlayCircle className="h-4 w-4 mr-2" />
            {previewing ? "Evaluating…" : "Preview candidates"}
          </Button>
          <Button onClick={onPromote} disabled={promoting || previewing}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {promoting ? "Promoting…" : "Run promotions"}
          </Button>
        </div>
      </div>

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-3 flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Criteria come from each rank's <code>minPersonalSales</code>,{" "}
            <code>minTeamSize</code>, <code>minTeamRevenue</code>, and{" "}
            <code>evaluationWindowDays</code>. Configure them under{" "}
            <Link href="/real-estate/agents/ranks" className="underline">
              Ranks
            </Link>
            .
          </span>
        </CardContent>
      </Card>

      {previewing || promoting ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : results == null ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Click Preview to see which agents qualify.</p>
          </CardContent>
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No agents qualify for promotion right now.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {results.length} {mode === "AUTO" ? "promoted" : "candidate"}
              {results.length === 1 ? "" : "s"}
            </CardTitle>
            {mode === "AUTO" && (
              <Badge className="text-[10px]">Promotions applied</Badge>
            )}
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Agent</th>
                  <th className="text-left p-3">Rank change</th>
                  <th className="text-right p-3">Personal sales</th>
                  <th className="text-right p-3">Team size</th>
                  <th className="text-right p-3">Team revenue</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.agentId} className="border-b hover:bg-muted/40">
                    <td className="p-3">
                      <Link
                        href={`/real-estate/agents/${r.agentId}`}
                        className="font-medium hover:underline"
                      >
                        {r.userId.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className="text-muted-foreground">
                        {r.fromRankName ?? "—"}
                      </span>{" "}
                      → <span className="font-medium">{r.toRankName}</span>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {r.metrics.personalSales}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {r.metrics.teamSize}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatCurrency(r.metrics.teamRevenue)}
                    </td>
                    <td className="p-3">
                      {r.promoted ? (
                        <Badge className="text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Promoted
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Eligible
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
