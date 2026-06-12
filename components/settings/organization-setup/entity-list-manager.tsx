"use client";

/**
 * EntityListManager — generic, persistent CRUD list for the "list" style
 * Organization Setup sections (Locations, Departments, Designations, From
 * Addresses). Driven by a field schema so each section is a thin config.
 *
 * Layout mirrors the Zoho-style master screens:
 *   • Toolbar: "Total Count: N" on the left; Add / Import / Filter on the right.
 *   • Bordered grid table (desktop) + card list (mobile).
 *   • Add / Edit dialog built from `fields`; CSV Import; client-side filter.
 *   • Owner/admin-only editing (mirrors the server); others get a read-only view.
 */

import { useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Lock,
  Upload,
  SlidersHorizontal,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { useOrgSetupSection, newId, type SetupSection } from "./use-org-setup";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "select"
  | "switch";

type Item = Record<string, string | number | boolean> & { id: string };

export interface EntityField {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Build the select options from the other items' primary value (e.g. Parent). */
  optionsFromItems?: boolean;
  /** Show as a column in the table / a line in the mobile card. */
  inTable?: boolean;
  /** Render the value as a Badge in the table. */
  badge?: boolean;
  /** Take the full width of the 2-col dialog grid. */
  span2?: boolean;
  /** Display-only computed column (e.g. "Associated users"). Not editable. */
  compute?: (item: Item) => React.ReactNode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  title: string;
  description: string;
  section: SetupSection;
  fields: EntityField[];
  /** Field key used as the row's primary label (e.g. "name"/"title"). */
  primaryKey: string;
  itemNoun: string;
  icon: LucideIcon;
  /** If set, only one item may have this boolean key === true (e.g. default). */
  enforceSingleTrue?: string;
  /** Show the Import (CSV) button. Default true. */
  importable?: boolean;
}

export function EntityListManager({
  title,
  description,
  section,
  fields,
  primaryKey,
  itemNoun,
  icon: Icon,
  enforceSingleTrue,
  importable = true,
}: Props) {
  const { toast } = useToast();
  const { saved, isOwner, loading, saving, save } = useOrgSetupSection<Item[]>(
    section,
    [],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>(
    {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = Array.isArray(saved) ? saved : [];
  const tableFields = fields.filter((f) => f.inTable);
  // Fields that are user-editable (everything except computed display columns).
  const editableFields = fields.filter((f) => !f.compute);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      tableFields.some((f) => {
        if (f.compute) return false;
        const v = it[f.key];
        return typeof v !== "boolean" && String(v ?? "").toLowerCase().includes(q);
      }),
    );
  }, [items, query, tableFields]);

  // Dynamic options for "parent" style selects: other items' primary values.
  const dynamicOptions = (excludeId?: string) =>
    items
      .filter((it) => it.id !== excludeId)
      .map((it) => String(it[primaryKey] ?? ""))
      .filter(Boolean);

  const openAdd = () => {
    const blank: Record<string, string | number | boolean> = {};
    editableFields.forEach((f) => {
      blank[f.key] = f.type === "switch" ? false : "";
    });
    setDraft(blank);
    setEditing(null);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (item: Item) => {
    const next: Record<string, string | number | boolean> = {};
    editableFields.forEach((f) => {
      const v = item[f.key];
      next[f.key] =
        v === undefined ? (f.type === "switch" ? false : "") : (v as never);
    });
    setDraft(next);
    setEditing(item);
    setErrors({});
    setDialogOpen(true);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    editableFields.forEach((f) => {
      const raw = draft[f.key];
      const str = typeof raw === "string" ? raw.trim() : raw;
      if (f.required && (str === "" || str === undefined)) {
        next[f.key] = `${f.label} is required`;
      } else if (
        f.type === "email" &&
        typeof str === "string" &&
        str.length > 0 &&
        !EMAIL_RE.test(str)
      ) {
        next[f.key] = "Enter a valid email";
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildRecord = (
    src: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> => {
    const record: Record<string, string | number | boolean> = {};
    editableFields.forEach((f) => {
      const raw = src[f.key];
      if (f.type === "switch") {
        record[f.key] = raw === true || raw === "true" || raw === 1;
      } else if (f.type === "number") {
        const n = typeof raw === "string" ? Number(raw) : (raw as number);
        record[f.key] = Number.isFinite(n) ? n : 0;
      } else {
        record[f.key] = typeof raw === "string" ? raw.trim() : String(raw ?? "");
      }
    });
    return record;
  };

  const submit = async () => {
    if (!validate()) return;
    const id = editing?.id ?? newId();
    const item: Item = { ...(buildRecord(draft) as Item), id };

    let nextItems: Item[] = editing
      ? items.map((it) => (it.id === id ? item : it))
      : [...items, item];

    if (enforceSingleTrue && item[enforceSingleTrue] === true) {
      nextItems = nextItems.map((it) =>
        it.id === id ? it : { ...it, [enforceSingleTrue]: false },
      );
    }

    const ok = await save(nextItems);
    if (ok) setDialogOpen(false);
  };

  const handleDeleteClick = (item: Item) => {
    setItemToDelete(item);
  };

  const runDelete = async () => {
    if (!itemToDelete) return;
    const ok = await save(items.filter((it) => it.id !== itemToDelete.id));
    if (ok) setItemToDelete(null);
  };

  // ── CSV import ────────────────────────────────────────────────────────────
  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast({
          title: "Nothing to import",
          description: "The file needs a header row and at least one data row.",
          variant: "destructive",
        });
        return;
      }
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      // Map each header to a field by label or key (case-insensitive).
      const colToField = headers.map((h) =>
        editableFields.find(
          (f) => f.label.toLowerCase() === h || f.key.toLowerCase() === h,
        ),
      );
      if (!colToField.some(Boolean)) {
        toast({
          title: "No matching columns",
          description: `Use headers like: ${editableFields.map((f) => f.label).join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      const imported: Item[] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const src: Record<string, string | number | boolean> = {};
        colToField.forEach((f, c) => {
          if (!f) return;
          src[f.key] = row[c] ?? "";
        });
        const record = buildRecord(src);
        // Skip blank rows (no primary value).
        if (!String(record[primaryKey] ?? "").trim()) continue;
        imported.push({ ...(record as Item), id: newId() });
      }

      if (imported.length === 0) {
        toast({
          title: "Nothing imported",
          description: `Every row was missing a ${itemNoun} name.`,
          variant: "destructive",
        });
        return;
      }

      const ok = await save([...items, ...imported]);
      if (ok) {
        setImportOpen(false);
        toast({
          title: "Imported",
          description: `Added ${imported.length} ${itemNoun}${imported.length === 1 ? "" : "s"}.`,
        });
      }
    } catch {
      toast({
        title: "Import failed",
        description: "Could not read the file.",
        variant: "destructive",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const renderCell = (item: Item, f: EntityField) => {
    if (f.compute) return f.compute(item);
    const v = item[f.key];
    if (f.type === "switch") {
      return v ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent hover:bg-emerald-500/15">
          Yes
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    }
    if (v === undefined || v === "" || v === null)
      return <span className="text-muted-foreground/60">—</span>;
    if (f.badge)
      return (
        <Badge variant="secondary" className="font-normal">
          {String(v)}
        </Badge>
      );
    return <span>{String(v)}</span>;
  };

  return (
    <div>
      <AlertDialog open={itemToDelete !== null} onOpenChange={(open) => { if (!open) setItemToDelete(null); }}>
        <AlertDialogContent className="z-[99999] bg-white border border-slate-200 shadow-xl max-w-[400px] rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Trash2 className="h-5 w-5 text-red-600 shrink-0" />
              Delete &ldquo;{itemToDelete ? String(itemToDelete[primaryKey] ?? "") : ""}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 text-sm text-left">
              Are you sure you want to delete this {itemNoun}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel disabled={saving} className="border border-slate-200 hover:bg-slate-100 font-medium">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runDelete();
              }}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-colors"
            >
              {saving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="text-sm font-medium text-foreground">
          Total Count: <span className="text-primary tabular-nums">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button onClick={openAdd} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1.5" />
              Add {itemNoun}
            </Button>
          )}
          {isOwner && importable && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className={cn("h-9 w-9", showSearch && "bg-muted")}
            aria-label="Filter"
            aria-pressed={showSearch}
            onClick={() => {
              setShowSearch((s) => !s);
              if (showSearch) setQuery("");
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search row (toggled by the filter button) */}
      {showSearch && (
        <div className="relative mb-3 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${itemNoun}s…`}
            className="pl-9 pr-9 h-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!isOwner && !loading && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-3">
          <Lock className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            Only the organization owner or an admin can edit {title.toLowerCase()}.
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Icon}
          itemNoun={itemNoun}
          description={description}
          canAdd={isOwner}
          onAdd={openAdd}
        />
      ) : (
        <>
          {/* Desktop bordered grid */}
          <div className="hidden md:block overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60">
                  {tableFields.map((f) => (
                    <th
                      key={f.key}
                      className="border-b border-r last:border-r-0 px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {f.label}
                    </th>
                  ))}
                  {isOwner && (
                    <th className="border-b w-[80px] px-2 py-2.5" />
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableFields.length + (isOwner ? 1 : 0)}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No {itemNoun}s match “{query}”.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="group hover:bg-muted/30">
                      {tableFields.map((f) => (
                        <td
                          key={f.key}
                          className={cn(
                            "border-b border-r last:border-r-0 px-4 py-3 align-middle",
                            f.key === primaryKey &&
                              "font-medium text-foreground",
                          )}
                        >
                          {renderCell(item, f)}
                        </td>
                      ))}
                      {isOwner && (
                        <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                          <span className="inline-flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(item)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(item)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No {itemNoun}s match “{query}”.
              </p>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border bg-card shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground truncate">
                      {String(item[primaryKey] ?? `Untitled ${itemNoun}`)}
                    </p>
                    {isOwner && (
                      <div className="flex shrink-0 -mr-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(item)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteClick(item)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <dl className="mt-2 space-y-1">
                    {tableFields
                      .filter((f) => f.key !== primaryKey)
                      .map((f) => (
                        <div
                          key={f.key}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <dt className="text-muted-foreground">{f.label}</dt>
                          <dd className="text-right">{renderCell(item, f)}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${itemNoun}` : `Add ${itemNoun}`}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {editableFields.map((f) => {
              const id = `field-${f.key}`;
              const val = draft[f.key];
              const err = errors[f.key];
              const wrapCls =
                f.span2 || f.type === "textarea" ? "sm:col-span-2" : "";
              const selectOptions = f.optionsFromItems
                ? dynamicOptions(editing?.id)
                : (f.options ?? []);
              return (
                <div key={f.key} className={cn("space-y-1.5", wrapCls)}>
                  {f.type === "switch" ? (
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                      <Label htmlFor={id} className="cursor-pointer">
                        {f.label}
                      </Label>
                      <Switch
                        id={id}
                        checked={!!val}
                        onCheckedChange={(c) =>
                          setDraft((d) => ({ ...d, [f.key]: c }))
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <Label htmlFor={id}>
                        {f.label}
                        {f.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </Label>
                      {f.type === "textarea" ? (
                        <Textarea
                          id={id}
                          value={String(val ?? "")}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                          }
                          rows={3}
                        />
                      ) : f.type === "select" || f.optionsFromItems ? (
                        <Select
                          value={(val as string) || undefined}
                          onValueChange={(v) =>
                            setDraft((d) => ({ ...d, [f.key]: v }))
                          }
                        >
                          <SelectTrigger id={id}>
                            <SelectValue
                              placeholder={f.placeholder ?? "Select"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {selectOptions.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No options yet
                              </div>
                            ) : (
                              selectOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={id}
                          type={
                            f.type === "number"
                              ? "number"
                              : f.type === "email"
                                ? "email"
                                : "text"
                          }
                          value={String(val ?? "")}
                          placeholder={f.placeholder}
                          aria-invalid={!!err || undefined}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                          }
                        />
                      )}
                      {err && <p className="text-xs text-destructive">{err}</p>}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving} className="min-w-[110px]">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                `Add ${itemNoun}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import {itemNoun}s</DialogTitle>
            <DialogDescription>
              Upload a CSV with a header row. Recognized columns:{" "}
              <span className="font-medium text-foreground">
                {editableFields.map((f) => f.label).join(", ")}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            className="mt-1 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center hover:bg-muted/40 transition-colors disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6 text-primary" />
            )}
            <span className="text-sm font-medium">
              {saving ? "Importing…" : "Choose a CSV file"}
            </span>
            <span className="text-xs text-muted-foreground">
              or drag &amp; drop is coming — click to browse
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
            }}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  itemNoun,
  description,
  canAdd,
  onAdd,
}: {
  icon: LucideIcon;
  itemNoun: string;
  description: string;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold">No {itemNoun}s yet</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {canAdd && (
        <Button onClick={onAdd} className="mt-5">
          <Plus className="h-4 w-4 mr-1.5" />
          Add your first {itemNoun}
        </Button>
      )}
    </div>
  );
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        val += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(val);
      val = "";
    } else if (c === "\n") {
      cur.push(val);
      rows.push(cur);
      cur = [];
      val = "";
    } else if (c !== "\r") {
      val += c;
    }
  }
  if (val.length > 0 || cur.length > 0) {
    cur.push(val);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
