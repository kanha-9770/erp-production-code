import { baseApi } from "./baseApi"

export const chatApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query<any[], void>({
      query: () => "/chat/conversations",
      providesTags: ["Conversations"],
    }),

    createConversation: builder.mutation<any, { title: string }>({
      query: (body) => ({
        url: "/chat/conversations",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Conversations"],
    }),

    deleteConversation: builder.mutation<any, string>({
      query: (conversationId) => ({
        url: `/chat/conversations/${conversationId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Conversations"],
    }),
  }),
})

export const {
  useGetConversationsQuery,
  useLazyGetConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
} = chatApi
