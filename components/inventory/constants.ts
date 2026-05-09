import type {
  InventoryProductStatus,
  PageLayout,
  BlockType,
} from "@/lib/api/inventory/types";

export const PRODUCT_STATUS_LABEL: Record<InventoryProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const PRODUCT_STATUS_VARIANT: Record<
  InventoryProductStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  ARCHIVED: "outline",
};

export const PRODUCT_STATUS_OPTIONS: Array<{ value: InventoryProductStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

export const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

const formatters = new Map<string, Intl.NumberFormat>();
function fmtFor(currency: string) {
  if (!formatters.has(currency)) {
    formatters.set(
      currency,
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    );
  }
  return formatters.get(currency)!;
}

export function formatMoney(value: number | null | undefined, currency = "INR"): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  try {
    return fmtFor(currency).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toLocaleString()}`;
  }
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

// ─── Page-builder catalog ───────────────────────────────────────────────────

export interface BlockMeta {
  type: BlockType;
  label: string;
  group: "Bound" | "Layout" | "Content";
  description: string;
  defaultSpan: number; // 1..12
  minSpan: number;
  defaultProps: Record<string, any>;
}

export const BLOCK_LIBRARY: BlockMeta[] = [
  // Bound blocks pull from product fields
  {
    type: "hero",
    label: "Hero",
    group: "Bound",
    description: "Image, title, price, CTA — full-bleed banner.",
    defaultSpan: 12,
    minSpan: 6,
    defaultProps: { showPrice: true, showCta: true, ctaLabel: "Add to cart" },
  },
  {
    type: "gallery",
    label: "Gallery",
    group: "Bound",
    description: "Image grid bound to product images.",
    defaultSpan: 6,
    minSpan: 3,
    defaultProps: { columns: 2, aspect: "1/1" },
  },
  {
    type: "title",
    label: "Title",
    group: "Bound",
    description: "Product name as a heading.",
    defaultSpan: 8,
    minSpan: 4,
    defaultProps: { level: 1 },
  },
  {
    type: "price",
    label: "Price",
    group: "Bound",
    description: "Price with compare-at strikethrough.",
    defaultSpan: 4,
    minSpan: 2,
    defaultProps: { size: "lg" },
  },
  {
    type: "description",
    label: "Description",
    group: "Bound",
    description: "Long product description.",
    defaultSpan: 8,
    minSpan: 4,
    defaultProps: {},
  },
  {
    type: "specs",
    label: "Specs",
    group: "Bound",
    description: "Key/value spec table.",
    defaultSpan: 6,
    minSpan: 3,
    defaultProps: { columns: 2 },
  },
  {
    type: "variants",
    label: "Variants",
    group: "Bound",
    description: "Variant selectors (size, color…).",
    defaultSpan: 6,
    minSpan: 3,
    defaultProps: {},
  },
  {
    type: "addToCart",
    label: "Add to cart",
    group: "Bound",
    description: "Stock-aware CTA button.",
    defaultSpan: 4,
    minSpan: 2,
    defaultProps: { label: "Add to cart" },
  },
  {
    type: "badges",
    label: "Badges",
    group: "Bound",
    description: "SKU, brand, category, stock chips.",
    defaultSpan: 4,
    minSpan: 2,
    defaultProps: {},
  },
  {
    type: "related",
    label: "Related",
    group: "Bound",
    description: "Carousel of related products (placeholder).",
    defaultSpan: 12,
    minSpan: 6,
    defaultProps: {},
  },

  // Layout
  {
    type: "spacer",
    label: "Spacer",
    group: "Layout",
    description: "Blank vertical room.",
    defaultSpan: 12,
    minSpan: 1,
    defaultProps: { height: 24 },
  },
  {
    type: "divider",
    label: "Divider",
    group: "Layout",
    description: "Horizontal rule.",
    defaultSpan: 12,
    minSpan: 4,
    defaultProps: {},
  },

  // Free content
  {
    type: "heading",
    label: "Heading",
    group: "Content",
    description: "Free heading text.",
    defaultSpan: 12,
    minSpan: 4,
    defaultProps: { text: "Section heading", level: 2 },
  },
  {
    type: "text",
    label: "Paragraph",
    group: "Content",
    description: "Free body text.",
    defaultSpan: 12,
    minSpan: 4,
    defaultProps: { text: "Write something compelling about this product." },
  },
  {
    type: "image",
    label: "Image",
    group: "Content",
    description: "Standalone image.",
    defaultSpan: 6,
    minSpan: 2,
    defaultProps: { url: "", alt: "", aspect: "16/9" },
  },
  {
    type: "video",
    label: "Video",
    group: "Content",
    description: "YouTube / Vimeo / mp4 embed.",
    defaultSpan: 8,
    minSpan: 4,
    defaultProps: { url: "", aspect: "16/9" },
  },
  {
    type: "html",
    label: "HTML",
    group: "Content",
    description: "Raw HTML snippet.",
    defaultSpan: 12,
    minSpan: 4,
    defaultProps: { html: "<p>Custom HTML here</p>" },
  },
];

export function blockMeta(type: BlockType): BlockMeta {
  return (
    BLOCK_LIBRARY.find((b) => b.type === type) ??
    BLOCK_LIBRARY.find((b) => b.type === "text")!
  );
}

// Default layout used when a product has no saved pageLayout yet.
export function defaultLayout(): PageLayout {
  const id = (n: string) => `${n}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    rows: [
      {
        id: id("row"),
        blocks: [
          { id: id("blk"), type: "gallery", colSpan: 6, props: { columns: 2, aspect: "1/1" } },
          {
            id: id("blk"),
            type: "title",
            colSpan: 6,
            props: { level: 1 },
          },
        ],
      },
      {
        id: id("row"),
        blocks: [
          { id: id("blk"), type: "badges", colSpan: 6, props: {} },
          { id: id("blk"), type: "price", colSpan: 6, props: { size: "lg" } },
        ],
      },
      {
        id: id("row"),
        blocks: [
          { id: id("blk"), type: "variants", colSpan: 6, props: {} },
          { id: id("blk"), type: "addToCart", colSpan: 6, props: { label: "Add to cart" } },
        ],
      },
      {
        id: id("row"),
        blocks: [{ id: id("blk"), type: "description", colSpan: 12, props: {} }],
      },
      {
        id: id("row"),
        blocks: [{ id: id("blk"), type: "specs", colSpan: 12, props: { columns: 2 } }],
      },
    ],
  };
}

export function newBlockId(prefix = "blk"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
