export type ClamScanResult = "clean" | "infected" | "skipped" | "error";

function clamavUrl(): string | null {
  const raw = process.env.CLAMAV_URL?.trim();
  return raw || null;
}

export async function scanBuffer(buffer: Buffer): Promise<ClamScanResult> {
  const url = clamavUrl();
  if (!url) {
    console.log(JSON.stringify({ scan: "SCAN_SKIPPED" }));
    return "skipped";
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error("[clamav] errorCode=URL");
    return "error";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.error("[clamav] errorCode=PROTOCOL");
    return "error";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(parsed.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(buffer),
      signal: controller.signal,
    });
    const text = (await res.text()).toUpperCase();
    if (text.includes("FOUND") || text.includes("INFECTED")) return "infected";
    if (!res.ok) return "error";
    return "clean";
  } catch (error) {
    const code = error instanceof Error ? error.name : "ERROR";
    console.error(`[clamav] errorCode=${code}`);
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

export function mustRejectScan(result: ClamScanResult): boolean {
  return result === "infected" || result === "error";
}
