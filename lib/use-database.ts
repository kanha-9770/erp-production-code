import { FormModule } from "@prisma/client"
import { useState, useEffect } from "react"

export function useModule(id: string) {
  const [module, setModule] = useState<FormModule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModule = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/modules/${id}`)
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch module")
      }

      setModule(result.data || null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      setError(errorMessage)
      console.error("Error fetching module:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) {
      fetchModule()
    }
  }, [id])

  return {
    module,
    loading,
    error,
    refetch: fetchModule,
    setModule,
  }
}