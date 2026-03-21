import { baseApi } from "./baseApi"

interface UploadResponse {
  success: boolean
  url?: string
  error?: string
}

export const uploadApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadFile: builder.mutation<UploadResponse, FormData>({
      query: (formData) => ({
        url: "/upload",
        method: "POST",
        body: formData,
      }),
    }),
  }),
})

export const {
  useUploadFileMutation,
} = uploadApi
