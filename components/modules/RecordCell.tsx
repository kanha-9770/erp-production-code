// "use client";
// import React, { memo, useState, useEffect, useMemo } from "react";
// import { ChevronDown, ChevronUp, MessageSquare, Layers, X } from "lucide-react";
// import { cn } from "@/lib/utils";
// import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
// import type {
//   EnhancedFormRecord,
//   FormFieldWithSection,
//   ProcessedFieldData,
//   EditingCell,
//   PendingChange,
//   Comment,
// } from "@/types/records";

// export interface RecordCellProps {
//   record: EnhancedFormRecord;
//   fieldDef: FormFieldWithSection;
//   fieldData: ProcessedFieldData | undefined;
//   pendingChange: PendingChange | undefined;
//   editingCell: EditingCell | null;
//   expandedCells: Set<string>;
//   columnWidth: number;
//   isWrapTextEnabled: boolean;
//   editMode: "locked" | "single-click" | "double-click";
//   canEdit?: boolean;
//   selectedCell: string | null;
//   focusedCell: string | null;
//   comments: Map<string, Comment[]>;
//   getConditionalStyle: (
//     fieldDef: FormFieldWithSection,
//     value: any,
//     displayText: string,
//   ) => React.CSSProperties;
//   handleCellPointerDown: (
//     e: React.PointerEvent<HTMLDivElement>,
//     record: EnhancedFormRecord,
//     fieldDef: FormFieldWithSection,
//   ) => void;
//   renderFieldEditor: (
//     record: EnhancedFormRecord,
//     fieldDef: FormFieldWithSection,
//     actualValue: any,
//     displayText: string,
//   ) => React.ReactNode;
//   onCellClick: (cellKey: string) => void;
//   onContextMenu: (cellKey: string) => void;
//   onPreviewClick: (
//     rows: any[],
//     title: string,
//     fieldDefinitions?: { id: string; label: string; type: string }[],
//   ) => void;
//   onCommentClick: (cellKey: string) => void;
//   toggleCellExpansion: (cellKey: string) => void;
// }

// export const RecordCell = memo(function RecordCell({
//   record,
//   fieldDef,
//   fieldData,
//   pendingChange,
//   editingCell,
//   expandedCells,
//   columnWidth,
//   isWrapTextEnabled,
//   editMode,
//   canEdit = true,
//   selectedCell,
//   focusedCell,
//   comments,
//   getConditionalStyle,
//   handleCellPointerDown,
//   renderFieldEditor,
//   onCellClick,
//   onContextMenu,
//   onPreviewClick,
//   onCommentClick,
//   toggleCellExpansion,
// }: RecordCellProps) {
//   const actualValue = pendingChange ? pendingChange.value : fieldData?.value ?? null;

//   const displayText = useMemo(() => {
//     const val = pendingChange ? pendingChange.value : fieldData?.displayValue ?? fieldData?.value ?? "";
//     if (val === null || val === undefined) return "";
//     if (Array.isArray(val)) {
//       return val.map(v => typeof v === 'object' && v !== null ? (v?.label || v?.url || JSON.stringify(v)) : String(v)).join(", ");
//     }
//     if (typeof val === 'object' && val !== null) {
//       return val.label || val.url || JSON.stringify(val);
//     }
//     return String(val);
//   }, [pendingChange, fieldData?.displayValue, fieldData?.value]);

//   const cellKey = `${record.id}-${fieldDef.id}`;
//   const isEditing =
//     editingCell?.recordId === record.id && editingCell?.fieldId === fieldDef.id;
//   const isExpanded = expandedCells.has(cellKey);

//   // ── Location Field Detection & Google Maps URL Generation ──
//   const isLocationField = useMemo(() => {
//     const type = (fieldDef.type || "").toLowerCase();
//     const label = (fieldDef.label || "").toLowerCase();
//     return (
//       type === "location" ||
//       type === "coordinates" ||
//       label.includes("location") ||
//       label.includes("coordinates") ||
//       label.includes("latitude") ||
//       label.includes("longitude") ||
//       label.includes("lat") ||
//       label.includes("lng")
//     );
//   }, [fieldDef.type, fieldDef.label]);

//   const locationUrl = useMemo(() => {
//     if (!isLocationField || !actualValue) return null;

//     let lat: number | null = null;
//     let lng: number | null = null;

//     // Handle object format: { lat: 26.9124, lng: 75.7873 } or { latitude, longitude }
//     if (typeof actualValue === "object" && actualValue !== null) {
//       lat = actualValue.lat ?? actualValue.latitude ?? null;
//       lng = actualValue.lng ?? actualValue.longitude ?? null;
//     }
//     // Handle string format: "26.9124,75.7873" or "26.9124, 75.7873"
//     else if (typeof actualValue === "string") {
//       const trimmed = actualValue.trim();
//       const parts = trimmed.split(",").map((p) => parseFloat(p.trim()));
//       if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
//         lat = parts[0];
//         lng = parts[1];
//       }
//     }

//     if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
//       return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
//     }

//     return null;
//   }, [actualValue, isLocationField]);

//   const getValidImages = (value: any): string[] => {
//     if (!value) return [];

//     let processedValue = value;

//     // 1. Try to parse stringified JSON
//     if (typeof value === "string") {
//       const trimmed = value.trim();
//       if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
//         try {
//           processedValue = JSON.parse(trimmed);
//         } catch (e) {
//           // Not valid JSON
//         }
//       } else if (trimmed === "[object Object]") {
//         return []; // Filter out literal "[object Object]" string
//       }
//     }

//     // 2. Normalize into an array
//     let rawItems: any[] = [];
//     if (Array.isArray(processedValue)) {
//       rawItems = processedValue;
//     } else if (typeof processedValue === "string") {
//       // Comma-separated or single string
//       rawItems = processedValue.includes(",")
//         ? processedValue.split(",").map(s => s.trim()).filter(Boolean)
//         : [processedValue];
//     } else if (typeof processedValue === "object" && processedValue !== null) {
//       // Single object or object with common properties
//       const possibleArrays = ["files", "urls", "images", "items", "data", "attachments"];
//       let foundArray = false;
//       for (const key of possibleArrays) {
//         if (Array.isArray((processedValue as any)[key])) {
//           rawItems = (processedValue as any)[key];
//           foundArray = true;
//           break;
//         }
//       }
//       if (!foundArray) rawItems = [processedValue];
//     }

//     // 3. Extract URLs from items and filter
//     return rawItems
//       .map((val) => {
//         if (typeof val === "string") return val;
//         if (typeof val === "object" && val !== null) {
//           // Search common URL keys
//           const obj = val as any;
//           return (
//             obj.url || obj.imageUrl || obj.path || obj.fileUrl ||
//             obj.secure_url || obj.src || obj.link || obj.value ||
//             (typeof obj.id === "string" && (obj.id.startsWith("http") || obj.id.includes(".")) ? obj.id : null)
//           );
//         }
//         return null;
//       })
//       .filter((url): url is string => {
//         if (typeof url !== "string" || !url || url === "[object Object]") return false;

//         const lowerUrl = url.toLowerCase();
//         return (
//           lowerUrl.startsWith("http") ||
//           lowerUrl.startsWith("/") ||
//           lowerUrl.startsWith("./") ||
//           lowerUrl.startsWith("data:image/") ||
//           lowerUrl.startsWith("blob:") ||
//           lowerUrl.includes("hostinger") ||
//           lowerUrl.includes("cloudinary") ||
//           lowerUrl.includes("storage") ||
//           lowerUrl.includes("googleusercontent") ||
//           lowerUrl.includes("amazonaws") ||
//           lowerUrl.includes("supabase") ||
//           lowerUrl.includes("firebase") ||
//           !!lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff|heic)$/) ||
//           isImageUrl(url)
//         );
//       });
//   };

//   const images = useMemo(() => getValidImages(actualValue), [actualValue]);
//   const hasImages = images.length > 0;
//   const isImageColumn = isImageField(fieldDef.label) || hasImages;
//   const hasComments = (comments.get(cellKey) || []).length > 0;
//   const isDynamicRows =
//     fieldDef.id.startsWith("_dynamicRows_") && Array.isArray(actualValue);

//   // ── State for image preview popup ──
//   const [previewUrl, setPreviewUrl] = useState<string | null>(null);

//   // Close on ESC key
//   useEffect(() => {
//     if (!previewUrl) return;

//     const handleEsc = (e: KeyboardEvent) => {
//       if (e.key === "Escape") {
//         setPreviewUrl(null);
//       }
//     };

//     window.addEventListener("keydown", handleEsc);
//     return () => window.removeEventListener("keydown", handleEsc);
//   }, [previewUrl]);

//   return (
//     <>
//       {/* ── Image Preview Popup ── */}
//       {previewUrl && (
//         <div
//           className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
//           onClick={() => setPreviewUrl(null)}
//         >
//           <div
//             className="relative max-w-[95vw] max-h-[95vh] overflow-auto"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <button
//               className="absolute -top-12 right-0 bg-gray-900/70 hover:bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1 shadow-md"
//               onClick={() => setPreviewUrl(null)}
//             >
//               <X className="h-4 w-4" /> Close
//             </button>

//             <img
//               src={previewUrl}
//               alt={fieldDef.label || "Enlarged image"}
//               className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white/5 backdrop-blur-sm"
//               onError={(e) => {
//                 (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
//                 (e.currentTarget as HTMLImageElement).alt = "Image failed to load";
//               }}
//             />

//             <div className="text-center text-white mt-3 text-sm opacity-80">
//               {fieldDef.label || "Image Preview"}
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── Main cell content ── */}
//       <div
//         key={cellKey}
//         className={cn(
//           "bg-white px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 relative",
//           isWrapTextEnabled || isExpanded
//             ? "h-auto min-h-[36px] py-2 items-start"
//             : "h-9 items-center",
//           selectedCell === cellKey &&
//           "bg-blue-50/70 border-2 border-blue-500 shadow-sm z-10",
//           isEditing &&
//           "ring-2 ring-inset ring-blue-600 bg-blue-50 shadow-inner z-20",
//           pendingChange &&
//           !isEditing &&
//           "bg-gradient-to-r from-yellow-50 to-amber-50 font-semibold",
//           editMode !== "locked" &&
//           canEdit &&
//           !isEditing &&
//           !isImageColumn &&
//           "cursor-pointer hover:bg-gray-50",
//           focusedCell === cellKey && !isEditing && "ring-1 ring-blue-300 ring-inset",
//         )}
//         style={{ width: `${columnWidth}px`, boxShadow: "inset -1px 0 0 0 #e5e7eb" }}
//         onClick={() => {
//           if (!isEditing && editMode !== "locked" && canEdit && !isImageColumn && !locationUrl) {
//             onCellClick(cellKey);
//           }
//         }}
//         onPointerDown={(e) => handleCellPointerDown(e, record, fieldDef)}
//         onContextMenu={(e) => {
//           if (!isImageColumn) {
//             e.preventDefault();
//             onContextMenu(cellKey);
//           }
//         }}
//       >
//         <div
//           className={cn(
//             "w-full h-full flex items-center",
//             isWrapTextEnabled || isExpanded ? "items-start py-2" : "",
//           )}
//         >
//           {isEditing ? (
//             renderFieldEditor(record, fieldDef, actualValue, displayText)
//           ) : isImageColumn ? (
//             <div className="flex items-center gap-2 flex-wrap py-1">
//               {Array.isArray(actualValue) ? (
//                 actualValue
//                   .filter(isImageUrl)
//                   .slice(0, 3)
//                   .map((url: string, idx: number) => (
//                     <img
//                       key={idx}
//                       src={url || "/placeholder.svg"}
//                       alt={`Image ${idx + 1} - ${fieldDef.label || "Uploaded image"}`}
//                       className="h-7 w-7 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-90 hover:scale-110 transition-all duration-200 shadow-sm"
//                       onError={(e) => (e.currentTarget.style.display = "none")}
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         if (url) setPreviewUrl(url);
//                       }}
//                     />
//                   ))
//               ) : isImageUrl(actualValue) ? (
//                 <img
//                   src={actualValue || "/placeholder.svg"}
//                   alt={fieldDef.label || "Uploaded image"}
//                   className="h-7 w-7 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-90 hover:scale-110 transition-all duration-200 shadow-sm"
//                   onError={(e) => (e.currentTarget.style.display = "none")}
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     if (actualValue) setPreviewUrl(actualValue);
//                   }}
//                 />
//               ) : (
//                 <span className="text-xs text-gray-400">No image</span>
//               )}
//             </div>
//           ) : isDynamicRows ? (
//             <div
//               className="flex items-center gap-2 cursor-pointer hover:text-blue-600"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onPreviewClick(
//                   actualValue,
//                   fieldDef.label,
//                   fieldData?.fieldDefinitions,
//                 );
//               }}
//             >
//               <div className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
//                 <Layers className="h-3 w-3" /> {actualValue.length}
//               </div>
//               <span className="text-gray-400 text-xs truncate max-w-[120px] italic">
//                 {displayText || "Click to view"}
//               </span>
//             </div>
//           ) : locationUrl ? (
//             // ── Clickable Location Map Link ──
//             <a
//               href={locationUrl}
//               target="_blank"
//               rel="noopener noreferrer"
//               className="block w-full h-full text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2 group/link"
//               onClick={(e) => e.stopPropagation()} // Prevent triggering cell edit
//               title={`Open ${displayText} in Google Maps`}
//             >
//               <span className="text-blue-500 text-lg flex-shrink-0">📍</span>
//               <span
//                 className={cn(
//                   "text-sm leading-tight py-2 flex-1",
//                   isWrapTextEnabled || isExpanded
//                     ? "whitespace-normal break-words"
//                     : "whitespace-nowrap overflow-hidden text-ellipsis"
//                 )}
//               >
//                 {displayText || "View on Google Maps"}
//               </span>
//             </a>
//           ) : (
//             // ── Normal Text Display ──
//             <div className="relative group w-full h-full">
//               <div
//                 className={cn(
//                   "w-full text-sm text-gray-700 leading-tight py-2 uppercase-data",
//                   isWrapTextEnabled || isExpanded
//                     ? "whitespace-normal break-words"
//                     : "whitespace-nowrap overflow-hidden text-ellipsis",
//                 )}
//                 style={getConditionalStyle(fieldDef, actualValue, displayText)}
//                 title={displayText}
//               >
//                 {(displayText ?? "") === "" ? "N/A" : displayText}
//               </div>

//               {!isWrapTextEnabled && displayText && displayText.length > 40 && (
//                 <button
//                   onClick={(e) => {
//                     e.stopPropagation();
//                     toggleCellExpansion(cellKey);
//                   }}
//                   className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs rounded shadow-sm p-0.5 z-20"
//                 >
//                   {isExpanded ? (
//                     <ChevronUp className="h-3 w-3" />
//                   ) : (
//                     <ChevronDown className="h-3 w-3" />
//                   )}
//                 </button>
//               )}
//             </div>
//           )}
//         </div>

//         {hasComments && (
//           <div className="absolute top-0 right-0 group z-10">
//             <button
//               className="bg-yellow-400 text-white p-0.5 rounded-bl text-xs"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 onCommentClick(cellKey);
//               }}
//             >
//               <MessageSquare className="h-3 w-3" />
//             </button>
//           </div>
//         )}
//       </div>
//     </>
//   );
// });


"use client";
import React, { memo, useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Layers, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageUrl, isImageField } from "@/lib/utils/fieldUtils";
import type {
  EnhancedFormRecord,
  FormFieldWithSection,
  ProcessedFieldData,
  EditingCell,
  PendingChange,
  Comment,
} from "@/types/records";

export interface RecordCellProps {
  record: EnhancedFormRecord;
  fieldDef: FormFieldWithSection;
  fieldData: ProcessedFieldData | undefined;
  pendingChange: PendingChange | undefined;
  editingCell: EditingCell | null;
  expandedCells: Set<string>;
  columnWidth: number;
  isWrapTextEnabled: boolean;
  editMode: "locked" | "single-click" | "double-click";
  canEdit?: boolean;
  selectedCell: string | null;
  focusedCell: string | null;
  comments: Map<string, Comment[]>;
  getConditionalStyle: (
    fieldDef: FormFieldWithSection,
    value: any,
    displayText: string,
  ) => React.CSSProperties;
  handleCellPointerDown: (
    e: React.PointerEvent<HTMLDivElement>,
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
  ) => void;
  renderFieldEditor: (
    record: EnhancedFormRecord,
    fieldDef: FormFieldWithSection,
    actualValue: any,
    displayText: string,
  ) => React.ReactNode;
  onCellClick: (cellKey: string) => void;
  onContextMenu: (cellKey: string) => void;
  onPreviewClick: (
    rows: any[],
    title: string,
    fieldDefinitions?: { id: string; label: string; type: string }[],
  ) => void;
  onCommentClick: (cellKey: string) => void;
  toggleCellExpansion: (cellKey: string) => void;
}

export const RecordCell = memo(function RecordCell({
  record,
  fieldDef,
  fieldData,
  pendingChange,
  editingCell,
  expandedCells,
  columnWidth,
  isWrapTextEnabled,
  editMode,
  canEdit = true,
  selectedCell,
  focusedCell,
  comments,
  getConditionalStyle,
  handleCellPointerDown,
  renderFieldEditor,
  onCellClick,
  onContextMenu,
  onPreviewClick,
  onCommentClick,
  toggleCellExpansion,
}: RecordCellProps) {
  const actualValue = pendingChange ? pendingChange.value : fieldData?.value ?? null;

  const displayText = useMemo(() => {
    let val = pendingChange ? pendingChange.value : fieldData?.displayValue ?? fieldData?.value ?? "";

    if (val === null || val === undefined) return "";

    // Special handling for Percent field
    if (fieldDef.type === "percent") {
      if (typeof val === "number") {
        return val.toFixed(fieldDef.percentConfig?.decimals ?? 2) + 
               (fieldDef.percentConfig?.showSymbol !== false ? "%" : "");
      }
      if (typeof val === "string") {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          return num.toFixed(fieldDef.percentConfig?.decimals ?? 2) + 
                 (fieldDef.percentConfig?.showSymbol !== false ? "%" : "");
        }
      }
    }

    if (Array.isArray(val)) {
      return val.map(v => typeof v === 'object' && v !== null ? (v?.label || v?.url || JSON.stringify(v)) : String(v)).join(", ");
    }
    if (typeof val === 'object' && val !== null) {
      return val.label || val.url || JSON.stringify(val);
    }
    return String(val);
  }, [pendingChange, fieldData?.displayValue, fieldData?.value, fieldDef]);

  const cellKey = `${record.id}-${fieldDef.id}`;
  const isEditing =
    editingCell?.recordId === record.id && editingCell?.fieldId === fieldDef.id;
  const isExpanded = expandedCells.has(cellKey);

  // Location Field Detection
  const isLocationField = useMemo(() => {
    const type = (fieldDef.type || "").toLowerCase();
    const label = (fieldDef.label || "").toLowerCase();
    return (
      type === "location" ||
      type === "coordinates" ||
      label.includes("location") ||
      label.includes("coordinates") ||
      label.includes("latitude") ||
      label.includes("longitude") ||
      label.includes("lat") ||
      label.includes("lng")
    );
  }, [fieldDef.type, fieldDef.label]);

  const locationUrl = useMemo(() => {
    if (!isLocationField || !actualValue) return null;

    let lat: number | null = null;
    let lng: number | null = null;

    if (typeof actualValue === "object" && actualValue !== null) {
      lat = actualValue.lat ?? actualValue.latitude ?? null;
      lng = actualValue.lng ?? actualValue.longitude ?? null;
    } else if (typeof actualValue === "string") {
      const trimmed = actualValue.trim();
      const parts = trimmed.split(",").map((p) => parseFloat(p.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
      }
    }

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return null;
  }, [actualValue, isLocationField]);

  const getValidImages = (value: any): string[] => {
    if (!value) return [];

    let processedValue = value;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          processedValue = JSON.parse(trimmed);
        } catch (e) {}
      } else if (trimmed === "[object Object]") {
        return [];
      }
    }

    let rawItems: any[] = [];
    if (Array.isArray(processedValue)) {
      rawItems = processedValue;
    } else if (typeof processedValue === "string") {
      rawItems = processedValue.includes(",")
        ? processedValue.split(",").map(s => s.trim()).filter(Boolean)
        : [processedValue];
    } else if (typeof processedValue === "object" && processedValue !== null) {
      const possibleArrays = ["files", "urls", "images", "items", "data", "attachments"];
      let foundArray = false;
      for (const key of possibleArrays) {
        if (Array.isArray((processedValue as any)[key])) {
          rawItems = (processedValue as any)[key];
          foundArray = true;
          break;
        }
      }
      if (!foundArray) rawItems = [processedValue];
    }

    return rawItems
      .map((val) => {
        if (typeof val === "string") return val;
        if (typeof val === "object" && val !== null) {
          const obj = val as any;
          return (
            obj.url || obj.imageUrl || obj.path || obj.fileUrl ||
            obj.secure_url || obj.src || obj.link || obj.value ||
            (typeof obj.id === "string" && (obj.id.startsWith("http") || obj.id.includes(".")) ? obj.id : null)
          );
        }
        return null;
      })
      .filter((url): url is string => {
        if (typeof url !== "string" || !url || url === "[object Object]") return false;
        const lowerUrl = url.toLowerCase();
        return (
          lowerUrl.startsWith("http") ||
          lowerUrl.startsWith("/") ||
          lowerUrl.startsWith("./") ||
          lowerUrl.startsWith("data:image/") ||
          lowerUrl.startsWith("blob:") ||
          lowerUrl.includes("hostinger") ||
          lowerUrl.includes("cloudinary") ||
          lowerUrl.includes("storage") ||
          lowerUrl.includes("googleusercontent") ||
          lowerUrl.includes("amazonaws") ||
          lowerUrl.includes("supabase") ||
          lowerUrl.includes("firebase") ||
          !!lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|avif|tiff|heic)$/) ||
          isImageUrl(url)
        );
      });
  };

  // Detect URL fields — these should show links, not images
  const isUrlField = useMemo(() => {
    const type = (fieldDef.type || "").toLowerCase();
    return type === "url" || type === "link";
  }, [fieldDef.type]);

  const images = useMemo(() => getValidImages(actualValue), [actualValue]);
  const hasImages = images.length > 0;
  const isImageColumn = !isUrlField && (isImageField(fieldDef.label) || hasImages);
  const hasComments = (comments.get(cellKey) || []).length > 0;
  const isDynamicRows =
    fieldDef.id.startsWith("_dynamicRows_") && Array.isArray(actualValue);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [previewUrl]);

  return (
    <>
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute -top-12 right-0 bg-gray-900/70 hover:bg-gray-800 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1 shadow-md"
              onClick={() => setPreviewUrl(null)}
            >
              <X className="h-4 w-4" /> Close
            </button>
            <img
              src={previewUrl}
              alt={fieldDef.label || "Enlarged image"}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-white/5 backdrop-blur-sm"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                (e.currentTarget as HTMLImageElement).alt = "Image failed to load";
              }}
            />
            <div className="text-center text-white mt-3 text-sm opacity-80">
              {fieldDef.label || "Image Preview"}
            </div>
          </div>
        </div>
      )}

      <div
        key={cellKey}
        className={cn(
          "px-3 text-sm font-medium text-gray-700 flex-shrink-0 transition-all duration-200 relative",
          !fieldDef.styling?.backgroundColor && "bg-white",
          isWrapTextEnabled || isExpanded ? "h-auto min-h-[36px] py-2 items-start" : "h-9 items-center",
          selectedCell === cellKey && "bg-blue-50/70 border-2 border-blue-500 shadow-sm z-10",
          isEditing && "ring-2 ring-inset ring-blue-600 bg-blue-50 shadow-inner z-20",
          pendingChange && !isEditing && "bg-gradient-to-r from-yellow-50 to-amber-50 font-semibold",
          editMode !== "locked" && canEdit && !isEditing && !isImageColumn && "cursor-pointer hover:bg-gray-50",
          focusedCell === cellKey && !isEditing && "ring-1 ring-blue-300 ring-inset",
        )}
        style={{
          width: `${columnWidth}px`,
          boxShadow: "inset -1px 0 0 0 #e5e7eb",
          ...(fieldDef.styling?.backgroundColor && !isEditing && !pendingChange && selectedCell !== cellKey
            ? { backgroundColor: fieldDef.styling.backgroundColor }
            : {}),
          ...(fieldDef.styling?.textColor ? { color: fieldDef.styling.textColor } : {}),
        }}
        onClick={() => {
          if (!isEditing && editMode !== "locked" && canEdit && !isImageColumn && !locationUrl) {
            onCellClick(cellKey);
          }
        }}
        onPointerDown={(e) => handleCellPointerDown(e, record, fieldDef)}
        onContextMenu={(e) => {
          if (!isImageColumn) {
            e.preventDefault();
            onContextMenu(cellKey);
          }
        }}
      >
        <div className={cn("w-full h-full flex items-center", isWrapTextEnabled || isExpanded ? "items-start py-2" : "")}>
          {isEditing ? (
            renderFieldEditor(record, fieldDef, actualValue, displayText)
          ) : isImageColumn ? (
            <div className="flex items-center gap-2 flex-wrap py-1">
              {Array.isArray(actualValue) ? (
                actualValue.filter(isImageUrl).slice(0, 3).map((url: string, idx: number) => (
                  <img
                    key={idx}
                    src={url || "/placeholder.svg"}
                    alt={`Image ${idx + 1}`}
                    className="h-7 w-7 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-90 hover:scale-110 transition-all duration-200 shadow-sm"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    onClick={(e) => { e.stopPropagation(); if (url) setPreviewUrl(url); }}
                  />
                ))
              ) : isImageUrl(actualValue) ? (
                <img
                  src={actualValue || "/placeholder.svg"}
                  alt={fieldDef.label || "Uploaded image"}
                  className="h-7 w-7 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-90 hover:scale-110 transition-all duration-200 shadow-sm"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                  onClick={(e) => { e.stopPropagation(); if (actualValue) setPreviewUrl(actualValue); }}
                />
              ) : (
                <span className="text-xs text-gray-400">No image</span>
              )}
            </div>
          ) : isDynamicRows ? (
            <div className="flex items-center gap-2 cursor-pointer hover:text-blue-600" onClick={(e) => { e.stopPropagation(); onPreviewClick(actualValue, fieldDef.label, fieldData?.fieldDefinitions); }}>
              <div className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                <Layers className="h-3 w-3" /> {actualValue.length}
              </div>
              <span className="text-gray-400 text-xs truncate max-w-[120px] italic">
                {displayText || "Click to view"}
              </span>
            </div>
          ) : locationUrl ? (
            <a href={locationUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-2 group/link" onClick={(e) => e.stopPropagation()} title={`Open ${displayText} in Google Maps`}>
              <span className="text-blue-500 text-lg flex-shrink-0">📍</span>
              <span className={cn("text-sm leading-tight py-2 flex-1", isWrapTextEnabled || isExpanded ? "whitespace-normal break-words" : "whitespace-nowrap overflow-hidden text-ellipsis")}>
                {displayText || "View on Google Maps"}
              </span>
            </a>
          ) : isUrlField && displayText ? (
            <a
              href={displayText.startsWith("http") ? displayText : `https://${displayText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-sm text-blue-600 hover:text-blue-700 hover:underline leading-tight py-2 truncate block"
              onClick={(e) => e.stopPropagation()}
              title={displayText}
            >
              {displayText}
            </a>
          ) : (
            <div className="relative group w-full h-full">
              {/* Capsule/Pill rendering for dropdown fields with styling */}
              {fieldDef.styling?.capsule && ["dropdown", "select", "lookup", "radio"].includes(fieldDef.type) && displayText && displayText !== "N/A" ? (
                <div className="flex items-center gap-1 flex-wrap py-1">
                  {displayText.split(",").map((val: string, i: number) => {
                    const trimmed = val.trim();
                    const optColors = fieldDef.styling?.optionColors?.[trimmed];
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium leading-tight"
                        style={{
                          color: optColors?.textColor || fieldDef.styling?.textColor || "#374151",
                          backgroundColor: optColors?.backgroundColor || fieldDef.styling?.backgroundColor || "#f3f4f6",
                        }}
                      >
                        {trimmed}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    "w-full text-sm text-gray-700 leading-tight py-2 uppercase-data",
                    isWrapTextEnabled || isExpanded ? "whitespace-normal break-words" : "whitespace-nowrap overflow-hidden text-ellipsis",
                  )}
                  style={getConditionalStyle(fieldDef, actualValue, displayText)}
                  title={displayText}
                >
                  {(displayText ?? "") === "" ? "N/A" : displayText}
                </div>
              )}

              {!isWrapTextEnabled && displayText && displayText.length > 40 && !fieldDef.styling?.capsule && (
                <button onClick={(e) => { e.stopPropagation(); toggleCellExpansion(cellKey); }} className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs rounded shadow-sm p-0.5 z-20">
                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>
          )}
        </div>

        {hasComments && (
          <div className="absolute top-0 right-0 group z-10">
            <button className="bg-yellow-400 text-white p-0.5 rounded-bl text-xs" onClick={(e) => { e.stopPropagation(); onCommentClick(cellKey); }}>
              <MessageSquare className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </>
  );
});