import type { PrismaClient } from "@prisma/client";

export const DEMO_NOTES_MARKER = "demo-ia-";

/** Brasília não tem horário de verão desde 2019. */
const BRT_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;

function noteField(notes: string, key: string): string | null {
  const match = notes.match(new RegExp(`(?:^|\\|)\\s*${key}=([^|]*)`));
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function isoDay(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Lê vigenciaDe / vigenciaAte das notes do pacote demo.
 * vigenciaAte é inclusivo: o documento vale até o fim desse dia em Brasília.
 */
export function demoVigencia(notes: string | null): {
  status: string | null;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
} {
  if (!notes?.includes(DEMO_NOTES_MARKER)) {
    return { status: null, effectiveFrom: null, effectiveUntil: null };
  }
  const from = isoDay(noteField(notes, "vigenciaDe"));
  const until = isoDay(noteField(notes, "vigenciaAte"));
  return {
    status: noteField(notes, "status"),
    effectiveFrom: from ? new Date(`${from}T00:00:00${BRT_OFFSET}`) : null,
    effectiveUntil: until ? new Date(new Date(`${until}T00:00:00${BRT_OFFSET}`).getTime() + DAY_MS) : null,
  };
}

type VigenciaDb = Pick<PrismaClient, "officeDocument">;

/**
 * Grava a vigência das notes nas colunas e aponta o regimento vigente para o
 * substituído do mesmo condomínio. Só toca documentos do pacote demo.
 */
export async function applyDemoVigencia(db: VigenciaDb, condominiumId: string) {
  const docs = await db.officeDocument.findMany({
    where: { condominiumId, notes: { contains: DEMO_NOTES_MARKER } },
    select: { id: true, kind: true, notes: true },
  });
  let vigencias = 0;
  for (const doc of docs) {
    const { effectiveFrom, effectiveUntil } = demoVigencia(doc.notes);
    if (!effectiveFrom && !effectiveUntil) continue;
    await db.officeDocument.update({ where: { id: doc.id }, data: { effectiveFrom, effectiveUntil } });
    vigencias += 1;
  }
  const regimentos = docs.filter((doc) => doc.kind === "regimento");
  const vigentes = regimentos.filter((doc) => demoVigencia(doc.notes).status === "vigente");
  const substituidos = regimentos.filter((doc) => demoVigencia(doc.notes).status === "substituido");
  let supersedes: { newerId: string; olderId: string } | null = null;
  if (vigentes.length === 1 && substituidos.length === 1) {
    supersedes = { newerId: vigentes[0].id, olderId: substituidos[0].id };
    await db.officeDocument.update({
      where: { id: supersedes.newerId },
      data: { supersedesDocumentId: supersedes.olderId },
    });
  }
  return { vigencias, supersedes };
}
