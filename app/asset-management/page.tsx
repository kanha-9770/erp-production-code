"use client";

/**
 * Asset Management — Premium Workspace Layout.
 * Tracks physical assets (laptops, monitors, etc.) and corporate SIMs.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Package, Plus, Search, Pencil, Trash2, Laptop, Smartphone, Monitor,
  Headphones, HardDrive, Calendar, User, IndianRupee, Tag, Info,
  MoreVertical, Filter, Smartphone as SimIcon, ShieldCheck
} from "lucide-react";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  FilterChips, ActiveFilterPills,
  ViewsBar, useSavedViews,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
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

type AssetType = "LAPTOP" | "PHONE" | "MONITOR" | "ACCESSORY" | "SIM" | "OTHER";
type AssetStatus = "AVAILABLE" | "ASSIGNED" | "UNDER_REPAIR" | "RETIRED";
type PlanType = "CORPORATE" | "INDIVIDUAL";

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
  countryCode?: string;
  simNumber?: string;
  imei?: string;
  carrier?: string;
  plan?: PlanType;
  monthlyCost?: number;
}

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  LAPTOP: "Laptop", PHONE: "Phone", MONITOR: "Monitor", ACCESSORY: "Accessory", SIM: "SIM card", OTHER: "Other"
};

const ASSET_TYPE_ICON: Record<AssetType, any> = {
  LAPTOP: Laptop, PHONE: Smartphone, MONITOR: Monitor, ACCESSORY: Headphones, SIM: SimIcon, OTHER: HardDrive
};

const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "RETIRED", label: "Retired" },
];

const TYPE_OPTIONS = (Object.keys(ASSET_TYPE_LABEL) as AssetType[]).map(t => ({ value: t, label: ASSET_TYPE_LABEL[t] }));

const CARRIER_OPTIONS = ["Airtel", "Jio", "Vi", "BSNL", "MTNL"] as const;
const COUNTRY_CODE_OPTIONS = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "US (+1)" },
  { code: "+44", label: "UK (+44)" },
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
  id: "", name: "", type: "LAPTOP", serialNo: "", status: "AVAILABLE", assignedTo: "",
  purchaseDate: new Date().toISOString().slice(0, 10), value: 0, notes: ""
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
  ], []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(q) || 
        a.id.toLowerCase().includes(q) || 
        a.assignedTo.toLowerCase().includes(q) ||
        a.serialNo.toLowerCase().includes(q)
      );
    }
    if (filters.type) result = result.filter(a => a.type === filters.type);
    if (filters.status) result = result.filter(a => a.status === filters.status);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [items, filters, conditions, filterFields]);

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
      cell: (a) => {
        const colors: Record<string, string> = {
          AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
          ASSIGNED: "bg-blue-100 text-blue-800 border-blue-200",
          UNDER_REPAIR: "bg-amber-100 text-amber-800 border-amber-200",
          RETIRED: "bg-slate-100 text-slate-800 border-slate-200",
        };
        return <Badge variant="outline" className={`${colors[a.status]} text-[10px] font-bold uppercase`}>{a.status.replace('_', ' ')}</Badge>;
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
  ], []);

  const handleSave = (draft: Asset) => {
    if (editingId) {
      setItems(items.map(i => i.id === editingId ? draft : i));
      toast({ title: "Asset Updated", description: `${draft.id} successfully updated.` });
    } else {
      const newId = `AST-${String(items.length + 1).padStart(4, '0')}`;
      const final = { ...draft, id: newId };
      setItems([final, ...items]);
      toast({ title: "Asset Created", description: `${newId} added to register.` });
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
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search assets..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setFilters(f => ({ ...f, search: searchInput }))}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton tableId="asset-management" columns={columns} />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => { setEditingId(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Asset
              </Button>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3">
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

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips label="Type" value={filters.type} onChange={(v) => setFilters(f => ({ ...f, type: v }))} options={TYPE_OPTIONS} />
              <FilterChips label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={STATUS_OPTIONS} />
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
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{a.id}</Badge>
      <span className="font-bold text-sm truncate uppercase tracking-tight">{displayName(a)}</span>
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
                  <Fact label="Purchase Date" value={a.purchaseDate} icon={Calendar} />
                  <Fact label="Assignee" value={a.assignedTo || "UNASSIGNED"} icon={User} />
               </>
            ) : (
               <>
                  <Fact label="SIM Number" value={`${a.countryCode} ${a.simNumber}`} icon={SimIcon} />
                  <Fact label="Carrier" value={a.carrier || "N/A"} icon={SimIcon} />
                  <Fact label="Plan" value={a.plan || "N/A"} icon={ShieldCheck} />
                  <Fact label="IMEI" value={a.imei || "N/A"} icon={Info} />
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
  const [formData, setFormData] = useState<Asset>(initial || { ...EMPTY, id: 'AUTO' });

  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Asset Type</Label>
          <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v as AssetType })}>
            <SelectTrigger className="h-12 border-slate-200 focus:ring-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Status</Label>
          <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as AssetStatus })}>
            <SelectTrigger className="h-12 border-slate-200 focus:ring-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{formData.type === 'SIM' ? 'Line Label' : 'Asset Name'}</Label>
        <Input 
          value={formData.name} 
          onChange={e => setFormData({ ...formData, name: e.target.value })} 
          placeholder={formData.type === 'SIM' ? "e.g. Sales Primary Line" : "e.g. MacBook Pro M3"}
          className="h-12 border-slate-200"
        />
      </div>

      {formData.type !== 'SIM' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Serial Number</Label>
            <Input value={formData.serialNo} onChange={e => setFormData({ ...formData, serialNo: e.target.value })} className="h-12 border-slate-200" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Purchase Value (₹)</Label>
            <Input type="number" value={formData.value} onChange={e => setFormData({ ...formData, value: Number(e.target.value) })} className="h-12 border-slate-200 font-mono" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
             <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">SIM Number</Label>
             <div className="flex gap-2">
                <Select value={formData.countryCode} onValueChange={v => setFormData({...formData, countryCode: v})}>
                   <SelectTrigger className="w-24 h-12 border-slate-200"><SelectValue /></SelectTrigger>
                   <SelectContent>{COUNTRY_CODE_OPTIONS.map(o => <SelectItem key={o.code} value={o.code}>{o.code}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={formData.simNumber} onChange={e => setFormData({ ...formData, simNumber: e.target.value })} className="h-12 border-slate-200 flex-1" />
             </div>
          </div>
          <div className="space-y-2">
             <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Monthly Cost (₹)</Label>
             <Input type="number" value={formData.monthlyCost} onChange={e => setFormData({ ...formData, monthlyCost: Number(e.target.value) })} className="h-12 border-slate-200 font-mono" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Purchase Date</Label>
          <Input type="date" value={formData.purchaseDate} onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} className="h-12 border-slate-200" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Assigned To</Label>
          <Input value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} placeholder="Employee Name" className="h-12 border-slate-200" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Asset Notes</Label>
        <Input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="h-12 border-slate-200" />
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button variant="ghost" onClick={onCancel} className="font-bold uppercase text-[10px] tracking-widest">Cancel</Button>
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           {initial ? 'Update Asset' : 'Register Asset'}
        </Button>
      </div>
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
