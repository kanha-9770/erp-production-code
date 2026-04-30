import { baseApi } from "./baseApi"

export interface NotificationFieldEntry {
  label: string
  apiName: string
  value: string
}

export interface NotificationData {
  fields?: NotificationFieldEntry[]
}

export interface NotificationItem {
  id: string
  recipientId: string
  organizationId: string
  title: string
  body: string | null
  /** Structured payload — currently `{ fields: [...] }` for System Notifications. */
  data: NotificationData | null
  ruleId: string | null
  ruleName: string | null
  moduleName: string | null
  formId: string | null
  recordId: string | null
  link: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

interface MarkReadBody {
  id?: string
  ids?: string[]
  all?: boolean
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<
      ApiResponse<NotificationItem[]>,
      { limit?: number; unreadOnly?: boolean } | void
    >({
      query: (args) => {
        const params = new URLSearchParams()
        if (args?.limit) params.set("limit", String(args.limit))
        if (args?.unreadOnly) params.set("unreadOnly", "true")
        const qs = params.toString()
        return `/notifications${qs ? `?${qs}` : ""}`
      },
      providesTags: ["Notifications"],
    }),

    getUnreadCount: builder.query<ApiResponse<{ count: number }>, void>({
      query: () => "/notifications/unread-count",
      providesTags: ["NotificationsUnreadCount"],
    }),

    markNotificationsRead: builder.mutation<
      ApiResponse<{ updated: number }>,
      MarkReadBody
    >({
      query: (body) => ({
        url: "/notifications",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Notifications", "NotificationsUnreadCount"],
    }),
  }),
})

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationsReadMutation,
} = notificationsApi
