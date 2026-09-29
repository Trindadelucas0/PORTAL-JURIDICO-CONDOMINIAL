export type RagDocumentGate = {
  ragEnabled: boolean;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  mime: string;
  kind: string;
};

export function officeDocumentRagEligible(doc: RagDocumentGate, now = new Date()): boolean {
  if (!doc.ragEnabled) return false;
  if (doc.kind === "audio" || doc.mime.toLowerCase().startsWith("audio/")) return false;
  if (doc.effectiveFrom && doc.effectiveFrom > now) return false;
  if (doc.effectiveUntil && doc.effectiveUntil <= now) return false;
  return true;
}
