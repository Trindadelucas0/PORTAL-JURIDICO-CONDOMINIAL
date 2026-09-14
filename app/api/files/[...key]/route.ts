import { handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { documentService } from "@/lib/services/document-service";
import { localDiskStorage } from "@/lib/storage/local-disk";
import { unprocessable } from "@/lib/api/errors";

export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }) {
  try {
    const user = await requireSession();
    const { key } = await ctx.params;
    const storageKey = key.map((part) => decodeURIComponent(part)).join("/");
    if (!storageKey || storageKey.includes("..")) {
      throw unprocessable("Chave de arquivo inválida");
    }
    const doc = await documentService.authorizeRead(user, storageKey);
    const file = await localDiskStorage.read(doc.storageKey);
    return new Response(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename="${doc.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
