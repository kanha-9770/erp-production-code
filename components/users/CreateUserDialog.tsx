"use client";

/**
 * Create User dialog.
 *
 * Provisions a new user account via POST /api/users. Required fields:
 *   - email      (server checks uniqueness)
 *   - first_name (used to derive avatar initials + display name)
 *
 * Optional:
 *   - last_name
 *   - department  → also synced onto the Employee row if one exists
 *                   for this user (see updateUser in user-management.ts)
 *   - password    → if omitted the account exists but has no password
 *                   set; the user can be invited via the auth flow or
 *                   the admin can set one later via Edit.
 *
 * The endpoint requires the caller to hold MANAGE_USERS, which is the
 * same gate the rest of the admin/users page sits behind, so unauthed
 * callers would already be redirected before they reach this dialog.
 *
 * On success, RTK Query's `invalidatesTags: ['AdminUsers']` on the
 * createUser mutation refetches the table — no manual refresh needed.
 */

import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { useCreateUserMutation } from "@/lib/api/users";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  email: string;
  first_name: string;
  last_name: string;
  department: string;
  password: string;
}

const EMPTY: FormState = {
  email: "",
  first_name: "",
  last_name: "",
  department: "",
  password: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const { toast } = useToast();
  const [createUser, { isLoading }] = useCreateUserMutation();
  const [form, setForm] = useState<FormState>(EMPTY);
  // Per-field errors so the user sees red text next to the actual field
  // they need to fix, not a single toast that disappears in 4s.
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const close = (next: boolean) => {
    if (isLoading) return;
    onOpenChange(next);
    if (!next) {
      // Reset on close so the next open starts clean — keeping the
      // previous draft would be surprising for the most common
      // workflow (create one user, close, create another).
      setForm(EMPTY);
      setErrors({});
    }
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.email.trim()) next.email = "Required";
    else if (!EMAIL_RE.test(form.email.trim())) next.email = "Invalid email";
    if (!form.first_name.trim()) next.first_name = "Required";
    if (form.password && form.password.length < 8) {
      next.password = "Use 8+ characters";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    try {
      await createUser({
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || undefined,
        department: form.department.trim() || undefined,
        password: form.password.trim() || undefined,
      }).unwrap();
      toast({
        title: "User created",
        description: `${form.first_name} ${form.last_name} (${form.email}) is now active.`,
      });
      onOpenChange(false);
      setForm(EMPTY);
      setErrors({});
    } catch (e: any) {
      // The handler returns 409 for an already-used email; surface it
      // against the email field so the user fixes the right thing.
      const message: string =
        e?.data?.error ?? e?.error ?? "Could not create user.";
      if (/email/i.test(message)) {
        setErrors((p) => ({ ...p, email: message }));
      } else {
        toast({ title: "Create failed", description: message, variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create user
          </DialogTitle>
          <DialogDescription>
            Adds a new account to this organization. Department and password
            are optional — you can set them later from Edit.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Field
            id="cu-email"
            label="Email"
            required
            error={errors.email}
          >
            <Input
              id="cu-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jane@company.com"
              disabled={isLoading}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="cu-first"
              label="First name"
              required
              error={errors.first_name}
            >
              <Input
                id="cu-first"
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
                placeholder="Jane"
                disabled={isLoading}
              />
            </Field>

            <Field id="cu-last" label="Last name" error={errors.last_name}>
              <Input
                id="cu-last"
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
                placeholder="Doe"
                disabled={isLoading}
              />
            </Field>
          </div>

          <Field id="cu-dept" label="Department" hint="Optional">
            <Input
              id="cu-dept"
              value={form.department}
              onChange={(e) =>
                setForm({ ...form, department: e.target.value })
              }
              placeholder="Engineering"
              disabled={isLoading}
            />
          </Field>

          <Field
            id="cu-pass"
            label="Password"
            hint="Optional · leave blank to invite later"
            error={errors.password}
          >
            <Input
              id="cu-pass"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="At least 8 characters"
              disabled={isLoading}
            />
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => close(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" /> Create user
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
