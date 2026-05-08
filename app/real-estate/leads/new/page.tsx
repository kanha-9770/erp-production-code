"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useCreateLeadMutation } from "@/lib/api/real-estate/leads";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, X } from "lucide-react";
import {
  LEAD_SCORE_LABEL,
  LEAD_SOURCE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  fullName,
} from "@/components/real-estate/constants";

export default function NewLeadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [create, { isLoading }] = useCreateLeadMutation();
  const { data: agentsData } = useGetAgentsQuery({ status: "ACTIVE", limit: 200 });

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    altPhone: "",
    budgetMin: "",
    budgetMax: "",
    bedroomsMin: "",
    score: "WARM",
    source: "OTHER",
    sourceDetails: "",
    assignedAgentId: "",
    nextFollowUpAt: "",
    notes: "",
    propertyTypes: [] as string[],
    preferredCities: [] as string[],
  });
  const [cityDraft, setCityDraft] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const togglePropertyType = (val: string) => {
    set(
      "propertyTypes",
      form.propertyTypes.includes(val)
        ? form.propertyTypes.filter((v) => v !== val)
        : [...form.propertyTypes, val],
    );
  };

  const addCity = () => {
    const c = cityDraft.trim();
    if (!c) return;
    if (!form.preferredCities.includes(c)) {
      set("preferredCities", [...form.preferredCities, c]);
    }
    setCityDraft("");
  };

  const removeCity = (c: string) => {
    set(
      "preferredCities",
      form.preferredCities.filter((x) => x !== c),
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
    const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));

    try {
      const res = await create({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        altPhone: form.altPhone.trim() || null,
        budgetMin: numOrNull(form.budgetMin),
        budgetMax: numOrNull(form.budgetMax),
        bedroomsMin: intOrNull(form.bedroomsMin),
        score: form.score as any,
        source: form.source as any,
        sourceDetails: form.sourceDetails.trim() || null,
        assignedAgentId: form.assignedAgentId || null,
        nextFollowUpAt: form.nextFollowUpAt || null,
        notes: form.notes.trim() || null,
        propertyTypes: form.propertyTypes,
        preferredCities: form.preferredCities,
      } as any).unwrap();
      toast({ title: "Lead captured" });
      router.push(`/real-estate/leads/${res.data.id}`);
    } catch (e: any) {
      toast({
        title: "Could not create lead",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  // Map agentProfile rows back to user ids — assignedAgentId should reference
  // the User.id (we use that for filters and on Lead.assignedAgentId).
  const agents = agentsData?.data ?? [];

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/real-estate/leads" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Capture lead
          </h1>
          <p className="text-sm text-muted-foreground">
            Drop in what you have — you can fill in property fit and follow-ups
            later from the lead page.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Alternate phone">
              <Input type="tel" value={form.altPhone} onChange={(e) => set("altPhone", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interest profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget min">
              <Input
                type="number"
                inputMode="decimal"
                value={form.budgetMin}
                onChange={(e) => set("budgetMin", e.target.value)}
              />
            </Field>
            <Field label="Budget max">
              <Input
                type="number"
                inputMode="decimal"
                value={form.budgetMax}
                onChange={(e) => set("budgetMax", e.target.value)}
              />
            </Field>
            <Field label="Min bedrooms">
              <Input
                type="number"
                value={form.bedroomsMin}
                onChange={(e) => set("bedroomsMin", e.target.value)}
              />
            </Field>
            <Field label="Property types of interest" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {PROPERTY_TYPE_OPTIONS.map((o) => {
                  const on = form.propertyTypes.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => togglePropertyType(o.value)}
                      className={`text-xs rounded-full border px-2.5 py-1 transition-colors ${
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Preferred cities" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.preferredCities.length === 0 ? (
                  <span className="text-xs text-muted-foreground">None added</span>
                ) : (
                  form.preferredCities.map((c) => (
                    <Badge key={c} variant="secondary" className="gap-1">
                      {c}
                      <button type="button" onClick={() => removeCity(c)} aria-label={`Remove ${c}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={cityDraft}
                  onChange={(e) => setCityDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCity();
                    }
                  }}
                  placeholder="Mumbai, Pune, Bengaluru…"
                />
                <Button type="button" variant="outline" onClick={addCity}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline & assignment</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Score">
              <Select value={form.score} onValueChange={(v) => set("score", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_SCORE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={form.source} onValueChange={(v) => set("source", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source details" className="sm:col-span-2" hint="Campaign name, referrer name, etc.">
              <Input value={form.sourceDetails} onChange={(e) => set("sourceDetails", e.target.value)} />
            </Field>
            <Field label="Assign to agent">
              <Select
                value={form.assignedAgentId || "NONE"}
                onValueChange={(v) => set("assignedAgentId", v === "NONE" ? "" : v)}
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
                value={form.nextFollowUpAt}
                onChange={(e) => set("nextFollowUpAt", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4} />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/real-estate/leads")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Capture lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
