/**
 * Cria o condominio Exito se faltar e grava os tres PDFs do cliente em
 * Downloads na pasta Documentos. Apaga os outros arquivos deste condominio
 * (pacote demo-ia e testes antigos). Rodar de novo pula SHA-256 ja gravado.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { DocumentKind } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { cadastroService } from "../lib/services/cadastro-service";
import { createDocumentService } from "../lib/services/document-service";
import { ingestOfficeDocument } from "../worker/ingest-document";

const DOWNLOADS = "C:\\Users\\trind\\Downloads";
const CONDO_NOME = "Êxito";
const CLIENT_NOTES_MARKER = "Carga de teste 08/10/2026";

type PdfSpec = {
  kind: DocumentKind;
  title: string;
  purpose: string;
  notes: string;
  match: (folded: string) => boolean;
};

const SPECS: PdfSpec[] = [
  {
    kind: "convencao",
    title: "Convenção do condomínio (via rotacionada)",
    purpose: "Convenção enviada pelo cliente para a IA consultar as regras neste teste do Êxito.",
    notes: `${CLIENT_NOTES_MARKER}. PDF do cliente. Nao enviar no WhatsApp.`,
    match: (folded) => folded.includes("convencao") && folded.includes("rotated"),
  },
  {
    kind: "convencao",
    title: "Convenção do condomínio (páginas 1 a 39)",
    purpose: "Segunda via da convenção enviada pelo cliente para a IA consultar neste teste do Êxito.",
    notes: `${CLIENT_NOTES_MARKER}. PDF do cliente. Nao enviar no WhatsApp.`,
    match: (folded) => folded.includes("convencao") && folded.includes("1-39"),
  },
  {
    kind: "regimento",
    title: "Normas de funcionamento — Canto do Sabiá",
    purpose: "Normas de funcionamento do Canto do Sabiá para a IA consultar o uso do condomínio neste teste.",
    notes: `${CLIENT_NOTES_MARKER}. PDF do cliente. Nao enviar no WhatsApp.`,
    match: (folded) => folded.includes("normas") && folded.includes("sabi"),
  },
];

function fold(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function pickCondo(
  rows: Array<{ id: string; nome: string; createdAt: Date }>,
): { id: string; nome: string } | null {
  const hits = rows.filter((row) => fold(row.nome) === "exito");
  if (hits.length === 0) return null;
  const exact = hits.find((row) => row.nome === CONDO_NOME);
  if (exact) return exact;
  const oldest = [...hits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (hits.length > 1) {
    console.log(`Mais de um cadastro Exito; usando o mais antigo: ${oldest.nome} (${oldest.id})`);
  }
  return oldest;
}

function isClientPdf(row: { title: string; notes: string | null }) {
  if (row.notes?.includes(CLIENT_NOTES_MARKER)) return true;
  return SPECS.some((spec) => spec.title === row.title);
}

async function removeOtherDocuments(condominiumId: string, condoNome: string) {
  const rows = await prisma.officeDocument.findMany({
    where: { condominiumId },
    select: { id: true, title: true, notes: true, storageKey: true },
  });
  const drop = rows.filter((row) => !isClientPdf(row));
  if (drop.length === 0) {
    console.log(`${condoNome} | nenhum documento de teste para remover`);
    return;
  }
  const dropIds = drop.map((row) => row.id);
  await prisma.officeDocument.updateMany({
    where: { supersedesDocumentId: { in: dropIds } },
    data: { supersedesDocumentId: null },
  });
  await prisma.aiJob.deleteMany({ where: { officeDocumentId: { in: dropIds } } });
  const root = path.resolve(process.cwd(), "uploads");
  for (const row of drop) {
    const resolved = path.resolve(root, row.storageKey);
    if (resolved.startsWith(root + path.sep)) {
      await unlink(resolved).catch(() => undefined);
    }
    await prisma.officeDocument.delete({ where: { id: row.id } });
    console.log(`${condoNome} | removido teste: ${row.title}`);
  }
}

async function resolveFile(spec: PdfSpec, files: string[]) {
  const hit = files.find((name) => spec.match(fold(name)));
  if (!hit) {
    throw new Error(`PDF nao encontrado em ${DOWNLOADS} para: ${spec.title}`);
  }
  return path.join(DOWNLOADS, hit);
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@juricon.local", deletedAt: null, ativo: true },
  });
  if (!admin) throw new Error("Admin admin@juricon.local nao encontrado. Rode pnpm db:seed antes.");

  const existing = await prisma.condominium.findMany({
    where: { deletedAt: null },
    select: { id: true, nome: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  let condo = pickCondo(existing);
  if (!condo) {
    const created = await cadastroService.createCondominium(admin.id, { nome: CONDO_NOME });
    condo = { id: created.id, nome: created.nome };
    console.log(`Condominio criado: ${condo.nome} (${condo.id})`);
  } else {
    console.log(`Condominio existente: ${condo.nome} (${condo.id})`);
  }

  await removeOtherDocuments(condo.id, condo.nome);

  const files = await readdir(DOWNLOADS);
  const docs = createDocumentService(prisma);
  for (const spec of SPECS) {
    const filePath = await resolveFile(spec, files);
    const buffer = await readFile(filePath);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const already = await prisma.officeDocument.findFirst({
      where: { condominiumId: condo.id, sha256 },
      select: { id: true, title: true },
    });
    if (already) {
      console.log(`${condo.nome} | ${spec.title} | pulado (sha256 ja gravado)`);
      continue;
    }
    const row = await docs.upload(admin, {
      kind: spec.kind,
      title: spec.title,
      purpose: spec.purpose,
      notes: spec.notes,
      condominiumId: condo.id,
      file: { buffer, name: path.basename(filePath), mime: "application/pdf" },
    });
    try {
      const indexed = await ingestOfficeDocument(prisma, row.id);
      const chunks = await prisma.documentChunk.count({ where: { officeDocumentId: row.id, active: true } });
      const extra =
        indexed.status === "failed"
          ? ` code=${indexed.code}`
          : indexed.status === "skipped"
            ? ` reason=${indexed.reason}`
            : "";
      console.log(`${condo.nome} | ${spec.title} | ingest=${indexed.status}${extra} | chunks=${chunks}`);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      console.log(
        `${condo.nome} | ${spec.title} | ingest=erro ${code || (error instanceof Error ? error.message : "falha")}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
