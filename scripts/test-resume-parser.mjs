// Standalone smoke test for the resume parser. Generates a tiny PDF + DOCX
// in memory using libraries we already have, runs them through pdf-parse /
// mammoth, and prints the extracted text. No DB / no auth needed.
//
//   pnpm exec node scripts/test-resume-parser.mjs

import { jsPDF } from "jspdf";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const RESUME_TEXT = [
  "John Doe",
  "john@example.com  •  +91 98765 43210  •  Bangalore, India",
  "",
  "Senior Software Engineer with 6 years of experience building web apps.",
  "",
  "SKILLS",
  "React, TypeScript, Node.js, Postgres, AWS, Docker",
  "",
  "EXPERIENCE",
  "Acme Corp — Senior Engineer (2022 - Present)",
  "  Led migration to microservices.",
  "Globex — Software Engineer (2019 - 2022)",
  "  Built internal analytics platform.",
  "",
  "EDUCATION",
  "B.E. Computer Science, IIT Madras, 2019",
].join("\n");

async function testPdf() {
  console.log("=== PDF test ===");
  const doc = new jsPDF();
  RESUME_TEXT.split("\n").forEach((line, i) => doc.text(line, 10, 20 + i * 7));
  const buffer = Buffer.from(doc.output("arraybuffer"));
  console.log(`Generated PDF: ${buffer.length} bytes`);

  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const res = await parser.getText();
      console.log("PDF extracted text length:", res.text?.length ?? 0);
      console.log("First 300 chars:", (res.text || "").slice(0, 300));
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (err) {
    console.error("PDF parse FAILED:", err);
  }
}

async function testDocx() {
  console.log("\n=== DOCX test ===");
  // Minimal but valid .docx. mammoth needs the OOXML structure; build one
  // by hand using a stripped-down template (zipped office package).
  const { default: JSZip } = await import("jszip").catch(() => ({}));
  if (!JSZip) {
    console.log("(skipping DOCX test — jszip not installed)");
    return;
  }
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const paragraphs = RESUME_TEXT.split("\n")
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`,
    )
    .join("");
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}</w:body>
</w:document>`,
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  console.log(`Generated DOCX: ${buffer.length} bytes`);

  try {
    const res = await mammoth.extractRawText({ buffer });
    console.log("DOCX extracted text length:", res.value?.length ?? 0);
    console.log("First 300 chars:", (res.value || "").slice(0, 300));
  } catch (err) {
    console.error("DOCX parse FAILED:", err);
  }
}

await testPdf();
await testDocx();
