"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Copy, ExternalLink, Loader2, Eye } from "lucide-react"
import { PublicFormDialog } from "@/components/public-form-dialog"
import type { Form } from "@/types/form-builder"
import { usePublishFormDirectMutation } from "@/lib/api/forms"

export interface PublishFormDialogProps {
  form: Form
  open: boolean
  onOpenChange: (open: boolean) => void
  onFormPublished?: (updatedForm: Form) => void
}

export default function PublishFormDialog({ form, open, onOpenChange, onFormPublished }: PublishFormDialogProps) {
  const { toast } = useToast()
  const [showPublicPreview, setShowPublicPreview] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [settings, setSettings] = useState({
    allowAnonymous: form.allowAnonymous ?? true,
    requireLogin: form.requireLogin ?? false,
    maxSubmissions: form.maxSubmissions || null,
    submissionMessage: form.submissionMessage || "Thank you for your submission!",
  })

  const [publishForm] = usePublishFormDirectMutation()

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const result = await publishForm({ formId: form.id, body: settings }).unwrap()
      toast({
        title: "Success",
        description: "Form published successfully!",
      })
      onFormPublished?.(result.data)
      onOpenChange(false)
    } catch (error: any) {
      console.error("Publish error:", error)
      toast({
        title: "Error",
        description: error?.data?.error || error.message || "Failed to publish form",
        variant: "destructive",
      })
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setPublishing(true)
    try {
      const result = await publishForm({ formId: form.id, body: { unpublish: true } }).unwrap()
      toast({
        title: "Success",
        description: "Form unpublished successfully!",
      })
      onFormPublished?.(result.data)
      onOpenChange(false)
    } catch (error: any) {
      console.error("Unpublish error:", error)
      toast({
        title: "Error",
        description: error?.data?.error || error.message || "Failed to unpublish form",
        variant: "destructive",
      })
    } finally {
      setPublishing(false)
    }
  }

  const inputRef = useRef<HTMLInputElement | null>(null)

  const copyToClipboard = async (text: string) => {
  try {
    // Modern API first (works on HTTPS/localhost in most browsers)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "URL copied to clipboard",
        duration: 2000,
      });
      return;
    }

    // Fallback: Use hidden textarea + execCommand
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);

    toast({
      title: "Copied!",
      description: "URL copied to clipboard",
      duration: 2000,
    });
  } catch (error: any) {
    console.error("Failed to copy:", error);
    toast({
      title: "Failed to copy",
      description: error?.message || "Please select and copy manually",
      variant: "destructive",
    });
  }
};

  // If `form.formUrl` is already a login-wrapped URL like
  //  https://host/login?callbackUrl=%2Fform%2F..., unwrap to the direct form path.
  const getDirectFormUrl = () => {
    const raw = form.formUrl || `/form/${form.id}`
    try {
      if (/^https?:\/\//i.test(raw)) {
        const parsed = new URL(raw)
        // if this looks like a login page with callbackUrl param, use the decoded callback
        const callback = parsed.searchParams.get("callbackUrl")
        if (callback) {
          // if callback is an absolute URL or path
          if (/^https?:\/\//i.test(callback)) return callback
          return `${parsed.origin}${callback}`
        }
        return raw
      }

      // raw is a relative path; nothing to unwrap
      return raw
    } catch (e) {
      return raw
    }
  }

  const directFormUrl = getDirectFormUrl()

  const getPublicUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const fullDirectUrl = /^https?:\/\//i.test(directFormUrl)
      ? directFormUrl
      : `${origin}${directFormUrl}`

    if (!settings.requireLogin) return fullDirectUrl

    try {
      const parsed = new URL(fullDirectUrl)
      // Normalise pathname: collapse any double-leading slashes (e.g. //form/ → /form/)
      const path = (parsed.pathname + parsed.search + parsed.hash).replace(/^\/\/+/, "/")
      return `${parsed.origin}/login?callbackUrl=${encodeURIComponent(path)}`
    } catch (e) {
      return fullDirectUrl
    }
  }

  const publicUrl = getPublicUrl()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{form.isPublished ? "Form Published" : "Publish Form"}</DialogTitle>
          <DialogDescription>
            {form.isPublished
              ? "Your form is live and accepting submissions."
              : "Make your form available to the public."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
              {form.isPublished && form.formUrl && (
            <div className="space-y-2">
              <Label>Public URL</Label>
              <div className="flex items-center space-x-2">
                <Input ref={inputRef} value={publicUrl} readOnly className="flex-1" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(publicUrl)} aria-label="Copy public URL">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => window.open(form.formUrl!, "_blank", "noopener,noreferrer")}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow Anonymous Submissions</Label>
                <p className="text-sm text-muted-foreground">Allow users to submit without logging in</p>
              </div>
              <Switch
                checked={settings.allowAnonymous}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, allowAnonymous: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Require Login</Label>
                <p className="text-sm text-muted-foreground">Users must be logged in to submit</p>
              </div>
              <Switch
                checked={settings.requireLogin}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, requireLogin: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSubmissions">Maximum Submissions</Label>
              <Input
                id="maxSubmissions"
                type="number"
                placeholder="Leave empty for unlimited"
                value={settings.maxSubmissions || ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxSubmissions: e.target.value ? Number.parseInt(e.target.value) : null,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="submissionMessage">Success Message</Label>
              <Textarea
                id="submissionMessage"
                placeholder="Thank you for your submission!"
                value={settings.submissionMessage}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    submissionMessage: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          {form.isPublished ? (
            <div className="flex w-full justify-between">
              <Button variant="destructive" onClick={handleUnpublish} disabled={publishing}>
                {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Unpublish
              </Button>
              <Button onClick={handlePublish} disabled={publishing}>
                {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Update Settings
              </Button>
            </div>
          ) : (
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish Form
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      {/* Inline preview of the published form (opens the public form dialog) */}
      <PublicFormDialog formId={form.id} isOpen={showPublicPreview} onClose={() => setShowPublicPreview(false)} />
    </Dialog>
  )
}
