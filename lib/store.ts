import { configureStore } from "@reduxjs/toolkit"
import { authApi } from "./api/auth"
import { modulesApi } from "./api/modules"
import { formsApi } from "./api/forms"
import { recordsApi } from "./api/records"

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    [modulesApi.reducerPath]: modulesApi.reducer,
    [formsApi.reducerPath]: formsApi.reducer,
    [recordsApi.reducerPath]: recordsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat([
      authApi.middleware,
      modulesApi.middleware,
      formsApi.middleware,
      recordsApi.middleware,
    ]),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
