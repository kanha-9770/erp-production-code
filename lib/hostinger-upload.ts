import { Client } from "basic-ftp";
import { Readable } from "stream";

const FTP_HOST = "217.21.82.234";
const FTP_USER = "u386199748.businesscardglobal";
const FTP_PASSWORD = "Kafka@India1122";
const FTP_PORT = 21;
const FTP_UPLOAD_DIR = "businesscard"; // 👈 target inside public_html
const PUBLIC_URL = "https://businesscard.nesscoglobal.com/businesscard"; // 👈 reflects the actual image URL
const PUBLIC_ACCESS_URL = "https://businesscard.nesscoglobal.com"; // 👈 reflects the actual image URL

// Open an FTP connection, run the callback, and ensure the connection is
// always closed even on error. All callers in this module funnel through
// here so the access/close lifecycle is in one place.
async function withFtpClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client();
  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASSWORD,
      port: FTP_PORT,
      secure: false,
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

// `subdir` is an optional path under FTP_UPLOAD_DIR. Only attendance
// photos currently use it, to keep the businesscard root tidy and let the
// retention sweeper rm whole month-folders at a time. The path is validated
// to allow only `[a-z0-9/_-]` so a malicious filename can't traverse out.
const SUBDIR_RE = /^[a-z0-9/_-]+$/i;

export async function uploadToHostinger(
  buffer: Buffer,
  filename: string,
  subdir?: string,
): Promise<string> {
  // Sanitize the subdir up-front. Empty / undefined means "upload to the
  // historical root" so existing callers (employee avatars, job
  // applications, leads, etc.) keep their URL shape unchanged.
  const safeSubdir = typeof subdir === "string" && subdir.length > 0
    ? subdir.replace(/^\/+|\/+$/g, "")
    : "";
  if (safeSubdir && !SUBDIR_RE.test(safeSubdir)) {
    throw new Error(`uploadToHostinger: invalid subdir '${subdir}'`);
  }

  try {
    return await withFtpClient(async (client) => {
      console.log("[FTP] Connecting to Hostinger...");

      // ✅ Change to 'businesscard' inside public_html, then walk down
      //    into the requested subdir, creating each segment as needed.
      //    `ensureDir` creates the chain idempotently and leaves CWD
      //    inside the final directory.
      await client.cd(FTP_UPLOAD_DIR);
      console.log(`[FTP] Changed directory to: ${FTP_UPLOAD_DIR}`);
      if (safeSubdir) {
        await client.ensureDir(safeSubdir);
        console.log(`[FTP] Working dir is now: ${FTP_UPLOAD_DIR}/${safeSubdir}`);
      }

      const stream = Readable.from(buffer);
      await client.uploadFrom(stream, filename);
      console.log("[FTP] Upload complete");

      const urlPath = safeSubdir ? `${safeSubdir}/${filename}` : filename;
      return `${PUBLIC_ACCESS_URL}/${urlPath}`;
    });
  } catch (error) {
    console.error("[FTP] Error:", error);
    throw error;
  } finally {
    console.log("[FTP] Connection closed");
  }
}

/**
 * Delete a previously-uploaded file from Hostinger by its public URL.
 * The URL is what the DB stores (e.g. the attendance row's checkInPhoto);
 * we parse the filename back out and ask the FTP server to remove it.
 *
 * Returns true on success or when the file was already missing (treated
 * as "nothing to do"), false on any other error. NEVER throws — the
 * photo-cleanup scheduler relies on this being best-effort so a single
 * FTP hiccup doesn't block the whole sweep.
 *
 * Only deletes files that live under PUBLIC_ACCESS_URL, as a guard
 * against accidentally being handed a foreign URL.
 */
export async function deleteFromHostinger(
  publicUrl: string,
): Promise<boolean> {
  if (typeof publicUrl !== "string" || publicUrl.length === 0) return false;
  // Defensive: refuse to operate on URLs that aren't ours. Don't want a
  // misconfigured DB row to make us issue DELETE against an arbitrary host.
  const prefix = PUBLIC_ACCESS_URL + "/";
  if (!publicUrl.startsWith(prefix)) {
    console.warn(`[FTP] Refusing to delete foreign URL: ${publicUrl}`);
    return false;
  }
  // Public URL shape is `${PUBLIC_ACCESS_URL}/${relPath}` where relPath
  // is everything under FTP_UPLOAD_DIR. Re-prepend the dir for the FTP path.
  const relPath = publicUrl.slice(prefix.length);
  const ftpPath = `${FTP_UPLOAD_DIR}/${relPath}`;
  try {
    return await withFtpClient(async (client) => {
      try {
        await client.remove(ftpPath);
        return true;
      } catch (err: any) {
        // basic-ftp throws FTPError with .code for non-2xx replies; 550
        // is "file unavailable" which we treat as already-deleted.
        const code = err?.code;
        if (code === 550) return true;
        console.warn(
          `[FTP] delete failed for ${ftpPath}:`,
          err?.message ?? err,
        );
        return false;
      }
    });
  } catch (err: any) {
    console.warn(
      `[FTP] delete connection failed for ${ftpPath}:`,
      err?.message ?? err,
    );
    return false;
  }
}

/**
 * Batched delete. Reuses ONE FTP connection across many files which is
 * dramatically faster than `deleteFromHostinger` in a loop — each
 * connection handshake is 200–500ms on Hostinger. Used by the daily
 * cleanup scheduler when it has hundreds of expired photos to sweep.
 *
 * Returns counts of removed / missing / failed so callers can log a
 * useful summary. NEVER throws.
 */
export async function deleteManyFromHostinger(
  publicUrls: string[],
): Promise<{ removed: number; missing: number; failed: number }> {
  const out = { removed: 0, missing: 0, failed: 0 };
  const prefix = PUBLIC_ACCESS_URL + "/";
  const paths: string[] = [];
  for (const url of publicUrls) {
    if (typeof url !== "string" || !url.startsWith(prefix)) {
      out.failed += 1;
      continue;
    }
    paths.push(`${FTP_UPLOAD_DIR}/${url.slice(prefix.length)}`);
  }
  if (paths.length === 0) return out;

  try {
    await withFtpClient(async (client) => {
      for (const p of paths) {
        try {
          await client.remove(p);
          out.removed += 1;
        } catch (err: any) {
          if (err?.code === 550) {
            out.missing += 1;
          } else {
            out.failed += 1;
            console.warn(`[FTP] delete failed for ${p}:`, err?.message ?? err);
          }
        }
      }
    });
  } catch (err: any) {
    // Connection-level failure — whatever we hadn't processed counts as
    // failed so the caller can retry next sweep.
    const processed = out.removed + out.missing + out.failed;
    out.failed += paths.length - processed;
    console.warn(
      `[FTP] batch delete connection failed:`,
      err?.message ?? err,
    );
  }
  return out;
}
