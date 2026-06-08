"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
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
import { cn } from "@/lib/utils";
// Parsing runs in a Web Worker (./parse-worker.ts) so the heavy XLSX decode
// never freezes the UI thread on large files. The pure logic + the
// ParsedFilePreview type live in the shared module; we import ONLY the types
// (erased at compile time, so `xlsx` stays out of the main bundle) and re-export
// ParsedFilePreview so existing importers (the import page) are unchanged.
import type { ParsedFilePreview, ParseProgress } from "@/lib/import/parse-spreadsheet";

export type { ParsedFilePreview };

/** Thrown when the worker can't be created/run, so we fall back to the main
 *  thread instead of surfacing it as a parse failure. */
class WorkerUnavailable extends Error {}

/* ============================================================
   CONSTANTS
============================================================ */
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — supports large XLSX with 5000+ rows and wide columns

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
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Tear down a still-running parse worker if the component unmounts mid-parse.
  useEffect(() => () => workerRef.current?.terminate(), []);

  /* ============================================================
     FILE PARSER
     Runs in a Web Worker so a big XLSX decode never freezes the page; falls
     back to a (lazy-loaded) main-thread parse only if a worker can't be made.
  ============================================================ */
  const parseViaWorker = (file: File): Promise<ParsedFilePreview> =>
    new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("./parse-worker.ts", import.meta.url), { type: "module" });
      } catch (err) {
        reject(new WorkerUnavailable(err instanceof Error ? err.message : "Worker unavailable"));
        return;
      }
      workerRef.current = worker;
      const cleanup = () => {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };
      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as
          | ({ type: "progress" } & ParseProgress)
          | { type: "result"; preview: ParsedFilePreview }
          | { type: "error"; error: string };
        if (msg.type === "progress") setProgress({ phase: msg.phase, percent: msg.percent });
        else if (msg.type === "result") { cleanup(); resolve(msg.preview); }
        else if (msg.type === "error") { cleanup(); reject(new Error(msg.error || "Parse failed")); }
      };
      worker.onerror = (ev) => {
        cleanup();
        // A worker script-load/runtime failure → fall back to the main thread.
        reject(new WorkerUnavailable(ev instanceof ErrorEvent ? ev.message : "Worker error"));
      };
      worker.postMessage({ file });
    });

  const parseOnMainThread = async (file: File): Promise<ParsedFilePreview> => {
    // Lazy-load the parser (and xlsx, ~300 KB gzipped) only now — keeps it out
    // of the initial page bundle, same as before.
    const { parseSpreadsheet } = await import("@/lib/import/parse-spreadsheet");
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const content: string | ArrayBuffer = isCsv ? await file.text() : await file.arrayBuffer();
    return parseSpreadsheet(content, isCsv, (p) => setProgress(p));
  };

  const parseFile = async (file: File): Promise<ParsedFilePreview> => {
    setIsParsing(true);
    setError(null);
    setProgress({ phase: "parsing", percent: 5 });
    try {
      if (typeof Worker !== "undefined") {
        try {
          return await parseViaWorker(file);
        } catch (err) {
          if (!(err instanceof WorkerUnavailable)) throw err; // real parse error
          console.warn("Parse worker unavailable, parsing on the main thread:", err);
        }
      }
      return await parseOnMainThread(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsParsing(false);
      setProgress(null);
    }
  };

  /* ============================================================
     FILE HANDLERS
  ============================================================ */
  const handleFiles = useCallback(
    async (file: File | null) => {
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("File exceeds 50MB limit");
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
                {isParsing
                  ? progress?.phase === "normalizing"
                    ? "Preparing rows…"
                    : "Reading spreadsheet…"
                  : "Drop your file here"}
              </p>

              {isParsing && progress && (
                <div className="w-full max-w-xs mt-4 space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Parsing in the background — the page stays responsive</span>
                    <span className="tabular-nums">{progress.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-200"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

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
