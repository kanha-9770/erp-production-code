/**
 * Web Worker entry for spreadsheet parsing.
 *
 * Reads the uploaded File and runs the heavy XLSX decode + normalisation off the
 * main thread, posting coarse progress and the final preview back. Spawned by
 * file-upload.tsx via `new Worker(new URL("./parse-worker.ts", import.meta.url),
 * { type: "module" })`. `xlsx` is bundled into THIS worker chunk only, so it
 * never weighs down the main page bundle.
 */

import {
  parseSpreadsheet,
  type ParseProgress,
  type ParsedFilePreview,
} from "@/lib/import/parse-spreadsheet";

// The project's tsconfig `lib` doesn't include "webworker", and the dom lib's
// `Window.postMessage` has a different signature — so type the worker scope
// loosely here.
const ctx = self as unknown as {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent) => void) => void;
};

type OutMsg =
  | ({ type: "progress" } & ParseProgress)
  | { type: "result"; preview: ParsedFilePreview }
  | { type: "error"; error: string };

const post = (m: OutMsg) => ctx.postMessage(m);

ctx.addEventListener("message", async (e: MessageEvent) => {
  const file = (e.data as { file?: File })?.file;
  if (!file) return;
  try {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const content: string | ArrayBuffer = isCsv
      ? await file.text()
      : await file.arrayBuffer();
    const preview = parseSpreadsheet(content, isCsv, (p: ParseProgress) =>
      post({ type: "progress", ...p }),
    );
    post({ type: "result", preview });
  } catch (err) {
    post({ type: "error", error: err instanceof Error ? err.message : "Parse failed" });
  }
});
