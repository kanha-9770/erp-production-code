"use client";

/**
 * Single product workbench. Two tabs:
 *
 *   • **Form**     — the structured field editor (basics + advanced).
 *   • **Builder**  — the 12-col page builder for the storefront page.
 *
 * Form changes are saved on demand with a "Save" button (the user can keep
 * tweaking without round-trips). Builder changes autosave with a 500 ms
 * debounce — page-builder edits are tiny and frequent.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  useGetInventoryProductQuery,
  useUpdateInventoryProductMutation,
  useDeleteInventoryProductMutation,
  useSaveInventoryProductLayoutMutation,
} from "@/lib/api/inventory/products";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Boxes,
  ExternalLink,
  Eye,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { ProductForm, type ProductDraft } from "@/components/inventory/product-form";
import { PageBuilder } from "@/components/inventory/page-builder";
import {
  PRODUCT_STATUS_LABEL,
  PRODUCT_STATUS_VARIANT,
} from "@/components/inventory/constants";
import { useToast } from "@/hooks/use-toast";
import type { InventoryProduct, PageLayout } from "@/lib/api/inventory/types";

function toDraft(p: InventoryProduct): ProductDraft {
  const { id, organizationId, createdAt, updatedAt, createdById, pageLayout, ...rest } = p;
  return rest;
}

export default function InventoryProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialTab = searchParams.get("tab") === "builder" ? "builder" : "form";
  const [tab, setTab] = useState<string>(initialTab);

  const { data, isLoading, error } = useGetInventoryProductQuery(id);
  const product = data?.data;

  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [layout, setLayout] = useState<PageLayout | null>(null);

  // Hydrate draft from server response.
  useEffect(() => {
    if (product) {
      setDraft(toDraft(product));
      setLayout(product.pageLayout ?? null);
    }
  }, [product]);

  const [updateProduct, { isLoading: saving }] = useUpdateInventoryProductMutation();
  const [saveLayout, { isLoading: layoutSaving }] = useSaveInventoryProductLayoutMutation();
  const [deleteProduct] = useDeleteInventoryProductMutation();

  // Form-tab dirtiness — used for the disabled state on Save.
  const dirty = useMemo(() => {
    if (!product || !draft) return false;
    return JSON.stringify(toDraft(product)) !== JSON.stringify(draft);
  }, [product, draft]);

  const handleSave = async () => {
    if (!draft) return;
    try {
      await updateProduct({ id, body: draft }).unwrap();
      toast({ title: "Saved", description: `Updated ${draft.name}.` });
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.data?.error ?? e?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
      await deleteProduct(id).unwrap();
      toast({ title: "Product deleted" });
      router.push("/inventory");
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.data?.error ?? e?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Debounced layout autosave (500 ms quiet period).
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLayoutChange = (next: PageLayout) => {
    setLayout(next);
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      saveLayout({ id, pageLayout: next })
        .unwrap()
        .catch((e: any) => {
          toast({
            title: "Layout save failed",
            description: e?.data?.error ?? e?.message ?? "Unknown error",
            variant: "destructive",
          });
        });
    }, 500);
  };
  useEffect(() => {
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, []);

  if (isLoading || !draft || !product) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Could not load product.</p>
        <Button asChild variant="link"><Link href="/inventory">Back to list</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem))] min-h-0">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Link href="/inventory" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Boxes className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold truncate">{draft.name || "Untitled product"}</h1>
              <Badge variant={PRODUCT_STATUS_VARIANT[draft.status]} className="text-[10px] shrink-0">
                {PRODUCT_STATUS_LABEL[draft.status]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              <code className="font-mono">/storefront/products/{draft.slug}</code>
              {layoutSaving && <span className="ml-2"><Loader2 className="h-3 w-3 inline animate-spin -mt-0.5" /> saving…</span>}
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8">
            <Link href={`/storefront/products/${draft.slug}`} target="_blank">
              <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
            </Link>
          </Button>
          <Button size="sm" variant="destructive" className="h-8" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" className="h-8" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
        <div className="border-b bg-background sticky top-[57px] z-10">
          <div className="px-4 sm:px-6">
            <TabsList>
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="builder">Page builder</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="form" className="flex-1 min-h-0 overflow-auto m-0">
          <div className="container mx-auto p-4 sm:p-6 max-w-5xl">
            <ProductForm draft={draft} onChange={setDraft} />
          </div>
        </TabsContent>

        <TabsContent value="builder" className="flex-1 min-h-0 m-0">
          <div className="h-full p-3">
            <PageBuilder product={product} layout={layout} onChange={handleLayoutChange} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
