import { baseApi } from "../baseApi";
import type {
  InventoryProduct,
  ListResponse,
  PageLayout,
  SingleResponse,
} from "./types";

export interface ProductListParams {
  status?: string;
  category?: string;
  brand?: string;
  search?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  limit?: number;
  offset?: number;
}

function toQuery(params: Record<string, any>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getInventoryProducts: builder.query<ListResponse<InventoryProduct>, ProductListParams | void>({
      query: (params) => `/inventory/products${toQuery(params ?? {})}`,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((p) => ({ type: "InventoryProduct" as const, id: p.id })),
              { type: "InventoryProducts" as const, id: "LIST" },
            ]
          : [{ type: "InventoryProducts" as const, id: "LIST" }],
    }),

    getInventoryProduct: builder.query<SingleResponse<InventoryProduct>, string>({
      query: (id) => `/inventory/products/${id}`,
      providesTags: (_r, _e, id) => [{ type: "InventoryProduct", id }],
    }),

    getInventoryProductBySlug: builder.query<SingleResponse<InventoryProduct>, string>({
      query: (slug) => `/inventory/products/by-slug/${slug}`,
      providesTags: (r) =>
        r ? [{ type: "InventoryProduct", id: r.data.id }] : ["InventoryProduct"],
    }),

    createInventoryProduct: builder.mutation<
      SingleResponse<InventoryProduct>,
      Partial<InventoryProduct>
    >({
      query: (body) => ({ url: "/inventory/products", method: "POST", body }),
      invalidatesTags: [{ type: "InventoryProducts", id: "LIST" }],
    }),

    updateInventoryProduct: builder.mutation<
      SingleResponse<InventoryProduct>,
      { id: string; body: Partial<InventoryProduct> }
    >({
      query: ({ id, body }) => ({ url: `/inventory/products/${id}`, method: "PUT", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "InventoryProduct", id },
        { type: "InventoryProducts", id: "LIST" },
      ],
    }),

    saveInventoryProductLayout: builder.mutation<
      SingleResponse<InventoryProduct>,
      { id: string; pageLayout: PageLayout | null }
    >({
      query: ({ id, pageLayout }) => ({
        url: `/inventory/products/${id}/layout`,
        method: "PATCH",
        body: { pageLayout },
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "InventoryProduct", id }],
    }),

    deleteInventoryProduct: builder.mutation<{ success: boolean; deleted?: boolean }, string>({
      query: (id) => ({ url: `/inventory/products/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "InventoryProduct", id },
        { type: "InventoryProducts", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetInventoryProductsQuery,
  useGetInventoryProductQuery,
  useGetInventoryProductBySlugQuery,
  useCreateInventoryProductMutation,
  useUpdateInventoryProductMutation,
  useSaveInventoryProductLayoutMutation,
  useDeleteInventoryProductMutation,
} = inventoryApi;
