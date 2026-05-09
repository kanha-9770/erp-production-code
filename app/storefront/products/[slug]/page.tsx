"use client";

/**
 * Public storefront product page — renders the layout the admin built in the
 * page builder. If `pageLayout` is null, falls back to the default layout so
 * a freshly-created product still renders something sensible.
 *
 * This is currently authenticated (server requires org membership) — that's
 * fine for previewing inside the ERP; turn off auth at the route level if/when
 * the storefront goes truly public.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetInventoryProductBySlugQuery } from "@/lib/api/inventory/products";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { BlockRenderer } from "@/components/inventory/block-renderer";
import { defaultLayout } from "@/components/inventory/constants";

export default function StorefrontProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, error } = useGetInventoryProductBySlugQuery(slug);
  const product = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="aspect-[16/7]" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto p-10 text-center">
        <h1 className="text-2xl font-semibold mb-2">Product not found</h1>
        <p className="text-sm text-muted-foreground mb-4">
          The product you’re looking for doesn’t exist or was unpublished.
        </p>
        <Button asChild variant="outline">
          <Link href="/inventory"><ArrowLeft className="h-4 w-4 mr-1" /> Back to inventory</Link>
        </Button>
      </div>
    );
  }

  const layout = product.pageLayout ?? defaultLayout();

  return (
    <div className="min-h-screen bg-background">
      {/* Lightweight admin breadcrumb — not part of the storefront aesthetic;
          remove or hide when this route is moved to a public surface. */}
      <div className="border-b bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/inventory" className="hover:underline">Inventory</Link>
          <span>·</span>
          <Link href={`/inventory/${product.id}`} className="hover:underline">Edit</Link>
          <span>·</span>
          <span>Storefront preview</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-4 sm:space-y-6">
          {layout.rows.map((row) => (
            <div key={row.id} className="grid grid-cols-12 gap-3 sm:gap-4">
              {row.blocks.map((block) => (
                <div
                  key={block.id}
                  className="min-w-0"
                  style={{ gridColumn: `span ${clamp(block.colSpan, 1, 12)} / span ${clamp(block.colSpan, 1, 12)}` }}
                >
                  <BlockRenderer block={block} product={product} mode="storefront" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number(n) || lo));
}
