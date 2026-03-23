"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  /** Optional permission check — returns true if the user can CREATE records for the given formId.
   *  When omitted, all form buttons are enabled (backwards-compatible). */
  canCreateForForm?: (formId: string) => boolean
}

const FormsContent: React.FC<FormsContentProps> = ({ forms, setSelectedForm, openFormDialog, canCreateForForm }) => {
  const visible = forms.slice(0, 2)
  const hasMore = forms.length > 2

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [attendanceStatus, setAttendanceStatus] = useState({
    checkedIn: false,
    checkedOut: false,
    canCheckIn: false,
    canCheckOut: false,
  })

  const { data: authData, isLoading: authLoading } = useGetUserQuery()

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
      console.log("[FormsContent] Refreshed Attendance:", status)

      if (status) {
        setAttendanceStatus({
          checkedIn: Boolean(status.checkedIn),
          checkedOut: Boolean(status.checkedOut),
          canCheckIn: Boolean(status.canCheckIn),
          canCheckOut: Boolean(status.canCheckOut),
        })
      }
    } catch (error) {
      console.error("[FormsContent] Attendance fetch failed:", error)
    }
  }

  useEffect(() => {
    if (userId) {
      508
      updateAttendanceStatus()
    }
  }, [userId])

  // FIXED: Listen to attendance updates via CustomEvent
  useEffect(() => {
    if (!userId) return;

    const handler = () => {
      console.log("[FormsContent] Attendance updated – refetching status")
      updateAttendanceStatus()
    }

    window.addEventListener("attendance-updated", handler)

    return () => {
      window.removeEventListener("attendance-updated", handler)
    }
  }, [userId])

  // Optional: Keep backup polling (safe fallback)
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(updateAttendanceStatus, 8000)
    return () => clearInterval(interval)
  }, [userId])

  const getButtonState = (formName: string) => {
    const name = formName.toLowerCase();

    if (name.includes("check") && name.includes("in")) {
      return {
        disabled: !attendanceStatus.canCheckIn,
        title: attendanceStatus.canCheckIn ? undefined : "Already checked in today",
      };
    }

    if (name.includes("check") && name.includes("out")) {
      return {
        disabled: !attendanceStatus.canCheckOut,
        title: attendanceStatus.canCheckOut
          ? undefined
          : attendanceStatus.checkedIn
            ? "Already checked out today"
            : "Please check in first",
      };
    }

    return { disabled: false };
  };

  const handleFormClick = (formId: string) => {
    ; (window as any).__currentUserId = userId
    openFormDialog(formId)
  }

  const FormButton = (f: Form) => {
    const { disabled, title } = getButtonState(f.name)
    const permissionDenied = canCreateForForm ? !canCreateForForm(f.id) : false

    return (
      <Button
        key={f.id}
        variant="outline"
        className="
          w-full justify-start text-left text-blue-600 hover:text-blue-800
          border-blue-600 hover:border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed
          bg-transparent font-medium transition-all
        "
        onClick={(e) => {
          e.stopPropagation()
          handleFormClick(f.id)
        }}
        disabled={disabled || loading || permissionDenied}
        title={permissionDenied ? "You don't have permission to submit this form" : title}
      >
        {f.name}
      </Button>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {forms.length > 0 ? (
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 - (visible.length + (hasMore ? 1 : 0)) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {visible.map((f) => (
            <div key={f.id} onClick={() => setSelectedForm(f)} className="flex justify-center">
              {FormButton(f)}
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                    <Filter className="h-4 w-4" />
                  </Button>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>All Forms</DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-2 pt-2">{forms.map(FormButton)}</div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">No forms available</div>
      )}
    </div>
  )
}

export default FormsContent