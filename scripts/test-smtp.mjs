// SMTP diagnostic — replicates lib/email.ts's transport exactly and reports
// the REAL error behind "emails not sending". Loads .env manually (the project
// has no dotenv), runs transporter.verify() to check connection + auth, and
// optionally sends a real test email.
//
//   node scripts/test-smtp.mjs                 # verify connection/auth only
//   node scripts/test-smtp.mjs you@example.com # also send a test email
//
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

// --- minimal .env loader (handles KEY="value" and KEY=value) ---------------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv(path.join(process.cwd(), ".env"));
loadEnv(path.join(process.cwd(), ".env.local"));

const host = process.env.EMAIL_HOST;
const port = Number.parseInt(process.env.EMAIL_PORT || "587");
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_APP_PASSWORD;
const from = process.env.EMAIL_FROM || user;

const mask = (s) => (s ? s.slice(0, 2) + "***" + s.slice(-2) : "(unset)");
console.log("=== SMTP config (from .env) ===");
console.log("  EMAIL_HOST        :", host || "(unset)");
console.log("  EMAIL_PORT        :", port, port === 465 ? "(implies secure:true)" : "(STARTTLS, secure:false)");
console.log("  EMAIL_USER        :", mask(user));
console.log("  EMAIL_APP_PASSWORD:", pass ? `${pass.length} chars ${/\s/.test(pass) ? "⚠ CONTAINS SPACES" : ""}` : "(unset)");
console.log("  EMAIL_FROM        :", mask(from));
console.log("");

if (!host || !user) {
  console.error("✗ EMAIL_HOST or EMAIL_USER is unset → lib/email.ts takes the");
  console.error("  [DEV] no-op path and returns success WITHOUT sending. Fix the env.");
  process.exit(1);
}

// Exact transport lib/email.ts builds (secure hardcoded false there).
const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false,
  auth: { user, pass },
});

console.log("=== Step 1: transporter.verify() (connection + auth) ===");
try {
  await transporter.verify();
  console.log("✓ verify() succeeded — SMTP connection and credentials are GOOD.\n");
} catch (err) {
  console.error("✗ verify() FAILED — this is why emails aren't sending:");
  console.error("  code   :", err?.code);
  console.error("  command:", err?.command);
  console.error("  message:", err?.message);
  console.error("");
  if (String(err?.message || "").includes("Invalid login") || err?.code === "EAUTH") {
    console.error("  → Gmail rejected the credentials. Most likely the");
    console.error("    EMAIL_APP_PASSWORD is wrong/expired, or it's a normal");
    console.error("    account password instead of a 16-char App Password.");
    console.error("    Generate one at https://myaccount.google.com/apppasswords");
    console.error("    (requires 2-Step Verification enabled).");
  }
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.log("No recipient given — skipping real send.");
  console.log("To send a real test: node scripts/test-smtp.mjs you@example.com");
  process.exit(0);
}

console.log(`=== Step 2: sending a real test email to ${to} ===`);
try {
  const info = await transporter.sendMail({
    from: { name: process.env.EMAIL_FROM_NAME || "App5", address: from },
    to,
    subject: "ERP SMTP test — recruitment emails",
    text: "If you received this, recruitment automation emails will send correctly.",
  });
  console.log("✓ sendMail succeeded. messageId:", info.messageId);
  console.log("  accepted:", info.accepted, "rejected:", info.rejected);
} catch (err) {
  console.error("✗ sendMail FAILED:", err?.message);
  process.exit(1);
}
