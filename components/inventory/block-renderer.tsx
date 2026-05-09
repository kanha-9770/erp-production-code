"use client";

/**
 * Renders a single page-builder block. Used by:
 *   • the builder canvas (mode="builder", shows placeholders for missing data)
 *   • the storefront page (mode="storefront", clean public render)
 *
 * Adding a new block type:
 *   1. Add to BlockType union in lib/api/inventory/types.ts
 *   2. Add an entry to BLOCK_LIBRARY in components/inventory/constants.ts
 *   3. Add a case to the switch below
 */

import * as React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageOff, ShoppingCart } from "lucide-react";
import { formatMoney } from "./constants";
import type { InventoryProduct, PageBlock } from "@/lib/api/inventory/types";

export type BlockMode = "builder" | "storefront";

interface RendererProps {
  block: PageBlock;
  product: InventoryProduct;
  mode?: BlockMode;
}

/** Builder placeholder — shown when a bound block has no data to render. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

export function BlockRenderer({ block, product, mode = "storefront" }: RendererProps) {
  const showPlaceholders = mode === "builder";

  switch (block.type) {
    case "hero": {
      const url = product.primaryImageUrl ?? product.images[0]?.url ?? null;
      return (
        <div className="relative overflow-hidden rounded-xl bg-muted">
          <div className="aspect-[16/7] relative">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <ImageOff className="h-10 w-10 text-muted-foreground/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 text-white">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight drop-shadow">
                {product.name}
              </h2>
              {block.props.showPrice !== false && (
                <div className="mt-1 text-lg sm:text-2xl font-semibold tabular-nums drop-shadow">
                  {formatMoney(product.price, product.currency)}
                </div>
              )}
              {block.props.showCta !== false && (
                <Button size="lg" className="mt-3">
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {block.props.ctaLabel ?? "Add to cart"}
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    case "gallery": {
      const images = product.images ?? [];
      const cols = Math.max(1, Math.min(4, Number(block.props.columns) || 2));
      const aspect = String(block.props.aspect ?? "1/1");
      if (images.length === 0) {
        return showPlaceholders ? (
          <Placeholder>No product images yet — add some on the Form tab.</Placeholder>
        ) : null;
      }
      return (
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {images.map((img, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg bg-muted"
              style={{ aspectRatio: aspect }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt ?? ""} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      );
    }

    case "title": {
      const level = clampLevel(block.props.level);
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      const cls =
        level === 1
          ? "text-3xl sm:text-4xl font-bold tracking-tight"
          : level === 2
          ? "text-2xl sm:text-3xl font-bold tracking-tight"
          : level === 3
          ? "text-xl sm:text-2xl font-semibold"
          : "text-lg font-semibold";
      return <Tag className={cls}>{product.name}</Tag>;
    }

    case "price": {
      const big = block.props.size === "lg";
      return (
        <div className="flex items-baseline gap-3">
          <span
            className={
              big
                ? "text-3xl font-bold tabular-nums"
                : "text-xl font-semibold tabular-nums"
            }
          >
            {formatMoney(product.price, product.currency)}
          </span>
          {product.compareAtPrice != null && product.compareAtPrice > product.price && (
            <span className="text-sm line-through text-muted-foreground tabular-nums">
              {formatMoney(product.compareAtPrice, product.currency)}
            </span>
          )}
          {product.taxRate != null && (
            <span className="text-[11px] text-muted-foreground">incl. {product.taxRate}% tax</span>
          )}
        </div>
      );
    }

    case "description": {
      if (!product.description) {
        return showPlaceholders ? <Placeholder>Description block — fill it in on the Form tab.</Placeholder> : null;
      }
      return (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
          {product.description}
        </p>
      );
    }

    case "specs": {
      const cols = Math.max(1, Math.min(3, Number(block.props.columns) || 2));
      if (!product.specs?.length) {
        return showPlaceholders ? <Placeholder>No specs yet — add some on the Form tab.</Placeholder> : null;
      }
      return (
        <div className="grid gap-x-6 gap-y-2 text-sm" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {product.specs.map((s, i) => (
            <div key={i} className="flex items-baseline justify-between gap-2 border-b py-1.5">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium">{s.value}</span>
            </div>
          ))}
        </div>
      );
    }

    case "variants": {
      if (!product.variants?.length) {
        return showPlaceholders ? <Placeholder>No variants yet — add some on the Form tab.</Placeholder> : null;
      }
      return (
        <div className="space-y-3">
          {product.variants.map((v, i) => (
            <div key={i}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                {v.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.options.map((o, j) => (
                  <button
                    key={j}
                    type="button"
                    className="rounded border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    {o.label}
                    {o.priceDelta ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        {o.priceDelta > 0 ? "+" : ""}
                        {formatMoney(o.priceDelta, product.currency)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    case "addToCart": {
      const inStock = !product.trackStock || product.stockQty > 0;
      return (
        <div className="flex items-center gap-2">
          <Button size="lg" disabled={!inStock} className="min-w-40">
            <ShoppingCart className="h-4 w-4 mr-2" />
            {block.props.label ?? "Add to cart"}
          </Button>
          {!inStock && <span className="text-xs text-destructive">Out of stock</span>}
          {inStock && product.trackStock && product.lowStockThreshold != null && product.stockQty <= product.lowStockThreshold && (
            <span className="text-xs text-amber-600">Only {product.stockQty} left</span>
          )}
        </div>
      );
    }

    case "badges": {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {product.sku && <Badge variant="outline">SKU {product.sku}</Badge>}
          {product.brand && <Badge variant="secondary">{product.brand}</Badge>}
          {product.category && <Badge variant="secondary">{product.category}</Badge>}
          {product.trackStock && (
            <Badge variant={product.stockQty > 0 ? "default" : "destructive"}>
              {product.stockQty > 0 ? `${product.stockQty} in stock` : "Out of stock"}
            </Badge>
          )}
          {product.tags?.map((t, i) => (
            <Badge key={i} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      );
    }

    case "related": {
      // Storefront-real implementation would query "related products". Here we
      // render a placeholder strip so the layout is visible in the builder.
      return (
        <Card className="bg-muted/30 border-dashed">
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Related products carousel
          </div>
        </Card>
      );
    }

    case "heading": {
      const level = clampLevel(block.props.level ?? 2);
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      const cls =
        level === 1
          ? "text-3xl sm:text-4xl font-bold tracking-tight"
          : level === 2
          ? "text-2xl sm:text-3xl font-bold tracking-tight"
          : level === 3
          ? "text-xl sm:text-2xl font-semibold"
          : "text-lg font-semibold";
      return <Tag className={cls}>{block.props.text || "Heading"}</Tag>;
    }

    case "text": {
      return (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
          {block.props.text || (showPlaceholders ? "Empty paragraph" : "")}
        </p>
      );
    }

    case "image": {
      const url = block.props.url as string | undefined;
      const aspect = String(block.props.aspect ?? "16/9");
      if (!url) {
        return showPlaceholders ? <Placeholder>Image block — set the URL in the right panel.</Placeholder> : null;
      }
      return (
        <div className="overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: aspect }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={block.props.alt ?? ""} className="h-full w-full object-cover" />
        </div>
      );
    }

    case "video": {
      const url = String(block.props.url ?? "");
      const aspect = String(block.props.aspect ?? "16/9");
      const yt = url.match(/(?:youtu\.be\/|v=)([\w-]{6,})/);
      const vimeo = url.match(/vimeo\.com\/(\d+)/);
      if (!url) {
        return showPlaceholders ? <Placeholder>Video block — paste a YouTube / Vimeo / mp4 URL.</Placeholder> : null;
      }
      const embed = yt
        ? `https://www.youtube.com/embed/${yt[1]}`
        : vimeo
        ? `https://player.vimeo.com/video/${vimeo[1]}`
        : null;
      return (
        <div className="overflow-hidden rounded-lg bg-black" style={{ aspectRatio: aspect }}>
          {embed ? (
            <iframe src={embed} className="h-full w-full" allowFullScreen />
          ) : (
            <video src={url} controls className="h-full w-full" />
          )}
        </div>
      );
    }

    case "html": {
      const html = String(block.props.html ?? "");
      // Trusted by the org admin who built the page; we don't sanitize here.
      // For untrusted multi-tenant publishing, swap in DOMPurify.
      return <div dangerouslySetInnerHTML={{ __html: html }} />;
    }

    case "spacer": {
      const h = Math.max(4, Math.min(240, Number(block.props.height) || 24));
      return <div style={{ height: h }} aria-hidden />;
    }

    case "divider": {
      return <hr className="border-t border-border" />;
    }

    default: {
      const t: any = (block as any).type;
      return showPlaceholders ? (
        <Placeholder>Unknown block type: {String(t)}</Placeholder>
      ) : null;
    }
  }
}

function clampLevel(v: any): 1 | 2 | 3 | 4 {
  const n = Number(v);
  if (n === 1 || n === 3 || n === 4) return n;
  return 2;
}

// Avoid unused-import warnings if next/image gets dropped.
void Image;
