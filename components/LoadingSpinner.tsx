import { Loader2 } from "lucide-react"

export function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
        <p className="mt-2 text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  )
}