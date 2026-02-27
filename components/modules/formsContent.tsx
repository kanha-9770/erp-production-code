// "use client"

// import type React from "react"
// import { useEffect, useState } from "react"
// import { Button } from "@/components/ui/button"
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
// import { ScrollArea } from "@/components/ui/scroll-area"
// import { Filter } from "lucide-react"
// import { getAttendanceStatus, canCheckOut } from "@/lib/attendance"

// interface Form {
//   id: string
//   name: string
//   description?: string
//   moduleId: string
//   isPublished: boolean
//   updatedAt: string
//   sections: any[]
// }

// interface FormsContentProps {
//   forms: Form[]
//   selectedForm: Form | null
//   setSelectedForm: (form: Form | null) => void
//   openFormDialog: (formId: string) => void
//   handlePublishForm?: (form: Form) => void
// }

// const FormsContent: React.FC<FormsContentProps> = ({ forms, setSelectedForm, openFormDialog }) => {
//   const visible = forms.slice(0, 2)
//   const hasMore = forms.length > 2

//   const [userId, setUserId] = useState<string | null>(null)
//   const [loading, setLoading] = useState(true)

//   const [attendanceStatus, setAttendanceStatus] = useState({
//     checkedIn: false,
//     checkedOut: false,
//     canCheckIn: true,
//     canCheckOut: false,
//   })

//   useEffect(() => {
//     const fetchUser = async () => {
//       try {
//         setLoading(true)
//         const response = await fetch("/api/auth/me")
//         const data = await response.json()

//         if (data.success && data.user?.id) {
//           console.log("[v0] User authenticated:", data.user.id)
//           setUserId(data.user.id)
//         } else {
//           console.log("[v0] User not authenticated")
//           setUserId(null)
//         }
//       } catch (error) {
//         console.error("[v0] Failed to fetch user:", error)
//         setUserId(null)
//       } finally {
//         setLoading(false)
//       }
//     }

//     fetchUser()
//   }, [])

//   useEffect(() => {
//     if (userId) {
//       updateAttendanceStatus()
//     }
//   }, [userId])

//   const updateAttendanceStatus = async () => {
//     if (!userId) return
//     const status = await getAttendanceStatus(userId)
//     if (status) {
//       setAttendanceStatus(status)
//     }
//   }

//   const getButtonState = (formName: string): { disabled: boolean; title?: string } => {
//     const lowerName = formName.toLowerCase()

//     if (lowerName === "check-in") {
//       return {
//         disabled: !attendanceStatus.canCheckIn,
//         title: attendanceStatus.checkedIn ? "Already checked in today" : undefined,
//       }
//     }

//     if (lowerName === "check-out") {
//       return {
//         disabled: !attendanceStatus.canCheckOut,
//         title: !attendanceStatus.checkedIn ? "Please complete Check-In first!" : "Already checked out today",
//       }
//     }

//     return { disabled: false }
//   }

//   const handleFormClick = async (formId: string, formName: string) => {
//     const lowerName = formName.toLowerCase()

//     if (lowerName === "check-out") {
//       if (!userId) {
//         alert("User not authenticated")
//         return
//       }

//       const canOut = await canCheckOut(userId)
//       if (!canOut) {
//         const status = await getAttendanceStatus(userId)
//         const message = !status?.checkedIn ? "Please complete Check-In first!" : "Already checked out today!"
//         alert(message)
//         return
//       }
//     }
//     ; (window as any).__currentUserId = userId
//     openFormDialog(formId)
//   }

//   const handleFormSubmitted = async (formName: string) => {
//     console.log("[v0] Form submitted:", formName)
//     if (formName.toLowerCase() === "check-in" || formName.toLowerCase() === "check-out") {
//       // Update state after attendance form submission
//       setTimeout(() => {
//         updateAttendanceStatus()
//       }, 500)
//     }
//   }

//   useEffect(() => {
//     ; (window as any).__handleFormSubmitted = handleFormSubmitted
//   }, [])

//   const FormButton = (f: Form) => {
//     const buttonState = getButtonState(f.name)

//     return (
//       <Button
//         key={f.id}
//         variant="outline"
//         className="w-full justify-start text-left text-blue-600 hover:text-blue-800 border-blue-600 hover:border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed bg-transparent"
//         onClick={(e) => {
//           e.stopPropagation()
//           handleFormClick(f.id, f.name)
//         }}
//         disabled={buttonState.disabled || loading}
//         title={buttonState.title}
//       >
//         {f.name}
//       </Button>
//     )
//   }

//   if (loading) {
//     return (
//       <div className="border-gray-300">
//         <div className="grid grid-cols-4 gap-2">
//           {Array.from({ length: 4 }).map((_, i) => (
//             <div key={`skeleton-${i}`} className="col-span-1 h-10 bg-gray-200 rounded animate-pulse" />
//           ))}
//         </div>
//       </div>
//     )
//   }

//   return (
//     <div className="border-gray-300">
//       {forms.length ? (
//         <div className="grid grid-cols-4 gap-2">
//           {/* EMPTY CELLS */}
//           {Array.from({ length: 4 - (visible.length + (hasMore ? 1 : 0)) }).map((_, i) => (
//             <div key={`empty-left-${i}`} className="col-span-1" />
//           ))}

//           {/* TWO VISIBLE BUTTONS */}
//           {visible.map((f) => (
//             <div key={f.id} onClick={() => setSelectedForm(f)} className="flex items-center">
//               {FormButton(f)}
//             </div>
//           ))}

//           {/* FUNNEL ICON */}
//           {hasMore && (
//             <div className="flex items-center justify-center">
//               <Dialog>
//                 <DialogTrigger asChild>
//                   <Button
//                     variant="ghost"
//                     size="icon"
//                     className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground"
//                     onClick={(e) => e.stopPropagation()}
//                   >
//                     <Filter className="h-4 w-4" />
//                     <span className="sr-only">Open all forms</span>
//                   </Button>
//                 </DialogTrigger>

//                 <DialogContent className="sm:max-w-md">
//                   <DialogHeader>
//                     <DialogTitle className="flex items-center gap-2">
//                       <Filter className="h-5 w-5" />
//                       All Forms ({forms.length})
//                     </DialogTitle>
//                   </DialogHeader>

//                   <ScrollArea className="max-h-[60vh] pr-4">
//                     <div className="space-y-2 py-2">{forms.map(FormButton)}</div>
//                   </ScrollArea>
//                 </DialogContent>
//               </Dialog>
//             </div>
//           )}
//         </div>
//       ) : (
//         <div className="text-center py-4 text-gray-500">No forms in this module</div>
//       )}
//     </div>
//   )
// }

// export default FormsContent

"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Filter } from "lucide-react"
import { getAttendanceStatus } from "@/lib/attendance"

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
  handlePublishForm?: (form: Form) => void
}

const FormsContent: React.FC<FormsContentProps> = ({ forms, setSelectedForm, openFormDialog }) => {
  const visible = forms.slice(0, 2)
  const hasMore = forms.length > 2

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [attendanceStatus, setAttendanceStatus] = useState({
    checkedIn: false,
    checkedOut: false,
    canCheckIn: true,
    canCheckOut: false,
  })

  // Fetch current user
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/auth/me")
        const data = await response.json()

        if (data.success && data.user?.id) {
          console.log("[FormsContent] User authenticated:", data.user.id)
          setUserId(data.user.id)
        } else {
          console.log("[FormsContent] User not authenticated")
          setUserId(null)
        }
      } catch (error) {
        console.error("[FormsContent] Failed to fetch user:", error)
        setUserId(null)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  // Update attendance status
  const updateAttendanceStatus = async () => {
    if (!userId) return

    const status = await getAttendanceStatus(userId)
    if (status) {
      setAttendanceStatus({
        checkedIn: status.checkedIn || false,
        checkedOut: status.checkedOut || false,
        canCheckIn: !status.checkedIn,
        canCheckOut: status.checkedIn && !status.checkedOut,
      })
    }
  }

  // Initial load
  useEffect(() => {
    if (userId) {
      updateAttendanceStatus()
    }
  }, [userId])

  // CRITICAL: Listen for global attendance updates from PublicFormDialog
  useEffect(() => {
    (window as any).__handleAttendanceUpdate = () => {
      console.log("[FormsContent] Attendance update received → refreshing buttons")
      updateAttendanceStatus()
    }

    return () => {
      delete (window as any).__handleAttendanceUpdate
    }
  }, [userId])

  // Optional: Refresh records table after form submission
  useEffect(() => {
    (window as any).__handleRecordsRefresh = () => {
      console.log("[FormsContent] Records refresh triggered")
    }

    return () => {
      delete (window as any).__handleRecordsRefresh
    }
  }, [])

  // Button state logic
  const getButtonState = (formName: string): { disabled: boolean; title?: string } => {
    const lowerName = formName.toLowerCase().trim()

    if (lowerName.includes("check-in") || lowerName === "checkin") {
      return {
        disabled: !attendanceStatus.canCheckIn,
        title: attendanceStatus.checkedIn ? "Already checked in today" : undefined,
      }
    }

    if (lowerName.includes("check-out") || lowerName === "checkout") {
      return {
        disabled: !attendanceStatus.canCheckOut,
        title: !attendanceStatus.checkedIn
          ? "Please complete Check-In first!"
          : attendanceStatus.checkedOut
            ? "Already checked out today"
            : undefined,
      }
    }

    return { disabled: false }
  }

  const handleFormClick = async (formId: string, formName: string) => {
    (window as any).__currentUserId = userId
    openFormDialog(formId)
  }

  const FormButton = (f: Form) => {
    const buttonState = getButtonState(f.name)

    return (
      <Button
        key={f.id}
        variant="outline"
        className={`
          w-full justify-start text-left text-blue-600 hover:text-blue-800 
          border-blue-600 hover:border-blue-800 disabled:opacity-50 disabled:cursor-not-allowed
          bg-transparent font-medium transition-all
          ${buttonState.disabled ? "opacity-60" : ""}
        `}
        onClick={(e) => {
          e.stopPropagation()
          handleFormClick(f.id, f.name)
        }}
        disabled={buttonState.disabled || loading}
        title={buttonState.title}
      >
        {f.name}
      </Button>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="col-span-1 h-10 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {forms.length ? (
        <div className="grid grid-cols-6 gap-2">
          {/* Push content to the right */}
          {Array.from({ length: 6 - (visible.length + (hasMore ? 1 : 0)) }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Visible forms */}
          {visible.map((f) => (
            <div key={f.id} onClick={() => setSelectedForm(f)} className="flex items-center justify-center">
              {FormButton(f)}
            </div>
          ))}

          {/* Filter button */}
          {hasMore && (
            <div className="flex items-center justify-center">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Filter className="h-4 w-4" />
                    <span className="sr-only">Open all forms</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Filter className="h-5 w-5" />
                      All Forms ({forms.length})
                    </DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-2 py-2">{forms.map(FormButton)}</div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">No forms in this module</div>
      )}
    </div>
  )
}

export default FormsContent