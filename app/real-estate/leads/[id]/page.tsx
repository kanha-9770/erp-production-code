"use client";

/**
 * Lead detail — contact + interest sidebar, status / score / assignment editor,
 * activity timeline (call / email / meeting / note), viewings list, and a
 * convert-to-buyer action that locks the pipeline at CONVERTED.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  useGetLeadQuery,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useAddLeadActivityMutation,
  useConvertLeadMutation,
  useCreateViewingMutation,
} from "@/lib/api/real-estate/leads";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetPropertiesQuery } from "@/lib/api/real-estate/properties";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Save,
  Trash2,
  CheckCircle2,
  Plus,
  PhoneCall,
  MailCheck,
  StickyNote,
  Users,
  History,
  Eye,
} from "lucide-react";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_VARIANT,
  LEAD_SCORE_LABEL,
  LEAD_SCORE_VARIANT,
  LEAD_SOURCE_LABEL,
  LEAD_SOURCE_OPTIONS,
  LEAD_ACTIVITY_LABEL,
  LEAD_ACTIVITY_LOG_OPTIONS,
  VIEWING_STATUS_LABEL,
  VIEWING_STATUS_VARIANT,
  formatCurrency,
  formatDate,
  formatDateTime,
  fullName,
} from "@/components/real-estate/constants";
import type { LeadActivityType } from "@/lib/api/real-estate/types";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { toast } = useToast();

  const { data, isLoading } = useGetLeadQuery(id);
  const { data: agentsData } = useGetAgentsQuery({ status: "ACTIVE", limit: 200 });
  const [update, { isLoading: saving }] = useUpdateLeadMutation();
  const [removeLead] = useDeleteLeadMutation();
  const [convert, { isLoading: converting }] = useConvertLeadMutation();

  const lead = data?.data;
  const agents = agentsData?.data ?? [];

  const [draft, setDraft] = useState({
    status: "",
    score: "",
    source: "",
    assignedAgentId: "",
    nextFollowUpAt: "",
    notes: "",
    lostReason: "",
  });

  useEffect(() => {
    if (!lead) return;
    setDraft({
      status: lead.status,
      score: lead.score,
      source: lead.source,
      assignedAgentId: lead.assignedAgentId ?? "",
      nextFollowUpAt: lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 16) : "",
      notes: lead.notes ?? "",
      lostReason: lead.lostReason ?? "",
    });
  }, [lead]);

  if (isLoading)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );

  if (!lead)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Lead not found.</p>
            <Button asChild variant="link">
              <Link href="/real-estate/leads">Back to leads</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  const hasChanges =
    draft.status !== lead.status ||
    draft.score !== lead.score ||
    draft.source !== lead.source ||
    (draft.assignedAgentId || null) !== lead.assignedAgentId ||
    (draft.nextFollowUpAt
      ? new Date(draft.nextFollowUpAt).toISOString()
      : null) !== lead.nextFollowUpAt ||
    draft.notes !== (lead.notes ?? "") ||
    draft.lostReason !== (lead.lostReason ?? "");

  const save = async () => {
    try {
      await update({
        id,
        body: {
          status: draft.status as any,
          score: draft.score as any,
          source: draft.source as any,
          assignedAgentId: draft.assignedAgentId || null,
          nextFollowUpAt: draft.nextFollowUpAt
            ? new Date(draft.nextFollowUpAt).toISOString()
            : null,
          notes: draft.notes || null,
          lostReason: draft.lostReason || null,
        } as any,
      }).unwrap();
      toast({ title: "Lead updated" });
    } catch (e: any) {
      toast({
        title: "Could not save",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  const onDelete = async () => {
    if (!confirm("Delete this lead? Activities and viewings will also be removed.")) return;
    try {
      await removeLead(id).unwrap();
      toast({ title: "Lead deleted" });
      router.push("/real-estate/leads");
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  const onConvert = async () => {
    if (!confirm("Convert this lead? It will be locked at CONVERTED.")) return;
    try {
      await convert({ id }).unwrap();
      toast({ title: "Lead converted" });
    } catch (e: any) {
      toast({ title: "Could not convert", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/real-estate/leads" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {lead.name}
              </h1>
              <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>
                {LEAD_STATUS_LABEL[lead.status]}
              </Badge>
              <Badge variant={LEAD_SCORE_VARIANT[lead.score]}>
                {LEAD_SCORE_LABEL[lead.score]}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:underline">
                  <Mail className="h-3.5 w-3.5" /> {lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {lead.phone}
                </a>
              )}
              <span>· {LEAD_SOURCE_LABEL[lead.source]}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={save} disabled={!hasChanges || saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save"}
          </Button>
          {lead.status !== "CONVERTED" && lead.status !== "LOST" && (
            <Button variant="outline" onClick={onConvert} disabled={converting}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Convert
            </Button>
          )}
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Left: pipeline + activities + viewings */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline & assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v })}
                  disabled={lead.status === "CONVERTED"}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUS_OPTIONS.filter((o) => o.value !== "CONVERTED").map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                    {/* CONVERTED is selectable only via the explicit Convert button.
                        Show it as disabled if currently converted. */}
                    {lead.status === "CONVERTED" && (
                      <SelectItem value="CONVERTED">Converted</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {lead.status === "CONVERTED" && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Lead is locked at CONVERTED.
                  </p>
                )}
              </Field>
              <Field label="Score">
                <Select value={draft.score} onValueChange={(v) => setDraft({ ...draft, score: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LEAD_SCORE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Source">
                <Select value={draft.source} onValueChange={(v) => setDraft({ ...draft, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assigned agent">
                <Select
                  value={draft.assignedAgentId || "NONE"}
                  onValueChange={(v) => setDraft({ ...draft, assignedAgentId: v === "NONE" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Unassigned</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.userId}>
                        {fullName(a.user!)} {a.rank ? `· ${a.rank.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Next follow-up">
                <Input
                  type="datetime-local"
                  value={draft.nextFollowUpAt}
                  onChange={(e) => setDraft({ ...draft, nextFollowUpAt: e.target.value })}
                />
              </Field>
              {draft.status === "LOST" && (
                <Field label="Lost reason">
                  <Input
                    value={draft.lostReason}
                    onChange={(e) => setDraft({ ...draft, lostReason: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Notes" className="sm:col-span-2">
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  rows={3}
                />
              </Field>
            </CardContent>
          </Card>

          <Tabs defaultValue="activities">
            <TabsList>
              <TabsTrigger value="activities">
                Activities ({lead.activities.length})
              </TabsTrigger>
              <TabsTrigger value="viewings">
                Viewings ({lead.viewings.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="activities">
              <ActivitiesPanel
                leadId={id}
                assignedAgentId={lead.assignedAgentId}
                activities={lead.activities}
              />
            </TabsContent>
            <TabsContent value="viewings">
              <ViewingsPanel
                leadId={id}
                viewings={lead.viewings}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: interest profile / buyer */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Interest profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(lead.budgetMin != null || lead.budgetMax != null) && (
                <Stat
                  label="Budget"
                  value={`${formatCurrency(lead.budgetMin ?? 0)} – ${formatCurrency(lead.budgetMax ?? 0)}`}
                />
              )}
              {lead.bedroomsMin != null && (
                <Stat label="Min bedrooms" value={lead.bedroomsMin} />
              )}
              {lead.preferredCities.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Preferred cities</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.preferredCities.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {lead.propertyTypes.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Property types</div>
                  <div className="flex flex-wrap gap-1.5">
                    {lead.propertyTypes.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t pt-2 mt-2 space-y-1.5">
                <Stat label="Created" value={formatDateTime(lead.createdAt)} />
                {lead.lastContactedAt && (
                  <Stat label="Last contact" value={formatDateTime(lead.lastContactedAt)} />
                )}
                {lead.convertedAt && (
                  <Stat label="Converted" value={formatDateTime(lead.convertedAt)} />
                )}
              </div>
            </CardContent>
          </Card>

          {(lead as any).buyer && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Buyer
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div className="font-medium">{(lead as any).buyer.name}</div>
                {(lead as any).buyer.email && (
                  <div className="text-muted-foreground">{(lead as any).buyer.email}</div>
                )}
                {(lead as any).buyer.phone && (
                  <div className="text-muted-foreground">{(lead as any).buyer.phone}</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Activities panel ────────────────────────────────────────────────────────

function ActivitiesPanel({
  leadId,
  assignedAgentId,
  activities,
}: {
  leadId: string;
  assignedAgentId: string | null;
  activities: Array<{
    id: string;
    type: string;
    occurredAt: string;
    subject: string | null;
    content: string | null;
    outcome: string | null;
    agentId: string;
    data: any;
  }>;
}) {
  const { toast } = useToast();
  const [add, { isLoading }] = useAddLeadActivityMutation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeadActivityType>("CALL");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [outcome, setOutcome] = useState("");

  const submit = async () => {
    if (!subject.trim()) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    try {
      await add({
        id: leadId,
        type,
        agentId: assignedAgentId ?? undefined,
        subject: subject.trim(),
        content: content.trim() || undefined,
        outcome: outcome.trim() || undefined,
      }).unwrap();
      toast({ title: "Activity logged" });
      setSubject("");
      setContent("");
      setOutcome("");
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Could not log", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Timeline
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Log activity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log activity</DialogTitle>
              <DialogDescription>
                Captured against the assigned agent. Status changes are auto-logged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Type">
                <Select value={type} onValueChange={(v) => setType(v as LeadActivityType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_ACTIVITY_LOG_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{LEAD_ACTIVITY_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Subject *">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
              </Field>
              <Field label="Outcome">
                <Input
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g. Will call back tomorrow"
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isLoading}>
                {isLoading ? "Saving…" : "Log"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No activities yet. Log a call, email, meeting, or note.
          </p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {iconForActivity(a.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {LEAD_ACTIVITY_LABEL[a.type as keyof typeof LEAD_ACTIVITY_LABEL] ?? a.type}
                      {a.subject ? ` · ${a.subject}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(a.occurredAt)}
                    </span>
                  </div>
                  {a.content && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                      {a.content}
                    </p>
                  )}
                  {a.outcome && (
                    <p className="text-xs italic text-muted-foreground mt-1">
                      Outcome: {a.outcome}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function iconForActivity(t: string) {
  switch (t) {
    case "CALL": return <PhoneCall className="h-4 w-4" />;
    case "EMAIL": return <MailCheck className="h-4 w-4" />;
    case "MEETING": return <Users className="h-4 w-4" />;
    case "VIEWING": return <Eye className="h-4 w-4" />;
    case "NOTE": return <StickyNote className="h-4 w-4" />;
    case "STATUS_CHANGE": return <History className="h-4 w-4" />;
    case "ASSIGNMENT": return <Users className="h-4 w-4" />;
    default: return <StickyNote className="h-4 w-4" />;
  }
}

// ─── Viewings panel ──────────────────────────────────────────────────────────

function ViewingsPanel({
  leadId,
  viewings,
}: {
  leadId: string;
  viewings: any[];
}) {
  const { toast } = useToast();
  const [createViewing, { isLoading }] = useCreateViewingMutation();
  const { data: propertiesData } = useGetPropertiesQuery({ status: "AVAILABLE", limit: 200 });
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState(30);

  const submit = async () => {
    if (!propertyId || !scheduledAt) {
      toast({ title: "Property and time are required", variant: "destructive" });
      return;
    }
    try {
      await createViewing({
        leadId,
        propertyId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMin,
      }).unwrap();
      toast({ title: "Viewing scheduled" });
      setPropertyId("");
      setScheduledAt("");
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Could not schedule", description: e?.data?.error || e?.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Property viewings
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Schedule viewing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule a viewing</DialogTitle>
              <DialogDescription>
                Advances the lead to "Viewing scheduled" if it's earlier in the
                pipeline.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Field label="Property *">
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger><SelectValue placeholder="Pick a property" /></SelectTrigger>
                  <SelectContent>
                    {propertiesData?.data.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} — {p.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="When *">
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </Field>
              <Field label="Duration (min)">
                <Input
                  type="number"
                  value={durationMin}
                  onChange={(e) => setDurationMin(parseInt(e.target.value || "0", 10))}
                />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isLoading}>
                {isLoading ? "Saving…" : "Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {viewings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No viewings scheduled yet.
          </p>
        ) : (
          <ul className="divide-y">
            {viewings.map((v) => (
              <li key={v.id} className="py-2.5 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    href={v.property ? `/real-estate/properties/${v.property.id}` : "#"}
                    className="font-medium truncate hover:underline"
                  >
                    {v.property?.title ?? "Property"}
                  </Link>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(v.scheduledAt)} · {v.durationMin} min
                  </div>
                </div>
                <Badge variant={VIEWING_STATUS_VARIANT[v.status as keyof typeof VIEWING_STATUS_VARIANT]} className="text-[10px] shrink-0">
                  {VIEWING_STATUS_LABEL[v.status as keyof typeof VIEWING_STATUS_LABEL]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
