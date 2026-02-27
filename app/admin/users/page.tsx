// app/admin/users/page.tsx
"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, ArrowUp, ArrowDown, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import AdvancedFilterSidebar from "@/components/modules/AdvancedFilterSidebar";

interface User {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  fullName: string;
  avatar: string | null;
  status: string;
  department: string | null;
  joinDate: string | null;
  createdAt: string;
  unitsAndRoles: Array<{ unit: { name: string }; role: { name: string; isAdmin?: boolean } }>;
  permissions: Array<{ id: string; name: string; category: string }>;
}

interface FieldFilter {
  fieldId: string;
  fieldLabel: string;
  fieldType: string;
  operator: string;
  value: any;
  value2?: any;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

const ExcelCell: React.FC<{
  content: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}> = ({ content, isExpanded, onToggleExpand }) => {
  const needsExpand = content.length > 80;
  return (
    <div className="relative group h-full flex items-center">
      <div className={cn("w-full", isExpanded ? "whitespace-normal" : "whitespace-nowrap overflow-hidden text-ellipsis")} title={content}>
        {content || "—"}
      </div>
      {needsExpand && (
        <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-blue-600 text-white rounded p-0.5">
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
};

export default function AdminUsersTable() {
  const { data, isLoading, error } = useSWR<{ success: boolean; data: User[]; count: number }>("/api/api-test", fetcher);
  const users = data?.success ? data.data : [];

  const [searchQuery, setSearchQuery] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [activeFilters, setActiveFilters] = React.useState<FieldFilter[]>([]);
  const [preselectedField, setPreselectedField] = React.useState<string | null>(null);
  const [columnSearchValue, setColumnSearchValue] = React.useState("");
  const [sortField, setSortField] = React.useState("fullName");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const perPage = 25;
  const [expandedCells, setExpandedCells] = React.useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = React.useState<Map<string, number>>(() => new Map([
    ["fullName", 280], ["email", 260], ["department", 180], ["status", 140],
    ["unitsAndRoles", 320], ["joinDate", 160], ["createdAt", 160], ["permissions", 200]
  ]));

  // Define fields exactly as your original RecordsDisplay expects
  const fields = [
    { id: "fullName", originalId: "fullName", label: "Full Name", type: "text", order: 1, sectionTitle: "Info", sectionId: "info", formId: "users", formName: "Users" },
    { id: "email", originalId: "email", label: "Email", type: "email", order: 2, sectionTitle: "Info", sectionId: "info", formId: "users", formName: "Users" },
    { id: "department", originalId: "department", label: "Department", type: "text", order: 3, sectionTitle: "Info", sectionId: "info", formId: "users", formName: "Users" },
    { id: "status", originalId: "status", label: "Status", type: "select", order: 4, sectionTitle: "Info", sectionId: "info", formId: "users", formName: "Users" },
    { id: "unitsAndRoles", originalId: "unitsAndRoles", label: "Units & Roles", type: "text", order: 5, sectionTitle: "Access", sectionId: "access", formId: "users", formName: "Users" },
    { id: "joinDate", originalId: "joinDate", label: "Join Date", type: "date", order: 6, sectionTitle: "Dates", sectionId: "dates", formId: "users", formName: "Users" },
    { id: "createdAt", originalId: "createdAt", label: "Created", type: "date", order: 7, sectionTitle: "Dates", sectionId: "dates", formId: "users", formName: "Users" },
    { id: "permissions", originalId: "permissions", label: "Permissions", type: "text", order: 8, sectionTitle: "Access", sectionId: "access", formId: "users", formName: "Users" },
  ];

  // Sorting
  const sorted = React.useMemo(() => {
    return [...users].sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];

      if (sortField === "fullName") { aVal = a.fullName; bVal = b.fullName; }
      if (sortField === "unitsAndRoles") { aVal = a.unitsAndRoles.length; bVal = b.unitsAndRoles.length; }
      if (sortField === "permissions") { aVal = a.permissions.length; bVal = b.permissions.length; }

      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortOrder]);

  // Filtering (global + advanced)
  const filtered = React.useMemo(() => {
    let result = sorted;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u => 
        u.fullName.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    }

    if (activeFilters.length > 0) {
      result = result.filter(user => {
        return activeFilters.every(f => {
          const value = (user as any)[f.fieldId];
          const str = String(value || "").toLowerCase();
          const filterVal = String(f.value || "").toLowerCase();

          switch (f.operator) {
            case "contains": return str.includes(filterVal);
            case "is": return str === filterVal;
            case "is empty": return !value;
            case "is not empty": return !!value;
            default: return true;
          }
        });
      });
    }

    return result;
  }, [sorted, searchQuery, activeFilters]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
  };

  const openFilter = (fieldId: string) => {
    setPreselectedField(fieldId);
    setIsFilterOpen(true);
  };

  if (isLoading) return <div className="p-10 text-center">Loading users...</div>;
  if (error) return <div className="p-10 text-center text-red-600">Failed to load</div>;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Your original AdvancedFilterSidebar — 100% untouched */}
      <AdvancedFilterSidebar
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        fields={fields}
        filters={activeFilters}
        onFiltersChange={setActiveFilters}
        isMergedMode={false}
        preselectedFieldId={preselectedField}
        onColumnSearch={(fieldId, value) => setColumnSearchValue(value)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Card className="border-none rounded-none shadow-none bg-transparent flex-1">
          <CardContent className="p-6 space-y-6 flex-1 flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="outline" onClick={() => setIsFilterOpen(true)} className={cn(activeFilters.length && "border-blue-500 bg-blue-50")}>
                <Filter className="h-4 w-4 mr-2" />
                Filters {activeFilters.length ? `(${activeFilters.length})` : ""}
              </Button>
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="text-sm font-medium">{filtered.length} users</div>
            </div>

            {/* Active Filters */}
            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg border">
                {activeFilters.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {f.fieldLabel} {f.operator} {f.value}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setActiveFilters(activeFilters.filter((_, x) => x !== i))} />
                  </Badge>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setActiveFilters([])}>Clear</Button>
              </div>
            )}

            {/* Table */}
            <div className="border rounded-xl overflow-hidden shadow-lg bg-white flex-1 flex flex-col">
              <div className="overflow-auto flex-1">
                <div className="inline-block min-w-full">
                  <div className="flex bg-gradient-to-r from-slate-100 to-gray-100 border-b-2 border-gray-300 sticky top-0 z-10">
                    <div className="w-12 h-12 border-r flex items-center justify-center"><Checkbox /></div>
                    {fields.map(f => {
                      const width = columnWidths.get(f.id) || 200;
                      return (
                        <div
                          key={f.id}
                          className="relative h-12 border-r px-3 flex items-center justify-between group cursor-pointer hover:bg-blue-50"
                          style={{ width: `${width}px` }}
                          onClick={() => toggleSort(f.id)}
                        >
                          <span className="text-xs font-bold truncate pr-6">{f.label}</span>
                          {sortField === f.id && (sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />)}
                          <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); openFilter(f.id); }}>
                            <Filter className="h-3.5 w-3.5" />
                          </Button>
                          <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const startX = e.clientX;
                              const startW = width;
                              const move = (ev: MouseEvent) => {
                                const newW = Math.max(120, startW + ev.clientX - startX);
                                setColumnWidths(m => new Map(m).set(f.id, newW));
                              };
                              const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
                              document.addEventListener("mousemove", move);
                              document.addEventListener("mouseup", up);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {paginated.map(user => (
                    <div key={user.id} className="flex border-b hover:bg-blue-50/30">
                      <div className="w-12 h-14 border-r flex items-center justify-center"><Checkbox /></div>
                      {/* Full Name */}
                      <div className="h-14 border-r px-3 flex items-center gap-3" style={{ width: columnWidths.get("fullName") }}>
                        <Avatar className="h-8 w-8"><AvatarImage src={user.avatar || ""} /><AvatarFallback>{getInitials(user.fullName)}</AvatarFallback></Avatar>
                        <div><div className="font-medium">{user.fullName}</div><div className="text-xs text-gray-500">@{user.username}</div></div>
                      </div>
                      {/* Email */}
                      <div className="h-14 border-r px-3 flex items-center" style={{ width: columnWidths.get("email") }}>
                        <ExcelCell content={user.email} isExpanded={expandedCells.has(`${user.id}-email`)} onToggleExpand={() => setExpandedCells(s => { const n = new Set(s); n.has(`${user.id}-email`) ? n.delete(`${user.id}-email`) : n.add(`${user.id}-email`); return n; })} />
                      </div>
                      {/* Department */}
                      <div className="h-14 border-r px-3 flex items-center" style={{ width: columnWidths.get("department") }}><ExcelCell content={user.department || "—"} isExpanded={false} onToggleExpand={() => {}} /></div>
                      {/* Status */}
                      <div className="h-14 border-r px-3 flex items-center" style={{ width: columnWidths.get("status") }}><Badge variant={user.status === "ACTIVE" ? "default" : "secondary"}>{user.status}</Badge></div>
                      {/* Units & Roles — comma separated */}
                      <div className="h-14 border-r px-3 flex items-center text-xs" style={{ width: columnWidths.get("unitsAndRoles") }}>
                        <ExcelCell content={user.unitsAndRoles.map(ur => `${ur.unit.name} → ${ur.role.name}`).join(", ")} isExpanded={expandedCells.has(`${user.id}-unitsAndRoles`)} onToggleExpand={() => setExpandedCells(s => { const n = new Set(s); n.has(`${user.id}-unitsAndRoles`) ? n.delete(`${user.id}-unitsAndRoles`) : n.add(`${user.id}-unitsAndRoles`); return n; })} />
                      </div>
                      {/* Join Date */}
                      <div className="h-14 border-r px-3 flex items-center" style={{ width: columnWidths.get("joinDate") }}>{user.joinDate ? new Date(user.joinDate).toLocaleDateString() : "—"}</div>
                      {/* Created */}
                      <div className="h-14 border-r px-3 flex items-center" style={{ width: columnWidths.get("createdAt") }}>{new Date(user.createdAt).toLocaleDateString()}</div>
                      {/* Permissions — comma separated */}
                      <div className="h-14 border-r px-3 flex items-center text-xs" style={{ width: columnWidths.get("permissions") }}>
                        <ExcelCell content={user.permissions.map(p => p.name).join(", ")} isExpanded={expandedCells.has(`${user.id}-permissions`)} onToggleExpand={() => setExpandedCells(s => { const n = new Set(s); n.has(`${user.id}-permissions`) ? n.delete(`${user.id}-permissions`) : n.add(`${user.id}-permissions`); return n; })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pagination */}
              {filtered.length > perPage && (
                <div className="border-t p-4 flex justify-between bg-gray-50">
                  <div className="text-sm">Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={page >= Math.ceil(filtered.length / perPage)} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}