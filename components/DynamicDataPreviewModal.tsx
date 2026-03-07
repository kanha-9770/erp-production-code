import React, { useState, useMemo } from 'react';
import {
  X, Table2, LayoutList, Clock, Search, Download, Layers,
  MoreHorizontal, FileText, Layout, Filter, ChevronDown
} from 'lucide-react';

// --- Interfaces ---
export interface Field {
  id: string;
  label: string;
}

export interface Section {
  id: string;
  title: string;
  fields: Field[];
}

export interface Subform {
  id: string;
  name: string;
  sections: Section[];
}

export interface HierarchyGroup {
  id: string;
  name: string;
  directSections: Section[];
  subforms: Subform[];
}

export interface ProcessedData {
  fieldId: string;
  fieldLabel: string;
  displayValue: any;
}

export interface Record {
  id: string;
  submittedAt: string;
  status: 'approved' | 'rejected' | 'pending' | 'submitted';
  formName?: string;
  processedData: ProcessedData[];
  [key: string]: any;
}

export type ViewType = 'table' | 'page' | 'timeline';

export interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: Record[] | any[];
  title: string;
  hierarchyGroups?: HierarchyGroup[];
}

// --- Helper: Reliable value rendering (Prevents [object Object]) ---
const renderValue = (val: any): string => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') {
    // If it's a specific known object with a label/value, use that
    if (val.displayValue) return String(val.displayValue);
    if (val.label) return String(val.label);
    if (val.name) return String(val.name);
    // Fallback to JSON stringify for debugging or unknown objects
    try {
      return JSON.stringify(val);
    } catch {
      return '[Complex Data]';
    }
  }
  return String(val);
};

const getFieldValue = (row: any, header: string) => {
  if (row.processedData && Array.isArray(row.processedData)) {
    const found = row.processedData.find(
      (pd: any) => pd.fieldLabel === header || pd.fieldId === header
    );
    if (found) return found.displayValue;
  }
  return row[header];
};

const getRecordTitle = (record: Record) => {
  if (!record.processedData) return record.name || record.title || "Record Detail";
  const possibleTitleFields = ["name", "full name", "title", "project name", "customer name"];
  const titleField = record.processedData.find((pd) =>
    possibleTitleFields.some((keyword) => pd.fieldLabel.toLowerCase().includes(keyword)) &&
    pd.displayValue && typeof pd.displayValue === "string" && pd.displayValue.trim()
  );
  return titleField?.displayValue?.trim() || record.formName || `Record #${record.id}`;
};

// --- Sub-View: TableView ---
const TableView: React.FC<{ rows: any[]; headers: string[] }> = ({ rows, headers }) => (
  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden animate-slide-up">
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse table-auto">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-200">
            <th className="px-4 py-3 w-12 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">#</th>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 min-w-[150px]">
                <div className="flex items-center justify-between group cursor-pointer hover:text-slate-900 transition-colors">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-900">
                    {header}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Filter size={10} className="text-slate-400" />
                    <ChevronDown size={10} className="text-slate-400" />
                  </div>
                </div>
              </th>
            ))}
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-slate-50/40 transition-colors group">
              <td className="px-4 py-3.5 text-center text-[11px] font-medium text-slate-300">{idx + 1}</td>
              {headers.map((header) => {
                const val = getFieldValue(row, header);
                const isStatus = header.toLowerCase().includes('status');
                return (
                  <td key={header} className="px-4 py-3.5">
                    {isStatus ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${String(val).toLowerCase().includes('approved') || String(val).toLowerCase().includes('active')
                        ? 'bg-green-50 text-green-700 border-green-100'
                        : String(val).toLowerCase().includes('rejected')
                          ? 'bg-rose-50 text-rose-700 border-rose-100'
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                        {renderValue(val)}
                      </span>
                    ) : (
                      <span className="text-[12px] text-slate-600 font-medium truncate max-w-[240px] block">
                        {renderValue(val)}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-4 py-3.5 text-right">
                <button className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MoreHorizontal size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Sub-View: PageView ---
const PageView: React.FC<{ rows: Record[]; hierarchyGroups?: HierarchyGroup[] }> = ({ rows, hierarchyGroups }) => (
  <div className="space-y-6 animate-slide-up pb-8">
    {rows.map((record, idx) => (
      <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-800">{getRecordTitle(record)}</h3>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border ${record.status === 'approved' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
              {record.status}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
            <Clock size={12} /> {new Date(record.submittedAt).toLocaleDateString()}
          </div>
        </div>

        <div className="p-6 space-y-8">
          {hierarchyGroups ? hierarchyGroups.map(group => (
            <div key={group.id} className="space-y-6">
              <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] border-l-2 border-indigo-500 pl-3">
                {group.name}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {group.directSections.map(sec => (
                  <div key={sec.id} className="space-y-3">
                    {sec.title && <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{sec.title}</h4>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      {sec.fields.map(f => (
                        <div key={f.id} className="space-y-0.5">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{f.label}</label>
                          <div className="text-xs text-slate-700 font-semibold">{renderValue(getFieldValue(record, f.label))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {group.subforms.map(sf => (
                <div key={sf.id} className="bg-slate-50/40 rounded-lg p-4 border border-slate-100 space-y-4">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-2">
                    <FileText size={14} className="text-slate-400" /> {sf.name}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sf.sections.flatMap(s => s.fields).map(f => (
                      <div key={f.id} className="flex justify-between items-center py-1.5 border-b border-white">
                        <span className="text-[11px] text-slate-400 font-medium">{f.label}</span>
                        <span className="text-[11px] text-slate-700 font-bold">{renderValue(getFieldValue(record, f.label))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.keys(record).filter(k => !['_', 'id', 'submittedAt', 'status', 'formName', 'processedData'].includes(k)).map(key => (
                <div key={key} className="space-y-1">
                  <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{key.replace(/_/g, ' ')}</div>
                  <div className="text-[13px] font-semibold text-slate-700">{renderValue(record[key])}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);

// --- Sub-View: TimelineView ---
const TimelineView: React.FC<{ rows: Record[] }> = ({ rows }) => {
  const sorted = [...rows].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  return (
    <div className="max-w-2xl mx-auto py-6 animate-slide-up">
      <div className="relative border-l border-slate-200 ml-4 pl-8 space-y-10">
        {sorted.map((record, idx) => (
          <div key={idx} className="relative">
            <div className="absolute -left-[37px] top-1.5 w-4 h-4 rounded-full bg-white border border-slate-300"></div>
            <div className="mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {new Date(record.submittedAt).toLocaleString()}
              </span>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-5 hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-slate-800 tracking-tight">{getRecordTitle(record)}</h4>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase tracking-widest border border-slate-100">{record.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {record.processedData?.slice(0, 4).map((pd, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="text-slate-400 font-bold text-[9px] uppercase tracking-wider">{pd.fieldLabel}</div>
                    <div className="text-slate-700 font-bold text-[11px] truncate">{renderValue(pd.displayValue)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main Consolidated Modal Component ---
export const DynamicDataPreviewModal2: React.FC<DataPreviewModalProps> = ({
  isOpen, onClose, rows, title, hierarchyGroups
}) => {
  const [activeView, setActiveView] = useState<ViewType>('table');
  const [searchQuery, setSearchQuery] = useState('');

  const headers = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const firstRow = rows[0];
    if (firstRow.processedData && Array.isArray(firstRow.processedData)) {
      const uniqueLabels = Array.from(new Set(rows.flatMap(r => r.processedData.map((pd: any) => pd.fieldLabel))));
      return uniqueLabels.slice(0, 6);
    }
    return Object.keys(firstRow).filter(k => !['_', 'id', 'submittedAt', 'status', 'formName', 'processedData'].includes(k)).slice(0, 6);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(row => {
      if (row.processedData) return row.processedData.some(pd => String(pd.displayValue).toLowerCase().includes(q));
      return Object.values(row).some(v => String(v).toLowerCase().includes(q));
    });
  }, [rows, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 animate-fade-in overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-lg shadow-xl flex flex-col overflow-hidden border border-slate-200 animate-zoom-in">

        <header className="px-8 py-4 flex items-center justify-between border-b border-slate-100 bg-white z-10">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-md bg-slate-900 flex items-center justify-center text-white">
              <Layout size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight leading-none mb-1">{title}</h2>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <Layers size={12} /> {filteredRows.length} Records
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100/60 p-1 rounded-md border border-slate-200/40">
            {(['table', 'page', 'timeline'] as ViewType[]).map((v) => {
              const Icon = v === 'table' ? Table2 : v === 'page' ? LayoutList : Clock;
              const isActive = activeView === v;
              return (
                <button
                  key={v}
                  onClick={() => setActiveView(v)}
                  className={`flex items-center gap-2 px-4 py-1 rounded transition-all font-bold text-[9px] uppercase tracking-widest ${isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                    : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                  <Icon size={12} />
                  <span>{v}</span>
                </button>
              );
            })}
          </div>

          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-600 transition-all">
            <X size={20} />
          </button>
        </header>

        <div className="px-8 py-3 border-b border-slate-100 bg-slate-50/20 flex items-center justify-between">
          <div className="relative w-full max-w-xs group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
            <input
              type="text"
              placeholder="Filter current view..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-slate-100 focus:border-slate-400 text-[12px] font-medium transition-all outline-none"
            />
          </div>
          <button className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all">
            <Download size={14} /> Export
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/10">
          {activeView === 'table' && <TableView rows={filteredRows} headers={headers} />}
          {activeView === 'page' && <PageView rows={filteredRows} hierarchyGroups={hierarchyGroups} />}
          {activeView === 'timeline' && <TimelineView rows={filteredRows} />}
        </main>

        <footer className="px-8 py-3 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Data Preview Mode Active
          </div>
          <button
            onClick={onClose}
            className="px-6 py-1.5 bg-slate-900 text-white font-bold text-[10px] uppercase tracking-widest rounded transition-all hover:bg-slate-800"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
