/**
 * Wire types for the Inventory module. The page-builder layout schema is
 * defined here too so the builder, the storefront renderer, and the API
 * agree on shape.
 */

export type InventoryProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface ProductImage {
  url: string;
  alt?: string;
}

export interface ProductVariantOption {
  label: string;
  priceDelta?: number;
  sku?: string;
}

export interface ProductVariant {
  name: string;
  options: ProductVariantOption[];
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ProductDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: string;
}

// ─── Page-builder schema ────────────────────────────────────────────────────

/**
 * Block types the storefront knows how to render. Adding a type here is the
 * coordinated change: builder palette, renderer switch, and (optionally)
 * settings panel all need an entry.
 *
 * Two families:
 *  - **Bound** blocks read from the structured product fields (hero, gallery,
 *    title, price, description, specs, variants, addToCart, badges, related).
 *  - **Free** blocks carry their own content (heading, text, image, video,
 *    html, spacer, divider).
 */
export type BlockType =
  | "hero"
  | "gallery"
  | "title"
  | "price"
  | "description"
  | "specs"
  | "variants"
  | "addToCart"
  | "badges"
  | "related"
  | "heading"
  | "text"
  | "image"
  | "video"
  | "html"
  | "spacer"
  | "divider";

/** A single block on the canvas. `colSpan` is 1..12 (Tailwind grid). */
export interface PageBlock {
  id: string;
  type: BlockType;
  colSpan: number;
  props: Record<string, any>;
}

/** A row hosts blocks that share a 12-col grid. Rows stack vertically. */
export interface PageRow {
  id: string;
  blocks: PageBlock[];
  // Optional row-level styling
  align?: "start" | "center" | "end";
  gapClass?: string;
}

export interface PageLayout {
  rows: PageRow[];
}

// ─── Product DTO ────────────────────────────────────────────────────────────

export interface InventoryProduct {
  id: string;
  organizationId: string;

  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  status: InventoryProductStatus;

  price: number;
  compareAtPrice: number | null;
  currency: string;
  taxRate: number | null;

  stockQty: number;
  trackStock: boolean;
  lowStockThreshold: number | null;

  brand: string | null;
  category: string | null;
  tags: string[];

  primaryImageUrl: string | null;
  images: ProductImage[];

  variants: ProductVariant[];
  specs: ProductSpec[];

  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;

  weight: number | null;
  weightUnit: string | null;
  dimensions: ProductDimensions | null;

  pageLayout: PageLayout | null;

  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface ListResponse<T> {
  success: boolean;
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}
