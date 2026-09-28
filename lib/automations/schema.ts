import { z } from "zod";
import { findUnknownVariables } from "@/lib/automations/template";

const hm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horário inválido");

export const automationPatchSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da automação").max(80, "Nome muito longo").optional(),
  body: z
    .string()
    .trim()
    .min(1, "Informe a mensagem")
    .max(8000, "Mensagem muito longa")
    .optional(),
  startsAt: hm.optional(),
  endsAt: hm.optional(),
  skipActiveTicket: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export function unknownVariableMessage(body: string) {
  const unknown = findUnknownVariables(body);
  if (unknown.length === 0) return null;
  return `Variável não permitida: ${unknown.join(", ")}`;
}
