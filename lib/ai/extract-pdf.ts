const MAX_TEXT_CHARS = 20_000;

export function stripNul(text: string): string {
  return text.replace(/\u0000/g, "");
}

type PdfjsModule = {
  getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: true }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: unknown }> }> }>;
      cleanup: (keepLoadedFonts?: boolean) => Promise<unknown>;
    }>;
    destroy: () => Promise<void>;
  };
};

async function loadPdfjs(): Promise<PdfjsModule> {
  return import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfjsModule>;
}

/** Extração real (FlateDecode). PDF sem texto devolve string vazia — sem OCR. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const loading = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
  const doc = await loading.promise;
  try {
    const parts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str === "string" && item.str.trim()) parts.push(item.str);
      }
      if (parts.join(" ").length > MAX_TEXT_CHARS) break;
    }
    return stripNul(parts.join(" ").replace(/\s+/g, " ").trim()).slice(0, MAX_TEXT_CHARS);
  } finally {
    await doc.cleanup();
    await loading.destroy();
  }
}
