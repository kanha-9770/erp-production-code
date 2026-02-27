"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PermissionLevel = "READ_WRITE" | "READ_ONLY" | "NONE";

interface RolePermissionDisplay {
  roleId: string;
  roleName: string;
  permission: PermissionLevel;
}

interface SectionPermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string | null;
  sectionTitle?: string; // optional - better UX
}

export default function SectionPermissionDialog({
  open,
  onOpenChange,
  sectionId,
  sectionTitle = "this section",
}: SectionPermissionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rolePermissions, setRolePermissions] = useState<
    RolePermissionDisplay[]
  >([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !sectionId) return;

    const fetchActualPermissions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/permissions/section/${sectionId}`, {
          credentials: "include", // important - sends cookies
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch permissions: ${res.status}`);
        }

        const data = await res.json();

        // Expecting { profiles: [...] } from API
        if (!data.profiles || !Array.isArray(data.profiles)) {
          throw new Error("Invalid response format");
        }

        setRolePermissions(data.profiles);
        console.log("Loaded real section permissions:", data.profiles);
      } catch (err) {
        console.error("Failed to load real section permissions:", err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load actual permissions from database",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchActualPermissions();
  }, [open, sectionId, toast]);

  const handleChangePermission = async (
    roleId: string,
    newLevel: PermissionLevel,
  ) => {
    if (!sectionId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/permissions/section/${sectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // send auth cookie
        body: JSON.stringify({ roleId, permission: newLevel }),
      });

      if (!res.ok) {
        throw new Error(`Update failed: ${res.status}`);
      }

      // Optimistic UI update
      setRolePermissions((prev) =>
        prev.map((rp) =>
          rp.roleId === roleId ? { ...rp, permission: newLevel } : rp,
        ),
      );

      toast({
        title: "Success",
        description: "Permission updated successfully",
      });
    } catch (err) {
      console.error("Failed to save permission:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update permission in database",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Permissions — {sectionTitle}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rolePermissions.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            No roles or permissions found for this organization
          </div>
        ) : (
          <div className="space-y-2.5 py-4 max-h-[55vh] overflow-y-auto pr-1">
            {rolePermissions.map((rp) => (
              <div
                key={rp.roleId}
                className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors"
              >
                <span className="font-medium truncate max-w-[240px]">
                  {rp.roleName}
                </span>

                <Select
                  value={rp.permission}
                  onValueChange={(v) =>
                    handleChangePermission(rp.roleId, v as PermissionLevel)
                  }
                  disabled={saving}
                >
                  <SelectTrigger className="w-44 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ_WRITE">Full access</SelectItem>
                    <SelectItem value="READ_ONLY">Read only</SelectItem>
                    <SelectItem value="NONE">No access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
