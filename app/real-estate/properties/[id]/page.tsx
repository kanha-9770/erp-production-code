"use client";

/**
 * Property detail page — gallery, key facts, images grid, documents, price
 * history, and a viewings preview. Image/document uploads use the existing
 * /api/upload endpoint (returns { imageUrl }) and then attach via the property
 * sub-resource endpoints.
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  useGetPropertyQuery,
  useDeletePropertyMutation,
  useAddPropertyImageMutation,
  useRemovePropertyImageMutation,
  useAddPropertyDocumentMutation,
  useRemovePropertyDocumentMutation,
} from "@/lib/api/real-estate/properties";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  Edit,
  MapPin,
  Bed,
  Bath,
  Maximize,
  Calendar,
  IndianRupee,
  Trash2,
  Upload,
  ImageOff,
  FileText,
  ExternalLink,
  Star,
  History,
  Eye,
} from "lucide-react";
import {
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_VARIANT,
  PROPERTY_TYPE_LABEL,
  PROPERTY_SUBTYPE_LABEL,
  PROPERTY_DOC_TYPE_LABEL,
  PROPERTY_DOC_TYPE_OPTIONS,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/components/real-estate/constants";

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { toast } = useToast();

  const { data, isLoading } = useGetPropertyQuery(id);
  const [removeProperty, { isLoading: removing }] = useDeletePropertyMutation();

  const property = data?.data;

  const onDelete = async () => {
    if (!confirm("Withdraw this listing? It will be marked WITHDRAWN.")) return;
    try {
      const res = await removeProperty(id).unwrap();
      toast({
        title: res.deleted ? "Listing deleted" : "Listing withdrawn",
      });
      router.push("/real-estate/properties");
    } catch (e: any) {
      toast({
        title: "Could not delete",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-72" />
        <Skeleton className="h-32" />
      </div>
    );

  if (!property)
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-3xl">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Property not found.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/real-estate/properties">Back to properties</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/real-estate/properties" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                {property.title}
              </h1>
              <Badge variant={PROPERTY_STATUS_VARIANT[property.status]}>
                {PROPERTY_STATUS_LABEL[property.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {[property.addressLine1, property.city, property.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              {property.code && (
                <span className="ml-2 text-xs font-mono opacity-60">
                  · {property.code}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href={`/real-estate/properties/${id}/edit`}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Link>
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={removing}>
            <Trash2 className="h-4 w-4 mr-2" /> Withdraw
          </Button>
        </div>
      </div>

      {/* Hero image + key facts */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="aspect-[16/9] bg-muted relative">
            {property.primaryImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={property.primaryImageUrl}
                alt={property.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff className="h-12 w-12 text-muted-foreground/40" />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Key facts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Fact icon={<IndianRupee className="h-4 w-4" />} label="Listing price">
              <span className="font-semibold">
                {formatCurrency(property.listingPrice, property.currency)}
              </span>
            </Fact>
            <Fact icon={<Building2 className="h-4 w-4" />} label="Type">
              {PROPERTY_TYPE_LABEL[property.type]}
              {property.subType ? ` · ${PROPERTY_SUBTYPE_LABEL[property.subType]}` : ""}
            </Fact>
            {property.area != null && (
              <Fact icon={<Maximize className="h-4 w-4" />} label="Area">
                {property.area.toLocaleString()} {property.areaUnit ?? ""}
              </Fact>
            )}
            <div className="flex items-center gap-3 text-muted-foreground">
              {property.bedrooms != null && (
                <span className="flex items-center gap-1">
                  <Bed className="h-3.5 w-3.5" /> {property.bedrooms} bed
                </span>
              )}
              {property.bathrooms != null && (
                <span className="flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5" /> {property.bathrooms} bath
                </span>
              )}
              {property.parkingSpots != null && (
                <span>{property.parkingSpots} parking</span>
              )}
            </div>
            <Fact icon={<Calendar className="h-4 w-4" />} label="Listed">
              {formatDate(property.listedAt)}
            </Fact>
            {property.expectedClosingAt && (
              <Fact icon={<Calendar className="h-4 w-4" />} label="Expected close">
                {formatDate(property.expectedClosingAt)}
              </Fact>
            )}
            <div className="pt-2 border-t">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Commission
              </div>
              <div className="text-sm">
                {property.commissionTermType === "PERCENTAGE"
                  ? `${property.commissionPercentage ?? "—"}% of sale price`
                  : `Flat ${formatCurrency(property.commissionFlatFee, property.currency)}`}
              </div>
            </div>
            {property.features.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Features
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {property.features.map((f) => (
                    <Badge key={f} variant="secondary" className="text-[10px]">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: images / documents / price history / viewings / description */}
      <Tabs defaultValue="images">
        <TabsList className="overflow-x-auto justify-start">
          <TabsTrigger value="images">Images ({property.images.length})</TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({property.documents.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Price history ({property.priceHistory.length})
          </TabsTrigger>
          <TabsTrigger value="viewings">
            Viewings ({property.viewings.length})
          </TabsTrigger>
          <TabsTrigger value="description">Description</TabsTrigger>
        </TabsList>

        <TabsContent value="images">
          <ImagesPanel propertyId={id} images={property.images} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsPanel propertyId={id} documents={property.documents} />
        </TabsContent>
        <TabsContent value="history">
          <PriceHistoryPanel
            history={property.priceHistory}
            currency={property.currency}
          />
        </TabsContent>
        <TabsContent value="viewings">
          <ViewingsPanel viewings={property.viewings} />
        </TabsContent>
        <TabsContent value="description">
          <Card>
            <CardContent className="py-4 prose prose-sm max-w-none whitespace-pre-wrap">
              {property.description || (
                <span className="text-muted-foreground">No description.</span>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}

// ─── Images ──────────────────────────────────────────────────────────────────

function ImagesPanel({
  propertyId,
  images,
}: {
  propertyId: string;
  images: Array<{ id: string; url: string; caption: string | null; isPrimary: boolean }>;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [addImage] = useAddPropertyImageMutation();
  const [removeImage] = useRemovePropertyImageMutation();

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || !j.success || !j.imageUrl)
        throw new Error(j.error || "Upload failed");
      await addImage({
        id: propertyId,
        url: j.imageUrl,
        isPrimary: images.length === 0,
      }).unwrap();
      toast({ title: "Image added" });
    } catch (e: any) {
      toast({
        title: "Image upload failed",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Images</CardTitle>
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <span className="inline-flex items-center text-sm rounded-md border px-3 py-1.5 hover:bg-muted">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            {uploading ? "Uploading…" : "Upload"}
          </span>
        </label>
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <ImageOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No images uploaded yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="relative group rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption ?? ""} className="aspect-square object-cover w-full" />
                {img.isPrimary && (
                  <Badge className="absolute top-1.5 left-1.5 text-[10px] gap-1">
                    <Star className="h-3 w-3" /> Primary
                  </Badge>
                )}
                <button
                  type="button"
                  className="absolute top-1.5 right-1.5 h-7 w-7 rounded-md bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                  onClick={async () => {
                    if (!confirm("Delete this image?")) return;
                    try {
                      await removeImage({ id: propertyId, imageId: img.id }).unwrap();
                      toast({ title: "Image removed" });
                    } catch (e: any) {
                      toast({
                        title: "Could not delete",
                        description: e?.message,
                        variant: "destructive",
                      });
                    }
                  }}
                  aria-label="Delete image"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Documents ──────────────────────────────────────────────────────────────

function DocumentsPanel({
  propertyId,
  documents,
}: {
  propertyId: string;
  documents: Array<{ id: string; type: string; name: string; url: string; createdAt: string }>;
}) {
  const { toast } = useToast();
  const [docType, setDocType] = useState<string>("TITLE_DEED");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addDocument] = useAddPropertyDocumentMutation();
  const [removeDocument] = useRemovePropertyDocumentMutation();

  const onFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!docName.trim()) {
      toast({ title: "Enter a document name first", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || !j.success || !j.imageUrl)
        throw new Error(j.error || "Upload failed");
      await addDocument({
        id: propertyId,
        type: docType,
        name: docName.trim(),
        url: j.imageUrl,
      }).unwrap();
      toast({ title: "Document attached" });
      setDocName("");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto] items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_DOC_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Title deed - 2024"
            />
          </div>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            <span className="inline-flex items-center text-sm rounded-md border px-3 py-2 hover:bg-muted">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading…" : "Upload"}
            </span>
          </label>
        </div>

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No documents attached.
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {PROPERTY_DOC_TYPE_LABEL[d.type as keyof typeof PROPERTY_DOC_TYPE_LABEL] ?? d.type} ·{" "}
                    {formatDate(d.createdAt)}
                  </div>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm(`Delete "${d.name}"?`)) return;
                    try {
                      await removeDocument({ id: propertyId, documentId: d.id }).unwrap();
                      toast({ title: "Document removed" });
                    } catch (e: any) {
                      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
                    }
                  }}
                  aria-label="Delete document"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Price history ───────────────────────────────────────────────────────────

function PriceHistoryPanel({
  history,
  currency,
}: {
  history: Array<{ id: string; oldPrice: number; newPrice: number; changedAt: string; reason: string | null }>;
  currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Price history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No price changes recorded.
          </p>
        ) : (
          <ul className="divide-y">
            {history.map((h) => {
              const delta = h.newPrice - h.oldPrice;
              const up = delta > 0;
              return (
                <li key={h.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="line-through text-muted-foreground">
                        {formatCurrency(h.oldPrice, currency)}
                      </span>{" "}
                      → <span className="font-semibold">{formatCurrency(h.newPrice, currency)}</span>
                      <span
                        className={`ml-2 text-xs ${up ? "text-emerald-600" : "text-amber-600"}`}
                      >
                        {up ? "+" : ""}
                        {formatCurrency(delta, currency)}
                      </span>
                    </div>
                    {h.reason && <div className="text-xs text-muted-foreground mt-0.5">{h.reason}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {formatDateTime(h.changedAt)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Viewings ────────────────────────────────────────────────────────────────

function ViewingsPanel({
  viewings,
}: {
  viewings: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    lead: { id: string; name: string; phone: string | null };
  }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" /> Scheduled viewings
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/real-estate/viewings">Open calendar</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {viewings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No viewings scheduled.
          </p>
        ) : (
          <ul className="divide-y">
            {viewings.map((v) => (
              <li key={v.id} className="py-2.5 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.lead.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(v.scheduledAt)}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">{v.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
