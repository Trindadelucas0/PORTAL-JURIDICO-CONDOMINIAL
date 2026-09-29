import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { officeDocumentRagEligible } from "@/lib/ai/rag-eligibility";

describe("rag opt-in", () => {
  const base = {
    ragEnabled: true,
    effectiveFrom: null,
    effectiveUntil: null,
    mime: "application/pdf",
    kind: "regimento",
  };

  it("does not index a document until ragEnabled is true", () => {
    expect(officeDocumentRagEligible({ ...base, ragEnabled: false })).toBe(false);
  });

  it("skips audio and expired documents", () => {
    expect(officeDocumentRagEligible({ ...base, kind: "audio" })).toBe(false);
    expect(officeDocumentRagEligible({ ...base, mime: "audio/ogg" })).toBe(false);
    expect(officeDocumentRagEligible({ ...base, effectiveUntil: new Date("2020-01-01") })).toBe(false);
  });

  it("filters vector search by ragEnabled before similarity", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/ai/retriever.ts"), "utf8");
    const where = source.slice(source.indexOf("WHERE c.\"condominiumId\""));
    expect(where.indexOf('d."ragEnabled" = true')).toBeGreaterThan(-1);
    expect(where.indexOf('d."ragEnabled" = true')).toBeLessThan(where.indexOf("ORDER BY"));
    expect(where).toContain('newer."supersedesDocumentId"');
  });
});
