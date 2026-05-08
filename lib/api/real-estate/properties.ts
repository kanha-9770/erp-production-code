import { baseApi } from "../baseApi";
import type {
  PaginatedResponse,
  Property,
  PropertyDetail,
  PropertyImage,
  PropertyDocument,
  SingleResponse,
} from "./types";

export interface PropertyListParams {
  status?: string;
  type?: string;
  subType?: string;
  city?: string;
  search?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  listingAgentId?: string;
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

export const propertiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProperties: builder.query<PaginatedResponse<Property>, PropertyListParams | void>({
      query: (params) => `/real-estate/properties${toQuery(params ?? {})}`,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((p) => ({ type: "Property" as const, id: p.id })),
              { type: "Properties" as const, id: "LIST" },
            ]
          : [{ type: "Properties" as const, id: "LIST" }],
    }),

    getProperty: builder.query<SingleResponse<PropertyDetail>, string>({
      query: (id) => `/real-estate/properties/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Property", id }],
    }),

    createProperty: builder.mutation<SingleResponse<Property>, Partial<Property>>({
      query: (body) => ({
        url: "/real-estate/properties",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Properties", id: "LIST" }],
    }),

    updateProperty: builder.mutation<
      SingleResponse<Property>,
      { id: string; body: Partial<Property> & { priceChangeReason?: string } }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/properties/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Property", id },
        { type: "Properties", id: "LIST" },
      ],
    }),

    deleteProperty: builder.mutation<{ success: boolean; deleted?: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/properties/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Property", id },
        { type: "Properties", id: "LIST" },
      ],
    }),

    addPropertyImage: builder.mutation<
      SingleResponse<PropertyImage>,
      { id: string; url: string; caption?: string; isPrimary?: boolean; sortOrder?: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/real-estate/properties/${id}/images`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Property", id },
        { type: "Properties", id: "LIST" },
      ],
    }),

    removePropertyImage: builder.mutation<{ success: boolean }, { id: string; imageId: string }>(
      {
        query: ({ id, imageId }) => ({
          url: `/real-estate/properties/${id}/images?imageId=${imageId}`,
          method: "DELETE",
        }),
        invalidatesTags: (_r, _e, { id }) => [
          { type: "Property", id },
          { type: "Properties", id: "LIST" },
        ],
      },
    ),

    addPropertyDocument: builder.mutation<
      SingleResponse<PropertyDocument>,
      { id: string; type: string; name: string; url: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/real-estate/properties/${id}/documents`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Property", id }],
    }),

    removePropertyDocument: builder.mutation<
      { success: boolean },
      { id: string; documentId: string }
    >({
      query: ({ id, documentId }) => ({
        url: `/real-estate/properties/${id}/documents?documentId=${documentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Property", id }],
    }),
  }),
});

export const {
  useGetPropertiesQuery,
  useGetPropertyQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
  useAddPropertyImageMutation,
  useRemovePropertyImageMutation,
  useAddPropertyDocumentMutation,
  useRemovePropertyDocumentMutation,
} = propertiesApi;
