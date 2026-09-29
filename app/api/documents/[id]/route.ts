import { ok } from "@/lib/api/envelope";
import { assertCsrf, handleRouteError } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/guards";
import { unprocessable } from "@/lib/api/errors";
import { documentService } from "@/lib/services/document-service";
import { z } from "zod";

const patchSchema = z
  .object({
    clientSendable: z.boolean().optional(),
    ragEnabled: z.boolean().optional(),
  })
  .refine((value) => value.clientSendable !== undefined || value.ragEnabled !== undefined, {
    message: "Informe clientSendable ou ragEnabled",
  });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireSession();
    const { id } = await ctx.params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw unprocessable("Informe clientSendable ou ragEnabled");
    let row = null;
    if (parsed.data.clientSendable !== undefined) {
      row = await documentService.patchClientSendable(user, id, parsed.data.clientSendable);
    }
    if (parsed.data.ragEnabled !== undefined) {
      row = await documentService.patchRagEnabled(user, id, parsed.data.ragEnabled);
    }
    return ok(row);
  } catch (error) {
    return handleRouteError(error);
  }
}
