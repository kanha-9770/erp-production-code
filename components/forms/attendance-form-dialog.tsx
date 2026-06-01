// "use client"

// import React, { useState, useEffect } from "react"
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
// import { Button } from "@/components/ui/button"
// import { Card, CardContent } from "@/components/ui/card"
// import { useToast } from "@/hooks/use-toast"
// import { Clock, MapPin, Smartphone, CheckCircle2, XCircle, Loader2, CalendarDays } from 'lucide-react'
// import { cn } from "@/lib/utils"

// interface AttendanceFormDialogProps {
//   formId: string | null
//   isOpen: boolean
//   onClose: () => void
//   employeeId: string // This should come from auth context
//   employeeName?: string
// }

// interface AttendanceStatus {
//   hasCheckedInToday: boolean
//   hasCheckedOutToday: boolean
//   todayCheckIn?: string
//   todayCheckOut?: string
//   workingHours?: number
//   location?: string
//   deviceInfo?: string
// }

// export function AttendanceFormDialog({
//   formId,
//   isOpen,
//   onClose,
//   employeeId,
//   employeeName = "Employee",
// }: AttendanceFormDialogProps) {
//   const { toast } = useToast()
//   const [loading, setLoading] = useState(false)
//   const [actionInProgress, setActionInProgress] = useState(false)
//   const [buttonDisabled, setButtonDisabled] = useState(false)
//   const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({
//     hasCheckedInToday: false,
//     hasCheckedOutToday: false,
//   })

//   // Get current location
//   const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
//     return new Promise((resolve, reject) => {
//       if (!navigator.geolocation) {
//         reject(new Error("Geolocation is not supported"))
//         return
//       }

//       navigator.geolocation.getCurrentPosition(
//         (position) => {
//           resolve({
//             latitude: position.coords.latitude,
//             longitude: position.coords.longitude,
//           })
//         },
//         (error) => {
//           reject(error)
//         },
//         { timeout: 10000, enableHighAccuracy: true }
//       )
//     })
//   }

//   // Get device info
//   const getDeviceInfo = () => {
//     return {
//       userAgent: navigator.userAgent,
//       platform: navigator.platform,
//       language: navigator.language,
//       screenResolution: `${window.screen.width}x${window.screen.height}`,
//     }
//   }

//   // Fetch today's attendance status
//   const fetchTodayAttendance = async () => {
//     if (!formId || !employeeId) return

//     try {
//       setLoading(true)
//       const today = new Date().toISOString().split("T")[0]
      
//       const response = await fetch(
//         `/api/forms/${formId}/attendance/status?employeeId=${employeeId}&date=${today}`
//       )
      
//       if (!response.ok) {
//         throw new Error("Failed to fetch attendance status")
//       }

//       const data = await response.json()
      
//       if (data.success) {
//         setAttendanceStatus({
//           hasCheckedInToday: data.hasCheckedIn,
//           hasCheckedOutToday: data.hasCheckedOut,
//           todayCheckIn: data.checkInTime,
//           todayCheckOut: data.checkOutTime,
//           workingHours: data.workingHours,
//           location: data.location,
//           deviceInfo: data.deviceInfo,
//         })
//       }
//     } catch (error) {
//       console.error("Error fetching attendance status:", error)
//       toast({
//         title: "Error",
//         description: "Failed to load attendance status",
//         variant: "destructive",
//       })
//     } finally {
//       setLoading(false)
//     }
//   }

//   // Handle Check-In
//   const handleCheckIn = async () => {
//     if (!formId || !employeeId) return

//     // RULE 1: Prevent check-in if already checked in today
//     if (attendanceStatus.hasCheckedInToday) {
//       toast({
//         title: "Already Checked In",
//         description: "You have already checked in today",
//         variant: "destructive",
//       })
//       return
//     }

//     try {
//       setActionInProgress(true)
//       setButtonDisabled(true)

//       // Get location and device info
//       let location = "Location unavailable"
//       try {
//         const coords = await getCurrentLocation()
//         location = `${coords.latitude}, ${coords.longitude}`
//       } catch (error) {
//         console.warn("Location access denied or unavailable:", error)
//       }

//       const deviceInfo = JSON.stringify(getDeviceInfo())
//       const checkInTime = new Date().toISOString()
//       const today = new Date().toISOString().split("T")[0]

//       // Store check-in record
//       const response = await fetch(`/api/forms/${formId}/attendance/checkin`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           employeeId,
//           employeeName,
//           checkInTime,
//           date: today,
//           location,
//           deviceInfo,
//         }),
//       })

//       if (!response.ok) {
//         const errorData = await response.json()
//         throw new Error(errorData.error || "Failed to check in")
//       }

//       const result = await response.json()

//       if (result.success) {
//         toast({
//           title: "✓ Check-In Successful",
//           description: `Checked in at ${new Date(checkInTime).toLocaleTimeString()}`,
//         })

//         // Refresh status
//         await fetchTodayAttendance()
//       } else {
//         throw new Error(result.error || "Failed to check in")
//       }
//     } catch (error: any) {
//       console.error("Check-in error:", error)
//       toast({
//         title: "Check-In Failed",
//         description: error.message || "Failed to record check-in",
//         variant: "destructive",
//       })
//     } finally {
//       setActionInProgress(false)
      
//       // Disable button for 5 seconds to prevent double-tapping
//       setTimeout(() => {
//         setButtonDisabled(false)
//       }, 5000)
//     }
//   }

//   // Handle Check-Out
//   const handleCheckOut = async () => {
//     if (!formId || !employeeId) return

//     // RULE 2: Prevent check-out without check-in
//     if (!attendanceStatus.hasCheckedInToday) {
//       toast({
//         title: "Cannot Check Out",
//         description: "You must check in before checking out",
//         variant: "destructive",
//       })
//       return
//     }

//     // RULE 2: Prevent multiple check-outs
//     if (attendanceStatus.hasCheckedOutToday) {
//       toast({
//         title: "Already Checked Out",
//         description: "You have already checked out today",
//         variant: "destructive",
//       })
//       return
//     }

//     try {
//       setActionInProgress(true)
//       setButtonDisabled(true)

//       // Get location and device info
//       let location = "Location unavailable"
//       try {
//         const coords = await getCurrentLocation()
//         location = `${coords.latitude}, ${coords.longitude}`
//       } catch (error) {
//         console.warn("Location access denied or unavailable:", error)
//       }

//       const deviceInfo = JSON.stringify(getDeviceInfo())
//       const checkOutTime = new Date().toISOString()
//       const today = new Date().toISOString().split("T")[0]

//       // Calculate working hours (RULE 3)
//       const checkInTime = new Date(attendanceStatus.todayCheckIn!)
//       const checkOut = new Date(checkOutTime)
//       const workingHoursCalculated = (checkOut.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

//       // Store check-out record
//       const response = await fetch(`/api/forms/${formId}/attendance/checkout`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           employeeId,
//           checkOutTime,
//           date: today,
//           location,
//           deviceInfo,
//           workingHours: workingHoursCalculated,
//         }),
//       })

//       if (!response.ok) {
//         const errorData = await response.json()
//         throw new Error(errorData.error || "Failed to check out")
//       }

//       const result = await response.json()

//       if (result.success) {
//         toast({
//           title: "✓ Check-Out Successful",
//           description: `Checked out at ${new Date(checkOutTime).toLocaleTimeString()}. Working hours: ${workingHoursCalculated.toFixed(2)}h`,
//         })

//         // Refresh status
//         await fetchTodayAttendance()
//       } else {
//         throw new Error(result.error || "Failed to check out")
//       }
//     } catch (error: any) {
//       console.error("Check-out error:", error)
//       toast({
//         title: "Check-Out Failed",
//         description: error.message || "Failed to record check-out",
//         variant: "destructive",
//       })
//     } finally {
//       setActionInProgress(false)
      
//       // Disable button for 5 seconds to prevent double-tapping
//       setTimeout(() => {
//         setButtonDisabled(false)
//       }, 5000)
//     }
//   }

//   // Load attendance status on mount and when dialog opens
//   useEffect(() => {
//     if (isOpen && formId) {
//       fetchTodayAttendance()
//     }
//   }, [isOpen, formId, employeeId])

//   const formatTime = (isoString?: string) => {
//     if (!isoString) return "—"
//     return new Date(isoString).toLocaleTimeString("en-US", {
//       hour: "2-digit",
//       minute: "2-digit",
//       hour12: true,
//     })
//   }

//   const formatWorkingHours = (hours?: number) => {
//     if (!hours) return "—"
//     const h = Math.floor(hours)
//     const m = Math.round((hours - h) * 60)
//     return `${h}h ${m}m`
//   }

//   return (
//     <Dialog open={isOpen} onOpenChange={onClose}>
//       <DialogContent className="sm:max-w-[500px]">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             <Clock className="h-5 w-5 text-blue-600" />
//             Attendance System
//           </DialogTitle>
//           <DialogDescription>
//             Track your daily check-in and check-out times
//           </DialogDescription>
//         </DialogHeader>

//         {loading ? (
//           <div className="flex items-center justify-center py-8">
//             <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
//           </div>
//         ) : (
//           <div className="space-y-4">
//             {/* Today's Status Card */}
//             <Card className="border-2">
//               <CardContent className="pt-6">
//                 <div className="flex items-center justify-between mb-4">
//                   <div className="flex items-center gap-2">
//                     <CalendarDays className="h-5 w-5 text-gray-600" />
//                     <h3 className="font-semibold text-lg">Today's Status</h3>
//                   </div>
//                   <span className="text-sm text-muted-foreground">
//                     {new Date().toLocaleDateString("en-US", {
//                       weekday: "short",
//                       month: "short",
//                       day: "numeric",
//                     })}
//                   </span>
//                 </div>

//                 <div className="grid grid-cols-2 gap-4">
//                   {/* Check-In Status */}
//                   <div className="space-y-1">
//                     <div className="flex items-center gap-2">
//                       {attendanceStatus.hasCheckedInToday ? (
//                         <CheckCircle2 className="h-4 w-4 text-green-600" />
//                       ) : (
//                         <XCircle className="h-4 w-4 text-gray-400" />
//                       )}
//                       <span className="text-sm font-medium">Check-In</span>
//                     </div>
//                     <p className="text-2xl font-bold text-green-600">
//                       {formatTime(attendanceStatus.todayCheckIn)}
//                     </p>
//                   </div>

//                   {/* Check-Out Status */}
//                   <div className="space-y-1">
//                     <div className="flex items-center gap-2">
//                       {attendanceStatus.hasCheckedOutToday ? (
//                         <CheckCircle2 className="h-4 w-4 text-blue-600" />
//                       ) : (
//                         <XCircle className="h-4 w-4 text-gray-400" />
//                       )}
//                       <span className="text-sm font-medium">Check-Out</span>
//                     </div>
//                     <p className="text-2xl font-bold text-blue-600">
//                       {formatTime(attendanceStatus.todayCheckOut)}
//                     </p>
//                   </div>
//                 </div>

//                 {/* Working Hours */}
//                 {attendanceStatus.workingHours !== undefined && (
//                   <div className="mt-4 pt-4 border-t">
//                     <div className="flex items-center justify-between">
//                       <span className="text-sm text-muted-foreground">Working Hours</span>
//                       <span className="text-lg font-bold text-purple-600">
//                         {formatWorkingHours(attendanceStatus.workingHours)}
//                       </span>
//                     </div>
//                   </div>
//                 )}

//                 {/* Location Info */}
//                 {attendanceStatus.location && (
//                   <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
//                     <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
//                     <span className="truncate">{attendanceStatus.location}</span>
//                   </div>
//                 )}
//               </CardContent>
//             </Card>

//             {/* Action Buttons */}
//             <div className="grid grid-cols-2 gap-3">
//               {/* Check-In Button */}
//               <Button
//                 onClick={handleCheckIn}
//                 disabled={
//                   buttonDisabled ||
//                   actionInProgress ||
//                   attendanceStatus.hasCheckedInToday
//                 }
//                 className={cn(
//                   "h-16 text-base font-semibold",
//                   !attendanceStatus.hasCheckedInToday &&
//                     "bg-green-600 hover:bg-green-700 text-white"
//                 )}
//                 variant={
//                   attendanceStatus.hasCheckedInToday ? "secondary" : "default"
//                 }
//               >
//                 {actionInProgress && !attendanceStatus.hasCheckedInToday ? (
//                   <>
//                     <Loader2 className="h-5 w-5 mr-2 animate-spin" />
//                     Processing...
//                   </>
//                 ) : attendanceStatus.hasCheckedInToday ? (
//                   <>
//                     <CheckCircle2 className="h-5 w-5 mr-2" />
//                     Checked In
//                   </>
//                 ) : (
//                   <>
//                     <Clock className="h-5 w-5 mr-2" />
//                     Check In
//                   </>
//                 )}
//               </Button>

//               {/* Check-Out Button */}
//               <Button
//                 onClick={handleCheckOut}
//                 disabled={
//                   buttonDisabled ||
//                   actionInProgress ||
//                   !attendanceStatus.hasCheckedInToday ||
//                   attendanceStatus.hasCheckedOutToday
//                 }
//                 className={cn(
//                   "h-16 text-base font-semibold",
//                   attendanceStatus.hasCheckedInToday &&
//                     !attendanceStatus.hasCheckedOutToday &&
//                     "bg-blue-600 hover:bg-blue-700 text-white"
//                 )}
//                 variant={
//                   attendanceStatus.hasCheckedInToday &&
//                   !attendanceStatus.hasCheckedOutToday
//                     ? "default"
//                     : "secondary"
//                 }
//               >
//                 {actionInProgress && attendanceStatus.hasCheckedInToday ? (
//                   <>
//                     <Loader2 className="h-5 w-5 mr-2 animate-spin" />
//                     Processing...
//                   </>
//                 ) : attendanceStatus.hasCheckedOutToday ? (
//                   <>
//                     <CheckCircle2 className="h-5 w-5 mr-2" />
//                     Checked Out
//                   </>
//                 ) : (
//                   <>
//                     <Clock className="h-5 w-5 mr-2" />
//                     Check Out
//                   </>
//                 )}
//               </Button>
//             </div>

//             {/* Info Messages */}
//             <div className="space-y-2 text-xs text-muted-foreground bg-gray-50 p-3 rounded-md">
//               <div className="flex items-start gap-2">
//                 <Smartphone className="h-3 w-3 mt-0.5 flex-shrink-0" />
//                 <p>Location and device information will be recorded for security purposes.</p>
//               </div>
//               {buttonDisabled && (
//                 <div className="flex items-start gap-2 text-amber-600">
//                   <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
//                   <p>Button disabled for 5 seconds to prevent accidental double-tapping.</p>
//                 </div>
//               )}
//             </div>
//           </div>
//         )}
//       </DialogContent>
//     </Dialog>
//   )
// }


"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Clock, MapPin, Smartphone, CheckCircle2, XCircle, Loader2, CalendarDays } from 'lucide-react'
import { cn } from "@/lib/utils"
import { useSubmitAttendanceCheckinMutation, useSubmitAttendanceCheckoutMutation, useLazyGetAttendanceStatusQuery } from "@/lib/api/forms"

interface AttendanceFormDialogProps {
  formId: string | null
  isOpen: boolean
  onClose: () => void
  employeeId: string
  employeeName?: string
}

interface AttendanceStatus {
  hasCheckedInToday: boolean
  hasCheckedOutToday: boolean
  todayCheckIn?: string
  todayCheckOut?: string
  workingHours?: number
  location?: string
  deviceInfo?: string
}

export function AttendanceFormDialog({
  formId,
  isOpen,
  onClose,
  employeeId,
  employeeName = "Employee",
}: AttendanceFormDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [buttonDisabled, setButtonDisabled] = useState(false)
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>({
    hasCheckedInToday: false,
    hasCheckedOutToday: false,
  })

  const [submitCheckin] = useSubmitAttendanceCheckinMutation()
  const [submitCheckout] = useSubmitAttendanceCheckoutMutation()
  const [triggerGetAttendanceStatus] = useLazyGetAttendanceStatusQuery()

  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    if (!navigator.geolocation) {
      return Promise.reject(new Error("Geolocation is not supported"))
    }

    // Helper: single getCurrentPosition call wrapped as a promise.
    const tryOnce = (opts: PositionOptions) =>
      new Promise<{ latitude: number; longitude: number; accuracy: number }>(
        (resolve, reject) => {
          let settled = false
          // Belt-and-suspenders timeout — some browsers ignore the
          // PositionOptions timeout and hang indefinitely.
          const hard = setTimeout(() => {
            if (settled) return
            settled = true
            const e: any = new Error("Location request timed out")
            e.code = 3
            reject(e)
          }, (opts.timeout ?? 8000) + 500)

          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (settled) return
              settled = true
              clearTimeout(hard)
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
              })
            },
            (error) => {
              if (settled) return
              settled = true
              clearTimeout(hard)
              reject(error)
            },
            opts,
          )
        },
      )

    // Stage 1: GPS-grade fix. maximumAge: 0 forces a fresh reading instead
    // of returning a cached position (common cause of "wrong location"
    // reports from users who moved recently).
    return tryOnce({ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 })
      .catch((err) => {
        // Permission/insecure-origin failures won't be cured by retrying.
        if (err?.code === 1) throw err
        // Stage 2: coarse fallback. enableHighAccuracy: false uses cell-
        // tower / Wi-Fi positioning, which works indoors and through walls
        // where GPS cannot get a fix. Worse accuracy but a reading beats
        // no reading at all.
        return tryOnce({
          enableHighAccuracy: false,
          maximumAge: 0,
          timeout: 12000,
        })
      })
  }

  // Anything worse than this means the device is using cell-tower / Wi-Fi
  // triangulation, not real GPS. We surface a console warning so anyone
  // diagnosing a wrong-location report can correlate with the accuracy.
  const LOW_ACCURACY_WARN_M = 200

  const getDeviceInfo = () => {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
    }
  }

  const fetchTodayAttendance = async () => {
    if (!formId || !employeeId) return

    try {
      setLoading(true)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const data = await triggerGetAttendanceStatus({ formId, employeeId, date: today }).unwrap()

      if (data.success) {
        setAttendanceStatus({
          hasCheckedInToday: data.hasCheckedIn ?? data.data?.hasCheckedIn,
          hasCheckedOutToday: data.hasCheckedOut ?? data.data?.hasCheckedOut,
          todayCheckIn: data.checkInTime ?? data.data?.checkInTime,
          todayCheckOut: data.checkOutTime ?? data.data?.checkOutTime,
          workingHours: data.workingHours ?? data.data?.workingHours,
          location: data.location ?? data.data?.location,
          deviceInfo: data.deviceInfo ?? data.data?.deviceInfo,
        })
      }
    } catch (error) {
      console.error("Error fetching attendance status:", error)
      toast({
        title: "Error",
        description: "Failed to load attendance status",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = async () => {
    if (!formId || !employeeId) return

    if (attendanceStatus.hasCheckedInToday) {
      toast({
        title: "Already Checked In",
        description: "You have already checked in today",
        variant: "destructive",
      })
      return
    }

    try {
      setActionInProgress(true)
      setButtonDisabled(true)

      let location = "Location unavailable"
      try {
        const coords = await getCurrentLocation()
        location = `${coords.latitude}, ${coords.longitude}`
        if (coords.accuracy > LOW_ACCURACY_WARN_M) {
          console.warn(
            `Check-in location captured with low accuracy (±${Math.round(coords.accuracy)}m) — device likely using Wi-Fi/cell-tower positioning, not GPS`,
          )
          toast({
            title: "Location is approximate",
            description: `Captured ±${Math.round(coords.accuracy)}m. For an exact fix, enable GPS or move outdoors.`,
          })
        }
      } catch (error) {
        console.warn("Location access denied or unavailable:", error)
      }

      const deviceInfo = JSON.stringify(getDeviceInfo())
      const checkInTime = new Date().toISOString()
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const result = await submitCheckin({
        formId,
        body: {
          employeeId,
          employeeName,
          checkInTime,
          date: today,
          location,
          deviceInfo,
        },
      }).unwrap()

      if (result.success) {
        toast({
          title: "✓ Check-In Successful",
          description: `Checked in at ${new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}`,
        })

        await fetchTodayAttendance()
      } else {
        throw new Error(result.error || "Failed to check in")
      }
    } catch (error: any) {
      console.error("Check-in error:", error)
      toast({
        title: "Check-In Failed",
        description: error.message || "Failed to record check-in",
        variant: "destructive",
      })
    } finally {
      setActionInProgress(false)
      
      setTimeout(() => {
        setButtonDisabled(false)
      }, 5000)
    }
  }

  const handleCheckOut = async () => {
    if (!formId || !employeeId) return

    if (!attendanceStatus.hasCheckedInToday) {
      toast({
        title: "Cannot Check Out",
        description: "You must check in before checking out",
        variant: "destructive",
      })
      return
    }

    if (attendanceStatus.hasCheckedOutToday) {
      toast({
        title: "Already Checked Out",
        description: "You have already checked out today",
        variant: "destructive",
      })
      return
    }

    try {
      setActionInProgress(true)
      setButtonDisabled(true)

      let location = "Location unavailable"
      try {
        const coords = await getCurrentLocation()
        location = `${coords.latitude}, ${coords.longitude}`
        if (coords.accuracy > LOW_ACCURACY_WARN_M) {
          console.warn(
            `Check-out location captured with low accuracy (±${Math.round(coords.accuracy)}m) — device likely using Wi-Fi/cell-tower positioning, not GPS`,
          )
          toast({
            title: "Location is approximate",
            description: `Captured ±${Math.round(coords.accuracy)}m. For an exact fix, enable GPS or move outdoors.`,
          })
        }
      } catch (error) {
        console.warn("Location access denied or unavailable:", error)
      }

      const deviceInfo = JSON.stringify(getDeviceInfo())
      const checkOutTime = new Date().toISOString()
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const checkInTime = new Date(attendanceStatus.todayCheckIn!)
      const checkOut = new Date(checkOutTime)
      const workingHoursCalculated = (checkOut.getTime() - checkInTime.getTime()) / (1000 * 60 * 60)

      const result = await submitCheckout({
        formId,
        body: {
          employeeId,
          checkOutTime,
          date: today,
          location,
          deviceInfo,
          workingHours: workingHoursCalculated,
        },
      }).unwrap()

      if (result.success) {
        toast({
          title: "✓ Check-Out Successful",
          description: `Checked out at ${new Date(checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}. Working hours: ${workingHoursCalculated.toFixed(2)}h`,
        })

        await fetchTodayAttendance()
      } else {
        throw new Error(result.error || "Failed to check out")
      }
    } catch (error: any) {
      console.error("Check-out error:", error)
      toast({
        title: "Check-Out Failed",
        description: error.message || "Failed to record check-out",
        variant: "destructive",
      })
    } finally {
      setActionInProgress(false)
      
      setTimeout(() => {
        setButtonDisabled(false)
      }, 5000)
    }
  }

  useEffect(() => {
    if (isOpen && formId) {
      fetchTodayAttendance()
    }
  }, [isOpen, formId, employeeId])

  const formatTime = (isoString?: string) => {
    if (!isoString) return "—"
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatWorkingHours = (hours?: number) => {
    if (!hours) return "—"
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}h ${m}m`
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Attendance System
          </DialogTitle>
          <DialogDescription>
            Track your daily check-in and check-out times
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-2">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-gray-600" />
                    <h3 className="font-semibold text-lg">Today's Status</h3>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {attendanceStatus.hasCheckedInToday ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">Check-In</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatTime(attendanceStatus.todayCheckIn)}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {attendanceStatus.hasCheckedOutToday ? (
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-sm font-medium">Check-Out</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatTime(attendanceStatus.todayCheckOut)}
                    </p>
                  </div>
                </div>

                {attendanceStatus.workingHours !== undefined && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Working Hours</span>
                      <span className="text-lg font-bold text-purple-600">
                        {formatWorkingHours(attendanceStatus.workingHours)}
                      </span>
                    </div>
                  </div>
                )}

                {attendanceStatus.location && (
                  <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{attendanceStatus.location}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleCheckIn}
                disabled={
                  buttonDisabled ||
                  actionInProgress ||
                  attendanceStatus.hasCheckedInToday
                }
                className={cn(
                  "h-16 text-base font-semibold",
                  !attendanceStatus.hasCheckedInToday &&
                    "bg-green-600 hover:bg-green-700 text-white"
                )}
                variant={
                  attendanceStatus.hasCheckedInToday ? "secondary" : "default"
                }
              >
                {actionInProgress && !attendanceStatus.hasCheckedInToday ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : attendanceStatus.hasCheckedInToday ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Checked In
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 mr-2" />
                    Check In
                  </>
                )}
              </Button>

              <Button
                onClick={handleCheckOut}
                disabled={
                  buttonDisabled ||
                  actionInProgress ||
                  !attendanceStatus.hasCheckedInToday ||
                  attendanceStatus.hasCheckedOutToday
                }
                className={cn(
                  "h-16 text-base font-semibold",
                  attendanceStatus.hasCheckedInToday &&
                    !attendanceStatus.hasCheckedOutToday &&
                    "bg-blue-600 hover:bg-blue-700 text-white"
                )}
                variant={
                  attendanceStatus.hasCheckedInToday &&
                  !attendanceStatus.hasCheckedOutToday
                    ? "default"
                    : "secondary"
                }
              >
                {actionInProgress && attendanceStatus.hasCheckedInToday ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : attendanceStatus.hasCheckedOutToday ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Checked Out
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 mr-2" />
                    Check Out
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground bg-gray-50 p-3 rounded-md">
              <div className="flex items-start gap-2">
                <Smartphone className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <p>Location and device information will be recorded for security purposes.</p>
              </div>
              {buttonDisabled && (
                <div className="flex items-start gap-2 text-amber-600">
                  <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <p>Button disabled for 5 seconds to prevent accidental double-tapping.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}