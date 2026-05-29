"use client"

/**
 * PersonalTab — Instagram-style profile edit.
 *
 * Visual contract (vs the previous card-heavy version):
 *   - Centred avatar at the top of the form, ~h-20 sm:h-24
 *   - "Change profile photo" link directly under the avatar (primary,
 *     semibold) — taps the file picker
 *   - A smaller "Take photo" link next to it for the camera path,
 *     and a "Remove" link under both if a photo exists
 *   - Single-column form below, with plain labels above each input.
 *     No card wrappers. No icons inside the inputs. No descriptions
 *     like "How you appear across the app" — the field labels speak
 *     for themselves.
 *   - Sticky save bar at the bottom (full-width on mobile, right-
 *     aligned on desktop) so the action is always reachable.
 *
 * Functional contract (UNCHANGED — same hooks, same APIs, same dialogs):
 *   - useUploadAvatarMutation / useRemoveAvatarMutation / useUpdateProfileMutation
 *   - File picker + camera capture + face enrollment on /api/face/enroll
 *   - Phone validation via react-phone-number-input
 *   - Preview dialog (with camera mode toggle) — unchanged
 *   - Remove-photo AlertDialog — unchanged
 *   - Form dirty detection + diff-only save — unchanged
 *
 * Only the visible layout changed. Every mutation, validation and
 * dialog hook is the same as before, so the API contract and UX of
 * actions (upload, take, remove, save) are identical.
 */

import { useEffect, useRef, useState } from "react"
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
import { Loader2, Camera, Save, Trash2 } from "lucide-react"
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
import { DailyBanner } from "./DailyBanner"
import AvatarCropper from "./AvatarCropper"

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
  // Crop/edit step shown between picking-or-capturing an image and the
  // upload. `cropSrc` is the object URL of the image being framed.
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropName, setCropName] = useState("photo.jpg")
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
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = s
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
    setCameraMode(false)
    setPreviewOpen(false)
    // Hand the captured frame to the cropper so the user can frame their face
    // before it's uploaded and enrolled for attendance.
    openCropper(file)
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

  // Open the crop/edit dialog for a freshly chosen or captured image. Both
  // the file picker and the camera route through here so every photo can be
  // framed before upload. Heavy originals are fine — the cropper downscales to
  // a 512px square — but guard against absurd files that could exhaust memory
  // when decoded into an <img>.
  const openCropper = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" })
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 25 MB.", variant: "destructive" })
      return
    }
    setCropName(file.name || "photo.jpg")
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const closeCropper = () => {
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
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
    setAvatarPreview(URL.createObjectURL(file))
    const fd = new FormData()
    fd.append("avatar", file)
    try {
      const res: any = await uploadAvatar(fd).unwrap()
      if (res?.url) setAvatarPreview(res.url)

      // Also register the photo as the user's reference face so
      // attendance check-in can match against it later. Best-effort:
      // failures never block the avatar update. face-api weights (~7
      // MB) are lazy-loaded only when a photo is actually picked, so
      // the profile page stays light for users who never change their
      // photo.
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

  const photoBusy = isUploading || isRemoving

  return (
    <div className="max-w-xl mx-auto">
      {/* ── Preview / camera dialog ─────────────────────────────────
          Same dialog as before — image preview AND camera capture in
          one surface, toggled by `cameraMode`. Unchanged behavior. */}
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
                ? "Look at the camera, then tap Capture."
                : "How your photo appears across the app."}
            </DialogDescription>
          </DialogHeader>

          {cameraMode ? (
            <div className="px-6 pb-6 space-y-4">
              <div className="relative aspect-square w-full bg-black rounded-xl overflow-hidden ring-1 ring-border">
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
              <div className="rounded-2xl bg-muted/30 ring-1 ring-border p-6 flex flex-col items-center">
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
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remove-photo confirmation (unchanged) ───────────────── */}
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

      {/* ── Crop / edit dialog — runs after a photo is picked or captured,
            before it's uploaded. On Apply we get back a framed 512px square
            JPEG, which flows through the same upload + face-enrollment path
            as before. */}
      <AvatarCropper
        open={!!cropSrc}
        src={cropSrc}
        fileName={cropName}
        onCancel={closeCropper}
        onCropped={async (file) => {
          closeCropper()
          await onAvatarFile(file)
        }}
      />

      {/* ── Daily banner — matches the cover on /profile so the edit
            page feels like a continuation of the same surface, not a
            different screen. Tucked behind the avatar block so the
            avatar overlaps its bottom edge. */}
      <DailyBanner className="h-28 sm:h-36 rounded-2xl" />

      {/* ── Avatar block — overlaps the banner above (-mt) so the
            page reads as a single composition: banner → avatar →
            actions → fields. */}
      <div className="flex flex-col items-center pb-6 -mt-12 sm:-mt-14">
        <button
          type="button"
          onClick={() => {
            setCameraMode(false)
            setCameraError(null)
            setPreviewOpen(true)
          }}
          className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={avatarPreview ? "Preview profile photo" : "No photo"}
        >
          <Avatar className="h-24 w-24 sm:h-28 sm:w-28 ring-4 ring-background shadow-md">
            {avatarPreview ? (
              <AvatarImage src={avatarPreview} alt={displayName(user)} />
            ) : null}
            <AvatarFallback className="text-2xl font-semibold bg-muted text-foreground/70">
              {initialsOf(user)}
            </AvatarFallback>
          </Avatar>
          {photoBusy && (
            <span className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
        </button>

        {/* Primary action — IG's "Change profile photo" link. The label
            triggers the hidden <input type="file"> so the OS picker
            opens directly with no intermediate dialog. */}
        <label
          htmlFor="avatar-upload"
          className={cn(
            "mt-3 text-[15px] font-semibold text-primary cursor-pointer",
            "hover:underline active:opacity-70 transition-opacity",
            photoBusy && "opacity-50 pointer-events-none",
          )}
        >
          Change profile photo
        </label>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) openCropper(f)
            e.currentTarget.value = ""
          }}
        />

        {/* Secondary actions — camera + remove. Smaller text, muted by
            default; the user can still find them but they don't compete
            with the primary "Change profile photo" link above. */}
        <div className="mt-1.5 flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => {
              setPreviewOpen(true)
              setCameraMode(true)
              setCameraError(null)
              void startCamera()
            }}
            disabled={photoBusy}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            Take photo
          </button>
          {avatarPreview && (
            <button
              type="button"
              onClick={() => setRemoveConfirmOpen(true)}
              disabled={photoBusy}
              className="text-destructive/80 hover:text-destructive disabled:opacity-50 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* ── Form fields — grouped into three intent-buckets so the
            user can find what they need without scanning a flat list:
            Identity (who you are), Contact (how to reach you), and
            Work (where you sit in the org). Each group sits inside a
            soft-bordered card with a small header label, which gives
            the page visual structure without resorting to heavy card
            chrome. Extra bottom padding leaves room for the sticky
            save bar so the last field is never covered. */}
      <div className="space-y-5">
        <FieldGroup title="Identity">
          <Field label="First name">
            <Input
              value={form.first_name}
              onChange={(e) =>
                setForm({ ...form, first_name: e.target.value })
              }
              placeholder="Jane"
              className="h-11"
            />
          </Field>

          <Field label="Last name">
            <Input
              value={form.last_name}
              onChange={(e) =>
                setForm({ ...form, last_name: e.target.value })
              }
              placeholder="Doe"
              className="h-11"
            />
          </Field>

          <Field label="Username">
            <Input
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
              placeholder="janedoe"
              className="h-11"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        </FieldGroup>

        <FieldGroup title="Contact">
          <Field label="Email" hint="Contact your admin to change.">
            <Input
              value={user.email}
              disabled
              className="h-11 bg-muted/40"
            />
          </Field>

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
                  "h-11 rounded-md border border-input px-3 flex items-center gap-2 bg-background text-sm",
                  "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                  phoneError && "border-destructive",
                )}
                numberInputProps={{
                  className: "outline-none bg-transparent w-full h-full text-sm",
                  placeholder: "000 000 0000",
                }}
              />
            </div>
          </Field>

          <Field
            label="Mobile"
            error={mobileError}
            hint={user.mobile_verified ? "Verified" : undefined}
          >
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
                  "h-11 rounded-md border border-input px-3 flex items-center gap-2 bg-background text-sm",
                  "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                  mobileError && "border-destructive",
                )}
                numberInputProps={{
                  className: "outline-none bg-transparent w-full h-full text-sm",
                  placeholder: "000 000 0000",
                }}
              />
            </div>
          </Field>
        </FieldGroup>

        <FieldGroup title="Work">
          <Field label="Location">
            <Input
              value={form.location}
              onChange={(e) =>
                setForm({ ...form, location: e.target.value })
              }
              placeholder="City, country"
              className="h-11"
            />
          </Field>

          <Field label="Department">
            <Input
              value={form.department}
              onChange={(e) =>
                setForm({ ...form, department: e.target.value })
              }
              placeholder="Engineering"
              className="h-11"
            />
          </Field>
        </FieldGroup>
      </div>

      {/* ── Save bar ─────────────────────────────────────────────────
          Sits at the natural bottom of the form. Users scroll down to
          save. Previously this was `position: sticky bottom-16` so it
          would float above the mobile bottom nav, but the sticky
          containing-block behavior was anchoring the bar mid-viewport
          on some mobile screens. Plain flow + a `mb-16` bottom margin
          (so the mobile bottom nav doesn't cover it) is simpler and
          bullet-proof. */}
      <div className="mt-8 mb-16 md:mb-0 px-1 py-3 border-t flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => setForm(initial)}
          disabled={!dirty || isSaving}
          className="h-10"
        >
          Reset
        </Button>
        <Button
          onClick={submit}
          disabled={!dirty || isSaving}
          className="h-10"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Save
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FieldGroup — a soft-bordered card with a small label header. Used to
// bucket related fields (Identity, Contact, Work) so the form reads as
// three small sections rather than one long list.
// ─────────────────────────────────────────────────────────────────────────────

function FieldGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/60 px-4 sm:px-5 py-4 sm:py-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Field — plain label above input, optional hint or error line below.
// No icons, no descriptions, no card chrome. The label *is* the affordance.
// ─────────────────────────────────────────────────────────────────────────────

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
      <Label className="text-sm font-medium text-foreground/90">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
