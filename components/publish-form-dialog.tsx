"use client"

import { useState } from "react"
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
import { Copy, ExternalLink, Loader2 } from "lucide-react"
import type { Form } from "@/types/form-builder"

export interface PublishFormDialogProps {
  form: Form
  open: boolean
  onOpenChange: (open: boolean) => void
  onFormPublished?: (updatedForm: Form) => void
}

export default function PublishFormDialog({ form, open, onOpenChange, onFormPublished }: PublishFormDialogProps) {
  const { toast } = useToast()
  const [publishing, setPublishing] = useState(false)
  const [settings, setSettings] = useState({
    allowAnonymous: form.allowAnonymous ?? true,
    requireLogin: form.requireLogin ?? false,
    maxSubmissions: form.maxSubmissions || null,
    submissionMessage: form.submissionMessage || "Thank you for your submission!",
  })

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const response = await fetch(`/api/forms/${form.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) throw new Error("Failed to publish form")

      const result = await response.json()
      if (result.success) {
        toast({
          title: "Success",
          description: "Form published successfully!",
        })
        onFormPublished?.(result.data)
        onOpenChange(false)
      } else {
        throw new Error(result.error || "Failed to publish form")
      }
    } catch (error: any) {
      console.error("Publish error:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setPublishing(true)
    try {
      const response = await fetch(`/api/forms/${form.id}/publish`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to unpublish form")

      const result = await response.json()
      if (result.success) {
        toast({
          title: "Success",
          description: "Form unpublished successfully!",
        })
        onFormPublished?.(result.data)
        onOpenChange(false)
      } else {
        throw new Error(result.error || "Failed to unpublish form")
      }
    } catch (error: any) {
      console.error("Unpublish error:", error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setPublishing(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied",
        description: "URL copied to clipboard",
      })
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

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
                <Input value={form.formUrl} readOnly className="flex-1" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(form.formUrl!)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => window.open(form.formUrl!, "_blank")}>
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
    </Dialog>
  )
}
