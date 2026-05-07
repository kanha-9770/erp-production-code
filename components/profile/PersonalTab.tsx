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

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Camera, X, Save, MapPin, Briefcase, AtSign, Mail, Phone, Smartphone, BadgeCheck } from "lucide-react"
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

  // Re-sync local form when the underlying user changes (e.g. after upload).
  useEffect(() => {
    setAvatarPreview(user.avatar)
  }, [user.avatar])

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
      toast({ title: "Photo updated" })
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
    if (!confirm("Remove your profile photo?")) return
    try {
      await removeAvatar().unwrap()
      setAvatarPreview(null)
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
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} alt={displayName(user)} />
                ) : null}
                <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                  {initialsOf(user)}
                </AvatarFallback>
              </Avatar>
              {(isUploading || isRemoving) && (
                <span className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </span>
              )}
              {avatarPreview && !isRemoving && (
                <button
                  type="button"
                  onClick={onRemoveAvatar}
                  className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-background border shadow-sm flex items-center justify-center hover:bg-muted"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="space-y-2 min-w-0">
              <label
                htmlFor="avatar-upload"
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border bg-background px-3 h-9 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Camera className="h-3.5 w-3.5" />
                {avatarPreview ? "Replace photo" : "Upload photo"}
              </label>
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
