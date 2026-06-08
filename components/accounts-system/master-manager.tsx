"use client";

/**
 * Accounts Master — manage the dropdowns used across the finance documents
 * (Account Group, Tax Rate, Payment Mode, Bank/Cash, Expense Category, …) and
 * register new ones. Same UX as the Purchase Master; bound to the accounts
 * provider.
 *
 * The `customer` and `ledger` masters are entity projections (Customer Master /
 * Chart of Accounts), so they're hidden here — manage them on their own screens.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Layers,
  Wallet,
  Percent,
  CreditCard,
  Landmark,
  Tags,
  Building2,
  List,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/lib/accounts-system/store";
import type { MasterOption, MasterType, AccountsSubmoduleKey } from "@/lib/accounts-system/types";
import { ResetDataButton } from "./record-table-view";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  layers: Layers,
  wallet: Wallet,
  percent: Percent,
  "credit-card": CreditCard,
  landmark: Landmark,
  tags: Tags,
  building: Building2,
  list: List,
};

const SUBMODULE_LABEL: Record<AccountsSubmoduleKey, string> = {
  coa: "Ledger",
  customer: "Customer",
  salesInvoice: "Invoice",
  receipt: "Receipt",
  paymentVoucher: "Payment",
  expense: "Expense",
  journal: "Journal",
};

// Masters managed as entities elsewhere (not raw dropdowns).
const ENTITY_MASTERS = new Set(["customer", "ledger"]);

export function MasterManager() {
  const { ready, masters, addMasterType } = useAccounts();
  const [activeKey, setActiveKey] = useState<string>("account_group");
  const [createOpen, setCreateOpen] = useState(false);

  const visibleMasters = useMemo(
    () => masters.filter((m) => !ENTITY_MASTERS.has(m.key)),
    [masters],
  );

  const active = useMemo(
    () => visibleMasters.find((m) => m.key === activeKey) ?? visibleMasters[0],
    [visibleMasters, activeKey],
  );

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Loading masters…</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 sm:px-6 py-4 border-b shrink-0 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">Accounts Master</h1>
          <p className="text-sm text-muted-foreground">
            Manage the dropdowns used across the finance documents — Account Group, Tax Rate,
            Payment Mode and more. You can add your own too.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New master
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr]">
        <div className="border-r overflow-y-auto p-2 space-y-1">
          {visibleMasters.map((m) => {
            const Icon = ICONS[m.icon ?? "list"] ?? List;
            const isActive = m.key === active?.key;
            const activeCount = m.options.filter((o) => o.active).length;
            return (
              <button
                key={m.key}
                onClick={() => setActiveKey(m.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    isActive ? "bg-primary/15" : "bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{activeCount} options</span>
                </span>
                {m.system && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    system
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <div className="overflow-y-auto">{active ? <MasterOptionsPanel master={active} /> : null}</div>
      </div>

      <div className="border-t px-4 sm:px-6 py-2 shrink-0 flex justify-end">
        <ResetDataButton />
      </div>

      <CreateMasterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (label, description) => {
          const key = await addMasterType(label, { description });
          setActiveKey(key);
        }}
      />
    </div>
  );
}

function MasterOptionsPanel({ master }: { master: MasterType }) {
  const { addMasterOption, updateMasterOption, deleteMasterOption, deleteMasterType } = useAccounts();
  const Icon = ICONS[master.icon ?? "list"] ?? List;
  const [deletingMaster, setDeletingMaster] = useState(false);

  const [search, setSearch] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCode, setNewCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleting, setDeleting] = useState<MasterOption | null>(null);

  const sorted = useMemo(
    () => [...master.options].sort((a, b) => a.sortOrder - b.sortOrder),
    [master.options],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((o) => o.value.toLowerCase().includes(q));
  }, [sorted, search]);

  const submitAdd = async () => {
    const v = newValue.trim();
    if (!v) return;
    setAdding(true);
    try {
      await addMasterOption(master.key, v, newCode);
      setNewValue("");
      setNewCode("");
    } finally {
      setAdding(false);
    }
  };

  const submitEdit = async (id: string) => {
    const v = editValue.trim();
    if (v) await updateMasterOption(master.key, id, { value: v });
    setEditingId(null);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold">{master.label}</h2>
            {(master.usedBy ?? []).map((u) => (
              <Badge key={u} variant="secondary" className="text-[10px] h-4 px-1.5">
                {SUBMODULE_LABEL[u]}
              </Badge>
            ))}
          </div>
          {master.description && <p className="text-sm text-muted-foreground">{master.description}</p>}
        </div>
        {master.system ? (
          <Badge variant="outline" className="shrink-0">
            System
          </Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive shrink-0"
            onClick={() => setDeletingMaster(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete master
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder={`New ${master.label.toLowerCase()} value…`}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitAdd();
              }
            }}
            className="flex-1"
          />
          <Input
            placeholder="Code (optional)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="sm:w-40"
          />
          <Button onClick={submitAdd} disabled={adding || !newValue.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </Card>

      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter options…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 pl-8 max-w-xs"
        />
      </div>

      <div className="border rounded-lg divide-y">
        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {sorted.length === 0 ? "No options yet — add one above." : "No matches."}
          </div>
        )}
        {visible.map((o, idx) => (
          <div key={o.id} className={cn("flex items-center gap-3 px-3 py-2", !o.active && "opacity-55")}>
            <span className="w-6 text-xs text-muted-foreground tabular-nums text-right">{idx + 1}</span>

            {editingId === o.id ? (
              <Input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitEdit(o.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-8 flex-1"
              />
            ) : (
              <span className="flex-1 min-w-0 flex items-center gap-2">
                <span className="font-medium truncate">{o.value}</span>
                {o.code && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 font-mono">
                    {o.code}
                  </Badge>
                )}
              </span>
            )}

            {editingId === o.id ? (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void submitEdit(o.id)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Switch
                  checked={o.active}
                  onCheckedChange={(v) => void updateMasterOption(master.key, o.id, { active: v })}
                  aria-label="Active"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(o.id);
                    setEditValue(o.value);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setDeleting(o)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Inactive options stay on existing documents but are hidden from new selections.
      </p>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.value}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Removing this option won’t change documents that already use it, but it will no longer be
              selectable. Consider toggling it inactive instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) void deleteMasterOption(master.key, deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingMaster} onOpenChange={setDeletingMaster}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the “{master.label}” master?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the entire dropdown and all {master.options.length} of its options. Fields
              that referenced it keep their stored text but lose the dropdown. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void deleteMasterType(master.key);
                setDeletingMaster(false);
              }}
            >
              Delete master
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateMasterDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (label: string, description: string) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setLabel("");
    setDescription("");
  };

  const submit = async () => {
    const l = label.trim();
    if (!l) return;
    setBusy(true);
    try {
      await onCreate(l, description.trim());
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New master dropdown</DialogTitle>
          <DialogDescription>
            Create a reusable dropdown (e.g. TDS Section, Currency, Branch). You can add its options
            right after.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="e.g. TDS Section"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              placeholder="What is this dropdown used for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !label.trim()}>
            Create master
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
