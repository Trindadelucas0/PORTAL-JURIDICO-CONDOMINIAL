import { ZodError } from "zod";
import { fail } from "@/lib/api/envelope";
import { AppError } from "@/lib/api/errors";

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return fail(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return fail(422, "VALIDATION_ERROR", "Dados inválidos", error.flatten());
  }
  console.error("[api]", error instanceof Error ? error.message : "unknown");
  return fail(500, "INTERNAL", "Não foi possível concluir a operação.");
}

export function assertCsrf(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) {
    throw new AppError(403, "CSRF", "Origem não permitida");
  }
}
