"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Plus,
  Search,
  Pencil,
  Trash2,
  Laptop,
  Smartphone,
  Monitor,
  Headphones,
  HardDrive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import PageBackLink from "@/components/shared/page-back-link";

type AssetType =
  | "LAPTOP"
  | "PHONE"
  | "MONITOR"
  | "ACCESSORY"
  | "SIM"
  | "OTHER";
type AssetStatus = "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  serialNo: string;
  status: AssetStatus;
  assignedTo: string;
  purchaseDate: string;
  value: number;
  notes: string;
  // SIM-only fields. Used when type === "SIM" so a single asset register can
  // hold both physical assets and corporate SIMs without splitting tables.
  // Non-SIM rows leave these blank/zero.
  simNumber?: string;
  imei?: string;
  carrier?: string;
  plan?: string;
  monthlyCost?: number;
}

// v2 schema introduces SIM-specific fields. v1 data still loads fine because
// the new fields are all optional — old rows simply read as undefined.
const STORAGE_KEY = "asset-management:v2";
const LEGACY_STORAGE_KEY = "asset-management:v1";

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  LAPTOP: "Laptop",
  PHONE: "Phone",
  MONITOR: "Monitor",
  ACCESSORY: "Accessory",
  SIM: "SIM card",
  OTHER: "Other",
};

const ASSET_TYPE_ICON: Record<AssetType, React.ComponentType<{ className?: string }>> = {
  LAPTOP: Laptop,
  PHONE: Smartphone,
  MONITOR: Monitor,
  ACCESSORY: Headphones,
  SIM: Smartphone,
  OTHER: HardDrive,
};

const STATUS_LABEL: Record<AssetStatus, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  UNDER_REPAIR: "Under Repair",
  RETIRED: "Retired",
};

const STATUS_VARIANT: Record<AssetStatus, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  ASSIGNED: "secondary",
  UNDER_REPAIR: "outline",
  RETIRED: "destructive",
};

const SEED: Asset[] = [
  {
    id: "AST-0001",
    name: "Dell Latitude 7430",
    type: "LAPTOP",
    serialNo: "DLT7430-A98QXZ",
    status: "ASSIGNED",
    assignedTo: "Riya Sharma",
    purchaseDate: "2024-08-12",
    value: 78000,
    notes: "16GB RAM, 512GB SSD",
  },
  {
    id: "AST-0002",
    name: 'LG UltraFine 27"',
    type: "MONITOR",
    serialNo: "LG27UN-K12P",
    status: "AVAILABLE",
    assignedTo: "",
    purchaseDate: "2024-03-04",
    value: 32000,
    notes: "",
  },
  {
    id: "AST-0003",
    name: "iPhone 14 (company)",
    type: "PHONE",
    serialNo: "IP14-D8H7K2",
    status: "UNDER_REPAIR",
    assignedTo: "Arjun Mehta",
    purchaseDate: "2023-11-21",
    value: 71000,
    notes: "Screen replacement in progress",
  },
  {
    id: "AST-0004",
    name: "Corporate SIM — Airtel Postpaid",
    type: "SIM",
    serialNo: "",
    status: "ASSIGNED",
    assignedTo: "Riya Sharma",
    purchaseDate: "2024-08-15",
    value: 0,
    notes: "Unlimited data + roaming",
    simNumber: "+91 98765 43210",
    imei: "356938035643809",
    carrier: "Airtel",
    plan: "Postpaid 999",
    monthlyCost: 999,
  },
];

function loadAssets(): Asset[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Asset[]) : SEED;
    }
    // One-time migration: pick up data written under the v1 key so existing
    // users don't lose their asset list when the SIM merge ships.
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        window.localStorage.setItem(STORAGE_KEY, legacy);
        return parsed as Asset[];
      }
    }
    return SEED;
  } catch {
    return SEED;
  }
}

function saveAssets(items: Asset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nextAssetId(items: Asset[]): string {
  const nums = items
    .map((a) => Number(a.id.replace(/[^0-9]/g, "")))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `AST-${String(next).padStart(4, "0")}`;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

const EMPTY: Asset = {
  id: "",
  name: "",
  type: "LAPTOP",
  serialNo: "",
  status: "AVAILABLE",
  assignedTo: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  value: 0,
  notes: "",
};

export default function AssetManagementPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AssetStatus>("");
  const [typeFilter, setTypeFilter] = useState<"" | AssetType>("");
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  useEffect(() => {
    setItems(loadAssets());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveAssets(items);
  }, [items, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (typeFilter && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.serialNo.toLowerCase().includes(q) ||
        a.assignedTo.toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const totalValue = items.reduce((s, a) => s + a.value, 0);
    const activeSimMonthly = items
      .filter((a) => a.type === "SIM" && a.status !== "RETIRED")
      .reduce((sum, a) => sum + (a.monthlyCost ?? 0), 0);
    const simCount = items.filter((a) => a.type === "SIM").length;
    return {
      total: items.length,
      assigned: items.filter((a) => a.status === "ASSIGNED").length,
      available: items.filter((a) => a.status === "AVAILABLE").length,
      underRepair: items.filter((a) => a.status === "UNDER_REPAIR").length,
      totalValue,
      simCount,
      activeSimMonthly,
    };
  }, [items]);

  const onSave = (draft: Asset) => {
    if (!draft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const existing = items.find((a) => a.id === draft.id);
    const finalAsset: Asset =
      existing != null
        ? draft
        : { ...draft, id: draft.id || nextAssetId(items) };
    setItems((prev) =>
      existing != null
        ? prev.map((a) => (a.id === finalAsset.id ? finalAsset : a))
        : [finalAsset, ...prev],
    );
    setEditing(null);
    toast({
      title: existing ? "Asset updated" : "Asset added",
      description: `${finalAsset.id} · ${finalAsset.name}`,
    });
  };

  const onDelete = (asset: Asset) => {
    setItems((prev) => prev.filter((a) => a.id !== asset.id));
    setDeleting(null);
    toast({ title: "Asset deleted", description: `${asset.id} · ${asset.name}` });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <PageBackLink href="/admin/modules" label="Modules" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-500" /> Asset Management
          </h1>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl">
            Track every physical asset the company owns — laptops, monitors,
            phones, accessories, and corporate SIM cards. Assign to employees,
            log repairs, and retire when end-of-life. Pick <strong>SIM card</strong>{" "}
            as the type to capture carrier, plan, and monthly cost.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-4 w-4 mr-1.5" /> Add asset
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Total assets" value={stats.total.toString()} />
        <KpiCard label="Assigned" value={stats.assigned.toString()} tone="primary" />
        <KpiCard label="Available" value={stats.available.toString()} tone="success" />
        <KpiCard label="Under repair" value={stats.underRepair.toString()} tone="warning" />
        <KpiCard
          label={`SIMs · ₹${formatINR(stats.activeSimMonthly)}/mo`}
          value={stats.simCount.toString()}
          tone="primary"
        />
      </div>

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, ID, serial, assignee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select
            value={statusFilter || "ALL"}
            onValueChange={(v) =>
              setStatusFilter(v === "ALL" ? "" : (v as AssetStatus))
            }
          >
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {(Object.keys(STATUS_LABEL) as AssetStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter || "ALL"}
            onValueChange={(v) =>
              setTypeFilter(v === "ALL" ? "" : (v as AssetType))
            }
          >
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {ASSET_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Asset ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[130px]">Status</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead className="w-[110px]">Purchased</TableHead>
              <TableHead className="text-right w-[110px]">Value</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  {items.length === 0
                    ? "No assets yet. Click \"Add asset\" to register the first one."
                    : "No assets match these filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const Icon = ASSET_TYPE_ICON[a.type];
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.id}</TableCell>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      {a.type === "SIM" ? (
                        (a.simNumber || a.carrier) && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {a.simNumber || "—"}
                            {a.carrier ? ` · ${a.carrier}` : ""}
                            {a.plan ? ` · ${a.plan}` : ""}
                          </div>
                        )
                      ) : (
                        a.serialNo && (
                          <div className="text-[11px] text-muted-foreground">
                            S/N {a.serialNo}
                          </div>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {ASSET_TYPE_LABEL[a.type]}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px]">
                        {STATUS_LABEL[a.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a.assignedTo || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.purchaseDate || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {a.type === "SIM" ? (
                        a.monthlyCost ? (
                          <>
                            ₹{formatINR(a.monthlyCost)}
                            <span className="text-[10px] text-muted-foreground font-normal">
                              /mo
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <>₹{formatINR(a.value)}</>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AssetDialog
        open={editing != null}
        draft={editing}
        onCancel={() => setEditing(null)}
        onSave={onSave}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  This will permanently remove <strong>{deleting.id}</strong> ·{" "}
                  {deleting.name} from the register. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && onDelete(deleting)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: "text-gray-900",
    primary: "text-blue-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
  } as const;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass[tone]}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetDialog({
  open,
  draft,
  onCancel,
  onSave,
}: {
  open: boolean;
  draft: Asset | null;
  onCancel: () => void;
  onSave: (a: Asset) => void;
}) {
  const [form, setForm] = useState<Asset>(EMPTY);
  useEffect(() => {
    if (draft) setForm(draft);
  }, [draft]);

  const isEdit = !!draft?.id;

  const isSim = form.type === "SIM";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update details for ${form.id}.`
              : isSim
                ? "Register a corporate SIM. ID is generated automatically."
                : "Register a new physical asset. ID is generated automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as AssetType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ASSET_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as AssetStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABEL) as AssetStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                isSim
                  ? "e.g. Corporate SIM — Airtel Postpaid"
                  : "e.g. Dell Latitude 7430"
              }
            />
          </div>

          {isSim ? (
            <>
              <div className="col-span-2">
                <Label className="text-xs">SIM number</Label>
                <Input
                  value={form.simNumber ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, simNumber: e.target.value })
                  }
                  placeholder="+91 98765 43210"
                />
              </div>
              <div>
                <Label className="text-xs">Carrier</Label>
                <Input
                  value={form.carrier ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, carrier: e.target.value })
                  }
                  placeholder="Airtel / Jio / Vi"
                />
              </div>
              <div>
                <Label className="text-xs">Plan</Label>
                <Input
                  value={form.plan ?? ""}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  placeholder="Postpaid 999"
                />
              </div>
              <div>
                <Label className="text-xs">Monthly cost (₹)</Label>
                <Input
                  type="number"
                  value={form.monthlyCost || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      monthlyCost: Number(e.target.value) || 0,
                    })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">IMEI of paired device</Label>
                <Input
                  value={form.imei ?? ""}
                  onChange={(e) => setForm({ ...form, imei: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2">
                <Label className="text-xs">Serial number</Label>
                <Input
                  value={form.serialNo}
                  onChange={(e) =>
                    setForm({ ...form, serialNo: e.target.value })
                  }
                  placeholder="Manufacturer serial / IMEI"
                />
              </div>
              <div>
                <Label className="text-xs">Value (₹)</Label>
                <Input
                  type="number"
                  value={form.value || ""}
                  onChange={(e) =>
                    setForm({ ...form, value: Number(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <div />
            </>
          )}

          <div className="col-span-2">
            <Label className="text-xs">Assigned to</Label>
            <Input
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              placeholder={
                isSim
                  ? "Employee name (leave blank if pool)"
                  : "Employee name (leave blank if unassigned)"
              }
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">
              {isSim ? "Activated on" : "Purchase date"}
            </Label>
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) =>
                setForm({ ...form, purchaseDate: e.target.value })
              }
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)}>
            {isEdit ? "Save changes" : isSim ? "Add SIM" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
