"use client";

import React, { useCallback, useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

/* ============================================================
   CONSTANTS
============================================================ */
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — supports large XLSX with 5000+ rows and wide columns
const PREVIEW_ROWS_LIMIT = 50;

/* ============================================================
   TYPES
============================================================ */
interface ColumnGroup {
  sectionTitle: string;
  columns: string[];
  startIndex: number;
}

export interface ParsedFilePreview {
  headers: string[];
  rows: string[][];       // preview rows (limited for display)
  allRows: string[][];    // ALL rows for actual import
  totalRows: number;
  columnGroups?: ColumnGroup[];
}

interface FileUploadProps {
  onFileUpload: (
    file: File,
    preview: ParsedFilePreview
  ) => void;
  uploadedFile:
    | { file: File; preview: ParsedFilePreview }
    | null;
  onFileRemove: () => void;
}

/* ============================================================
   COMPONENT
============================================================ */
export function FileUpload({
  onFileUpload,
  uploadedFile,
  onFileRemove,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ============================================================
     FILE PARSER
  ============================================================ */
  const parseFile = async (
    file: File
  ): Promise<ParsedFilePreview> => {
    setIsParsing(true);
    setError(null);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const result = e.target?.result;
          if (!result) throw new Error("File read failed");

          let workbook: XLSX.WorkBook;

          if (file.name.toLowerCase().endsWith(".csv")) {
            workbook = XLSX.read(result as string, { type: "string" });
          } else {
            workbook = XLSX.read(result as ArrayBuffer, { type: "array" });
          }

          const sheetName = workbook.SheetNames[0];
          if (!sheetName) throw new Error("No sheet found");

          const worksheet = workbook.Sheets[sheetName];

          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
            header: 1,
            defval: "",
            blankrows: false,
          }) as string[][];

          if (jsonData.length < 2) {
            throw new Error("File must contain a header row and at least one data row");
          }

          /* ====================================================
             DETECT FORMAT: standard CSV vs 2-row section format
             Standard CSV: row 0 = headers, row 1+ = data
             Section format: row 0 = sections, row 1 = headers, row 2+ = data
          ==================================================== */
          const row0 = jsonData[0];
          const row1 = jsonData[1];

          // Count empty cells in row 0 vs row 1
          const row0Empty = row0.filter((c) => !String(c || "").trim()).length;
          const row1Empty = row1.filter((c) => !String(c || "").trim()).length;
          const totalCols = Math.max(row0.length, row1.length);

          // If row 0 has many empty cells and row 1 has fewer, it's a section format
          const hasSectionRow = totalCols > 1 && row0Empty > row1Empty && row0Empty > totalCols * 0.3;

          let columnGroups: ColumnGroup[] = [];
          let finalHeaders: string[] = [];
          let dataStartIndex: number;

          if (hasSectionRow) {
            // 2-row format: row 0 = sections, row 1 = headers
            const sectionRow = row0;
            const headerRow = row1;
            dataStartIndex = 2;

            let currentSection = "General";
            let currentColumns: string[] = [];
            let currentStartIndex = 0;

            for (let col = 0; col < headerRow.length; col++) {
              const sectionCell = String(sectionRow[col] || "").trim();
              const headerCell = String(headerRow[col] || "").trim();

              if (sectionCell) {
                if (currentColumns.length > 0) {
                  columnGroups.push({
                    sectionTitle: currentSection,
                    columns: [...currentColumns],
                    startIndex: currentStartIndex,
                  });
                }
                currentSection = sectionCell;
                currentColumns = [];
                currentStartIndex = col;
              }

              const safeHeader = headerCell || `Column ${col + 1}`;
              finalHeaders.push(safeHeader);
              currentColumns.push(safeHeader);
            }

            if (currentColumns.length > 0) {
              columnGroups.push({
                sectionTitle: currentSection,
                columns: currentColumns,
                startIndex: currentStartIndex,
              });
            }
          } else {
            // Standard CSV: row 0 = headers, row 1+ = data
            dataStartIndex = 1;
            finalHeaders = row0.map((cell, idx) => {
              const val = String(cell || "").trim();
              return val || `Column ${idx + 1}`;
            });
          }

          /* ====================================================
             ROW NORMALIZATION (CRITICAL)
          ==================================================== */
          const normalizeRow = (row: string[]) =>
            finalHeaders.map((_, idx) => String(row[idx] ?? ""));

          const filterEmpty = (row: string[]) =>
            row.some((cell) => cell.trim() !== "");

          const allDataRows = jsonData
            .slice(dataStartIndex)
            .map(normalizeRow)
            .filter(filterEmpty);

          const previewRows = allDataRows.slice(0, PREVIEW_ROWS_LIMIT);

          resolve({
            headers: finalHeaders,
            rows: previewRows,
            allRows: allDataRows,
            totalRows: allDataRows.length,
            columnGroups: hasSectionRow ? columnGroups : undefined,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Parse failed";
          setError(message);
          reject(new Error(message));
        } finally {
          setIsParsing(false);
        }
      };

      reader.onerror = () => {
        setError("File read error");
        setIsParsing(false);
        reject(new Error("FileReader error"));
      };

      if (file.name.toLowerCase().endsWith(".csv")) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  };

  /* ============================================================
     FILE HANDLERS
  ============================================================ */
  const handleFiles = useCallback(
    async (file: File | null) => {
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("File exceeds 10MB limit");
        return;
      }

      if (!file.name.match(/\.(csv|xlsx)$/i)) {
        setError("Only CSV or XLSX files allowed");
        return;
      }

      try {
        const preview = await parseFile(file);
        onFileUpload(file, preview);
      } catch (err) {
        console.error(err);
      }
    },
    [onFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files[0]);
    },
    [handleFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files?.[0] || null);
      e.target.value = "";
    },
    [handleFiles]
  );

  /* ============================================================
     UI
  ============================================================ */
  return (
    <div className="space-y-6">
      {!uploadedFile ? (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card
            className={cn(
              "border-2 border-dashed",
              isDragging && "border-primary bg-primary/5",
              isParsing && "opacity-60 pointer-events-none"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <CardContent className="py-20 flex flex-col items-center">
              {isParsing ? (
                <Loader2 className="h-10 w-10 animate-spin mb-4" />
              ) : (
                <Upload className="h-10 w-10 mb-4" />
              )}

              <p className="text-lg font-semibold">
                {isParsing ? "Processing..." : "Drop your file here"}
              </p>

              {!isParsing && (
                <>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse File
                  </Button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx"
                    onChange={handleFileSelect}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardContent className="flex justify-between items-center">
              <span className="font-medium truncate">
                {uploadedFile.file.name}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={onFileRemove}
              >
                <X />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Table>
                {uploadedFile.preview.columnGroups && (
                  <TableHeader>
                    <TableRow>
                      {uploadedFile.preview.columnGroups.map((group, i) => (
                        <TableHead
                          key={i}
                          colSpan={group.columns.length}
                          className="text-center font-bold bg-muted"
                        >
                          {group.sectionTitle}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                )}

                <TableHeader>
                  <TableRow>
                    {uploadedFile.preview.headers.map((header, i) => (
                      <TableHead key={i}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {uploadedFile.preview.rows.map((row, r) => (
                    <TableRow key={r}>
                      {row.map((cell, c) => (
                        <TableCell key={c}>
                          {cell || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
