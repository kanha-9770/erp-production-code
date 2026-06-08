"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { useCreateLeadMutation } from "@/lib/api/real-estate/leads";
import { useGetAgentsQuery } from "@/lib/api/real-estate/agents";
import { useGetUserQuery } from "@/lib/api/auth";
import { computeImagePhash } from "@/lib/real-estate/perceptual-hash";
import { LeadPhotoCapture } from "@/components/real-estate/lead-photo-capture";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneField } from "@/components/form-fields/phone-field";
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
  const { data: userData } = useGetUserQuery();

  // Only admins / org owners can open a lead to the company pool. We
  // detect privilege client-side from the auth-meta payload (same fields
  // the sidebar + middleware use) — the server is the source of truth
  // either way (it forces origin=AGENT for unauthorised callers).
  const isAdminUser =
    Boolean(userData?.user?.isAdmin) || Boolean(userData?.user?.isOrgOwner);
  const roleNames: string[] = (
    (userData?.user as any)?.unitAssignments ?? []
  )
    .map((ua: any) => (ua?.role?.name ?? "").trim().toLowerCase())
    .filter(Boolean);
  const isPrivileged =
    isAdminUser ||
    roleNames.some((n: string) =>
      ["managing director", "director", "principal broker"].includes(n),
    );

  const [form, setForm] = useState({
    // origin: "AGENT" — default agent-captured. Admin/MD can flip to
    // "COMPANY" to open the lead to the org. Hidden in the UI for
    // regular agents.
    origin: "AGENT" as "AGENT" | "COMPANY",
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
    // Photo capture state. `photoUrl` is the public URL returned from
    // /api/upload. `photoPhash` is the 16-char dHash we compute in the
    // browser before upload — both are shipped to the server on submit
    // so the silent duplicate-detection can match by photo even when
    // the agent typed the wrong phone to "fool the system".
    photoUrl: "" as string,
    photoPhash: "" as string,
  });
  const [cityDraft, setCityDraft] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  /**
   * Pick + upload the customer photo. Two things happen in parallel:
   *   1. Browser-side dHash on the original file (fast, runs while the
   *      upload is in flight).
   *   2. POST to /api/upload to push the file to Hostinger and get the
   *      public URL back.
   * We need BOTH to come back successfully — partial state would mean
   * the duplicate-detection misses on photo even when one was provided.
   */
  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    setPhotoUploading(true);
    try {
      // Kick off both jobs concurrently — the hash works on the raw File
      // in memory, the upload streams the bytes to FTP.
      const fd = new FormData();
      fd.append("file", file);
      const [phashResult, uploadRes] = await Promise.all([
        computeImagePhash(file).catch(() => null),
        fetch("/api/upload", {
          method: "POST",
          body: fd,
          credentials: "include",
        }),
      ]);
      const uploadJson = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadJson.success || !uploadJson.imageUrl) {
        throw new Error(uploadJson.error || "Photo upload failed");
      }
      set("photoUrl", uploadJson.imageUrl);
      set("photoPhash", phashResult ?? "");
      toast({
        title: "Photo attached",
        description: phashResult
          ? "Image fingerprinted for duplicate detection."
          : "Image attached (fingerprinting skipped).",
      });
    } catch (err: any) {
      toast({
        title: "Could not attach photo",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const clearPhoto = () => {
    set("photoUrl", "");
    set("photoPhash", "");
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
      // For COMPANY origin we don't pre-assign — the lead sits in the
      // pool until an agent claims it. The server enforces this too,
      // but we keep the payload clean.
      const isCompany = form.origin === "COMPANY" && isPrivileged;

      const res = await create({
        origin: form.origin,
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
        assignedAgentId: isCompany ? null : (form.assignedAgentId || null),
        nextFollowUpAt: form.nextFollowUpAt || null,
        notes: form.notes.trim() || null,
        propertyTypes: form.propertyTypes,
        preferredCities: form.preferredCities,
        // Photo + perceptual hash for silent duplicate detection.
        photoUrl: form.photoUrl || null,
        photoPhash: form.photoPhash || null,
      } as any).unwrap();
      toast({
        title: isCompany ? "Company lead opened to pool" : "Lead captured",
      });
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
        {/* Origin selector — admin/MD only. Regular agents always capture
            as AGENT origin; even if they patch the request body to
            "COMPANY" the server forces it back. */}
        {isPrivileged && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Origin</CardTitle>
              <p className="text-xs text-muted-foreground">
                Decide who owns this lead and who can see it.
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set("origin", "AGENT")}
                className={
                  "text-left rounded-lg border p-3 transition-colors " +
                  (form.origin === "AGENT"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40")
                }
              >
                <div className="font-medium text-sm">Agent-captured</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Visible only to the assigned agent (and you, as admin).
                  Duplicate captures are flagged silently.
                </p>
              </button>
              <button
                type="button"
                onClick={() => set("origin", "COMPANY")}
                className={
                  "text-left rounded-lg border p-3 transition-colors " +
                  (form.origin === "COMPANY"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40")
                }
              >
                <div className="font-medium text-sm">Company pool</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Visible to every active agent. Whoever closes the deal
                  becomes the owner. Pre-assignment is disabled.
                </p>
              </button>
            </CardContent>
          </Card>
        )}

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
              <PhoneField value={form.phone} onChange={(v) => set("phone", v)} />
            </Field>
            <Field label="Alternate phone">
              <PhoneField value={form.altPhone} onChange={(v) => set("altPhone", v)} />
            </Field>
            <Field
              label="Customer photo"
              className="sm:col-span-2"
              hint="Optional — a quick snap fingerprints the lead so the system catches the same person captured by another agent, even if the phone or email is different."
            >
              <div className="flex items-start gap-3">
                <div className="h-20 w-20 rounded-md border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                  {form.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.photoUrl}
                      alt="Customer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">No photo</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {/* In-browser camera. Hands a JPEG `File` back to the
                        same onPhotoPicked() pipeline as the file picker,
                        so dHash + upload are identical for either path. */}
                    <LeadPhotoCapture
                      onCapture={onPhotoPicked}
                      disabled={photoUploading}
                      triggerLabel={form.photoUrl ? "Retake" : "Take photo"}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={photoUploading}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {photoUploading
                        ? "Uploading…"
                        : form.photoUrl
                          ? "Upload instead"
                          : "Upload photo"}
                    </Button>
                    {form.photoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearPhoto}
                        disabled={photoUploading}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {form.photoUrl && (
                    <p className="text-[11px] text-muted-foreground">
                      {form.photoPhash
                        ? `Fingerprint: ${form.photoPhash}`
                        : "Fingerprint unavailable — duplicate detection by photo is skipped for this lead."}
                    </p>
                  )}
                </div>
              </div>
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
            <Field
              label="Assign to agent"
              hint={
                form.origin === "COMPANY"
                  ? "Disabled for company-pool leads — agents claim it themselves."
                  : undefined
              }
            >
              <Select
                value={form.assignedAgentId || "NONE"}
                onValueChange={(v) => set("assignedAgentId", v === "NONE" ? "" : v)}
                disabled={form.origin === "COMPANY"}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      form.origin === "COMPANY" ? "Open to pool" : "Unassigned"
                    }
                  />
                </SelectTrigger>
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
