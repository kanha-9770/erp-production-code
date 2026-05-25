"use client"

/**
 * PersonalTab — inline edit for the user's identity & contact fields.
 *
 * Replaces the standalone /profile/update-profile page. Avatar upload is on
 * the left, fields on the right. Uses the same RTK Query mutations the old
 * page used so the API contract is unchanged.
 *
 * Phone fields use react-phone-number-input with strict client-side
 * validation (must be a possible AND valid number for the selected country).
 */

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  Camera,
  X,
  Save,
  MapPin,
  Briefcase,
  AtSign,
  Mail,
  BadgeCheck,
  Upload,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import PhoneInput, {
  isPossiblePhoneNumber,
  isValidPhoneNumber,
} from "react-phone-number-input"
import "react-phone-number-input/style.css"
import {
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
  useUpdateProfileMutation,
} from "@/lib/api/auth"
import type { ProfileUser } from "./types"
import { displayName, initialsOf } from "./profile-utils"

interface PersonalTabProps {
  user: ProfileUser
}

interface FormState {
  first_name: string
  last_name: string
  username: string
  phone: string
  mobile: string
  location: string
  department: string
}

export default function PersonalTab({ user }: PersonalTabProps) {
  const { toast } = useToast()
  const [uploadAvatar, { isLoading: isUploading }] = useUploadAvatarMutation()
  const [removeAvatar, { isLoading: isRemoving }] = useRemoveAvatarMutation()
  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation()

  const initial: FormState = {
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    username: user.username ?? "",
    phone: user.phone ?? "",
    mobile: user.mobile ?? "",
    location: user.location ?? "",
    department: user.department ?? "",
  }

  const [form, setForm] = useState<FormState>(initial)
  const [phoneError, setPhoneError] = useState<string>("")
  const [mobileError, setMobileError] = useState<string>("")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar)

  // Preview / camera dialog state. `cameraMode` toggles between the static
  // image preview and the live <video> capture inside the same dialog so
  // the user never loses context.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // Confirmation for "Remove photo" — replaces the native window.confirm
  // popup so the modal matches the rest of the app.
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Re-sync local form when the underlying user changes (e.g. after upload).
  useEffect(() => {
    setAvatarPreview(user.avatar)
  }, [user.avatar])

  // Stop the webcam track whenever the dialog closes or camera mode is
  // toggled off. Leaking the stream would leave the OS-level camera light
  // on after the user closes the preview.
  useEffect(() => {
    if (!previewOpen || !cameraMode) {
      stopCamera()
    }
  }, [previewOpen, cameraMode])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const startCamera = async () => {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported on this device.")
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        // Front camera on phones, default camera on laptops.
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = s
      // Wait a tick so the <video> element is mounted (cameraMode just flipped).
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {
            /* play() rejects when the element is detached — safe to ignore */
          })
        }
      })
    } catch (e: any) {
      setCameraError(
        e?.name === "NotAllowedError"
          ? "Camera permission denied. Enable it in your browser settings."
          : "Could not start the camera. Try file upload instead.",
      )
      setCameraMode(false)
    }
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    )
    if (!blob) {
      toast({ title: "Could not capture frame", variant: "destructive" })
      return
    }
    const file = new File([blob], `selfie_${Date.now()}.jpg`, {
      type: "image/jpeg",
    })
    // Hand off to the existing upload pipeline — handles preview, avatar
    // upload, employee-master sync, and face enrollment in one shot.
    setCameraMode(false)
    setPreviewOpen(false)
    await onAvatarFile(file)
  }

  const dirty =
    form.first_name !== initial.first_name ||
    form.last_name !== initial.last_name ||
    form.username !== initial.username ||
    form.phone !== initial.phone ||
    form.mobile !== initial.mobile ||
    form.location !== initial.location ||
    form.department !== initial.department

  const validatePhone = (value: string, field: "phone" | "mobile") => {
    const setter = field === "phone" ? setPhoneError : setMobileError
    if (!value) return setter(""), true
    if (!isPossiblePhoneNumber(value)) return setter(`Number is incomplete`), false
    if (!isValidPhoneNumber(value)) return setter(`Invalid number for selected country`), false
    setter("")
    return true
  }

  const onAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5 MB.", variant: "destructive" })
      return
    }
    // Optimistic local preview while we wait for the server.
    setAvatarPreview(URL.createObjectURL(file))
    const fd = new FormData()
    fd.append("avatar", file)
    try {
      const res: any = await uploadAvatar(fd).unwrap()
      if (res?.url) setAvatarPreview(res.url)

      // Also register the photo as the user's reference face so attendance
      // check-in can match against it later. This does NOT mark attendance —
      // it only saves the 128-dim descriptor + reference image so future
      // /api/attendance/photo calls have something to compare to. Without
      // this step the attendance widget refuses to check in with the
      // "Your face is not enrolled yet" toast.
      //
      // Best-effort: failures here never block the avatar update. face-api
      // weights (~7 MB) are lazy-loaded only when a photo is actually
      // picked, so the profile page stays light for users who never change
      // their photo.
      let faceMessage: string | undefined
      try {
        const { computeDescriptorFromBlobWithTimeout, descriptorToBase64 } =
          await import("@/lib/face/descriptor")
        const { descriptor, faceCount } =
          await computeDescriptorFromBlobWithTimeout(file)
        if (descriptor && faceCount === 1) {
          const enrollFd = new FormData()
          enrollFd.append("descriptor", descriptorToBase64(descriptor))
          enrollFd.append("photo", file)
          const enrollRes = await fetch("/api/face/enroll", {
            method: "POST",
            body: enrollFd,
            credentials: "include",
          })
          if (!enrollRes.ok) {
            faceMessage =
              "Saved, but couldn't register the face — attendance check-in may still ask for help."
          }
        } else if (faceCount === 0) {
          faceMessage =
            "No face detected in this photo. Pick a clear, front-facing photo so attendance can recognise you."
        } else if (faceCount > 1) {
          faceMessage =
            "Multiple faces detected. Use a solo photo so attendance can recognise you."
        }
      } catch (err) {
        console.warn("[profile] face reference not registered:", err)
      }

      toast({ title: "Photo updated", description: faceMessage })
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e?.data?.error || "Try a different image.",
        variant: "destructive",
      })
      setAvatarPreview(user.avatar)
    }
  }

  const onRemoveAvatar = async () => {
    try {
      await removeAvatar().unwrap()
      setAvatarPreview(null)
      setPreviewOpen(false)
      toast({ title: "Photo removed" })
    } catch (e: any) {
      toast({
        title: "Could not remove",
        description: e?.data?.error,
        variant: "destructive",
      })
    }
  }

  const submit = async () => {
    const phoneOk = validatePhone(form.phone, "phone")
    const mobileOk = validatePhone(form.mobile, "mobile")
    if (!phoneOk || !mobileOk) return

    try {
      // Send only changed fields so the API audit log records the diff cleanly.
      const diff: Partial<FormState> = {}
      ;(Object.keys(form) as Array<keyof FormState>).forEach((k) => {
        if (form[k] !== initial[k]) (diff as any)[k] = form[k]
      })
      if (Object.keys(diff).length === 0) {
        toast({ title: "Nothing to save" })
        return
      }
      await updateProfile(diff).unwrap()
      toast({ title: "Profile saved" })
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.data?.error || "Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Click-to-preview dialog. Doubles as the camera-capture surface so
          the user can take a fresh selfie without leaving the page. */}
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open)
          if (!open) setCameraMode(false)
        }}
      >
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-lg">
              {cameraMode ? "Take a photo" : "Profile photo"}
            </DialogTitle>
            <DialogDescription>
              {cameraMode
                ? "Look straight at the camera, then tap Capture."
                : "This is how your photo appears across the app."}
            </DialogDescription>
          </DialogHeader>

          {cameraMode ? (
            <div className="px-6 pb-6 space-y-4">
              <div className="relative aspect-square w-full bg-black rounded-xl overflow-hidden ring-1 ring-border shadow-inner">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Centring guide — helps people align their face. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="h-3/5 w-3/5 rounded-full border-2 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                </div>
              </div>
              {cameraError && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                  {cameraError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setCameraMode(false)}
                  disabled={isUploading}
                >
                  Back
                </Button>
                <Button
                  size="lg"
                  onClick={capturePhoto}
                  disabled={isUploading || !!cameraError}
                  className="min-w-[140px]"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Capture
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 pb-6">
              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-violet-500/5 to-cyan-500/10 ring-1 ring-border">
                {/* Soft top band gives the card depth so the photo doesn't
                    sit flat against the dialog background. */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/15 to-transparent"
                />
                <div className="relative pt-8 pb-6 px-6 flex flex-col items-center">
                  {avatarPreview ? (
                    <div className="h-48 w-48 sm:h-56 sm:w-56 rounded-full overflow-hidden bg-background ring-4 ring-background shadow-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarPreview}
                        alt={displayName(user)}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-48 w-48 sm:h-56 sm:w-56 rounded-full bg-primary/10 text-primary flex items-center justify-center text-6xl font-semibold ring-4 ring-background shadow-xl">
                      {initialsOf(user)}
                    </div>
                  )}
                  <p className="mt-5 text-base font-semibold tracking-tight text-center truncate max-w-full">
                    {displayName(user)}
                  </p>
                  <p className="text-xs text-muted-foreground text-center truncate max-w-full">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Styled confirmation for "Remove photo" — replaces the OS-level
          window.confirm popup so the look matches the rest of the app. */}
      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
            <AlertDialogDescription>
              Your photo will be cleared from your profile and the linked
              employee record. You can upload a new one any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRemoveAvatar}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Avatar + identity card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Profile photo</CardTitle>
          <CardDescription>
            A square JPG or PNG up to 5 MB. Visible to your team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCameraMode(false)
                  setCameraError(null)
                  setPreviewOpen(true)
                }}
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform hover:scale-[1.02]"
                aria-label={avatarPreview ? "Preview profile photo" : "Add profile photo"}
              >
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border cursor-pointer">
                  {avatarPreview ? (
                    <AvatarImage src={avatarPreview} alt={displayName(user)} />
                  ) : null}
                  <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                    {initialsOf(user)}
                  </AvatarFallback>
                </Avatar>
              </button>
              {(isUploading || isRemoving) && (
                <span className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center pointer-events-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </span>
              )}
              {avatarPreview && !isRemoving && (
                <button
                  type="button"
                  onClick={() => setRemoveConfirmOpen(true)}
                  className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-background border shadow-sm flex items-center justify-center hover:bg-muted"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="avatar-upload"
                  className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border bg-background px-3 h-9 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {avatarPreview ? "Replace photo" : "Upload photo"}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewOpen(true)
                    setCameraMode(true)
                    setCameraError(null)
                    void startCamera()
                  }}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 h-9 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Take photo
                </button>
              </div>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onAvatarFile(f)
                  e.currentTarget.value = ""
                }}
              />
              <p className="text-xs text-muted-foreground">
                Square images look best. We&apos;ll auto-crop.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Identity</CardTitle>
          <CardDescription>How you appear across the app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              placeholder="Jane"
              className="h-10"
            />
          </Field>
          <Field label="Last name">
            <Input
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              placeholder="Doe"
              className="h-10"
            />
          </Field>
          <Field label="Username">
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="janedoe"
                className="h-10 pl-9"
              />
            </div>
          </Field>
          <Field label="Email" hint="Contact admin to change.">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={user.email}
                disabled
                className="h-10 pl-9 bg-muted/30"
              />
              {user.email_verified && (
                <BadgeCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
              )}
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Contact</CardTitle>
          <CardDescription>How we reach you.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={phoneError}>
            <div className="profile-phone">
              <PhoneInput
                international
                defaultCountry="IN"
                value={form.phone}
                onChange={(v) => {
                  setForm({ ...form, phone: v ?? "" })
                  validatePhone(v ?? "", "phone")
                }}
                className={cn(
                  "h-10 rounded-md border px-3 flex items-center gap-2 bg-background",
                  phoneError && "border-destructive",
                )}
                numberInputProps={{
                  className: "outline-none bg-transparent w-full h-full text-sm",
                  placeholder: "000 000 0000",
                }}
              />
            </div>
          </Field>
          <Field label="Mobile" error={mobileError} hint={user.mobile_verified ? "Verified" : undefined}>
            <div className="profile-phone">
              <PhoneInput
                international
                defaultCountry="IN"
                value={form.mobile}
                onChange={(v) => {
                  setForm({ ...form, mobile: v ?? "" })
                  validatePhone(v ?? "", "mobile")
                }}
                className={cn(
                  "h-10 rounded-md border px-3 flex items-center gap-2 bg-background",
                  mobileError && "border-destructive",
                )}
                numberInputProps={{
                  className: "outline-none bg-transparent w-full h-full text-sm",
                  placeholder: "000 000 0000",
                }}
              />
            </div>
          </Field>
          <Field label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="City, country"
                className="h-10 pl-9"
              />
            </div>
          </Field>
          <Field label="Department">
            <div className="relative">
              <Briefcase className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="Engineering"
                className="h-10 pl-9"
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Save bar — sticks to the bottom on mobile so the action is always reachable. */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => setForm(initial)}
          disabled={!dirty || isSaving}
        >
          Reset
        </Button>
        <Button onClick={submit} disabled={!dirty || isSaving} className="h-10">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Save changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string
  children: React.ReactNode
  error?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <span>{label}</span>
        {hint && !error && <span className="text-muted-foreground/70 normal-case font-normal">· {hint}</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
