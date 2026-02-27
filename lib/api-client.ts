export class ApiClient {
  private static baseUrl = ''

  static async request(endpoint: string, options: RequestInit = {}, userId?: string, userEmail?: string, useToken: boolean = false) {
    try {
      console.log(`[ApiClient] Making request to: ${endpoint}`, {
        userId: userId || 'not provided',
        userEmail: userEmail || 'not provided',
        useToken
      })

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {})
      }

      if (useToken) {
        // Use JWT token authentication (preferred)
        const token = localStorage.getItem('authToken')
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
          console.log(`[ApiClient] Added JWT token for authentication`)
        } else {
          console.warn(`[ApiClient] No JWT token found for ${endpoint}`)
        }
      } else {
        // Fallback to header-based authentication
        const finalUserId = userId || localStorage.getItem('auth_user_id')
        const finalUserEmail = userEmail || localStorage.getItem('auth_user_email')

        if (finalUserId && finalUserEmail) {
          headers['x-user-id'] = finalUserId
          headers['x-user-email'] = finalUserEmail
          console.log(`[ApiClient] Added auth headers for user: ${finalUserEmail}`)
        } else {
          console.warn(`[ApiClient] No authentication credentials available for ${endpoint}`)
        }
      }

      const response = await fetch(endpoint, {
        ...options,
        headers
      })

      console.log(`[ApiClient] Response status: ${response.status} for ${endpoint}`)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (e) {
          // If response is not JSON, use status text
          console.warn(`[ApiClient] Could not parse error response as JSON`)
        }
        
        console.error(`[ApiClient] Request failed:`, errorMessage)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log(`[ApiClient] Request successful for ${endpoint}`, {
        success: data.success,
        dataLength: Array.isArray(data.data) ? data.data.length : 'not array'
      })
      return data
    } catch (error: any) {
      console.error(`[ApiClient] Request error for ${endpoint}:`, error.message)
      throw error
    }
  }

  static async get(endpoint: string, userId?: string, userEmail?: string, useToken: boolean = false) {
    return this.request(endpoint, { method: 'GET' }, userId, userEmail, useToken)
  }

  static async post(endpoint: string, data: any, userId?: string, userEmail?: string, useToken: boolean = false) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    }, userId, userEmail, useToken)
  }

  static async put(endpoint: string, data: any, userId?: string, userEmail?: string, useToken: boolean = false) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    }, userId, userEmail, useToken)
  }

  static async delete(endpoint: string, userId?: string, userEmail?: string, useToken: boolean = false) {
    return this.request(endpoint, { method: 'DELETE' }, userId, userEmail, useToken)
  }
}