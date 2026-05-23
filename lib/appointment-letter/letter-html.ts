import type { AppointmentLetter } from "@/lib/api/appointment-letters";

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsHtml(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function buildLetterHtml(l: AppointmentLetter): string {
  const title = l.title?.trim() || "Letter of Appointment";
  const company = l.company?.trim() || "";
  const issuedOn = formatDate(l.appointmentDate);
  const signedLine =
    l.signed && l.signedDate
      ? `<div class="sig-stamp">Accepted by candidate on ${esc(formatDate(l.signedDate))}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(l.applicantName)}</title>
  <style>
    @page { size: A4; margin: 25mm 30mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #111;
      font-size: 12pt;
      line-height: 1.55;
      background: #f3f4f6;
    }
    .sheet {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      margin: 18px auto;
      padding: 25mm 30mm;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    @media print {
      body { background: #fff; }
      .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; }
      .toolbar { display: none !important; }
    }
    .toolbar {
      max-width: 210mm;
      margin: 16px auto 0;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .toolbar button {
      cursor: pointer;
      border: 1px solid #d1d5db;
      background: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .toolbar button.primary {
      background: #111827;
      color: #fff;
      border-color: #111827;
    }
    .letterhead {
      text-align: center;
      border-bottom: 2px solid #111;
      padding-bottom: 12px;
      margin-bottom: 28px;
    }
    .letterhead .company {
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      margin-bottom: 28px;
    }
    .meta .ref { color: #555; }
    .recipient { margin-bottom: 22px; }
    .recipient .label { color: #555; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
    .subject {
      text-align: center;
      font-weight: 700;
      text-decoration: underline;
      margin: 14px 0 22px;
      font-size: 14pt;
    }
    .salutation { margin-bottom: 14px; }
    .body p { margin: 0 0 12px; text-align: justify; }
    .closing { margin-top: 32px; }
    .signature-block {
      margin-top: 56px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .sig-col { width: 45%; }
    .sig-line {
      border-top: 1px solid #111;
      padding-top: 4px;
      font-size: 10pt;
      color: #444;
    }
    .sig-stamp {
      margin-top: 12px;
      display: inline-block;
      border: 1px dashed #16a34a;
      color: #15803d;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10pt;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()" class="primary">Save as PDF / Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="letterhead">
      <p class="company">${esc(company) || "Company Name"}</p>
    </div>

    <div class="meta">
      <div class="ref">${l.letterCode ? `Ref: ${esc(l.letterCode)}` : ""}</div>
      <div>Date: ${esc(issuedOn)}</div>
    </div>

    <div class="recipient">
      <div class="label">To,</div>
      <div><strong>${esc(l.applicantName)}</strong></div>
      ${l.applicantEmail ? `<div>${esc(l.applicantEmail)}</div>` : ""}
    </div>

    <div class="subject">${esc(title)}</div>

    <div class="salutation">Dear ${esc(l.applicantName.split(/\s+/)[0] || l.applicantName)},</div>

    <div class="body">
      ${paragraphsHtml(l.introduction)}
      ${paragraphsHtml(l.description)}
      ${paragraphsHtml(l.closingNotes)}
    </div>

    <div class="closing">Sincerely,</div>

    <div class="signature-block">
      <div class="sig-col">
        <div class="sig-line">For ${esc(company) || "the Company"}<br />Authorised Signatory</div>
      </div>
      <div class="sig-col" style="text-align:right">
        <div class="sig-line">${esc(l.applicantName)}<br />(Candidate Signature)</div>
        ${signedLine}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Open the formatted letter in a new tab via a blob URL + anchor click. We
// don't use window.open() because aggressive pop-up blockers reject it even
// inside a click handler; programmatic anchor clicks aren't blocked because
// the browser treats them as user-initiated navigation.
export function viewLetterDocument(l: AppointmentLetter) {
  const html = buildLetterHtml(l);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener,noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Print via an off-screen iframe — sidesteps pop-up blockers entirely. The
// browser print dialog includes "Save as PDF" as a destination, so this also
// serves as the PDF download path.
export function printLetterDocument(l: AppointmentLetter) {
  const html = buildLetterHtml(l);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* noop */
      }
    }, 1000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("[appointment-letter] print failed", err);
    } finally {
      cleanup();
    }
  };

  iframe.srcdoc = html;
}
