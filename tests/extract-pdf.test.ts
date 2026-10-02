import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractPdfText, stripNul } from "@/lib/ai/extract-pdf";

function pdfWithStream(stream: Buffer, filter: boolean): Buffer {
  const filterLine = filter ? "/Filter /FlateDecode " : "";
  const objects = [
    Buffer.from("%PDF-1.4\n"),
    Buffer.from("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"),
    Buffer.from("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"),
    Buffer.from(
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    ),
    Buffer.from("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"),
  ];
  const obj4 = Buffer.concat([
    Buffer.from(`4 0 obj << /Length ${stream.length} ${filterLine}>> stream\n`),
    stream,
    Buffer.from("\nendstream endobj\n"),
  ]);
  const body = Buffer.concat([...objects, obj4]);
  const xrefPos = body.length;
  const xref = Buffer.from(`xref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return Buffer.concat([body, xref]);
}

describe("extractPdfText", () => {
  it("strips NUL before indexing", () => {
    expect(stripNul("convenção\u0000 vigente")).toBe("convenção vigente");
  });

  it("reads FlateDecode text from a LibreOffice-like PDF", async () => {
    const raw = Buffer.from("BT /F1 12 Tf 10 100 Td (Juricon convencao vigente) Tj ET", "latin1");
    const buffer = pdfWithStream(deflateSync(raw), true);
    const text = await extractPdfText(buffer);
    expect(text).toContain("Juricon convencao vigente");
  });

  it("returns empty text for a PDF without literals", async () => {
    const raw = Buffer.from("BT ET", "latin1");
    const buffer = pdfWithStream(raw, false);
    const text = await extractPdfText(buffer);
    expect(text).toBe("");
  });
});
