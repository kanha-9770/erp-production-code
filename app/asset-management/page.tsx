"use client";

/**
 * Asset Management — Premium Workspace Layout.
 * Tracks physical assets (laptops, monitors, etc.) and corporate SIMs.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Package, Plus, Search, Pencil, Trash2, Laptop, Smartphone, Monitor,
  Headphones, HardDrive, Calendar, User, IndianRupee, Tag, Info,
  MoreVertical, Filter, Smartphone as SimIcon, ShieldCheck,
  Computer, Tablet, Keyboard, Mouse, Printer, Camera, Car, Armchair,
  IdCard, ExternalLink, X as XIcon,
} from "lucide-react";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  SelectFilter, ActiveFilterPills,
  ViewsBar, useSavedViews,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

// --- Types & Constants ---

// Asset categories — mirrors the dynamic form-builder Asset Management
// dropdown so users see the same options in both surfaces. Keep SIM in the
// list since the form has a dedicated SIM details section that's
// triggered when the user selects this type. PHONE/ACCESSORY are kept as
// legacy aliases so existing localStorage data (saved before this list
// expanded) still loads without re-categorizing.
type AssetType =
  | "LAPTOP"
  | "DESKTOP"
  | "MOBILE_PHONE"
  | "TABLET"
  | "MONITOR"
  | "HEADPHONE"
  | "KEYBOARD"
  | "MOUSE"
  | "PRINTER"
  | "CAMERA"
  | "VEHICLE"
  | "FURNITURE"
  | "ID_CARD"
  | "SIM"
  | "OTHER"
  // Legacy aliases — accepted on read so old localStorage records still
  // hydrate, but not surfaced in the dropdown.
  | "PHONE"
  | "ACCESSORY";
type AssetStatus = "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";
type PlanType = "CORPORATE" | "INDIVIDUAL";
type SimType = "PREPAID" | "POSTPAID";
type SimStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LOST";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  purchaseDate: string;
  value: number;
  notes: string;

  // User & assignment — every asset (incl. SIM) can be assigned to an employee.
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  assignedTo?: string; // legacy single-string field kept for back-compat

  // Non-SIM physical fields.
  serialNo: string;
  assetModel?: string;
  configuration?: string;

  // SIM-specific fields. Drawn from the SIM Management screen — surfaced
  // only when type === "SIM" so the form swap happens cleanly on dropdown
  // change.
  countryCode?: string;
  simNumber?: string;       // Mobile No.
  imsiNumber?: string;
  imei?: string;
  carrier?: string;          // Service Provider
  simType?: SimType;
  planType?: string;
  simIssueBy?: string;
  simLocation?: string;
  simStatus?: SimStatus;
  plan?: PlanType;
  rechargeDate?: string;
  rechargeAmount?: number;
  monthlyCost?: number;
}

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  LAPTOP: "Laptop",
  DESKTOP: "Desktop",
  MOBILE_PHONE: "Mobile Phone",
  TABLET: "Tablet",
  MONITOR: "Monitor",
  HEADPHONE: "Headphone",
  KEYBOARD: "Keyboard",
  MOUSE: "Mouse",
  PRINTER: "Printer",
  CAMERA: "Camera",
  VEHICLE: "Vehicle",
  FURNITURE: "Furniture",
  ID_CARD: "ID Card",
  SIM: "SIM card",
  OTHER: "Other",
  // Legacy aliases — labels shown as fallbacks in the table when an old
  // record loads. They never appear in the dropdown.
  PHONE: "Phone (legacy)",
  ACCESSORY: "Accessory (legacy)",
};

const ASSET_TYPE_ICON: Record<AssetType, any> = {
  LAPTOP: Laptop,
  DESKTOP: Computer,
  MOBILE_PHONE: Smartphone,
  TABLET: Tablet,
  MONITOR: Monitor,
  HEADPHONE: Headphones,
  KEYBOARD: Keyboard,
  MOUSE: Mouse,
  PRINTER: Printer,
  CAMERA: Camera,
  VEHICLE: Car,
  FURNITURE: Armchair,
  ID_CARD: IdCard,
  SIM: SimIcon,
  OTHER: HardDrive,
  PHONE: Smartphone,
  ACCESSORY: Headphones,
};

const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "RETIRED", label: "Retired" },
];

// Filter out the legacy aliases so the dropdown only shows the canonical
// list. Legacy values still render correctly in the table/preview via the
// label and icon maps above.
const LEGACY_ASSET_TYPES: ReadonlySet<AssetType> = new Set(["PHONE", "ACCESSORY"]);
const TYPE_OPTIONS = (Object.keys(ASSET_TYPE_LABEL) as AssetType[])
  .filter((t) => !LEGACY_ASSET_TYPES.has(t))
  .map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }));

const CARRIER_OPTIONS = ["Airtel", "Jio", "Vi", "BSNL", "MTNL"] as const;
const COUNTRY_CODE_OPTIONS = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "US (+1)" },
  { code: "+44", label: "UK (+44)" },
];

// Common departments — drives the Department dropdown. Free-text fallback
// is exposed via the "+ Add new" item so HR can register a fresh dept
// without leaving the form.
const DEPARTMENT_OPTIONS = [
  "Engineering",
  "Sales",
  "Marketing",
  "Operations",
  "HR",
  "Finance",
  "IT",
  "Production",
  "Admin",
  "Customer Support",
];

const SIM_TYPE_OPTIONS: { value: SimType; label: string }[] = [
  { value: "PREPAID", label: "Prepaid" },
  { value: "POSTPAID", label: "Postpaid" },
];

const SIM_STATUS_OPTIONS: { value: SimStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "LOST", label: "Lost / Damaged" },
];

const PLAN_TYPE_OPTIONS: { value: PlanType; label: string }[] = [
  { value: "CORPORATE", label: "Corporate" },
  { value: "INDIVIDUAL", label: "Individual" },
];

const STORAGE_KEY = "asset-management:v3";

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
    id: "AST-0004",
    name: "Sales team primary line",
    type: "SIM",
    serialNo: "",
    status: "ASSIGNED",
    assignedTo: "Riya Sharma",
    purchaseDate: "2024-08-15",
    value: 0,
    notes: "Unlimited data + roaming",
    countryCode: "+91",
    simNumber: "98765 43210",
    carrier: "Airtel",
    plan: "CORPORATE",
    monthlyCost: 999,
  },
];

// --- Helper Functions ---

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

function displayName(a: Asset) {
  if (a.name?.trim()) return a.name.trim();
  if (a.type === "SIM") {
    const last4 = (a.simNumber ?? "").replace(/\D/g, "").slice(-4);
    return a.carrier ? `SIM · ${a.carrier} · ●●●● ${last4}` : `SIM · ●●●● ${last4}`;
  }
  return ASSET_TYPE_LABEL[a.type];
}

const EMPTY: Asset = {
  id: "",
  name: "",
  type: "LAPTOP",
  status: "AVAILABLE",
  purchaseDate: new Date().toISOString().slice(0, 10),
  value: 0,
  notes: "",
  serialNo: "",
  assetModel: "",
  configuration: "",
  employeeId: "",
  firstName: "",
  lastName: "",
  department: "",
  assignedTo: "",
  countryCode: "+91",
  simNumber: "",
  imsiNumber: "",
  carrier: "Airtel",
  simType: "POSTPAID",
  planType: "",
  simIssueBy: "",
  simLocation: "",
  simStatus: "ACTIVE",
  plan: "CORPORATE",
  rechargeDate: "",
  rechargeAmount: 0,
  monthlyCost: 0,
};

// --- Main Component ---

export default function AssetManagementPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({ search: "", type: "", status: "" });
  const [searchInput, setSearchInput] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const views = useSavedViews<typeof filters>("asset-management");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
      else setItems(SEED);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loading]);

  const filterFields: FilterField[] = useMemo(() => [
    { id: "id", label: "Asset ID", type: "text" },
    { id: "name", label: "Name", type: "text" },
    { id: "type", label: "Type", type: "select", options: TYPE_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "assignedTo", label: "Assigned To", type: "text" },
    { id: "value", label: "Value", type: "number" },
    // Employee assignment
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "department", label: "Department", type: "text" },
    // Asset-physical
    { id: "serialNo", label: "Serial Number", type: "text" },
    { id: "assetModel", label: "Model", type: "text" },
    // SIM-specific
    { id: "simNumber", label: "Mobile No.", type: "text" },
    { id: "imsiNumber", label: "IMSI Number", type: "text" },
    { id: "carrier", label: "Service Provider", type: "text" },
    {
      id: "simType",
      label: "SIM Type",
      type: "select",
      options: SIM_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      id: "simStatus",
      label: "SIM Status",
      type: "select",
      options: SIM_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    { id: "rechargeAmount", label: "Recharge Amount", type: "number" },
    { id: "monthlyCost", label: "Monthly Cost", type: "number" },
  ], []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.assignedTo ?? "").toLowerCase().includes(q) ||
        (a.firstName ?? "").toLowerCase().includes(q) ||
        (a.lastName ?? "").toLowerCase().includes(q) ||
        (a.employeeId ?? "").toLowerCase().includes(q) ||
        (a.department ?? "").toLowerCase().includes(q) ||
        (a.simNumber ?? "").toLowerCase().includes(q) ||
        a.serialNo.toLowerCase().includes(q)
      );
    }
    // Case-insensitive + trimmed match — defensive against any rows where
    // type/status was saved in a different case (legacy data, manual JSON
    // edits, etc.). Without this, `a.type === filters.type` silently drops
    // rows that look identical to the human eye.
    if (filters.type) {
      const want = filters.type.trim().toUpperCase();
      result = result.filter(a => (a.type ?? "").toString().trim().toUpperCase() === want);
    }
    if (filters.status) {
      const want = filters.status.trim().toUpperCase();
      result = result.filter(a => (a.status ?? "").toString().trim().toUpperCase() === want);
    }
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [items, filters, conditions, filterFields]);

  // Clear the selection when the currently-selected asset is no longer in
  // the filtered list. Without this the preview pane keeps rendering the
  // previously-selected asset alongside an "empty" or "wrong-type" table,
  // which looks like the filter is broken (a stale row appears beside the
  // freshly-filtered list).
  useEffect(() => {
    if (!selectedId) return;
    if (!filteredItems.some((a) => a.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredItems, selectedId]);

  const columns: ColumnDef<Asset>[] = useMemo(() => [
    {
      id: "id",
      header: "Asset ID",
      width: 120,
      pinned: true,
      cell: (a) => <span className="font-mono text-[11px] font-bold text-muted-foreground uppercase">{a.id}</span>,
    },
    {
      id: "name",
      header: "Asset Name / Info",
      width: 300,
      cell: (a) => {
        const Icon = ASSET_TYPE_ICON[a.type];
        return (
          <div className="flex items-center gap-3 min-w-0">
             <div className="p-2 rounded-lg bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-primary transition-colors">
                <Icon className="h-4 w-4" />
             </div>
             <div className="min-w-0">
                <div className="font-semibold truncate uppercase text-[12px]">{displayName(a)}</div>
                <div className="text-[10px] text-muted-foreground truncate uppercase">{a.type === 'SIM' ? a.carrier : `S/N: ${a.serialNo || 'N/A'}`}</div>
             </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      // Floor wide enough for "UNDER REPAIR" — the longest badge label.
      minWidth: 130,
      cell: (a) => {
        const colors: Record<string, string> = {
          AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
          ASSIGNED: "bg-blue-100 text-blue-800 border-blue-200",
          UNDER_REPAIR: "bg-amber-100 text-amber-800 border-amber-200",
          RETIRED: "bg-slate-100 text-slate-800 border-slate-200",
        };
        return (
          <Badge
            variant="outline"
            className={`${colors[a.status]} text-[10px] font-bold uppercase whitespace-nowrap`}
          >
            {a.status.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      id: "assignedTo",
      header: "Assignee",
      width: 180,
      cell: (a) => (
        <div className="flex items-center gap-2">
           <User className="h-3.5 w-3.5 text-muted-foreground" />
           <span className="text-xs font-medium">{a.assignedTo || "—"}</span>
        </div>
      ),
    },
    {
      id: "value",
      header: "Value / Cost",
      width: 140,
      cell: (a) => (
        <div className="font-mono text-xs font-semibold tabular-nums">
           ₹{formatINR(a.type === 'SIM' ? (a.monthlyCost || 0) : a.value)}
           {a.type === 'SIM' && <span className="text-[10px] text-muted-foreground ml-1">/MO</span>}
        </div>
      ),
    },
    {
      id: "type",
      header: "Asset Type",
      width: 120,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="text-xs font-medium uppercase">{ASSET_TYPE_LABEL[a.type] || a.type}</span>,
    },
    {
      id: "serialNo",
      header: "Serial Number",
      width: 150,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="font-mono text-xs text-muted-foreground">{a.serialNo || "—"}</span>,
    },
    {
      id: "purchaseDate",
      header: "Purchase Date",
      width: 130,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="text-xs">{new Date(a.purchaseDate).toLocaleDateString("en-IN")}</span>,
    },
    {
      id: "assetModel",
      header: "Model",
      width: 150,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="text-xs">{a.assetModel || "—"}</span>,
    },
    {
      id: "configuration",
      header: "Configuration",
      width: 180,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="text-xs text-muted-foreground">{a.configuration || "—"}</span>,
    },
    {
      id: "notes",
      header: "Notes",
      width: 200,
      defaultHidden: true,
      group: "Asset",
      cell: (a) => <span className="text-xs text-muted-foreground truncate">{a.notes || "—"}</span>,
    },

    // ── Employee assignment columns ────────────────────────────────────
    // Same data the form's "User & Assignment" section collects.
    {
      id: "employeeId",
      header: "Employee ID",
      width: 130,
      defaultHidden: true,
      group: "User & Assignment",
      cell: (a) => <span className="font-mono text-xs text-muted-foreground">{a.employeeId || "—"}</span>,
    },
    {
      id: "firstName",
      header: "First Name",
      width: 130,
      defaultHidden: true,
      group: "User & Assignment",
      cell: (a) => <span className="text-xs">{a.firstName || "—"}</span>,
    },
    {
      id: "lastName",
      header: "Last Name",
      width: 130,
      defaultHidden: true,
      group: "User & Assignment",
      cell: (a) => <span className="text-xs">{a.lastName || "—"}</span>,
    },
    {
      id: "department",
      header: "Department",
      width: 140,
      defaultHidden: true,
      group: "User & Assignment",
      cell: (a) => <span className="text-xs">{a.department || "—"}</span>,
    },

    // ── SIM-card columns ────────────────────────────────────────────────
    // Populated only when type === "SIM"; non-SIM rows show "—".
    {
      id: "mobileNo",
      header: "Mobile No.",
      width: 160,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => {
        if (a.type !== "SIM") return <span className="text-xs text-muted-foreground">—</span>;
        const num = `${a.countryCode ?? ""} ${a.simNumber ?? ""}`.trim();
        return <span className="font-mono text-xs">{num || "—"}</span>;
      },
    },
    {
      id: "imsiNumber",
      header: "IMSI Number",
      width: 160,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="font-mono text-xs text-muted-foreground">{a.imsiNumber || "—"}</span>,
    },
    {
      id: "carrier",
      header: "Service Provider",
      width: 140,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs">{a.carrier || "—"}</span>,
    },
    {
      id: "simType",
      header: "SIM Type",
      width: 110,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs uppercase">{a.simType ?? "—"}</span>,
    },
    {
      id: "planType",
      header: "Plan Type",
      width: 140,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs">{a.planType || "—"}</span>,
    },
    {
      id: "plan",
      header: "Plan Category",
      width: 130,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs">{a.plan ?? "—"}</span>,
    },
    {
      id: "simIssueBy",
      header: "SIM Issued By",
      width: 150,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs">{a.simIssueBy || "—"}</span>,
    },
    {
      id: "simLocation",
      header: "SIM Location",
      width: 150,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => <span className="text-xs">{a.simLocation || "—"}</span>,
    },
    {
      id: "simStatus",
      header: "SIM Status",
      width: 130,
      minWidth: 110,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => {
        if (!a.simStatus) return <span className="text-xs text-muted-foreground">—</span>;
        const colors: Record<string, string> = {
          ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
          INACTIVE: "bg-slate-100 text-slate-800 border-slate-200",
          SUSPENDED: "bg-amber-100 text-amber-800 border-amber-200",
          LOST: "bg-red-100 text-red-800 border-red-200",
        };
        return (
          <Badge
            variant="outline"
            className={`${colors[a.simStatus]} text-[10px] font-bold uppercase whitespace-nowrap`}
          >
            {a.simStatus}
          </Badge>
        );
      },
    },
    {
      id: "rechargeDate",
      header: "Recharge Date",
      width: 130,
      defaultHidden: true,
      group: "SIM Details",
      cell: (a) => (
        <span className="text-xs">
          {a.rechargeDate
            ? new Date(a.rechargeDate).toLocaleDateString("en-IN")
            : "—"}
        </span>
      ),
    },
    {
      id: "rechargeAmount",
      header: "Recharge Amount",
      width: 140,
      defaultHidden: true,
      align: "right",
      group: "SIM Details",
      cell: (a) =>
        a.rechargeAmount ? (
          <span className="font-mono text-xs tabular-nums">₹{formatINR(a.rechargeAmount)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "monthlyCost",
      header: "Monthly Cost",
      width: 130,
      defaultHidden: true,
      align: "right",
      group: "SIM Details",
      cell: (a) =>
        a.monthlyCost ? (
          <span className="font-mono text-xs tabular-nums">₹{formatINR(a.monthlyCost)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ], []);

  // Auto-mint Asset ID when the user leaves it blank or set to the sentinel
  // "AUTO". Otherwise respect what they typed — the form treats Asset ID as
  // a required user-editable field (matches the screenshot's red error).
  const nextAssetId = () => {
    const used = new Set(items.map((i) => i.id));
    let n = items.length + 1;
    while (used.has(`AST-${String(n).padStart(4, "0")}`)) n++;
    return `AST-${String(n).padStart(4, "0")}`;
  };

  const handleSave = (draft: Asset) => {
    // SIM Status drives the asset-level status so the table filter chips and
    // the AVAILABLE/ASSIGNED/UNDER_REPAIR/RETIRED counts stay accurate for
    // SIMs too. Non-SIM assets use the status the form set directly.
    const derivedStatus: AssetStatus =
      draft.type === "SIM"
        ? draft.simStatus === "ACTIVE"
          ? "ASSIGNED"
          : draft.simStatus === "SUSPENDED"
            ? "UNDER_REPAIR"
            : draft.simStatus === "LOST"
              ? "RETIRED"
              : "AVAILABLE"
        : draft.status;

    if (editingId) {
      const finalId = draft.id?.trim() && draft.id !== "AUTO" ? draft.id : editingId;
      const next = { ...draft, id: finalId, status: derivedStatus };
      setItems(items.map((i) => (i.id === editingId ? next : i)));
      toast({ title: "Asset Updated", description: `${finalId} successfully updated.` });
    } else {
      const typed = draft.id?.trim();
      const finalId = typed && typed !== "AUTO" ? typed : nextAssetId();
      const final = { ...draft, id: finalId, status: derivedStatus };
      setItems([final, ...items]);
      toast({ title: "Asset Created", description: `${finalId} added to register.` });
    }
    setFormOpen(false);
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deletingId) return;
    setItems(items.filter(i => i.id !== deletingId));
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
    toast({ title: "Asset Deleted", variant: "destructive" });
  };

  return (
    <>
      <WorkspaceShell
        scope="asset-management"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Package className="h-5 w-5 text-slate-600" />}
              title="Asset Management"
              subtitle={`${filteredItems.length} assets registered`}
            >
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 relative shrink-0"
                    aria-label="Search"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {filters.search && (
                      <span
                        aria-hidden
                        className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={6} className="w-72 p-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search assets..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setFilters(f => ({ ...f, search: searchInput }));
                        if (e.key === "Escape") { setSearchInput(""); setFilters(f => ({ ...f, search: "" })); }
                      }}
                      autoFocus
                      className="pl-8 pr-7 h-8 w-full text-sm"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(""); setFilters(f => ({ ...f, search: "" })); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="asset-management"
                columns={columns}
                variant="dialog"
              />
              <Button
                size="sm"
                className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                onClick={() => { setEditingId(null); setFormOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Add Asset</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </WorkspaceHeader>

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2">
              <ViewsBar
                views={views.views}
                activeId={views.activeId}
                onSelect={(id) => {
                   views.select(id);
                   const v = views.views.find(x => x.id === id);
                   if (v) { setFilters(v.filters); setSearchInput(v.filters.search); }
                   else { setFilters({ search: "", type: "", status: "" }); setSearchInput(""); }
                }}
                onSave={(name) => views.save(name, filters)}
                onDelete={views.remove}
                isDirty={JSON.stringify(views.views.find(v => v.id === views.activeId)?.filters ?? { search: "", type: "", status: "" }) !== JSON.stringify(filters)}
              />
            </div>

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2 border-t pt-2">
              <SelectFilter label="Type" value={filters.type} onChange={(v) => setFilters(f => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
              <SelectFilter label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={STATUS_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters({ search: "", type: "", status: "" }); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<Asset>
            tableId="asset-management"
            columns={columns}
            rows={filteredItems}
            rowId={(a) => a.id}
            pageSize={10}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(a) => setSelectedId(a.id)}
          />
        }
        preview={selectedId ? (
          <AssetPreview 
            id={selectedId} 
            items={items} 
            onEdit={(id) => { setEditingId(id); setFormOpen(true); }} 
            onDelete={(id) => setDeletingId(id)} 
          />
        ) : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} items={items} /> : null}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="uppercase tracking-tight font-bold">{editingId ? 'Edit Asset' : 'Register New Asset'}</SheetTitle>
          </SheetHeader>
          <AssetForm
            initial={editingId ? items.find(i => i.id === editingId) : undefined}
            onCancel={() => setFormOpen(false)}
            onSubmit={handleSave}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the asset record from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Asset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PreviewHeader({ id, items }: { id: string, items: Asset[] }) {
  const a = items.find(x => x.id === id);
  if (!a) return null;
  return (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{a.id}</Badge>
      <span className="font-bold text-sm truncate uppercase tracking-tight">{displayName(a)}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/asset-management/${a.id}`} title="Open full details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function AssetPreview({ id, items, onEdit, onDelete }: { id: string, items: Asset[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const a = items.find(x => x.id === id);
  if (!a) return null;
  const Icon = ASSET_TYPE_ICON[a.type];

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex gap-4">
           <div className={`p-4 rounded-2xl bg-slate-950 text-white shadow-xl`}>
              <Icon className="h-8 w-8" />
           </div>
           <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none mb-1">{displayName(a)}</h2>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{ASSET_TYPE_LABEL[a.type]}</p>
           </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => onEdit(a.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" onClick={() => onDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
         <Card className="p-4 bg-slate-50 border-0 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Status</span>
            <div className="flex items-center gap-2">
               <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
               <span className="font-bold uppercase text-sm tracking-tight">{a.status.replace('_', ' ')}</span>
            </div>
         </Card>
         <Card className="p-4 bg-slate-50 border-0 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Valuation</span>
            <div className="flex items-baseline gap-1">
               <span className="text-lg font-black tabular-nums">₹{formatINR(a.type === 'SIM' ? (a.monthlyCost || 0) : a.value)}</span>
               {a.type === 'SIM' && <span className="text-[10px] font-bold text-muted-foreground">/MO</span>}
            </div>
         </Card>
      </div>

      <div className="space-y-6">
         <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 border-b pb-2">Technical Specifications</h3>
         <div className="grid grid-cols-2 gap-y-6">
            {a.type !== 'SIM' ? (
               <>
                  <Fact label="Serial Number" value={a.serialNo || "NOT RECORDED"} icon={Tag} />
                  <Fact label="Asset Model" value={a.assetModel || "NOT RECORDED"} icon={Tag} />
                  <Fact label="Purchase Date" value={a.purchaseDate} icon={Calendar} />
                  <Fact label="Configuration" value={a.configuration || "—"} icon={Info} />
                  <Fact label="Assignee" value={a.assignedTo || "UNASSIGNED"} icon={User} />
                  <Fact label="Employee ID" value={a.employeeId || "—"} icon={User} />
                  <Fact label="Department" value={a.department || "—"} icon={ShieldCheck} />
               </>
            ) : (
               <>
                  <Fact label="Mobile No." value={`${a.countryCode ?? ""} ${a.simNumber ?? ""}`.trim() || "—"} icon={SimIcon} />
                  <Fact label="IMSI" value={a.imsiNumber || "N/A"} icon={Info} />
                  <Fact label="Service Provider" value={a.carrier || "N/A"} icon={SimIcon} />
                  <Fact label="SIM Type" value={a.simType || "N/A"} icon={ShieldCheck} />
                  <Fact label="Plan Type" value={a.planType || "—"} icon={ShieldCheck} />
                  <Fact label="Plan Category" value={a.plan || "—"} icon={ShieldCheck} />
                  <Fact label="SIM Issue By" value={a.simIssueBy || "—"} icon={Info} />
                  <Fact label="SIM Location" value={a.simLocation || "—"} icon={Info} />
                  <Fact label="SIM Status" value={a.simStatus || "—"} icon={ShieldCheck} />
                  <Fact label="Assignee" value={a.assignedTo || "UNASSIGNED"} icon={User} />
                  <Fact label="Department" value={a.department || "—"} icon={ShieldCheck} />
                  <Fact label="Recharge Date" value={a.rechargeDate || "—"} icon={Calendar} />
                  <Fact label="Recharge Amount" value={a.rechargeAmount ? `₹${formatINR(a.rechargeAmount)}` : "—"} icon={IndianRupee} />
               </>
            )}
         </div>
      </div>

      <Card className="p-5 border-0 bg-slate-950 text-slate-400">
         <div className="flex items-start gap-3">
            <Info className="h-4 w-4 mt-1 shrink-0" />
            <div className="space-y-2">
               <span className="text-[10px] font-bold uppercase tracking-widest">Asset Notes</span>
               <p className="text-sm text-slate-200 leading-relaxed italic">{a.notes || "No special notes recorded for this asset."}</p>
            </div>
         </div>
      </Card>
    </div>
  );
}

function AssetForm({ initial, onCancel, onSubmit }: { initial?: Asset, onCancel: () => void, onSubmit: (data: Asset) => void }) {
  const [formData, setFormData] = useState<Asset>(initial ? { ...EMPTY, ...initial } : { ...EMPTY, id: '' });
  const isSim = formData.type === 'SIM';
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Department dropdown supports a "+ Add new" item that flips into a free-
  // text input — keeps HR unblocked when a fresh department appears.
  const [deptMode, setDeptMode] = useState<"select" | "custom">(
    formData.department && !DEPARTMENT_OPTIONS.includes(formData.department) ? "custom" : "select",
  );

  const update = <K extends keyof Asset>(key: K, value: Asset[K]) => {
    setFormData((d) => ({ ...d, [key]: value }));
    // Clear that field's error as soon as the user starts fixing it — same
    // pattern as the screenshots: typing in the field hides the red error.
    if (errors[key as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as string];
        return next;
      });
    }
  };

  // Compose the legacy `assignedTo` from first+last so the table column /
  // search index keep working without an extra pass.
  const handleSubmit = () => {
    const next: Record<string, string> = {};
    if (!formData.id?.trim()) next.id = "Asset ID is required";
    if (!formData.type) next.type = "Asset Type is required";
    if (isSim) {
      if (!formData.simNumber?.trim()) next.simNumber = "Mobile No. is required";
      if (!formData.carrier?.trim()) next.carrier = "Service Provider is required";
      if (!formData.simType) next.simType = "SIM Type is required";
      if (!formData.simStatus) next.simStatus = "SIM Status is required";
    } else {
      if (!formData.status) next.status = "Asset Status is required";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const composed = [formData.firstName, formData.lastName].filter((s) => s?.trim()).join(" ").trim();
    onSubmit({ ...formData, assignedTo: composed || formData.assignedTo || "" });
  };

  return (
    <div className="p-6 space-y-8">
      {/* ─── Section 1: Asset / SIM Details ─────────────────────────── */}
      <SectionHeader index={1} title={isSim ? "SIM Details" : "Asset"} subtitle={isSim ? "Number, provider, plan" : "Company asset allocation"} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField label="Asset ID *" error={errors.id}>
          <Input
            value={formData.id || ""}
            onChange={(e) => update("id", e.target.value)}
            placeholder="e.g. AST-0001"
            className={`h-11 ${errors.id ? "border-destructive" : ""}`}
          />
        </FormField>
        <FormField label="Asset Type *" error={errors.type}>
          <Select value={formData.type} onValueChange={(v) => update("type", v as AssetType)}>
            <SelectTrigger className={`h-11 ${errors.type ? "border-destructive" : ""}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* Asset Name / Line Label — always visible. */}
      <FormField label={isSim ? "Line Label" : "Asset Name"}>
        <Input
          value={formData.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder={isSim ? "e.g. Sales Primary Line" : "e.g. MacBook Pro M3"}
          className="h-11"
        />
      </FormField>

      {/* Non-SIM block: serial, model, configuration, value. Hidden when
          Asset Type = SIM, replaced by the SIM block below. */}
      {!isSim && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Asset Serial No.">
              <Input value={formData.serialNo} onChange={(e) => update("serialNo", e.target.value)} className="h-11" />
            </FormField>
            <FormField label="Asset Model">
              <Input value={formData.assetModel} onChange={(e) => update("assetModel", e.target.value)} placeholder="Make/model" className="h-11" />
            </FormField>
          </div>
          <FormField label="Configuration">
            <textarea
              value={formData.configuration}
              onChange={(e) => update("configuration", e.target.value)}
              placeholder="Specifications"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Purchase Date">
              <Input type="date" value={formData.purchaseDate} onChange={(e) => update("purchaseDate", e.target.value)} className="h-11" />
            </FormField>
            <FormField label="Purchase Value (₹)">
              <Input type="number" value={formData.value} onChange={(e) => update("value", Number(e.target.value))} className="h-11 font-mono" />
            </FormField>
          </div>
          <FormField label="Asset Status *" error={errors.status}>
            <Select value={formData.status} onValueChange={(v) => update("status", v as AssetStatus)}>
              <SelectTrigger className={`h-11 ${errors.status ? "border-destructive" : ""}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
        </>
      )}

      {/* SIM block: every field from the SIM Management screen, revealed
          only when Asset Type = SIM. */}
      {isSim && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Mobile No. *" error={errors.simNumber}>
              <div className="flex gap-2">
                <Select value={formData.countryCode} onValueChange={(v) => update("countryCode", v)}>
                  <SelectTrigger className="w-[88px] h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODE_OPTIONS.map((o) => <SelectItem key={o.code} value={o.code}>{o.code}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  value={formData.simNumber}
                  onChange={(e) => update("simNumber", e.target.value.replace(/[^\d\s]/g, ""))}
                  placeholder="98765 43210"
                  className={`h-11 flex-1 ${errors.simNumber ? "border-destructive" : ""}`}
                />
              </div>
            </FormField>
            <FormField label="IMSI Number">
              <Input value={formData.imsiNumber} onChange={(e) => update("imsiNumber", e.target.value)} placeholder="IMSI" className="h-11" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Service Provider *" error={errors.carrier}>
              <Select value={formData.carrier} onValueChange={(v) => update("carrier", v)}>
                <SelectTrigger className={`h-11 ${errors.carrier ? "border-destructive" : ""}`}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIER_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="SIM Type *" error={errors.simType}>
              <Select value={formData.simType} onValueChange={(v) => update("simType", v as SimType)}>
                <SelectTrigger className={`h-11 ${errors.simType ? "border-destructive" : ""}`}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {SIM_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Plan Type">
              <Input value={formData.planType} onChange={(e) => update("planType", e.target.value)} placeholder="Plan name" className="h-11" />
            </FormField>
            <FormField label="Plan Category">
              <Select value={formData.plan} onValueChange={(v) => update("plan", v as PlanType)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="SIM Issue By">
              <Input value={formData.simIssueBy} onChange={(e) => update("simIssueBy", e.target.value)} placeholder="Issuing authority" className="h-11" />
            </FormField>
            <FormField label="SIM Location">
              <Input value={formData.simLocation} onChange={(e) => update("simLocation", e.target.value)} placeholder="Branch / site" className="h-11" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="SIM Status *" error={errors.simStatus}>
              <Select value={formData.simStatus} onValueChange={(v) => update("simStatus", v as SimStatus)}>
                <SelectTrigger className={`h-11 ${errors.simStatus ? "border-destructive" : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIM_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Monthly Cost (₹)">
              <Input type="number" value={formData.monthlyCost} onChange={(e) => update("monthlyCost", Number(e.target.value))} className="h-11 font-mono" />
            </FormField>
          </div>
        </>
      )}

      {/* ─── Section 2: User & Assignment ─────────────────────────────── */}
      <SectionHeader
        index={2}
        title={isSim ? "User & Recharge" : "User & Assignment"}
        subtitle={isSim ? "Assigned employee and recharge history" : "Assigned employee"}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField label="Employee ID">
          <Input value={formData.employeeId} onChange={(e) => update("employeeId", e.target.value)} placeholder="Assigned to" className="h-11" />
        </FormField>
        <FormField label="First Name">
          <Input value={formData.firstName} onChange={(e) => update("firstName", e.target.value)} className="h-11" />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField label="Last Name">
          <Input value={formData.lastName} onChange={(e) => update("lastName", e.target.value)} className="h-11" />
        </FormField>
        <FormField label="Department">
          {deptMode === "select" ? (
            <Select
              value={formData.department || undefined}
              onValueChange={(v) => {
                if (v === "__new__") {
                  setDeptMode("custom");
                  update("department", "");
                  return;
                }
                update("department", v);
              }}
            >
              <SelectTrigger className="h-11"><SelectValue placeholder="Select an option" /></SelectTrigger>
              <SelectContent>
                {/* Surface a legacy free-text value so editing keeps it. */}
                {formData.department && !DEPARTMENT_OPTIONS.includes(formData.department) && (
                  <SelectItem value={formData.department}>{formData.department} (legacy)</SelectItem>
                )}
                {DEPARTMENT_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                <SelectItem value="__new__">+ Add new department…</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input
                value={formData.department}
                onChange={(e) => update("department", e.target.value)}
                placeholder="e.g. Engineering"
                className="h-11 flex-1"
                autoFocus
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setDeptMode("select")}>Pick existing</Button>
            </div>
          )}
        </FormField>
      </div>

      {/* Recharge details — SIM-only. */}
      {isSim && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField label="Recharge Date">
            <Input type="date" value={formData.rechargeDate} onChange={(e) => update("rechargeDate", e.target.value)} className="h-11" />
          </FormField>
          <FormField label="Recharge Amount (₹)">
            <Input type="number" value={formData.rechargeAmount} onChange={(e) => update("rechargeAmount", Number(e.target.value))} className="h-11 font-mono" />
          </FormField>
        </div>
      )}

      <FormField label="Remarks">
        <textarea
          value={formData.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Notes"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </FormField>

      {Object.keys(errors).length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-semibold">Please fix the highlighted fields</span> · {Object.keys(errors).length} {Object.keys(errors).length === 1 ? "issue" : "issues"} above.
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button variant="ghost" onClick={onCancel} className="font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
        <Button
          onClick={handleSubmit}
          className={
            Object.keys(errors).length > 0
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95"
              : "bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95"
          }
        >
          {Object.keys(errors).length > 0 ? "Fix Errors" : initial ? 'Update Asset' : 'Register Asset'}
        </Button>
      </div>
    </div>
  );
}

function SectionHeader({ index, title, subtitle }: { index: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 pt-2">
      <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{index}</span>
      <div>
        <p className="text-base font-semibold leading-tight">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function FormField({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label.replace(/\s\*$/, "")}
        {label.endsWith("*") && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}

function Fact({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-tight">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
        {value}
      </div>
    </div>
  );
}
