'use client';

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  MoreHorizontal,
  Eye,
  Trash2,
  Layers,
  Table2,
  Filter,
  GripVertical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { matchesFilter } from "@/lib/filterUtils"
import type { FieldFilter } from "./AdvancedFilterSidebar"
import ViewDetailsModal from "./viewDetailsModal"
import AdvancedFilterSidebar from "./AdvancedFilterSidebar"

// DnD Kit
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// --- Interfaces ---
interface RecordsDisplayProps {
  allModuleForms: any[]
  formRecords: any[]
  formFieldsWithSections: any[]
  recordSearchQuery: string
  recordsPerPage: number
  currentPage: number
  selectedRecords: Set<string>
  getFieldIcon: (fieldType: string) => any
  setRecordSearchQuery: (query: string) => void
  onDeleteRecord: (record: any) => Promise<void>
}

// --- Dialogue Component (ONLY PLACE FOR SUBFORM DATA) ---
const DynamicDataPreviewModal = ({ isOpen, onClose, rows, title }: { isOpen: boolean, onClose: () => void, rows: any[], title: string }) => {
  if (!rows || rows.length === 0) return null;
  const headers = Object.keys(rows[0]).filter(key => !key.startsWith('_'));
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white shadow-2xl">
        <DialogHeader className="p-6 bg-[#d1e7dd] border-b border-gray-400">
          <div className="flex items-center gap-3 text-black">
            <Table2 className="h-6 w-6" />
            <div>
              <DialogTitle className="text-xl font-bold uppercase tracking-tight">{title}</DialogTitle>
              <DialogDescription className="text-gray-700 font-medium">Viewing hidden subform record data.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto px-6 py-6 bg-gray-50/50">
          <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-[#cccccc] border-b border-gray-400 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-black font-bold w-12 text-center border-r border-gray-300">#</th>
                  {headers.map((header) => (
                    <th key={header} className="px-4 py-3 text-black font-bold uppercase text-[11px] border-r border-gray-300 whitespace-nowrap">
                      {header.replace(/([A-Z])/g, ' $1').trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/50">
                    <td className="px-4 py-3 text-gray-500 text-center font-mono text-xs border-r border-gray-200">{idx + 1}</td>
                    {headers.map((header) => (
                      <td key={header} className="px-4 py-3 text-gray-600 border-r border-gray-200">
                        {typeof row[header] === 'object' ? "Nested Data" : String(row[header] || "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter className="bg-gray-100 p-4 border-t border-gray-300">
          <Button variant="outline" onClick={onClose} className="px-8 font-bold border-gray-400 hover:bg-white bg-transparent">CLOSE DIALOGUE</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SortableColumnHeader = ({ field, columnWidths, handleResizeStart, onOpenFilter }: any) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 9999 : 0, opacity: isDragging ? 0.8 : 1 }
  const columnWidth = columnWidths.get(field.id) || 192
  return (
    <div ref={setNodeRef} style={{ width: `${columnWidth}px`, ...style }} className="h-12 border-r border-gray-400 bg-[#cccccc] flex items-center text-[11px] font-bold text-black px-2 group relative flex-shrink-0">
      <div className="flex items-center gap-1 w-full">
        <div ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
          <GripVertical className="h-4 w-4 text-gray-500" />
        </div>
        <span className="truncate uppercase">{field.label}</span>
        {!field.originalId.startsWith('_dynamicRows_') && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenFilter(field.originalId);
            }}
            className="ml-auto flex-shrink-0"
          >
            <Filter className="h-3.5 w-3.5 text-gray-600 hover:text-blue-500" />
          </button>
        )}
      </div>
      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 z-40" onMouseDown={(e) => handleResizeStart(e, field.id, columnWidth)} />
    </div>
  )
}

const RecordsDisplay: React.FC<RecordsDisplayProps> = (props) => {
  const { allModuleForms, formRecords, formFieldsWithSections, recordsPerPage, currentPage, getFieldIcon, recordSearchQuery, setRecordSearchQuery, onDeleteRecord, selectedRecords } = props;
  
  const [viewDetailsOpen, setViewDetailsOpen] = React.useState(false)
  const [selectedRecord, setSelectedRecord] = React.useState<any>(null)
  const [columnWidths, setColumnWidths] = React.useState<Map<string, number>>(new Map())
  const [orderedFields, setOrderedFields] = React.useState<any[]>([])
  const [activeTab, setActiveTab] = React.useState<string>("merged")
  const [resizingColumn, setResizingColumn] = React.useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = React.useState<number>(0)
  const [resizeStartWidth, setResizeStartWidth] = React.useState<number>(0)
  const [previewData, setPreviewData] = React.useState({ isOpen: false, rows: [], title: "" });
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<FieldFilter[]>([]);
  const [preselectedFieldId, setPreselectedFieldId] = React.useState<string | null>(null);
  const [previewColumnFilter, setPreviewColumnFilter] = React.useState<{ fieldId: string; search: string } | null>(null);

  const isMergedMode = activeTab === "merged"

  // Level 2 Group Headers logic
  const headerGroups = React.useMemo(() => {
    const groups: { title: string, width: number, color: string }[] = [];
    if (orderedFields.length === 0) return groups;
    let currentGroup = { title: orderedFields[0].sectionTitle || "General", width: 0 };
    orderedFields.forEach((field, index) => {
      const fieldWidth = columnWidths.get(field.id) || 192;
      if (field.sectionTitle === currentGroup.title) {
        currentGroup.width += fieldWidth;
      } else {
        groups.push({ ...currentGroup, color: groups.length % 2 === 0 ? "bg-[#c3e6cb]" : "bg-[#b19cd9]" });
        currentGroup = { title: field.sectionTitle || "General", width: fieldWidth };
      }
      if (index === orderedFields.length - 1) {
        groups.push({ ...currentGroup, color: groups.length % 2 === 0 ? "bg-[#c3e6cb]" : "bg-[#b19cd9]" });
      }
    });
    return groups;
  }, [orderedFields, columnWidths]);

  const totalFieldsWidth = React.useMemo(() => 
    orderedFields.reduce((acc, field) => acc + (columnWidths.get(field.id) || 192), 0),
  [orderedFields, columnWidths]);

  const buildProcessedData = (rec: any) => {
    return Object.entries(rec.recordData || {}).map(([key, field]: [string, any]) => {
      let label = field.label;
      if (key.startsWith('_dynamicRows_')) {
          const subformId = key.replace('_dynamicRows_', '');
          const foundSub = allModuleForms.flatMap(f => f.sections).flatMap(s => s.subforms).find(sub => sub?.id === subformId);
          label = foundSub?.name || "Subform Data";
      } else if (!label || label.startsWith('cmk')) {
          label = formFieldsWithSections.find(f => f.id === key)?.label || label || key;
      }

      return {
        fieldId: key,
        fieldLabel: label,
        fieldType: field.type || "text",
        value: field.value,
        displayValue: String(field.value || "—"),
        order: field.order ?? 999,
        sectionTitle: field.sectionTitle || "General",
        formId: rec.formId,
        formName: rec.form?.name || "Form"
      };
    });
  };

  const baseRecords = React.useMemo(() => 
    formRecords.map(r => ({ ...r, processedData: buildProcessedData(r) })), 
  [formRecords, activeTab, allModuleForms]);

  // EFFECT: FILTER OUT ALL INSTANCE-SPECIFIC FIELDS
  React.useEffect(() => {
    const fieldMap = new Map<string, any>();
    baseRecords.forEach(record => {
      record.processedData.forEach(pd => {
        const fieldId = pd.fieldId;

        // --- FILTER LOGIC ---
        // 1. Hide fields that contain "__" AND "_instance_" (These are the fields you pasted)
        if (fieldId.includes('__') && fieldId.includes('_instance_')) {
          return;
        }
        
        // 2. Hide internal cryptic IDs that aren't the summary toggle
        if (fieldId.startsWith('cmk') && fieldId.includes('__')) {
            return;
        }

        const uniqueId = isMergedMode ? `${pd.formId}-${fieldId}` : fieldId;
        if (!fieldMap.has(uniqueId)) {
          fieldMap.set(uniqueId, {
            id: uniqueId,
            originalId: fieldId,
            label: isMergedMode ? `${pd.formName} - ${pd.fieldLabel}` : pd.fieldLabel,
            type: pd.fieldType,
            order: pd.order,
            sectionTitle: isMergedMode ? `${pd.formName} - ${pd.sectionTitle}` : pd.sectionTitle,
          });
        }
      });
    });
    setOrderedFields(Array.from(fieldMap.values()).sort((a, b) => a.order - b.order));
  }, [baseRecords, activeTab, isMergedMode]);

  // Column Resizing logic
  React.useEffect(() => {
    if (!resizingColumn) return;
    const move = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX;
      setColumnWidths(prev => new Map(prev).set(resizingColumn, Math.max(80, resizeStartWidth + delta)));
    };
    const up = () => setResizingColumn(null);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const filteredRecords = React.useMemo(() => {
    let records = baseRecords;

    // Apply search query
    if (recordSearchQuery) {
      const lowerQuery = recordSearchQuery.toLowerCase();
      records = records.filter((record) =>
        record.processedData.some((pd: any) => String(pd.value || "").toLowerCase().includes(lowerQuery))
      );
    }

    // Apply persistent filters
    if (filters && filters.length > 0) {
      records = records.filter((record) => {
        for (const filter of filters) {
          // Find matching field in processedData
          const data = record.processedData.find((pd: any) => pd.fieldId === filter.fieldId);
          const value = data ? data.value : null;

          // Apply filter logic
          if (!matchesFilter(value, filter)) {
            return false;
          }
        }
        return true;
      });
    }

    // Apply preview column search if active
    if (previewColumnFilter && previewColumnFilter.search) {
      const { fieldId, search } = previewColumnFilter;
      const lowerSearch = search.toLowerCase();
      records = records.filter((record) => {
        const data = record.processedData.find((pd: any) => pd.fieldId === fieldId);
        const value = data ? String(data.value || "").toLowerCase() : "";
        return value.includes(lowerSearch);
      });
    }

    return records;
  }, [baseRecords, filters, previewColumnFilter, recordSearchQuery]);

  const onOpenFilter = (fieldId: string) => {
    setPreselectedFieldId(fieldId);
    setIsFilterSidebarOpen(true);
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {isFilterSidebarOpen && (
        <AdvancedFilterSidebar
          isOpen={isFilterSidebarOpen}
          onClose={() => {
            setIsFilterSidebarOpen(false);
            setPreselectedFieldId(null);
            setPreviewColumnFilter(null);
          }}
          fields={formFieldsWithSections}
          filters={filters}
          onFiltersChange={setFilters}
          isMergedMode={isMergedMode}
          preselectedFieldId={preselectedFieldId}
          onColumnSearch={(fieldId, searchValue) => setPreviewColumnFilter({ fieldId, search: searchValue })}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="border-none rounded-none shadow-none bg-transparent flex-1 flex flex-col overflow-hidden">
          <CardContent className="p-4 flex-1 flex flex-col min-h-0">
            <div className="border border-gray-300 bg-white rounded-md overflow-hidden shadow-sm flex-1 flex flex-col">
              <div className="flex-1 overflow-auto">
                <DndContext sensors={useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))} onDragEnd={(e) => {
                  if (e.over && e.active.id !== e.over.id) {
                    setOrderedFields(prev => arrayMove(prev, prev.findIndex(f => f.id === e.active.id), prev.findIndex(f => f.id === e.over.id)));
                  }
                }}>
                  <div className="inline-block min-w-max border-collapse">
                    
                    {/* LEVEL 1: FORM NAME */}
                    <div className="flex sticky top-0 z-30 bg-[#d1e7dd] border-b border-gray-400 h-10 items-center justify-center font-bold text-sm text-black uppercase" style={{ width: `${totalFieldsWidth + 172}px` }}>
                       {isMergedMode ? "Consolidated Module Records" : (allModuleForms.find(f => f.id === activeTab)?.name || "Form Records")}
                    </div>

                    {/* LEVEL 2: SECTION NAMES */}
                    <div className="flex sticky top-10 z-30 border-b border-gray-400 h-10">
                      <div className="w-[172px] bg-[#d1e7dd] border-r border-gray-400 flex-shrink-0" />
                      {headerGroups.map((group, i) => (
                        <div key={i} className={cn("flex items-center justify-center text-[11px] font-bold border-r border-gray-400 px-2 truncate", group.color)} style={{ width: `${group.width}px` }}>
                          {group.title}
                        </div>
                      ))}
                    </div>

                    {/* LEVEL 3: FIELD NAMES */}
                    <div className="flex sticky top-20 z-30 border-b-2 border-black">
                      <div className="w-10 h-12 border-r border-gray-400 bg-gray-200 flex items-center justify-center flex-shrink-0"><Checkbox /></div>
                      <div className="w-12 h-12 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">S No.</div>
                      <div className="w-20 h-12 border-r border-gray-400 bg-gray-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">Actions</div>
                      <SortableContext items={orderedFields.map(f => f.id)} strategy={horizontalListSortingStrategy}>
                        {orderedFields.map(field => (
                          <SortableColumnHeader 
                            key={field.id} 
                            field={field} 
                            columnWidths={columnWidths} 
                            handleResizeStart={(e:any, id:any, w:any) => {
                              e.preventDefault(); setResizingColumn(id); setResizeStartX(e.clientX); setResizeStartWidth(w);
                            }}
                            onOpenFilter={onOpenFilter}
                          />
                        ))}
                      </SortableContext>
                    </div>

                    {/* TABLE BODY */}
                    {filteredRecords.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage).map((record, rowIndex) => (
                      <div key={record.id} className="flex border-b border-gray-300 hover:bg-blue-50/50 h-10 items-center">
                        <div className="w-10 h-full border-r border-gray-200 flex items-center justify-center flex-shrink-0"><Checkbox /></div>
                        <div className="w-12 h-full border-r border-gray-200 flex items-center justify-center text-xs bg-gray-50/50 flex-shrink-0">{(currentPage - 1) * recordsPerPage + rowIndex + 1}</div>
                        <div className="w-20 h-full border-r border-gray-200 flex items-center justify-center flex-shrink-0">
                           <Button variant="ghost" className="h-6 w-6 p-0" onClick={() => { setSelectedRecord(record); setViewDetailsOpen(true); }}><Eye className="h-4 w-4" /></Button>
                        </div>
                        {orderedFields.map(fieldDef => {
                          const data = record.processedData.find((pd:any) => pd.fieldId === fieldDef.originalId);
                          const isSummary = fieldDef.originalId.startsWith('_dynamicRows_');

                          return (
                            <div key={fieldDef.id} className="h-full border-r border-gray-200 px-3 flex items-center text-xs truncate bg-white" style={{ width: `${columnWidths.get(fieldDef.id) || 192}px` }}>
                              {isSummary ? (
                                <div 
                                  className="flex items-center gap-2 cursor-pointer text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200 font-bold hover:bg-blue-100"
                                  onClick={() => setPreviewData({ isOpen: true, rows: data.value, title: fieldDef.label })}
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  <span>{data.value?.length || 0} ROWS</span>
                                </div>
                              ) : (
                                <span className="truncate">{data?.displayValue || "—"}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </DndContext>
              </div>

              {/* TABS FOOTER */}
              <div className="border-t border-gray-400 bg-gray-200 px-4 py-1 flex items-center gap-1">
                <button onClick={() => setActiveTab("merged")} className={cn("px-4 py-1 text-[11px] font-bold rounded", activeTab === "merged" ? "bg-white text-blue-700 shadow-sm" : "text-gray-600")}>MERGED VIEW</button>
                {allModuleForms.map(f => (
                  <button key={f.id} onClick={() => setActiveTab(f.id)} className={cn("px-4 py-1 text-[11px] font-bold rounded", activeTab === f.id ? "bg-white text-blue-700 shadow-sm" : "text-gray-600")}>{f.name.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ViewDetailsModal isOpen={viewDetailsOpen} onClose={() => setViewDetailsOpen(false)} record={selectedRecord} />
      <DynamicDataPreviewModal isOpen={previewData.isOpen} onClose={() => setPreviewData(p => ({ ...p, isOpen: false }))} rows={previewData.rows} title={previewData.title} />
    </div>
  )
}

export default RecordsDisplay;
