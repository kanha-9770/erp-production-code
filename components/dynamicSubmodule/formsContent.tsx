"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Filter } from "lucide-react"
import { getAttendanceStatus } from "@/lib/attendance"
import { useGetUserQuery } from "@/lib/api/auth"

interface Form {
  id: string
  name: string
  description?: string
  moduleId: string
  isPublished: boolean
  updatedAt: string
  sections: any[]
}

interface FormsContentProps {
  forms: Form[]
  selectedForm: Form | null
  setSelectedForm: (form: Form | null) => void
  openFormDialog: (formId: string) => void
  canCreateForForm?: (formId: string) => boolean
}

const FormsContent: React.FC<FormsContentProps> = ({
  forms,
  setSelectedForm,
  openFormDialog,
  canCreateForForm,
}) => {
  const publishedForms = forms.filter((f) => f.isPublished)

  // ✅ Sort newest first
  const sortedForms = [...publishedForms].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() -
      new Date(a.updatedAt).getTime()
  )

  const visible = sortedForms.slice(0, 2)
  const hasMore = sortedForms.length > 2

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [attendanceStatus, setAttendanceStatus] = useState({
    checkedIn: false,
    checkedOut: false,
    canCheckIn: false,
    canCheckOut: false,
  })

  const { data: authData, isLoading: authLoading } =
    useGetUserQuery()

  useEffect(() => {
    if (authLoading) return

    if (authData?.success && authData?.user?.id) {
      setUserId(authData.user.id)
    } else {
      setUserId(null)
    }

    setLoading(false)
  }, [authData, authLoading])

  const updateAttendanceStatus = async () => {
    if (!userId) return

    try {
      const status = await getAttendanceStatus(userId)

      if (status) {
        setAttendanceStatus({
          checkedIn: Boolean(status.checkedIn),
          checkedOut: Boolean(status.checkedOut),
          canCheckIn: Boolean(status.canCheckIn),
          canCheckOut: Boolean(status.canCheckOut),
        })
      }
    } catch (error) {
      console.error("Attendance fetch failed:", error)
    }
  }

  useEffect(() => {
    if (userId) updateAttendanceStatus()
  }, [userId])

  useEffect(() => {
    if (!userId) return

    const handler = () => updateAttendanceStatus()

    window.addEventListener("attendance-updated", handler)

    return () => {
      window.removeEventListener("attendance-updated", handler)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    const interval = setInterval(updateAttendanceStatus, 8000)
    return () => clearInterval(interval)
  }, [userId])

  const getButtonState = (formName: string) => {
    const name = formName.toLowerCase()

    if (name.includes("check") && name.includes("in")) {
      return {
        disabled: !attendanceStatus.canCheckIn,
        title: attendanceStatus.canCheckIn
          ? undefined
          : "Already checked in today",
      }
    }

    if (name.includes("check") && name.includes("out")) {
      return {
        disabled: !attendanceStatus.canCheckOut,
        title: attendanceStatus.canCheckOut
          ? undefined
          : attendanceStatus.checkedIn
          ? "Already checked out today"
          : "Please check in first",
      }
    }

    return { disabled: false }
  }

  const handleFormClick = (form: Form) => {
    if (!form.isPublished) return

    ;(window as any).__currentUserId = userId
    openFormDialog(form.id)
  }

  const FormButton = (f: Form) => {
    const { disabled, title } = getButtonState(f.name)

    const permissionDenied = canCreateForForm
      ? !canCreateForForm(f.id)
      : false

    return (
      <Button
        key={f.id}
        variant="outline"
        className="
          w-full justify-start text-left text-blue-600 hover:text-blue-800
          border-blue-600 hover:border-blue-800
          disabled:opacity-50 disabled:cursor-not-allowed
          bg-transparent font-medium transition-all h-8 px-3
          overflow-hidden
        "
        onClick={(e) => {
          e.stopPropagation()
          handleFormClick(f)
        }}
        disabled={disabled || loading || permissionDenied}
        title={
          permissionDenied
            ? "You don't have permission"
            : title
        }
      >
        <span className="block w-full truncate text-sm">
          {f.name}
        </span>
      </Button>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-11 bg-gray-200 rounded animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      {sortedForms.length > 0 ? (
        <div
          className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          style={{ direction: "rtl" }} // ✅ RTL grid
        >
          {/* ✅ FILTER FIRST → goes LAST visually */}
          {hasMore && (
            <div
              className="flex justify-center"
              style={{ direction: "ltr" }}
            >
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 rounded-full border border-gray-300 hover:bg-gray-100"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md max-h-[85vh]">
                  <DialogHeader>
                    <DialogTitle>
                      All Published Forms Available
                    </DialogTitle>
                  </DialogHeader>

                  <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-3 pt-2">
                      {sortedForms.map((f) => (
                        <div key={f.id}>
                          {FormButton(f)}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* ✅ FORMS */}
          {visible.map((f) => (
            <div
              key={f.id}
              onClick={() => setSelectedForm(f)}
              className="flex justify-center"
              style={{ direction: "ltr" }}
            >
              {FormButton(f)}
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({
            length: 6 - (visible.length + (hasMore ? 1 : 0)),
          }).map((_, i) => (
            <div key={i} className="hidden lg:block" />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">
          No published forms available
        </div>
      )}
    </div>
  )
}

export default FormsContent