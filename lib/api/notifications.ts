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
      // Optimistically flip the badge count and the matching rows to read so
      // the UI reflects the change instantly, instead of waiting for the PATCH
      // round-trip and then a tag-invalidation refetch to complete. The server
      // confirms in the background; on failure we roll the patches back.
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const matches = (row: NotificationItem) =>
          !!arg.all || arg.id === row.id || !!arg.ids?.includes(row.id)

        const patches: { undo: () => void }[] = []

        // Badge count.
        patches.push(
          dispatch(
            notificationsApi.util.updateQueryData(
              "getUnreadCount",
              undefined,
              (draft) => {
                if (!draft?.data) return
                if (arg.all) {
                  draft.data.count = 0
                } else {
                  const n = arg.ids?.length ?? (arg.id ? 1 : 0)
                  draft.data.count = Math.max(0, draft.data.count - n)
                }
              }
            )
          )
        )

        // Every cached notification list, regardless of its query args.
        const listEntries = notificationsApi.util.selectInvalidatedBy(
          getState(),
          [{ type: "Notifications" }]
        )
        for (const { endpointName, originalArgs } of listEntries) {
          if (endpointName !== "getNotifications") continue
          patches.push(
            dispatch(
              notificationsApi.util.updateQueryData(
                "getNotifications",
                originalArgs as { limit?: number; unreadOnly?: boolean },
                (draft) => {
                  if (!draft?.data) return
                  for (const row of draft.data) {
                    if (matches(row)) row.isRead = true
                  }
                }
              )
            )
          )
        }

        try {
          await queryFulfilled
        } catch {
          patches.forEach((p) => p.undo())
        }
      },
      invalidatesTags: ["Notifications", "NotificationsUnreadCount"],
    }),
  }),
})

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationsReadMutation,
} = notificationsApi
