import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  isAllowedMime,
  isMarkdownFile,
  mimeMatchesSniff,
  sniffMime,
  maxUploadBytes,
  sanitizeFileName,
  type SaveOptions,
  type StorageProvider,
  type StoredFile,
} from "@/lib/storage/provider";
import { unprocessable } from "@/lib/api/errors";

const ROOT = path.join(process.cwd(), "uploads");

export class LocalDiskStorage implements StorageProvider {
  async save(buffer: Buffer, originalName: string, mime: string, options: SaveOptions = {}): Promise<StoredFile> {
    const limit = maxUploadBytes(options);
    if (buffer.length > limit) {
      throw unprocessable(`Arquivo excede ${Math.round(limit / (1024 * 1024))} MB`);
    }
    if (!isAllowedMime(mime, options)) {
      throw unprocessable("Tipo de arquivo não permitido");
    }
    if (!isMarkdownFile(originalName, mime) && !mimeMatchesSniff(mime, sniffMime(buffer))) {
      throw unprocessable("Tipo de arquivo não confere com o conteúdo");
    }
    const safe = sanitizeFileName(originalName);
    const key = `${new Date().toISOString().slice(0, 10)}/${randomBytes(8).toString("hex")}-${safe}`;
    const full = path.join(ROOT, key);
    const resolvedRoot = path.resolve(ROOT);
    const resolvedFile = path.resolve(full);
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
      throw unprocessable("Nome de arquivo inválido");
    }
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return {
      storageKey: key,
      mime: mime.split(";")[0]?.trim() || mime,
      sizeBytes: buffer.length,
      originalName: safe,
    };
  }

  async read(storageKey: string): Promise<{ buffer: Buffer }> {
    const resolvedRoot = path.resolve(ROOT);
    const resolvedFile = path.resolve(path.join(ROOT, storageKey));
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
      throw unprocessable("Chave de arquivo inválida");
    }
    try {
      const buffer = await readFile(resolvedFile);
      return { buffer };
    } catch {
      throw unprocessable("Arquivo não encontrado no disco");
    }
  }
}

export const localDiskStorage = new LocalDiskStorage();
