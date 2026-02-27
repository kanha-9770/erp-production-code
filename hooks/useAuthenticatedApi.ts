
import { useAuth } from "@/components/context/AuthContext"
import { ApiClient } from "@/lib/api-client"
import { useCallback } from "react"

export function useAuthenticatedApi() {
    const { user, isAuthenticated, loading } = useAuth()

    const makeRequest = useCallback(async (
        method: 'get' | 'post' | 'put' | 'delete',
        endpoint: string,
        data?: any
    ) => {
        if (loading) {
            throw new Error("Authentication still loading")
        }

        if (!isAuthenticated || !user) {
            throw new Error("Authentication required")
        }

        try {
            switch (method) {
                case 'get':
                    return await ApiClient.get(endpoint, user.id, user.email, true)
                case 'post':
                    return await ApiClient.post(endpoint, data, user.id, user.email, true)
                case 'put':
                    return await ApiClient.put(endpoint, data, user.id, user.email, true)
                case 'delete':
                    return await ApiClient.delete(endpoint, user.id, user.email, true)
                default:
                    throw new Error(`Unsupported method: ${method}`)
            }
        } catch (error: any) {
            console.error(`[useAuthenticatedApi] ${method.toUpperCase()} ${endpoint} failed:`, error.message)
            throw error
        }
    }, [user, isAuthenticated, loading])

    const get = useCallback((endpoint: string) => makeRequest('get', endpoint), [makeRequest])
    const post = useCallback((endpoint: string, data?: any) => makeRequest('post', endpoint, data), [makeRequest])
    const put = useCallback((endpoint: string, data?: any) => makeRequest('put', endpoint, data), [makeRequest])
    const del = useCallback((endpoint: string) => makeRequest('delete', endpoint), [makeRequest])

    return {
        get,
        post,
        put,
        delete: del,
        isReady: isAuthenticated && !loading,
        user
    }
}