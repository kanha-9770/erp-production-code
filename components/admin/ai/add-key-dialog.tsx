"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerName: string;
  onSubmit: (payload: { label: string; apiKey: string }) => void;
}

export default function AddKeyDialog({
  open,
  onOpenChange,
  providerName,
  onSubmit,
}: Props) {
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) {
      setLabel("");
      setApiKey("");
    }
  }, [open]);

  // Min length of 1 — self-hosted servers accept any non-empty string
  // (vLLM/Ollama with optional --api-key). Cloud keys are typically 20+ chars
  // anyway; the upstream will reject anything too short on first request.
  const canSubmit = label.trim().length > 0 && apiKey.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add API key for {providerName}</DialogTitle>
          <DialogDescription>
            Keys are encrypted with AES-256-GCM before being stored. You will only
            see a preview afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. primary, backup, team-a"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">API key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => onSubmit({ label: label.trim(), apiKey: apiKey.trim() })}
          >
            Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
