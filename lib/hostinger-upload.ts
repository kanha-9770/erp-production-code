import { Client } from "basic-ftp";
import { Readable } from "stream";

const FTP_HOST = "217.21.82.234";
const FTP_USER = "u386199748.businesscardglobal";
const FTP_PASSWORD = "Kafka@India1122";
const FTP_PORT = 21;
const FTP_UPLOAD_DIR = "businesscard"; // 👈 target inside public_html
const PUBLIC_URL = "https://businesscard.nesscoglobal.com/businesscard"; // 👈 reflects the actual image URL
const PUBLIC_ACCESS_URL = "https://businesscard.nesscoglobal.com"; // 👈 reflects the actual image URL
export async function uploadToHostinger(buffer: Buffer, filename: string): Promise<string> {
  const client = new Client();
  try {
    console.log("[FTP] Connecting to Hostinger...");
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASSWORD,
      port: FTP_PORT,
      secure: false,
    });

    // ✅ Change to 'businesscard' inside public_html
    await client.cd(FTP_UPLOAD_DIR);
    console.log(`[FTP] Changed directory to: ${FTP_UPLOAD_DIR}`);

    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, filename);
    console.log("[FTP] Upload complete");

    return `${PUBLIC_ACCESS_URL}/${filename}`;
  } catch (error) {
    console.error("[FTP] Error:", error);
    throw error;
  } finally {
    client.close();
    console.log("[FTP] Connection closed");
  }
}
