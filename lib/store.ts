import { configureStore } from "@reduxjs/toolkit"
import { baseApi } from "./api/baseApi"

// Import all endpoint slices to ensure they register with baseApi
import "./api/auth"
import "./api/modules"
import "./api/forms"
import "./api/records"
import "./api/permissions"
import "./api/organization"
import "./api/users"
import "./api/lookup"
import "./api/settings"
import "./api/upload"
import "./api/payroll"
import "./api/employees"

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export type AppStore = typeof store
